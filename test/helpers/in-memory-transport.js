import { createHash } from "node:crypto";

export function createInMemoryTransport() {
  const events = [];
  const subscriptions = new Set();

  return {
    async query(filters) {
      const list = normalizeFilters(filters);
      return events.filter((event) => list.some((filter) => matchesFilter(event, filter)));
    },

    async publish(event) {
      const normalized = normalizeEvent(event, events.length);
      events.push(normalized);
      queueMicrotask(() => {
        for (const subscription of subscriptions) {
          if (subscription.filters.some((filter) => matchesFilter(normalized, filter))) {
            subscription.onEvent(normalized);
          }
        }
      });
      return normalized;
    },

    async subscribe(filters, onEvent) {
      const entry = {
        filters: normalizeFilters(filters),
        onEvent,
      };
      subscriptions.add(entry);
      return () => subscriptions.delete(entry);
    },

    getEvents() {
      return events.slice();
    },
  };
}

export function createTestSigner(label) {
  const pubkey = `pubkey:${String(label || "signer").trim()}`;
  return {
    pubkey,
    async sign(event) {
      const body = JSON.stringify({
        kind: event.kind,
        created_at: event.created_at,
        pubkey,
        tags: event.tags,
        content: event.content,
      });
      const id = sha256(body);
      return {
        ...event,
        pubkey,
        id,
        sig: `sig:${id}`,
      };
    },
  };
}

function normalizeFilters(filters) {
  return Array.isArray(filters) ? filters.filter(Boolean) : [filters].filter(Boolean);
}

function normalizeEvent(event, sequence) {
  const pubkey = String(event.pubkey || "").trim();
  const body = JSON.stringify({
    kind: event.kind,
    created_at: event.created_at,
    pubkey,
    tags: event.tags,
    content: event.content,
    sequence,
  });
  const id = String(event.id || sha256(body));
  return {
    ...event,
    pubkey,
    id,
    sig: String(event.sig || `sig:${id}`),
  };
}

function matchesFilter(event, filter) {
  if (!filter || typeof filter !== "object") return false;
  if (Array.isArray(filter.kinds) && !filter.kinds.includes(Number(event.kind))) return false;
  if (Array.isArray(filter.authors) && !filter.authors.includes(String(event.pubkey || ""))) return false;
  if (Array.isArray(filter.ids) && !filter.ids.includes(String(event.id || ""))) return false;
  if (Number.isFinite(filter.since) && Number(event.created_at || 0) < Number(filter.since)) return false;
  if (Number.isFinite(filter.until) && Number(event.created_at || 0) > Number(filter.until)) return false;

  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith("#")) continue;
    const tagKey = key.slice(1);
    const tagValues = (Array.isArray(event.tags) ? event.tags : [])
      .filter((tag) => Array.isArray(tag) && tag[0] === tagKey)
      .map((tag) => String(tag[1] || ""));
    if (!Array.isArray(values) || !values.some((value) => tagValues.includes(String(value)))) {
      return false;
    }
  }

  return true;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}
