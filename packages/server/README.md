# proof-vc-server

proof-vc-server lets your server request and verify Proof Digital IDs. It includes
[proof-vc-common](https://github.com/proof/proof-vc-common), for the browser.

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
  - [Send the presentation to your server](#send-the-presentation-to-your-server)
  - [Request specific claims](#request-specific-claims)
  - [Use a pushed authorization request](#use-a-pushed-authorization-request)
  - [Sign the request](#sign-the-request)
  - [Host the signed request](#host-the-signed-request)
  - [Use the Digital Credentials API](#use-the-digital-credentials-api)
  - [Add transaction data](#add-transaction-data)
  - [Read the signed transaction data](#read-the-signed-transaction-data)
  - [Verify a single credential](#verify-a-single-credential)
  - [Verify x401 presentations](#verify-x401-presentations)
  - [Enroll an x401 verifier](#enroll-an-x401-verifier)
- [Reference](#reference)
- [Credentials](#credentials)
- [Errors](#errors)
- [Certificate authority](#certificate-authority)
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

The examples below run on your server with proof-vc-server, unless they say otherwise.

### Send the presentation to your server

With `responseMode: "direct_post"`, Proof sends the `vp_token` to your server in a POST request.
Set `callbackUri` to your server endpoint. The callback must be a public HTTPS URL.

```js
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  callbackUri: "https://example.com/verify",
  responseMode: "direct_post",
});

const url = await proof.authorizationUrl({
  nonce: session.nonce,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  state: "6A2B4CD830",
});
```

Proof sends this request to your endpoint:

```http
POST /verify HTTP/1.1
Content-Type: application/x-www-form-urlencoded

vp_token=eyJwcm9vZl9pZF9...&state=6A2B4CD830
```

Verify `vp_token` as in the [Quickstart](#quickstart).

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
import { DCQL_QUERY_BASIC } from "@proof.com/proof-vc-server";

const url = await proof.authorizationUrl({
  nonce: session.nonce,
  dcqlQuery: DCQL_QUERY_BASIC,
});
```

`proof` is the client from the example above.

### Use a pushed authorization request

With [Pushed Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9126) (PAR), your
server sends the request parameters to Proof, and the URL holds only a reference to them. Use it to
keep the parameters out of the browser, or when [transaction data](#add-transaction-data) makes the
URL too long. PAR needs your client secret.

```js
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  clientSecret: process.env.PROOF_CLIENT_SECRET,
  callbackUri: "https://example.com/callback",
  usePushedAuthorizationRequest: true,
});

const url = await proof.authorizationUrl({
  nonce: session.nonce,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

The request times out after `timeout` milliseconds (10 000 by default). To cancel it earlier, pass
a signal: `proof.authorizationUrl(params, { signal })`.

### Sign the request

With [JWT-Secured Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9101) (JAR),
proof-vc-server signs the request parameters with your ES256 (P-256) private key. You can use JAR
with PAR.

```js
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  callbackUri: "https://example.com/callback",
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => privateKey,
});

const url = await proof.authorizationUrl({
  nonce: session.nonce,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

`privateKeyFactory` returns a JWK, a `CryptoKey` or a `KeyObject`.

### Host the signed request

To serve the signed request from your own server, get it with `signedAuthorizationRequest`. Serve
it with `Content-Type: application/oauth-authz-req+jwt`, and give its URL to
`jarByReferenceAuthorizationUrl`. You cannot use this with PAR.

```js
const jwt = await proof.signedAuthorizationRequest({
  nonce: session.nonce,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
await store.put("requests/42", jwt);

const url = proof.jarByReferenceAuthorizationUrl({
  requestUri: "https://example.com/requests/42",
});
```

`proof` is the client from [Sign the request](#sign-the-request).

### Use the Digital Credentials API

`signedDcApiRequest` returns a signed request for the
[W3C Digital Credentials API](https://www.w3.org/TR/digital-credentials/). Pass it to
`navigator.credentials.get` in the browser. `expectedOrigins` lists the origins that can make the
request: your website, and any party between it and the user, such as an AI agent's browser.

```js
import { createClient, DCQL_QUERY_BASIC } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => privateKey,
});

const request = await proof.signedDcApiRequest({
  nonce: session.nonce,
  dcqlQuery: DCQL_QUERY_BASIC,
  expectedOrigins: ["https://example.com"],
});
```

### Add transaction data

[Transaction data](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-transaction-data)
binds the presentation to an action, such as a payment. Proof shows the data to the user, and the
user signs it with their presentation.

```js
import { transactionData } from "@proof.com/proof-vc-server";

const url = await proof.authorizationUrl({
  nonce: session.nonce,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  transactionData: transactionData.paymentItemized({
    title: "Drive Shaft",
    description: "The Roadhouse (18+), May 6 2026",
    currency: "USD",
    items: [
      { quantity: 2, unit_cost: 40.0, label: "General Admission" },
      { quantity: 2, unit_cost: 11.4, label: "Fees" },
    ],
  }),
});
```

`proof` is a client from the examples above.

| Factory                               | Type (`TX_DATA_TYPE`)                                                                     | Payload type                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| `transactionData.paymentItemized`     | `urn:proof:params:vc:transaction-data:payment-itemized:v1` (`PAYMENT_ITEMIZED`)           | `PaymentItemizedPayload`     |
| `transactionData.paymentMandate`      | `urn:proof:params:vc:transaction-data:payment-mandate:v1` (`PAYMENT_MANDATE`)             | `PaymentMandatePayload`      |
| `transactionData.wireInstructions`    | `urn:proof:params:vc:transaction-data:wire-instructions:v1` (`WIRE_INSTRUCTIONS`)         | `WireInstructionsPayload`    |
| `transactionData.mppPaymentChallenge` | `urn:proof:params:vc:transaction-data:mpp-payment-challenge:v1` (`MPP_PAYMENT_CHALLENGE`) | `MppPaymentChallengePayload` |
| `transactionData.sessionData`         | `urn:proof:params:vc:transaction-data:session-data` (`SESSION_DATA`)                      | `SessionDataPayload`         |

### Read the signed transaction data

After you verify the presentation, `getTransactionData` returns the data that the user signed, or
`undefined` when the presentation has none of that type:

```js
import { TX_DATA_TYPE } from "@proof.com/proof-vc-server";

const payment = credential.getTransactionData(TX_DATA_TYPE.PAYMENT_ITEMIZED);
```

`credential` is the one from the [Quickstart](#quickstart).

### Verify a single credential

`verify` verifies one SD-JWT-VC instead of a `vp_token`:

```js
import { createVerifier } from "@proof.com/proof-vc-server";

const verifier = createVerifier({ environment: "sandbox" });

const credential = await verifier.verify({
  encodedSDJWT: "eyJraWQiOiI3...",
  aud: "<CLIENT_ID>",
});
```

### Verify x401 presentations

Presentations that come through [x401](https://x401.proof.com/spec/latest/) have detached
signatures. The verifier gets them from Proof with your client ID and the private key published in
your [Client ID Metadata Document](#enroll-an-x401-verifier):

```js
import { createVerifier } from "@proof.com/proof-vc-server";

const verifier = createVerifier({
  environment: "sandbox",
  clientId: "https://example.com/.well-known/proof-client.json",
  privateKeyFactory: () => privateKey,
});
```

To pay for the signatures with [x402](https://dev.proof.com/docs/x401-signatures#pay-with-x402),
pass a `fetch` that pays. `evmPrivateKey` is your wallet's private key. Otherwise Proof charges your
account's default payment method.

```js
import { createVerifier } from "@proof.com/proof-vc-server";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const wallet = privateKeyToAccount(evmPrivateKey);

const verifier = createVerifier({
  environment: "production",
  clientId: "https://example.com/.well-known/proof-client.json",
  privateKeyFactory: () => privateKey,
  fetch: wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:*", client: new ExactEvmScheme(wallet) }],
  }),
});
```

### Enroll an x401 verifier

An x401 verifier's client ID is the URL of its
[Client ID Metadata Document](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.html).
Build the document and serve it at that URL:

```js
import {
  agentsTrustListUrl,
  createClientIdMetadataDocument,
} from "@proof.com/proof-vc-server";

const document = await createClientIdMetadataDocument({
  environment: "sandbox",
  clientId: "https://example.com/.well-known/proof-client.json",
  clientName: "Example",
  redirectUris: [agentsTrustListUrl("sandbox")],
  jwks: [publicJwk],
});
```

Then create your verifier account. Proof sends an activation link to the email address. In
`production`, the email address must be on the document's domain.

```sh
npx @proof.com/proof-vc-server enroll https://example.com/.well-known/proof-client.json \
  --email you@example.com --key private-key.pem --environment sandbox
```

## Reference

`createClient` options. proof-vc-common accepts the first four.

| Option                           | Default    | Description                                                            |
| -------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `environment`                    |            | `"sandbox"` or `"production"`                                          |
| `clientId`                       |            | Your Proof client ID                                                   |
| `callbackUri`                    |            | Where Proof sends the presentation; one of your client's redirect URIs |
| `responseMode`                   | `fragment` | `fragment` sends the user to `callbackUri`; `direct_post` posts to it  |
| `clientSecret`                   |            | Required with `usePushedAuthorizationRequest`                          |
| `usePushedAuthorizationRequest`  | `false`    | Send the request with PAR                                              |
| `useSecuredAuthorizationRequest` | `false`    | Sign the request (JAR); needs `privateKeyFactory`                      |
| `privateKeyFactory`              |            | Returns your ES256 private key: JWK, `CryptoKey` or `KeyObject`        |
| `requestObjectLifetime`          | `300`      | Lifetime of the signed request, in seconds                             |
| `timeout`                        | `10000`    | HTTP timeout, in milliseconds                                          |
| `fetch`                          | `fetch`    | The `fetch` to use for HTTP requests                                   |

`authorizationUrl` parameters:

| Parameter         | Required               | Description                                                                    |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `nonce`           | yes                    | A new random value for each request; compare it when you verify                |
| `scope`           | `scope` or `dcqlQuery` | The claims to request; see [Request specific claims](#request-specific-claims) |
| `dcqlQuery`       | `scope` or `dcqlQuery` | A DCQL query, instead of `scope`                                               |
| `state`           | no                     | A value that Proof sends back with the presentation                            |
| `loginHint`       | no                     | The user's email, pre-filled on Proof                                          |
| `transactionData` | no                     | proof-vc-server only; see [Add transaction data](#add-transaction-data)        |

`createVerifier` options:

| Option              | Description                                                                         |
| ------------------- | ----------------------------------------------------------------------------------- |
| `environment`       | `"sandbox"` or `"production"`; use the same one as the request                      |
| `clientId`          | Your client ID; needed for [x401 presentations](#verify-x401-presentations)         |
| `privateKeyFactory` | Your ES256 private key; needed for [x401 presentations](#verify-x401-presentations) |
| `timeout`, `fetch`  | As in `createClient`                                                                |

| Function                         | Package | Description                                                 |
| -------------------------------- | ------- | ----------------------------------------------------------- |
| `createClient`                   | both    | Creates a client that builds authorization request URLs     |
| `buildAuthorizationUrl`          | both    | `createClient(config).authorizationUrl(params)` in one call |
| `parseAuthorizationResponse`     | both    | Reads the presentation or the error from the callback URL   |
| `createVerifier`                 | server  | Creates a verifier with `verifyVPToken` and `verify`        |
| `createClientIdMetadataDocument` | server  | Builds a Client ID Metadata Document                        |
| `enroll`                         | server  | Creates a verifier account, as the `enroll` command does    |
| `agentsTrustListUrl`             | both    | The redirect URI for x401 verifiers                         |

## Credentials

`verifyVPToken` returns the credentials by result key, such as `proof_id_default`. Each credential
is a `ProofCredentialV1`, or a `DefaultProofCredential` when this SDK does not know its type.

| Claim                  | `ProofCredentialV1` property | Type    |
| ---------------------- | ---------------------------- | ------- |
| `given_name`           | `givenName`                  | string  |
| `family_name`          | `familyName`                 | string  |
| `birth_date`           | `birthDate`                  | string  |
| `age_equal_or_over.18` | `isOver18`                   | boolean |
| `age_equal_or_over.21` | `isOver21`                   | boolean |
| `age_equal_or_over.65` | `isOver65`                   | boolean |
| `is_national.us`       | `isNationalUS`               | boolean |

A property is `undefined` when the user did not present that claim. All credentials have these
methods:

| Method                     | Returns                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `getNonce()`               | The nonce that the user signed, or `undefined`                |
| `getTransactionData(type)` | The transaction data that the user signed, or `undefined`     |
| `getClaims()`              | The presented claims, as issued                               |
| `toJSON()`                 | The credential type, the format, the nonce and the properties |
| `getSDJWT()`               | The decoded SD-JWT                                            |

## Errors

The SDK throws `ProofVCError`. Its `code` tells you what failed:

| `code`                       | Cause                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| `invalid_config`             | An option or a request parameter is missing or not valid             |
| `invalid_input`              | The `vp_token` or the SD-JWT-VC is malformed                         |
| `authorization_server_error` | Proof answered with an error; read `status`                          |
| `verification_failed`        | The presentation did not pass verification                           |
| `payment_required`           | Proof asks for payment for x401 signatures; pass a `fetch` that pays |

## Certificate authority

Proof issues Digital IDs from its [certificate authority](https://www.proof.com/legal/certificate-policy).
`production` verifies them against the
[Proof Root CA R1](http://cert.proof.com/proof-root-ca-r1.crt)
([in this repository](https://github.com/proof/proof-vc-common/blob/main/packages/server/src/certificates/trust_store/proof_root_ca_r1.ts)). `sandbox`
verifies them against the
[development root](https://github.com/proof/proof-vc-common/blob/main/packages/server/src/certificates/trust_store/proof_root_ca_r1_development.ts).

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
