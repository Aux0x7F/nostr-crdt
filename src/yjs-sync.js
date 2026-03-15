import * as Y from "yjs";
import {
  DEFAULT_EVENT_KIND,
  createDocumentFilters,
  createUnsignedEvent,
  decodeEvent,
  sortEventsAscending,
} from "./codec.js";

const REMOTE_ORIGIN = Symbol("nostr-crdt-remote");

export function createYjsSync(options) {
  return new YjsNostrSync(options);
}

export class YjsNostrSync {
  constructor({
    doc,
    namespace,
    roomId,
    transport,
    signer,
    kind = DEFAULT_EVENT_KIND,
    bufferMs = 100,
    acceptEvent = () => true,
    onCheckpointRequest = null,
  }) {
    if (!(doc instanceof Y.Doc)) throw new Error("doc must be a Y.Doc.");
    if (!transport || typeof transport.query !== "function" || typeof transport.publish !== "function") {
      throw new Error("transport must provide query() and publish().");
    }
    if (typeof transport.subscribe !== "function") {
      throw new Error("transport must provide subscribe().");
    }
    if (!signer || typeof signer.sign !== "function" || !String(signer.pubkey || "").trim()) {
      throw new Error("signer must provide pubkey and sign().");
    }

    this.doc = doc;
    this.namespace = namespace;
    this.roomId = roomId;
    this.kind = Number(kind);
    this.transport = transport;
    this.signer = signer;
    this.bufferMs = Math.max(0, Number(bufferMs) || 0);
    this.acceptEvent = acceptEvent;
    this.onCheckpointRequest = onCheckpointRequest;

    this.filters = createDocumentFilters({
      kind: this.kind,
      namespace: this.namespace,
      roomId: this.roomId,
    });

    this.pendingUpdates = [];
    this.flushTimer = null;
    this.unsubscribe = null;
    this.initialized = false;
    this.destroyed = false;
    this.seenEventIds = new Set();

    this.handleDocumentUpdate = this.handleDocumentUpdate.bind(this);
    this.handleTransportEvent = this.handleTransportEvent.bind(this);

    this.doc.on("update", this.handleDocumentUpdate);
  }

  async initialize() {
    if (this.destroyed) throw new Error("Cannot initialize a destroyed sync.");
    if (this.initialized) return this;

    const localStateBeforeReplay = Y.encodeStateAsUpdate(this.doc);
    const unsubscribe = await this.transport.subscribe(this.filters, this.handleTransportEvent);
    this.unsubscribe = typeof unsubscribe === "function" ? unsubscribe : () => {};

    const replayEvents = await this.transport.query(this.filters);
    const remoteState = await this.applyReplay(replayEvents);
    const remoteVector = Y.encodeStateVectorFromUpdate(remoteState);
    const missingOnRemote = Y.diffUpdate(Y.encodeStateAsUpdate(this.doc), remoteVector);

    if (hasMeaningfulUpdate(localStateBeforeReplay) && hasMeaningfulUpdate(missingOnRemote)) {
      this.pendingUpdates.push(missingOnRemote);
      await this.flush();
    }

    this.initialized = true;
    return this;
  }

  async flush() {
    if (!this.pendingUpdates.length) return null;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const update =
      this.pendingUpdates.length === 1
        ? this.pendingUpdates[0]
        : Y.mergeUpdates(this.pendingUpdates);

    this.pendingUpdates = [];
    return this.publishMessage("update", update);
  }

  async publishCheckpoint(meta = {}) {
    const update = Y.encodeStateAsUpdate(this.doc);
    return this.publishMessage("checkpoint", update, meta);
  }

  async requestCheckpoint(meta = {}) {
    return this.publishMessage("checkpoint-request", new Uint8Array(), meta);
  }

  destroy() {
    this.destroyed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingUpdates = [];
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.doc.off("update", this.handleDocumentUpdate);
  }

  async applyReplay(events) {
    const decoded = await this.decodeAccepted(events);
    const checkpoints = decoded.filter((item) => item.messageType === "checkpoint");
    const updates = decoded.filter((item) => item.messageType === "update");
    const remoteDoc = new Y.Doc();

    const latestCheckpoint = checkpoints.length ? checkpoints[checkpoints.length - 1] : null;
    if (latestCheckpoint) {
      this.applyUpdate(latestCheckpoint.payloadBytes);
      Y.applyUpdate(remoteDoc, latestCheckpoint.payloadBytes, REMOTE_ORIGIN);
    }

    const checkpointCutoff = latestCheckpoint
      ? sortEventsAscending(events).findIndex((event) => event.id === latestCheckpoint.event.id)
      : -1;

    const orderedEvents = sortEventsAscending(events);
    for (let index = 0; index < orderedEvents.length; index += 1) {
      if (index <= checkpointCutoff) continue;
      const event = orderedEvents[index];
      const decodedEvent = updates.find((item) => item.event.id === event.id);
      if (!decodedEvent) continue;
      this.applyUpdate(decodedEvent.payloadBytes);
      Y.applyUpdate(remoteDoc, decodedEvent.payloadBytes, REMOTE_ORIGIN);
    }

    return Y.encodeStateAsUpdate(remoteDoc);
  }

  handleDocumentUpdate(update, origin) {
    if (this.destroyed || origin === REMOTE_ORIGIN) return;
    this.pendingUpdates.push(update);

    if (this.bufferMs === 0) {
      void this.flush();
      return;
    }

    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.bufferMs);
  }

  async handleTransportEvent(event) {
    if (this.destroyed) return;
    if (event?.id && this.seenEventIds.has(event.id)) return;

    let decoded;
    try {
      decoded = decodeEvent(event, {
        namespace: this.namespace,
        roomId: this.roomId,
      });
    } catch {
      return;
    }

    const accepted = await this.acceptEvent(event, decoded);
    if (!accepted) return;

    if (event.id) this.seenEventIds.add(event.id);

    if (decoded.messageType === "checkpoint-request") {
      if (typeof this.onCheckpointRequest === "function") {
        await this.onCheckpointRequest({ event, decoded, sync: this });
      }
      return;
    }

    this.applyUpdate(decoded.payloadBytes);
  }

  applyUpdate(update) {
    if (!(update instanceof Uint8Array) || update.length === 0) return;
    Y.applyUpdate(this.doc, update, REMOTE_ORIGIN);
  }

  async publishMessage(messageType, payloadBytes, meta = {}) {
    const unsignedEvent = createUnsignedEvent({
      kind: this.kind,
      namespace: this.namespace,
      roomId: this.roomId,
      messageType,
      payloadBytes,
      meta,
    });

    const signedEvent = await this.signer.sign({
      ...unsignedEvent,
      pubkey: this.signer.pubkey,
    });

    const published = await this.transport.publish(signedEvent);
    if (published?.id) this.seenEventIds.add(published.id);
    return published;
  }

  async decodeAccepted(events) {
    const ordered = sortEventsAscending(Array.isArray(events) ? events : []);
    const accepted = [];

    for (const event of ordered) {
      if (event?.id && this.seenEventIds.has(event.id)) continue;

      let decoded;
      try {
        decoded = decodeEvent(event, {
          namespace: this.namespace,
          roomId: this.roomId,
        });
      } catch {
        continue;
      }

      if (!(await this.acceptEvent(event, decoded))) continue;
      if (event.id) this.seenEventIds.add(event.id);
      accepted.push(decoded);
    }

    return accepted;
  }
}

export function getRemoteOrigin() {
  return REMOTE_ORIGIN;
}

function hasMeaningfulUpdate(update) {
  return update instanceof Uint8Array && update.length > 2;
}
