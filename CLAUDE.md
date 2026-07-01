# Proof VC Common - AI Assistant Guide

Dual-target ESM TypeScript library `@proof.com/proof-vc-common`. Browser entry exposes `init` + `getAuthorizationRequestURL` (zero runtime deps). Node entry adds `verify` + `verifyVPToken` (SD-JWT verification, X.509 chain validation against an embedded trust root).

## Hard Rules

1. **No `node:*`, `@sd-jwt/*`, `@owf/*`, or other runtime imports from anything reachable from `src/index.browser.ts`.** Type-only imports (`import type` / `export type *`) are safe — `verbatimModuleSyntax: true` erases them.
2. **Prompt before publishing.** Never bump version, push tags, create a Release, or trigger the publish workflow without explicit confirmation. Publishes are permanent.
3. **Run `yarn check-all` before any commit or push.** Composes format, lint, typecheck, publint.
4. **Keep `yarn publint` on `--pack npm`.** `--pack auto` picks yarn-1 mode and reports false-positive errors.
5. **Keep `engines.node` at `>=22.0.0` and keep the CI `test-matrix` covering that floor.** Node 22 is the oldest maintained LTS (Node 20 is EOL; `@sd-jwt/*` needs 20+). `>=22` is a lower bound, so it still allows 24 and newer. The floor is checked at runtime by the `test-matrix` job (`yarn test` on Node 22 and 24); `@types/node` tracks the dev runtime (24, from `.node-version`), not the floor. Invariant: the `test-matrix` low entry must equal the `engines.node` floor, so raise the floor by bumping both together. If you drop the matrix, pin `@types/node` to the floor major so typecheck guards it instead.
6. **Never use `eslint-disable` as a workaround.** If a lint rule fires, fix the underlying code or surface the rule to the user for a config decision — do not silence it inline. Same applies to `@ts-ignore` / `@ts-expect-error` and other suppression comments.

## Browser Graph

Browser-runtime files (reachable from `src/index.browser.ts`):

- `src/index.browser.ts`
- `src/vc_presentation.browser.ts`
- `src/presentation/base_client.ts`
- `src/transaction_data.ts`
- `src/dcql.ts`
- `src/constants.ts`
- `src/types.ts` (type-only, erased at emit)

Everything else under `src/` is Node-side. Verify after build:

```bash
grep -lE '(jose|@sd-jwt|@owf|node:)' \
  dist/index.browser.js dist/vc_presentation.browser.js \
  dist/presentation/base_client.js dist/transaction_data.js \
  dist/dcql.js dist/constants.js dist/types.js
# Must match nothing.
```

## Essential Commands

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `yarn check-all`    | Full check: format, lint, typecheck, publint |
| `yarn build`        | `tsc` emit to `dist/`                        |
| `yarn typecheck`    | `tsc --noEmit`                               |
| `yarn lint:check`   | eslint, no fix                               |
| `yarn lint`         | `eslint --fix`                               |
| `yarn format:check` | `prettier --check`                           |
| `yarn format`       | `prettier --write`                           |
| `yarn publint`      | `publint --pack npm` (keep the flag)         |

## TypeScript Conventions

- `verbatimModuleSyntax: true` — use `import type` / `export type`.
- `noUncheckedIndexedAccess: true` — indexing returns `T | undefined`; use `!` only when access is guaranteed safe.
- `exactOptionalPropertyTypes: true` — spread optional fields conditionally: `...(state !== undefined && { state })`.
- Local imports use the `.ts` extension (`rewriteRelativeImportExtensions` rewrites to `.js` on emit).
- Wire-level types use snake_case to match the JSON wire format.

## Recipes

### Add a new EC algorithm

In `src/presentation/node_client.ts`:

1. Import the helper from `@owf/crypto`.
2. Add to `VERIFIERS` — `SupportedAlg` derives from `keyof typeof VERIFIERS` automatically.
3. Add the matching entry to `EXPECTED_CURVE` — `Record<SupportedAlg, string>` enforces it.

### Add a new transaction-data template

In `src/transaction_data.ts`:

1. Add the URN literal to `TX_DATA_TYPE` (keep `as const`).
2. Define payload and envelope types (use the `Envelope<T, P>` helper).
3. Add the variant to the `TransactionData` union.
4. Add a factory to the `transactionData` namespace.
5. Re-export the new type names from `src/index.browser.ts` and `src/index.node.ts`.

`encodeTransactionData()` operates on the union — no encoder changes.

## Publishing

Prompt before publishing (Hard Rule 2).

- **Auth**: npm Trusted Publishing via OIDC (no `NPM_TOKEN`).
- **Trigger**: GitHub Release published → `.github/workflows/publish.yml`.
- **Registry**: https://www.npmjs.com/package/@proof.com/proof-vc-common

### Release flow (after user confirms)

`main` is branch-protected: direct pushes are rejected. Bump on a branch, merge the PR, then create the Release against the exact merged commit SHA.

1. Bump on a branch (no auto-tag from npm — the tag is created by `gh release create` in step 4):
   ```bash
   git switch -c release-X.Y.Z origin/main
   npm version patch --no-git-tag-version          # or minor / major; writes package.json only
   git commit -am "Release X.Y.Z"
   git push -u origin release-X.Y.Z
   ```
2. Open a PR. Approve and merge in the GitHub UI.
3. Locate the merged commit SHA on `main` by grepping for the release commit subject:
   ```bash
   git fetch origin main
   SHA=$(git log origin/main --grep='Release X.Y.Z' --format=%H -n 1)
   echo "$SHA"   # sanity-check before using
   ```
   Expect exactly one match. If zero matches, the PR isn't merged yet. If multiple, narrow the grep further.
4. Create the Release against that SHA — `gh release create` creates the tag automatically when it doesn't exist:
   ```bash
   gh release create vX.Y.Z --target "$SHA" --generate-notes
   ```

The Release triggers `publish.yml`: check suite → tag must match `package.json` → `npm publish --provenance --access public`.

Never `git push --follow-tags` to `main`: the commit is rejected but the tag still pushes, stranding it on an unmerged commit. Delete a stray tag with `git push --delete origin vX.Y.Z`.

## Tooling (Yarn 4)

- Yarn is pinned via `packageManager: yarn@4.17.0` (`.yarn/releases/yarn-4.17.0.cjs`). Run `corepack enable` so the project yarn is used; CI does the same.
- `.yarnrc.yml` config: `nodeLinker: node-modules`, immutable installs (`enableImmutableInstalls: true` - no `--frozen-lockfile` needed), `enableScripts: false` (no postinstall scripts - a dep needing a build step at install won't run it), `npmMinimalAgeGate: 1w` (deps published <1 week ago won't install; matches the dependabot 7-day cooldown).
- `yarn.lock` is the only lockfile.

## Notes

- Scope is `@proof.com` (with the dot), not `@proof`.
