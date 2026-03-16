# nostr-crdt

`nostr-crdt` is a browser-first transport layer for syncing CRDT documents over Nostr.

The initial target is Yjs. The transport should be small, dependency-light, and usable from browsers without dragging in a framework or a server-first architecture.

## Design goals

- one CRDT document per collaborative unit
- Nostr as transport, not as state or merge logic
- browser-first operation with optional durable peers
- optional durable peers for replay and compaction
- no required WebRTC, websocket sync server, or hosted signaling layer

## Initial document model

- `page:<page-id>`
- `post:<slug-or-draft-id>`
- `entity:<entity-id>`

Each document is collaborative on its own. The library should not encourage one giant shared site document.

This library is responsible for transport, encoding, checkpointing, and replay. It is not responsible for application-specific auth, publishing, or bakedown policy.

## Current status

This repo starts as a protocol and implementation-plan scaffold. The next step is a minimal Yjs transport package with:

- update message encoding and decoding
- document room identity conventions
- relay replay and catch-up
- optional checkpoint messages
- in-memory transport tests

The first implementation slice is now present:

- Yjs document sync with buffered update publishing
- checkpoint plus tail replay
- host-provided acceptance hook
- in-memory transport tests

## First API slice

```js
import * as Y from "yjs";
import { createRoomId, createYjsSync } from "nostr-crdt";

const doc = new Y.Doc();
const roomId = createRoomId("true-cost", "page:home");

const sync = createYjsSync({
  doc,
  namespace: "true-cost",
  roomId,
  transport,
  signer,
  verifyEvent(event) {
    return event.sig === `sig:${event.id}`;
  },
  acceptEvent(event, decoded) {
    return trustedAdminSet.has(decoded.event.pubkey);
  },
});

await sync.initialize();
```

The transport adapter is intentionally small:

- `query(filters)`
- `subscribe(filters, onEvent)`
- `publish(event)`

Optional host hooks stay explicit:

- `verifyEvent(event)`
- `acceptEvent(event, decoded)`

## Documents

- [PROTOCOL.md](./PROTOCOL.md)
- [API_CONTRACT.md](./API_CONTRACT.md)
- [ROADMAP.md](./ROADMAP.md)
