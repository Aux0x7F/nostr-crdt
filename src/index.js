/**
 * Docs-first scaffold.
 *
 * The first real implementation should expose:
 * - room identity helpers
 * - event codec helpers
 * - replay helpers
 * - buffered update publishing
 * - checkpoint helpers
 * - host-provided authorization hooks
 */

export const PROTOCOL_VERSION = 1;

export function describeProtocol() {
  return {
    version: PROTOCOL_VERSION,
    name: "nostr-crdt",
    focus: "CRDT transport over Nostr",
    initialTarget: "Yjs",
  };
}
