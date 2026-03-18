# Contributing

## Workflow

`nostr-crdt` should use a branch -> purpose -> squash workflow.

Normal work should follow this pattern:

1. create a focused branch from `main`
2. keep the branch scoped to one transport or protocol slice
3. open a PR against `main`
4. squash merge the PR
5. delete the branch after merge

Direct commits to `main` should be rare.

## Branch and PR shape

Prefer branch names that explain the change:

- `task-contributing-contract`
- `task-yjs-update-encoding`
- `issue-14-sync-message-replay`

PRs should document:

- the contract being changed
- the test coverage for that contract
- any protocol or API implications

## Merge policy

- prefer squash merge
- keep `main` readable as a sequence of purposeful changes
- avoid preserving iterative local fixup history in `main`

## Validation minimum

Before merge:

- run `npm test`
- run `npm run check`
- note the behavior verified
