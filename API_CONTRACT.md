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
- a transport adapter contract that does not require a specific Nostr client library

`nostr-crdt` should not provide:

- application-specific auth rules
- page or post rendering
- moderation workflow
- bakedown or GitHub PR logic

## First implementation slice

The current implementation exposes:

- `createRoomId(namespace, documentId)`
- `createDocumentFilters(...)`
- `createUnsignedEvent(...)`
- `decodeEvent(...)`
- `createYjsSync(...)`

The higher-level sync object is responsible for:

- replay
- buffered update publishing
- checkpoint publishing
- checkpoint requests

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

## Transport adapter

The first implementation should accept a small adapter rather than importing a full Nostr client stack.

Expected adapter shape:

- `query(filters) -> Promise<event[]>`
- `subscribe(filters, onEvent) -> unsubscribe | Promise<unsubscribe>`
- `publish(event) -> Promise<event>`

This keeps the core library browser-first and easy to test.
