# Proof VC - AI Assistant Guide

A Yarn 4 monorepo publishing two ESM TypeScript packages:

- **`@proof.com/proof-vc-common`** (`packages/common`) — public/frontend, runs in the browser **and** Node, **zero runtime deps**. Builds OID4VP Authorization Request URLs (`createClient` / `buildAuthorizationUrl`) and reads the `vp_token` from the redirect (`parseAuthorizationResponse`). No secrets, no `nonce` generation, no transaction data.
- **`@proof.com/proof-vc-server`** (`packages/server`) — privileged/backend, **Node only**. Adds `verify` / `verifyVPToken` (SD-JWT-VC verification, X.509 chain validation against an embedded trust root), Pushed Authorization Requests, transaction data, and DC API requests. Depends on `proof-vc-common` and **re-exports it**, so backend integrators need one import. Yarn links it locally via transparent workspaces.

`server` reuses `common`'s URL/param builders via the `@proof.com/proof-vc-common/internal` subpath export (server-only; not public frontend surface).

## Hard Rules

1. **`packages/common` must stay pure.** No `node:*`, `@sd-jwt/*`, `@owf/*`, or other runtime imports from anything reachable from `packages/common/src/index.ts` or `packages/common/src/internal.ts`. Type-only imports (`import type` / `export type *`) are safe — `verbatimModuleSyntax: true` erases them. Verify after build (see Package Boundaries).
2. **Prompt before publishing.** Never bump version, push tags, create a Release, or trigger the publish workflow without explicit confirmation. Publishes are permanent.
3. **Run `yarn check-all` before any commit or push.** Composes format, lint, typecheck, publint.
4. **Keep `yarn publint` on `--pack npm`.** `--pack auto` picks yarn-1 mode and reports false-positive errors.
5. **Keep `engines.node` at `>=22.0.0` and keep the CI `test-matrix` covering that floor.** Node 22 is the oldest maintained LTS (Node 20 is EOL; `@sd-jwt/*` needs 20+). `>=22` is a lower bound, so it still allows 24 and newer. The floor is checked at runtime by the `test-matrix` job (`yarn test` on Node 22 and 24); `@types/node` tracks the dev runtime (24, from `.node-version`), not the floor. Invariant: the `test-matrix` low entry must equal the `engines.node` floor, so raise the floor by bumping both together. If you drop the matrix, pin `@types/node` to the floor major so typecheck guards it instead.
6. **Never use `eslint-disable` as a workaround.** If a lint rule fires, fix the underlying code or surface the rule to the user for a config decision — do not silence it inline. Same applies to `@ts-ignore` / `@ts-expect-error` and other suppression comments.

## Package Boundaries

Versioning is **lockstep**: both packages always share one version, published together from one GitHub Release.

`packages/common/src` (browser + Node, zero deps):

- `index.ts` (public entry), `internal.ts` (server-only helpers)
- `client.ts` — `createClient`, `buildAuthorizationUrl`, `parseAuthorizationResponse`, and the shared param/URL builders
- `dcql.ts`, `constants.ts`, `types.ts` (shared wire types — the single source of truth; server imports & re-exports them)

`packages/server/src` (Node only):

- `index.ts` — `export * from "@proof.com/proof-vc-common"` then the server surface (its `createClient` intentionally shadows the frontend one)
- `client.ts` — server `createClient` (PAR, `transactionData`, `dcApiRequest`); `authorizationUrl` is `async` (PAR fetches)
- `verifier.ts` — `createVerifier` → `verify` / `verifyVPToken`
- `transaction_data.ts`, `proof_credentials.ts`, `proof_credential_factory.ts`, `utils.ts`, `types.ts` (`ProofCredential`/`VPToken`/`TrustRoot`), `certificates/**`

Verify `common` stays free of runtime leaks after build:

```bash
grep -lE '(jose|@sd-jwt|@owf|node:)' packages/common/dist/*.js
# Must match nothing.
```

## Essential Commands

Run from the repo root. Use `corepack yarn …` (or just `yarn`, with Corepack enabled).

| Command             | Purpose                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| `yarn check-all`    | Full check: format, lint, build, publint                                           |
| `yarn build`        | `tsc -b` (project references; builds common then server; errors on any type error) |
| `yarn test`         | `yarn workspaces foreach` run tests (each self-builds)                             |
| `yarn lint:check`   | eslint, no fix                                                                     |
| `yarn lint`         | `eslint --fix`                                                                     |
| `yarn format:check` | `prettier --check`                                                                 |
| `yarn format`       | `prettier --write`                                                                 |
| `yarn publint`      | publint over both publishable packages (`--pack npm`)                              |

Installs are immutable by default (`.yarnrc.yml`). When changing dependencies or workspaces, run `yarn install --no-immutable` to update `yarn.lock`, then commit it.

## Package manager (Yarn for dev, npm only for release)

- **Yarn 4 (Corepack)** runs everything day-to-day: `install`, `build`, `test`, `lint`, `format`, `publint`, `check-all`. `yarn.lock` is the only lockfile.
- **npm is used only in the release path** — `npm version … --workspaces` (bump) and `npm publish -w … --provenance` (publish) — for OIDC provenance / trusted publishing and the `-w` workspace publish. Always pass `--no-package-lock` so npm doesn't drop a `package-lock.json` into this Yarn-only repo.
- **Don't run `npm install` / `npm ci` (or bare `npm version` / `npm publish`) locally outside the release flow.** npm's reify rewrites `node_modules` in a way that breaks Yarn's per-workspace `PATH` (symptom: workspace scripts fail with `command not found: tsc` / `publint`); recover with a fresh `yarn install`.
- Each publishable package declares its script tools (`typescript`, `publint`) as devDependencies so `yarn workspace <pkg> <script>` (and `cd packages/<pkg> && yarn <script>`) work standalone — Yarn only exposes a workspace's own deps on its script `PATH`.

## TypeScript Conventions

- `verbatimModuleSyntax: true` — use `import type` / `export type`.
- `noUncheckedIndexedAccess: true` — indexing returns `T | undefined`; use `!` only when access is guaranteed safe.
- `exactOptionalPropertyTypes: true` — spread optional fields conditionally: `...(state !== undefined && { state })`.
- Local imports (within a package) use the `.ts` extension (`rewriteRelativeImportExtensions` rewrites to `.js` on emit).
- Cross-package imports use the bare specifier (`@proof.com/proof-vc-common` / `…/internal`), resolved through the workspace symlink to the built `dist`.
- Wire-level types use snake_case to match the JSON wire format.
- Throw `Error` instances, not bare strings.
- Shared config is in `tsconfig.base.json`; each package's `tsconfig.json` sets `rootDir`/`outDir`/`lib`/`types` and (server) `references`.

## Recipes

### Add a new EC algorithm

In `packages/server/src/verifier.ts`:

1. Import the helper from `@owf/crypto`.
2. Add to `VERIFIERS` — `SupportedAlg` derives from `keyof typeof VERIFIERS` automatically.
3. Add the matching entry to `EXPECTED_CURVE` — `Record<SupportedAlg, string>` enforces it.

### Add a new transaction-data template

In `packages/server/src/transaction_data.ts`:

1. Add the URN literal to `TX_DATA_TYPE` (keep `as const`).
2. Define payload and envelope types (use the `Envelope<T, P>` helper).
3. Add the variant to the `TransactionData` union.
4. Add a factory to the `transactionData` namespace.
5. Re-export the new type names from `packages/server/src/index.ts`.

`encodeTransactionData()` operates on the union — no encoder changes.

## Publishing

Prompt before publishing (Hard Rule 2).

- **Auth**: npm Trusted Publishing via OIDC (no `NPM_TOKEN`), configured per package. `@proof.com/proof-vc-server` is a new package — confirm its trusted-publisher config exists on npm before the first release.
- **Trigger**: GitHub Release published → `.github/workflows/publish.yml`, which publishes **both** packages with `npm publish -w <pkg> --provenance --access public --no-package-lock`, common first.
- **Registries**: https://www.npmjs.com/package/@proof.com/proof-vc-common and https://www.npmjs.com/package/@proof.com/proof-vc-server

### Release flow (after user confirms)

`main` is branch-protected: direct pushes are rejected. Bump both packages on a branch, merge the PR, then create the Release against the exact merged commit SHA.

1. Bump on a branch (the tag is created by `gh release create` in step 4):
   ```bash
   git switch -c release-X.Y.Z origin/main
   npm version X.Y.Z --workspaces --no-git-tag-version --no-package-lock
   npm pkg set "dependencies[@proof.com/proof-vc-common]=X.Y.Z" -w packages/server --no-package-lock
   yarn install --no-immutable   # refresh yarn.lock for the bumped versions/range
   git commit -am "Release X.Y.Z"
   git push -u origin release-X.Y.Z
   ```
   `npm version` bumps each package's `version`; the `npm pkg set` step then pins server's `@proof.com/proof-vc-common` dependency to the exact version being released, so server always ships against the latest common. `yarn install --no-immutable` refreshes `yarn.lock` (the version/range changes invalidate it) so the immutable CI install in `publish.yml` passes — commit it with the release.
2. Open a PR. Approve and merge in the GitHub UI.
3. Locate the merged commit SHA on `main`:
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

The Release triggers `publish.yml`: checks → tag must match both `package.json` versions → publish both with provenance.

Never `git push --follow-tags` to `main`: the commit is rejected but the tag still pushes, stranding it on an unmerged commit. Delete a stray tag with `git push --delete origin vX.Y.Z`.

## Notes

- Yarn 4 via Corepack, pinned by `packageManager` (`.yarn/releases/yarn-4.17.0.cjs`). `.yarnrc.yml`: `nodeLinker: node-modules`, immutable installs, `enableScripts: false`, `npmMinimalAgeGate: 1w`.
- The root `package.json` is private (`proof-vc-workspace`) and is not published.
- Scope is `@proof.com` (with the dot), not `@proof`.
