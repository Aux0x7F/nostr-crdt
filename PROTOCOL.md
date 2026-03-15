# Protocol

## Scope

This protocol describes how a CRDT document is transported over Nostr.

It does not define:

- application-specific auth policy
- UI behavior
- publishing and bakedown workflows
- whether the CRDT engine is Yjs forever

The first implementation target is Yjs.

## Core model

- One CRDT document per collaborative unit.
- Nostr carries CRDT messages.
- Clients maintain local CRDT state and merge by applying CRDT messages.
- Optional durable peers may retain state, emit checkpoints, or help replay.

## Terms

- `document`: one collaborative unit such as `page:home` or `post:county-line-logistics-yard`
- `room`: the relay-visible namespace for one document
- `update`: one CRDT delta message
- `checkpoint`: a compaction message representing a full document state or merge base
- `durable peer`: a non-browser peer that retains document state and can rebroadcast or checkpoint it

## Document identity

Document ids are opaque strings owned by the application.

Recommended forms:

- `page:<page-id>`
- `post:<slug-or-id>`
- `entity:<entity-id>`

Document ids must be stable enough for replay and bakedown.

## Event classes

The transport should support at least these message classes:

- `update`
- `checkpoint`
- `checkpoint-request`
- `awareness` later, optional

The first implementation only needs `update`, `checkpoint`, and `checkpoint-request`.

## Nostr envelope

The exact Nostr kind may be application-configurable. The transport must support a dedicated kind and a queryable tag layout.

Recommended tags:

- `["t", "crdt"]`
- `["app", "<namespace>"]`
- `["doc", "<document-id>"]`
- `["msg", "update" | "checkpoint" | "checkpoint-request"]`
- `["codec", "yjs-update-v1"]`
- `["checkpoint", "<checkpoint-id>"]` when applicable

The event `pubkey` is the signer identity. The transport does not decide whether that signer is trusted; the host application does.

## Payload

The content field should be JSON for inspectability and versioning.

Recommended shape:

```json
{
  "v": 1,
  "doc": "page:home",
  "msg": "update",
  "codec": "yjs-update-v1",
  "payload": "BASE64_BYTES",
  "baseCheckpoint": "optional-checkpoint-id",
  "meta": {
    "site": "optional-site-namespace"
  }
}
```

Notes:

- `payload` is the CRDT binary message encoded as base64.
- `baseCheckpoint` is optional and useful for faster replay and debugging.
- `meta` is reserved for application hints, not authorization.

## Client acceptance rules

The transport layer validates the event shape and verifies the Nostr signature.

The host application decides whether to apply the update. `nostr-crdt` should expose hooks for host-provided authorization and acceptance policy.

## Replay and catch-up

Clients need two replay paths:

- `checkpoint + tail`
- `full history fallback`

Recommended flow:

1. Query most recent checkpoint for a document.
2. Apply it if present.
3. Query updates after that checkpoint timestamp or checkpoint reference.
4. Apply tail updates in order of Nostr event time and id stability.

If no checkpoint exists, replay the full update history for the document.

## Checkpoints

Checkpoints are compaction artifacts, not a replacement for normal updates.

They should:

- represent the full current CRDT document state
- be signed like any other event
- be attributable to the durable peer or authorized client that created them
- allow clients to avoid replaying the entire room history

Checkpoint creation can be:

- periodic
- triggered by pinner
- triggered by a document size threshold

## Security boundary

The transport layer does not define authorization policy.

The host application must decide:

- which signers are trusted
- which document namespaces a signer may mutate
- whether some events are advisory and others authoritative

This protocol assumes the signer identity on each event is the basis for trust decisions.

## Non-goals

- end-to-end encrypted CRDT sync in v1
- presence/cursors in v1
- giant multi-object site documents
- server-first coordination requirements

## Initial implementation target

The first implementation should provide:

- Yjs document binding
- event encode and decode helpers
- room subscription and replay helpers
- buffered update publishing
- checkpoint publish and replay helpers
- in-memory tests with mocked relay transport
