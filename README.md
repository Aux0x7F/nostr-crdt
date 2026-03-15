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

## Documents

- [PROTOCOL.md](./PROTOCOL.md)
- [API_CONTRACT.md](./API_CONTRACT.md)
- [ROADMAP.md](./ROADMAP.md)
