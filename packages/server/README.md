# proof-vc-server

proof-vc-server lets your server request and verify Proof Digital IDs, with Signed Mandates and
x401.

Your server sends the user to Proof with an
[OpenID for Verifiable Presentations](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
(OID4VP) authorization request. The user presents their Digital ID and signs your Signed Mandate,
such as a payment. Proof sends the presentation (`vp_token`) to your server, which verifies it and
reads the claims and the signed mandate. With [x401](https://x401.proof.com/spec/latest/), AI agents
present the user's Digital ID to your HTTP endpoints.

To add a button to your website without a backend SDK, use
[proof-vc-web](https://github.com/proof/proof-vc-web).

- [Installation](#installation)
- [Quickstart](#quickstart)
- [Usage](#usage)
  - [Signed Mandates](#signed-mandates)
    - [Request a signed mandate](#request-a-signed-mandate)
    - [Read the signed mandate](#read-the-signed-mandate)
  - [Secure the request](#secure-the-request)
    - [Use a pushed authorization request](#use-a-pushed-authorization-request)
    - [Sign the request](#sign-the-request)
  - [x401](#x401)
    - [Enroll an x401 verifier](#enroll-an-x401-verifier)
    - [Verify x401 presentations](#verify-x401-presentations)
    - [Use the Digital Credentials API](#use-the-digital-credentials-api)
    - [Pay for signatures with x402 (optional)](#pay-for-signatures-with-x402-optional)
  - [Request specific claims](#request-specific-claims)
- [Reference](#reference)
- [Credentials](#credentials)
- [Errors](#errors)
- [Certificate authority](#certificate-authority)
- [Links](#links)
- [Contributing](#contributing)
- [License](#license)

## Installation

```sh
npm install @proof.com/proof-vc-server
```

proof-vc-server needs Node 22.12 or later. It includes `@proof.com/proof-vc-common`, the code that
it shares with proof-vc-web.

You need a Proof client ID and client secret.
[Set up an OAuth application](https://dev.proof.com/docs/oauth-client-credentials) in your Proof
account, and add your callback URL to its redirect URIs.

## Quickstart

This example asks the user to sign a payment with their Digital ID. Create a client and a verifier:

```js
import {
  createClient,
  createVerifier,
  transactionData,
  TX_DATA_TYPE,
} from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  clientSecret: process.env.PROOF_CLIENT_SECRET,
  callbackUri: "https://example.com/verify",
  responseMode: "direct_post",
  usePushedAuthorizationRequest: true,
});
const verifier = createVerifier({ environment: "sandbox" });
const nonces = new Map(); // Use your database in production.
```

When the user starts the payment, send them to Proof with their email, a new `nonce` and a new `state`:

```js
export async function checkout(email) {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  nonces.set(state, nonce);

  const url = await proof.authorizationUrl({
    nonce,
    state,
    loginHint: email,
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
  return Response.redirect(url, 302);
}
```

Proof sends the presentation to your callback in a POST request. The callback must be a public
HTTPS URL. Verify the presentation, compare its nonce, and read the signed payment. Proof then sends
the user to the `redirect_uri` that you return.

```js
export async function verify(request) {
  const form = await request.formData();
  const state = String(form.get("state"));
  const nonce = nonces.get(state);
  nonces.delete(state);

  const presentation = await verifier.verifyVPToken({
    encodedVPToken: String(form.get("vp_token")),
    aud: "<CLIENT_ID>",
  });
  const credential = presentation.proof_id_default?.[0];
  if (!nonce || credential?.getNonce() !== nonce) {
    return Response.json({ error: "nonce mismatch" }, { status: 400 });
  }

  console.log(credential.toJSON());
  // => { givenName: "Alexander J", familyName: "Sample", isOver18: true, ... }
  console.log(credential.getTransactionData(TX_DATA_TYPE.PAYMENT_ITEMIZED));
  // => { title: "Drive Shaft", currency: "USD", items: [...], ... }

  return Response.json({ redirect_uri: "https://example.com/thank-you" });
}
```

`checkout` and `verify` use the web standard `Request` and `Response`. Mount them in your framework
at `GET /checkout` and `POST /verify`. `email` is the email address of the signed-in user.

## Usage

### Signed Mandates

A Signed Mandate binds the presentation to an action, such as a payment or a wire transfer. Proof
shows the mandate to the user, and the user signs it with their Digital ID. Proof uses
[OID4VP transaction data](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-transaction-data).

#### Request a signed mandate

Pass the mandate as `transactionData`. Use a
[pushed authorization request](#use-a-pushed-authorization-request), so that the mandate does not
make the URL too long.

```js
const url = await proof.authorizationUrl({
  nonce,
  state,
  loginHint: email,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  transactionData: transactionData.wireInstructions({
    recipient: {
      institution_name: "Crestline Financial",
      individual_name: "Acme Corp LLC",
      routing_number: "055000123",
      account_number: "7293",
    },
    source: {
      institution_name: "Sterling & Union",
      individual_name: "Sterling & Union",
      routing_number: "091000456",
      account_number: "4821",
    },
    amount: 5000,
    currency: "USD",
    memo: "Invoice #2024-089",
  }),
});
```

`proof`, `email`, `nonce` and `state` are the ones from the [Quickstart](#quickstart).

Mandate types:

| Factory                               | `TX_DATA_TYPE`          | Payload type                 | Use it for                         |
| ------------------------------------- | ----------------------- | ---------------------------- | ---------------------------------- |
| `transactionData.paymentItemized`     | `PAYMENT_ITEMIZED`      | `PaymentItemizedPayload`     | A purchase with line items         |
| `transactionData.wireInstructions`    | `WIRE_INSTRUCTIONS`     | `WireInstructionsPayload`    | A wire transfer                    |
| `transactionData.paymentMandate`      | `PAYMENT_MANDATE`       | `PaymentMandatePayload`      | An AI agent that pays for the user |
| `transactionData.mppPaymentChallenge` | `MPP_PAYMENT_CHALLENGE` | `MppPaymentChallengePayload` | An MPP payment challenge           |
| `transactionData.sessionData`         | `SESSION_DATA`          | `SessionDataPayload`         | The user's IP address and device   |

#### Read the signed mandate

After you verify the presentation, `getTransactionData` returns the mandate that the user signed,
or `undefined` when the presentation has no mandate of that type:

```js
const wire = credential.getTransactionData(TX_DATA_TYPE.WIRE_INSTRUCTIONS);
```

`credential` is the one from the [Quickstart](#quickstart).

### Secure the request

#### Use a pushed authorization request

With [Pushed Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9126) (PAR), your
server sends the request parameters to Proof, and the URL holds only a reference to them. The
parameters stay out of the browser, and the URL stays short. PAR needs your client secret, and
each request needs a `loginHint`.

```js
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  clientSecret: process.env.PROOF_CLIENT_SECRET,
  callbackUri: "https://example.com/verify",
  responseMode: "direct_post",
  usePushedAuthorizationRequest: true,
});
```

The request times out after `timeout` milliseconds (10 000 by default). To cancel it earlier, pass
a signal: `proof.authorizationUrl(params, { signal })`.

#### Sign the request

With [JWT-Secured Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9101) (JAR),
proof-vc-server signs the request parameters with your ES256 (P-256) private key. You can use JAR
with PAR.

```js
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  callbackUri: "https://example.com/verify",
  responseMode: "direct_post",
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => privateKey,
});
```

`privateKeyFactory` returns a JWK, a `CryptoKey` or a `KeyObject`.

Without PAR, the signed request can make the URL too long. Serve it from your server instead, with
`Content-Type: application/oauth-authz-req+jwt`, and send only its URL:

```js
const jwt = await proof.signedAuthorizationRequest({
  nonce,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
await store.put("requests/42", jwt);

const url = proof.jarByReferenceAuthorizationUrl({
  requestUri: "https://example.com/requests/42",
});
```

### x401

With [x401](https://x401.proof.com/spec/latest/), your HTTP endpoint answers `401` with a proof
request, and the user's AI agent presents their Digital ID. To protect an endpoint on Cloudflare
Workers, use [x401-workers](https://github.com/proof/x401-workers). It uses proof-vc-server.

#### Enroll an x401 verifier

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

#### Verify x401 presentations

x401 presentations have detached signatures. The verifier gets them from Proof with your client ID
and the private key published in your Client ID Metadata Document:

```js
import { createVerifier } from "@proof.com/proof-vc-server";

const verifier = createVerifier({
  environment: "sandbox",
  clientId: "https://example.com/.well-known/proof-client.json",
  privateKeyFactory: () => privateKey,
});
```

#### Use the Digital Credentials API

`signedDcApiRequest` returns a signed request for the
[W3C Digital Credentials API](https://www.w3.org/TR/digital-credentials/). Pass it to
`navigator.credentials.get` in the browser. `expectedOrigins` lists the origins that can make the request: your
website, and any party between it and the user, such as an AI agent's browser.

```js
import { createClient, DCQL_QUERY_BASIC } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "https://example.com/.well-known/proof-client.json",
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => privateKey,
});

const request = await proof.signedDcApiRequest({
  nonce,
  dcqlQuery: DCQL_QUERY_BASIC,
  expectedOrigins: ["https://example.com"],
});
```

#### Pay for signatures with x402 (optional)

By default, Proof charges your account's default payment method for x401 signatures. To pay with
[x402](https://dev.proof.com/docs/x401-signatures#pay-with-x402) instead, pass a `fetch` that pays.
`evmPrivateKey` is your wallet's private key.

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

### Request specific claims

`scope` sets the claims that the user presents. Each scope returns its credentials under one key of
the `verifyVPToken` result.

| `scope`                                                        | Claims                                              | Result key                |
| -------------------------------------------------------------- | --------------------------------------------------- | ------------------------- |
| `urn:proof:params:scope:verifiable-credentials:basic`          | `given_name`, `family_name`, `age_equal_or_over.18` | `proof_id_default`        |
| `urn:proof:params:scope:verifiable-credentials:nationality:us` | `age_equal_or_over.18`, `is_national.us`            | `proof_id_nationality_us` |

To write the query yourself, pass a
[DCQL](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-digital-credentials-query-l)
query as `dcqlQuery` instead of `scope`:

```js
import { DCQL_QUERY_BASIC } from "@proof.com/proof-vc-server";

const url = await proof.authorizationUrl({
  nonce,
  loginHint: email,
  dcqlQuery: DCQL_QUERY_BASIC,
});
```

`proof`, `email` and `nonce` are the ones from the [Quickstart](#quickstart).

## Reference

`createClient` options:

| Option                           | Default    | Description                                                                                    |
| -------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `environment`                    |            | `"sandbox"` or `"production"`                                                                  |
| `clientId`                       |            | Your Proof client ID                                                                           |
| `callbackUri`                    |            | Where Proof sends the presentation; one of your client's redirect URIs                         |
| `responseMode`                   | `fragment` | `direct_post` posts the presentation to `callbackUri`; `fragment` sends the user there with it |
| `clientSecret`                   |            | Required with `usePushedAuthorizationRequest`                                                  |
| `usePushedAuthorizationRequest`  | `false`    | Send the request with PAR                                                                      |
| `useSecuredAuthorizationRequest` | `false`    | Sign the request (JAR); needs `privateKeyFactory`                                              |
| `privateKeyFactory`              |            | Returns your ES256 private key: JWK, `CryptoKey` or `KeyObject`                                |
| `requestObjectLifetime`          | `300`      | Lifetime of the signed request, in seconds                                                     |
| `timeout`                        | `10000`    | HTTP timeout, in milliseconds                                                                  |
| `fetch`                          | `fetch`    | The `fetch` to use for HTTP requests                                                           |

`authorizationUrl` parameters:

| Parameter         | Required               | Description                                                                    |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `nonce`           | yes                    | A new random value for each request; compare it when you verify                |
| `scope`           | `scope` or `dcqlQuery` | The claims to request; see [Request specific claims](#request-specific-claims) |
| `dcqlQuery`       | `scope` or `dcqlQuery` | A DCQL query, instead of `scope`                                               |
| `transactionData` | no                     | A Signed Mandate; see [Signed Mandates](#signed-mandates)                      |
| `state`           | no                     | A value that Proof sends back with the presentation                            |
| `loginHint`       | with PAR               | The user's email, pre-filled on Proof                                          |

`createVerifier` options:

| Option              | Description                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| `environment`       | `"sandbox"` or `"production"`; use the same one as the request                        |
| `clientId`          | Your client ID; required for [x401 presentations](#verify-x401-presentations)         |
| `privateKeyFactory` | Your ES256 private key; required for [x401 presentations](#verify-x401-presentations) |
| `timeout`, `fetch`  | As in `createClient`                                                                  |

| Function                         | Description                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `createClient`                   | Creates a client that builds authorization requests                           |
| `createVerifier`                 | Creates a verifier with `verifyVPToken`, and `verify` for a single SD-JWT-VC  |
| `createClientIdMetadataDocument` | Builds a Client ID Metadata Document                                          |
| `enroll`                         | Creates a verifier account, as the `enroll` command does                      |
| `agentsTrustListUrl`             | The redirect URI for x401 verifiers                                           |
| `parseAuthorizationResponse`     | Reads the presentation from the callback URL, with `responseMode: "fragment"` |

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
| `getTransactionData(type)` | The Signed Mandate of that type, or `undefined`               |
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

Proof issues Digital IDs from its
[certificate authority](https://www.proof.com/legal/certificate-policy). `production` verifies them
against the [Proof Root CA R1](http://cert.proof.com/proof-root-ca-r1.crt)
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
