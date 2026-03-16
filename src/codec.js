export const PROTOCOL_VERSION = 1;
export const YJS_UPDATE_CODEC = "yjs-update-v1";
export const DEFAULT_EVENT_KIND = 31178;

export function createRoomId(namespace, documentId) {
  const app = normalizeToken(namespace, "app");
  const doc = normalizeDocumentId(documentId);
  return `${app}:${doc}`;
}

export function createDocumentFilters({
  kind = DEFAULT_EVENT_KIND,
  namespace,
  roomId,
}) {
  const app = normalizeToken(namespace, "app");
  const room = normalizeDocumentId(roomId);

  return [
    createFilter(kind, app, room, "checkpoint"),
    createFilter(kind, app, room, "update"),
    createFilter(kind, app, room, "checkpoint-request"),
  ];
}

export function createUnsignedEvent({
  kind = DEFAULT_EVENT_KIND,
  namespace,
  roomId,
  messageType,
  payloadBytes = new Uint8Array(),
  checkpointId = "",
  createdAt = unixNow(),
  meta = {},
}) {
  const app = normalizeToken(namespace, "app");
  const room = normalizeDocumentId(roomId);
  const msg = normalizeMessageType(messageType);
  const content = {
    v: PROTOCOL_VERSION,
    doc: room,
    msg,
    codec: YJS_UPDATE_CODEC,
    payload: toBase64(payloadBytes),
    baseCheckpoint: String(checkpointId || "").trim(),
    meta: isPlainObject(meta) ? meta : {},
  };

  const tags = [
    ["t", "crdt"],
    ["n", app],
    ["d", room],
    ["m", msg],
    ["c", YJS_UPDATE_CODEC],
  ];

  if (content.baseCheckpoint) tags.push(["x", content.baseCheckpoint]);

  return {
    kind: Number(kind),
    created_at: Number(createdAt),
    tags,
    content: JSON.stringify(content),
  };
}

export function decodeEvent(event, expectations = {}) {
  if (!event || typeof event !== "object") {
    throw new Error("Event must be an object.");
  }

  const parsed = parseJson(event.content);
  if (!parsed || parsed.v !== PROTOCOL_VERSION) {
    throw new Error("Event payload version is unsupported.");
  }

  const tags = createTagMap(event.tags);
  const namespace = firstTag(tags, "n");
  const roomId = firstTag(tags, "d");
  const messageType = firstTag(tags, "m");
  const codec = firstTag(tags, "c");
  const checkpointId = firstTag(tags, "x") || String(parsed.baseCheckpoint || "").trim();

  if (firstTag(tags, "t") !== "crdt") throw new Error("Event is not a CRDT message.");
  if (!namespace) throw new Error("CRDT event is missing namespace.");
  if (!roomId) throw new Error("CRDT event is missing room id.");
  if (!messageType) throw new Error("CRDT event is missing message type.");
  if (codec !== YJS_UPDATE_CODEC || parsed.codec !== YJS_UPDATE_CODEC) {
    throw new Error("CRDT event codec is unsupported.");
  }

  if (expectations.namespace && namespace !== normalizeToken(expectations.namespace, "app")) {
    throw new Error("CRDT event namespace does not match.");
  }

  if (expectations.roomId && roomId !== normalizeDocumentId(expectations.roomId)) {
    throw new Error("CRDT event room id does not match.");
  }

  return {
    event,
    namespace,
    roomId,
    messageType: normalizeMessageType(messageType),
    codec,
    checkpointId,
    createdAt: Number(event.created_at || 0),
    pubkey: String(event.pubkey || "").trim(),
    payloadBytes: fromBase64(String(parsed.payload || "")),
    payloadBase64: String(parsed.payload || ""),
    meta: isPlainObject(parsed.meta) ? parsed.meta : {},
  };
}

export function sortEventsAscending(events) {
  return [...events].sort(compareEventsAscending);
}

export function compareEventsAscending(left, right) {
  const leftTime = Number(left?.created_at || 0);
  const rightTime = Number(right?.created_at || 0);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function normalizeToken(value, fallback = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized) return normalized;
  if (fallback) return fallback;
  throw new Error("Expected a non-empty token.");
}

export function normalizeDocumentId(value) {
  return normalizeToken(value, "document");
}

export function normalizeMessageType(value) {
  const normalized = normalizeToken(value, "update");
  if (
    normalized !== "update" &&
    normalized !== "checkpoint" &&
    normalized !== "checkpoint-request"
  ) {
    throw new Error(`Unsupported CRDT message type: ${normalized}`);
  }
  return normalized;
}

function createFilter(kind, namespace, roomId, messageType) {
  return {
    kinds: [Number(kind)],
    "#d": [roomId],
    "#m": [normalizeMessageType(messageType)],
  };
}

function createTagMap(tags) {
  const tagMap = new Map();
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    const key = String(tag[0] || "").trim();
    if (!key) continue;
    const list = tagMap.get(key) || [];
    list.push(String(tag[1] || "").trim());
    tagMap.set(key, list);
  }
  return tagMap;
}

function firstTag(tagMap, key) {
  const values = tagMap.get(key);
  return values?.[0] || "";
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function unixNow() {
  return Math.floor(Date.now() / 1000);
}

export function toBase64(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64");
  }
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value) {
  const source = String(value || "");
  if (!source) return new Uint8Array();
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(source, "base64"));
  }
  const binary = atob(source);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
