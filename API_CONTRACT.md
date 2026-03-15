# API Contract

This document defines what `nostr-crdt` is expected to expose as a generic library.

It is intentionally separate from `PROTOCOL.md`:

- `PROTOCOL.md` describes wire-level transport expectations
- `API_CONTRACT.md` describes host-facing library responsibilities

## Scope

The first implementation target is Yjs, but the API should be shaped so the repo does not become unusably tied to one editor or application.

## Library responsibilities

`nostr-crdt` should provide:

- document room identity helpers
- event encode and decode helpers
- replay and catch-up helpers
- buffered update publishing
- checkpoint publishing and replay helpers
- host hooks for signer acceptance policy

`nostr-crdt` should not provide:

- application-specific auth rules
- page or post rendering
- moderation workflow
- bakedown or GitHub PR logic

## Expected primitives

The library should eventually expose small primitives shaped roughly like:

- `createRoomId(namespace, documentId)`
- `encodeUpdateMessage(...)`
- `decodeMessage(...)`
- `subscribeDocument(...)`
- `publishUpdate(...)`
- `requestCheckpoint(...)`
- `applyReplay(...)`

These names are placeholders, not frozen API.

## Host responsibilities

The host application must provide:

- relay configuration
- signer identity and signing
- acceptance policy for incoming messages
- document ownership and namespace policy

The host application decides whether an otherwise valid message should affect visible state.

## Durable peer compatibility

The API should be usable from:

- browsers
- durable peers such as pinners
- test harnesses with mocked relay transport

It should not require a browser UI or framework runtime.

## Testing contract

The first test surface should avoid public relays.

Required test shapes:

- in-memory relay transport
- one-writer replay
- two-writer convergence
- checkpoint plus tail replay
- ignored update from a host-rejected signer
