# Proof VC Common - AI Assistant Guide

A dual-target ESM TypeScript library: `@proof.com/proof-vc-common`. Browser entry exposes `init` + `getAuthorizationRequestURL` with zero runtime dependencies; Node entry adds `verify` + `verifyVPToken` plus SD-JWT decoding and X.509 chain validation against an embedded trust root.

## Hard Rules

1. **Files reachable from `src/index.browser.ts` MUST NOT import `node:*`, `@sd-jwt/*`, `@owf/*`, or any other runtime package.** Browser consumers ship zero runtime deps — that is the whole reason the package is split. Type-only imports (`import type`, `export type *`) are safe because `verbatimModuleSyntax: true` erases them at emit.

2. **ALWAYS prompt the user before publishing to npm.** Never bump version, push tags, create a GitHub Release, or trigger the publish workflow without explicit confirmation. Publishes are effectively permanent.

3. **Run `yarn check-all` before any commit or push.** It composes format, lint, typecheck, publint. If changes touch browser-reachable files, also run the browser-graph grep below. The global pre-commit rule applies; this repo's equivalent of "tests + lint" is the full check suite.

4. **Do not change `yarn publint` to use any flag other than `--pack npm`.** Default `--pack auto` selects yarn-1 mode and reports false-positive "file not published" errors.

5. **Do not widen `engines.node` below `>=22.0.0`.** `@sd-jwt/*` requires Node 20 and Node 20 is past EOL.

## Browser Graph

Files allowed in the browser-runtime graph (reachable from `src/index.browser.ts`):

- `src/index.browser.ts`
- `src/vc_presentation.browser.ts`
- `src/presentation/base_client.ts`
- `src/transaction_data.ts`
- `src/types.ts` (type-only, fully erased)

Everything else in `src/` is Node-side and must not be reached from browser-side files.

Verify after build:

```bash
grep -lE '(jose|@sd-jwt|@owf|node:)' \
  dist/index.browser.js \
  dist/vc_presentation.browser.js \
  dist/presentation/base_client.js \
  dist/transaction_data.js \
  dist/types.js
# Must match nothing.
```

## Essential Commands

| Command            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `yarn check-all`   | Full check: format, lint, typecheck, publint           |
| `yarn build`       | `tsc` emit to `dist/`                                  |
| `yarn typecheck`   | `tsc --noEmit`                                         |
| `yarn lint:check`  | eslint, no fix                                         |
| `yarn lint`        | `eslint --fix`                                         |
| `yarn format:check`| `prettier --check`                                     |
| `yarn format`      | `prettier --write`                                     |
| `yarn publint`     | `publint --pack npm` — do not change the flag          |

## Architecture

### Class hierarchy

| Class                       | File                                | Role                                                                          |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `VCPresentationClient`      | `src/presentation/base_client.ts`   | Browser-safe base. Authorization URL + PAR + transaction-data encoding.       |
| `NodeVCPresentationClient`  | `src/presentation/node_client.ts`   | Extends base. Adds `verify` / `verifyVPToken`, owns the algorithm registry.   |

Each entry has its own module-level singleton: `vc_presentation.browser.ts`, `vc_presentation.node.ts`. `init()` builds the right class; subsequent calls delegate to it.

### Verification flow (`NodeVCPresentationClient.verify`)

1. Decode SD-JWT.
2. Read `alg` and `x5c` from JWT protected header.
3. Reject if `alg` is not in the `VERIFIERS` registry (`ES256` / `ES384` / `ES512` from `@owf/crypto`).
4. Parse `x5c` entries (base64-encoded DER bytes) into `X509Certificate[]`.
5. `verifyChain(chain, getTrustRoot(env))` — throws on any chain failure.
6. Assert `leafJwk.crv === EXPECTED_CURVE[alg]` (alg/cert consistency check).
7. Build the verifier via `VERIFIERS[alg].getVerifier(leafJwk)`.
8. Verify the SD-JWT signature.

No `/openid-connect/jwks` lookup. Trust comes from the `x5c` chain validated against the embedded root.

### Trust roots

| File                                                              | Used by                                          |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `src/certificates/trust_store/proof_root_ca_r1.ts`                | `production`                                     |
| `src/certificates/trust_store/proof_root_ca_r1_development.ts`    | `localhost`, `next`, `staging`, `sandbox`        |
| `src/certificates/trust_store/index.ts`                           | Exports `getTrustRoot(env)`                      |

`.crt` source files coexist in the same directory as audit aids; only the `.ts` files ship.

### Transaction data

`src/transaction_data.ts` owns four templates and their factories:

- `transactionData.wireInstructions(payload)`
- `transactionData.paymentMandate(payload)`
- `transactionData.paymentItemized(payload)`
- `transactionData.sessionData(payload)`

`credential_ids` is hardcoded to `["proof_id_default"]`. Factories return discriminated-union variants. Encoding to base64url JSON happens inside `buildAuthorizationRequestURL` when an object is passed. `AuthorizationRequestParams.transaction_data` accepts `TransactionData | string` — the string form is an escape hatch for hand-rolled payloads.

## TypeScript Conventions

- `verbatimModuleSyntax: true` — ALWAYS use `import type` / `export type` for types.
- `noUncheckedIndexedAccess: true` — array indexing returns `T | undefined`; use `!` only after guaranteed-safe access.
- `exactOptionalPropertyTypes: true` — use conditional spread for optional fields: `...(state !== undefined && { state })`.
- Local imports use the `.ts` extension (rewritten to `.js` on emit by `rewriteRelativeImportExtensions`).
- Wire-level types use snake_case to match the JSON wire format directly. Do not translate to camelCase.

## Recipes

### Add a new EC algorithm

In `src/presentation/node_client.ts`:

1. Import the helper from `@owf/crypto`.
2. Add it to `VERIFIERS` — `SupportedAlg` is derived as `keyof typeof VERIFIERS`, so the type updates automatically.
3. Add the corresponding entry to `EXPECTED_CURVE` — the `Record<SupportedAlg, string>` type forces this.

No other file needs touching. The curve check at runtime rejects mismatches.

### Add a new transaction-data template

In `src/transaction_data.ts`:

1. Add the URN literal to `TX_DATA_TYPE` (keep `as const`).
2. Define payload and envelope types (use the existing `Envelope<T, P>` helper).
3. Add the variant to the `TransactionData` union.
4. Add a factory to the `transactionData` namespace.
5. Re-export the new type names from `src/index.browser.ts` and `src/index.node.ts`.

`encodeTransactionData()` operates on the union — no encoder changes needed.

## Publishing

ALWAYS prompt the user before publishing (see Hard Rules).

- **Auth**: npm Trusted Publishing via OIDC. No `NPM_TOKEN` in secrets.
- **Trigger**: GitHub Release published.
- **Workflow**: `.github/workflows/publish.yml`.
- **Registry page**: `https://www.npmjs.com/package/@proof.com/proof-vc-common`

### Release flow (after user confirms)

```bash
npm version patch                              # or minor / major
git push --follow-tags
gh release create vX.Y.Z --generate-notes
```

The workflow fires on release-published: full check suite → verifies the tag matches `package.json` → `npm publish --provenance --access public`.

### Troubleshooting 404 from `npm publish`

A 404 after the provenance step succeeded means npm rejected auth (it returns 404 instead of 403 to hide existence). Check the Trusted Publisher config at `https://www.npmjs.com/package/@proof.com/proof-vc-common/access`:

- Organization matches the GitHub org owning the repo (case-sensitive)
- Repository: `proof-vc-common`
- Workflow filename: `publish.yml`
- Environment: empty (unless the workflow uses GitHub Environments)

## Notes

- `yarn.lock` is the only lockfile. No `package-lock.json`.
- Scope is `@proof.com` (with the dot), not `@proof`.
- CI uses Node 24 actions: `actions/checkout@v6` and `actions/setup-node@v6`.
- `yarn pack` and `npm pack` produce slightly different tarballs. Prefer `npm pack` for inspecting what will actually be published.
