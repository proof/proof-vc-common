# proof-vc-common

proof-vc-common lets your website request a Proof Digital ID, and proof-vc-server lets your server
verify it.

Your website sends the user to Proof with an
[OpenID for Verifiable Presentations](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
(OID4VP) authorization request. The user presents their Digital ID, and Proof sends the presentation
(`vp_token`) back to your callback. Your server verifies the presentation and reads the user's
claims.

For a ready-made button, use [proof-vc-web](https://github.com/proof/proof-vc-web). To protect an
HTTP endpoint with [x401](https://x401.proof.com/spec/latest/), use
[x401-workers](https://github.com/proof/x401-workers).

- [Installation](#installation)
- [Quickstart](#quickstart)
- [Usage](#usage)
  - [Request specific claims](#request-specific-claims)
  - [Do more on your server](#do-more-on-your-server)
- [Reference](#reference)
- [Errors](#errors)
- [Links](#links)
- [Contributing](#contributing)
- [License](#license)

## Installation

Install proof-vc-common in your website:

```sh
npm install @proof.com/proof-vc-common
```

Install proof-vc-server on your server. It includes proof-vc-common.

```sh
npm install @proof.com/proof-vc-server
```

| Package                      | Runtime       | Use it to                                                                          |
| ---------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `@proof.com/proof-vc-common` | Browser, Node | Build the authorization request URL and read the response. No runtime dependencies |
| `@proof.com/proof-vc-server` | Node 22.12+   | Everything in proof-vc-common, plus verification, PAR, signed requests and more    |

You need a Proof client ID. [Set up an OAuth application](https://dev.proof.com/docs/oauth-client-credentials)
in your Proof account, and add your callback URL to its redirect URIs.

## Quickstart

Write a new random `nonce` in the page for each page view, and keep it in the user's session. Send
the user to Proof:

```js
import { createClient } from "@proof.com/proof-vc-common";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  callbackUri: "https://example.com/callback",
});

window.location.href = proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

Proof sends the user to `https://example.com/callback#vp_token=...`. On the callback page, send the
`vp_token` to your server:

```js
import { parseAuthorizationResponse } from "@proof.com/proof-vc-common";

const response = parseAuthorizationResponse();
if (response?.type === "success") {
  await fetch("/verify", {
    method: "POST",
    body: new URLSearchParams({ vp_token: response.vpToken }),
  });
} else if (response?.type === "error") {
  console.error(response.error, response.errorDescription);
}
```

Verify the presentation on your server, and compare the credential's nonce with the nonce in the
user's session:

```js
import { createVerifier, ProofCredentialV1 } from "@proof.com/proof-vc-server";

const verifier = createVerifier({ environment: "sandbox" });

const presentation = await verifier.verifyVPToken({
  encodedVPToken: vpToken,
  aud: "<CLIENT_ID>",
});
const credential = presentation.proof_id_default?.[0];

const nonce = credential?.getNonce();
if (nonce !== undefined && nonce !== session.nonce) {
  throw new Error("nonce mismatch");
}
if (credential instanceof ProofCredentialV1) {
  console.log(credential.toJSON());
  // => { givenName: "Alexander J", familyName: "Sample", isOver18: true, ... }
}
```

## Usage

### Request specific claims

`scope` sets the claims that the user presents. Each scope returns its credentials under one key of
the `verifyVPToken` result.

| `scope`                                                        | Claims                                              | Result key                |
| -------------------------------------------------------------- | --------------------------------------------------- | ------------------------- |
| `urn:proof:params:scope:verifiable-credentials:basic`          | `given_name`, `family_name`, `age_equal_or_over.18` | `proof_id_default`        |
| `urn:proof:params:scope:verifiable-credentials:nationality:us` | `age_equal_or_over.18`, `is_national.us`            | `proof_id_nationality_us` |

To write the query yourself, pass a [DCQL](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-digital-credentials-query-l)
query as `dcqlQuery` instead of `scope`:

```js
import { DCQL_QUERY_BASIC } from "@proof.com/proof-vc-common";

const url = proof.authorizationUrl({
  nonce: session.nonce,
  dcqlQuery: DCQL_QUERY_BASIC,
});
```

`proof` is the client from the [Quickstart](#quickstart).

### Do more on your server

[proof-vc-server](https://github.com/proof/proof-vc-common/tree/main/packages/server) adds pushed authorization requests, signed requests, the Digital
Credentials API, transaction data, and verification.

## Reference

`createClient` options:

| Option         | Default    | Description                                                            |
| -------------- | ---------- | ---------------------------------------------------------------------- |
| `environment`  |            | `"sandbox"` or `"production"`                                          |
| `clientId`     |            | Your Proof client ID                                                   |
| `callbackUri`  |            | Where Proof sends the presentation; one of your client's redirect URIs |
| `responseMode` | `fragment` | `fragment` sends the user to `callbackUri`; `direct_post` posts to it  |

`authorizationUrl` parameters:

| Parameter   | Required               | Description                                                                    |
| ----------- | ---------------------- | ------------------------------------------------------------------------------ |
| `nonce`     | yes                    | A new random value for each request; compare it when you verify                |
| `scope`     | `scope` or `dcqlQuery` | The claims to request; see [Request specific claims](#request-specific-claims) |
| `dcqlQuery` | `scope` or `dcqlQuery` | A DCQL query, instead of `scope`                                               |
| `state`     | no                     | A value that Proof sends back with the presentation                            |
| `loginHint` | no                     | The user's email, pre-filled on Proof                                          |

| Function                     | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `createClient`               | Creates a client that builds authorization request URLs     |
| `buildAuthorizationUrl`      | `createClient(config).authorizationUrl(params)` in one call |
| `parseAuthorizationResponse` | Reads the presentation or the error from the callback URL   |
| `agentsTrustListUrl`         | The redirect URI for x401 verifiers                         |

## Errors

`createClient` and `authorizationUrl` throw `ProofVCError` with `code: "invalid_config"` when an
option or a parameter is missing or not valid.

## Links

- [Read the Proof Digital ID guides](https://dev.proof.com/docs/digital-credentials-overview)
- [Read the API documentation](https://dev.proof.com/reference/authorizeverifiablecredentialpresentation)
- [Add a "Continue with Proof" button with proof-vc-web](https://github.com/proof/proof-vc-web)
- [Protect an endpoint with x401-workers](https://github.com/proof/x401-workers)
- [Try Proof Digital IDs](https://try.proof.com)

## Contributing

[Contribution guidelines for this project](https://github.com/proof/proof-vc-common/blob/main/CONTRIBUTING.md)

## License

[Apache-2.0](https://github.com/proof/proof-vc-common/blob/main/LICENSE)
