import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";

import {
  createDocumentFilters,
  createRoomId,
  createUnsignedEvent,
  createYjsSync,
  decodeEvent,
} from "../src/index.js";
import { createInMemoryTransport, createTestSigner } from "./helpers/in-memory-transport.js";

test("one writer syncs to another client over replay and live updates", async () => {
  const transport = createInMemoryTransport();
  const roomId = createRoomId("demo", "page:home");

  const aliceDoc = new Y.Doc();
  const bobDoc = new Y.Doc();

  aliceDoc.getText("body").insert(0, "hello");

  const alice = createYjsSync({
    doc: aliceDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("alice"),
    bufferMs: 0,
  });

  await alice.initialize();
  await alice.flush();

  const bob = createYjsSync({
    doc: bobDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("bob"),
    bufferMs: 0,
  });

  await bob.initialize();
  assert.equal(bobDoc.getText("body").toString(), "hello");

  aliceDoc.getText("body").insert(aliceDoc.getText("body").length, " world");
  await alice.flush();
  await tick();

  assert.equal(bobDoc.getText("body").toString(), "hello world");

  alice.destroy();
  bob.destroy();
});

test("two writers converge on shared state", async () => {
  const transport = createInMemoryTransport();
  const roomId = createRoomId("demo", "post:alpha");

  const aliceDoc = new Y.Doc();
  const bobDoc = new Y.Doc();

  const alice = createYjsSync({
    doc: aliceDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("alice"),
    bufferMs: 0,
  });

  const bob = createYjsSync({
    doc: bobDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("bob"),
    bufferMs: 0,
  });

  await alice.initialize();
  await bob.initialize();

  aliceDoc.getMap("meta").set("title", "Alpha");
  bobDoc.getMap("meta").set("status", "draft");

  await Promise.all([alice.flush(), bob.flush()]);
  await tick();

  assert.equal(aliceDoc.getMap("meta").get("title"), "Alpha");
  assert.equal(aliceDoc.getMap("meta").get("status"), "draft");
  assert.equal(bobDoc.getMap("meta").get("title"), "Alpha");
  assert.equal(bobDoc.getMap("meta").get("status"), "draft");

  alice.destroy();
  bob.destroy();
});

test("checkpoint plus tail replay restores current state", async () => {
  const transport = createInMemoryTransport();
  const roomId = createRoomId("demo", "entity:county-line");

  const aliceDoc = new Y.Doc();
  const alice = createYjsSync({
    doc: aliceDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("alice"),
    bufferMs: 0,
  });

  await alice.initialize();

  aliceDoc.getMap("entity").set("name", "County Line");
  await alice.flush();
  await alice.publishCheckpoint({ reason: "compaction" });

  aliceDoc.getMap("entity").set("location", "Phoenix");
  await alice.flush();

  const replayDoc = new Y.Doc();
  const replay = createYjsSync({
    doc: replayDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("replay"),
    bufferMs: 0,
  });

  await replay.initialize();

  assert.equal(replayDoc.getMap("entity").get("name"), "County Line");
  assert.equal(replayDoc.getMap("entity").get("location"), "Phoenix");

  alice.destroy();
  replay.destroy();
});

test("host rejection prevents unauthorized live update application", async () => {
  const transport = createInMemoryTransport();
  const roomId = createRoomId("demo", "page:about");

  const aliceDoc = new Y.Doc();
  const viewerDoc = new Y.Doc();

  const alice = createYjsSync({
    doc: aliceDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("alice"),
    bufferMs: 0,
  });

  const viewer = createYjsSync({
    doc: viewerDoc,
    namespace: "demo",
    roomId,
    transport,
    signer: createTestSigner("viewer"),
    bufferMs: 0,
    acceptEvent: (event) => event.pubkey === "pubkey:bob",
  });

  await alice.initialize();
  await viewer.initialize();

  aliceDoc.getText("body").insert(0, "should not apply");
  await alice.flush();
  await tick();

  assert.equal(viewerDoc.getText("body").toString(), "");

  alice.destroy();
  viewer.destroy();
});

test("codec uses queryable single-letter tags", async () => {
  const roomId = createRoomId("demo", "page:home");
  const event = createUnsignedEvent({
    namespace: "demo",
    roomId,
    messageType: "update",
    payloadBytes: new Uint8Array([1, 2, 3]),
  });

  const decoded = decodeEvent({
    ...event,
    pubkey: "pubkey:test",
    id: "event-1",
    sig: "sig:event-1",
  });

  assert.equal(decoded.namespace, "demo");
  assert.equal(decoded.roomId, roomId);
  assert.equal(decoded.messageType, "update");

  const filters = createDocumentFilters({
    namespace: "demo",
    roomId,
  });

  assert.equal(filters[0]["#d"][0], roomId);
  assert.equal(filters[0]["#m"][0], "checkpoint");
});

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
