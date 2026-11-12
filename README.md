# proof-vc-server

proof-vc-server lets your server request and verify Proof Digital IDs.

Your server sends the user to Proof with an
[OpenID for Verifiable Presentations](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
(OID4VP) authorization request. The user presents their Proof Digital ID. Proof sends the
presentation (`vp_token`) to your server, which verifies it and reads the claims. To have the user
sign an action, such as a payment, add a [Signed Mandate](#signed-mandates) to the request. With
[x401](#x401), AI agents present the user's Proof Digital ID to your HTTP endpoints.

To request Proof Digital IDs on your website in a one-click button, use
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
    - [Enroll an x401 _Verifier_](#enroll-an-x401-verifier)
    - [Protect an endpoint](#protect-an-endpoint)
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

Requires Node 22.12 or later.

You need the client ID and the client secret of a Proof OAuth application.
[Set up an OAuth application](https://dev.proof.com/docs/oauth-client-credentials) in your Proof
account, and add your callback URL to its redirect URIs.

## Quickstart

This example is an [Express](https://expressjs.com) app (`npm install express`). It asks the user
for their name and age with their Proof Digital ID. Create a client, a _Verifier_ and the app:

```js
import express from "express";
import { createClient, createVerifier } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "<CLIENT_ID>",
  callbackUri: "https://example.com/verify",
  responseMode: "direct_post",
});
const verifier = createVerifier({ environment: "sandbox" });
const nonces = new Map(); // Use your database in production.

const app = express();
app.use(express.urlencoded({ extended: false }));
```

When the user starts the checkout, send them to Proof with a new `nonce` and a new `state`:

```js
app.get("/checkout", async (req, res) => {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  nonces.set(state, nonce);

  const url = await proof.authorizationUrl({
    nonce,
    state,
    scope: "urn:proof:params:scope:verifiable-credentials:basic",
  });
  res.redirect(url);
});
```

Proof sends the presentation to your callback in a POST request. The callback must be a public
HTTPS URL. Verify the presentation and compare its nonce. Proof then sends the user to the
`redirect_uri` that you return.

```js
app.post("/verify", async (req, res) => {
  const { state, vp_token } = req.body;
  const nonce = nonces.get(state);
  nonces.delete(state);

  const presentation = await verifier.verifyVPToken({
    encodedVPToken: vp_token,
    aud: "<CLIENT_ID>",
  });
  const credential = presentation.proof_id_default?.[0];
  if (!nonce || credential?.getNonce() !== nonce) {
    return res.status(400).json({ error: "nonce mismatch" });
  }

  console.log(credential.toJSON());
  // => { givenName: "Alexander J", familyName: "Sample", isOver18: true, ... }

  // Continue the checkout.

  res.json({ redirect_uri: "https://example.com/thank-you" });
});

app.listen(3000);
```

To test on your computer, expose port 3000 with an HTTPS tunnel. Use the tunnel URL instead of
`https://example.com`, and add its `/verify` URL to the redirect URIs of your OAuth application.

## Usage

### Signed Mandates

A Signed Mandate binds the presentation to an action, such as a payment or a wire transfer. Proof
shows the mandate to the user, and the user signs it with their Proof Digital ID. Proof uses
[OID4VP transaction data](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-transaction-data).

#### Request a signed mandate

Pass the mandate as `transactionData`. Prefer a
[pushed authorization request](#use-a-pushed-authorization-request), so that the mandate does not
make the URL too long.

```js
import { transactionData } from "@proof.com/proof-vc-server";

const url = await proof.authorizationUrl({
  nonce,
  state,
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

`proof`, `nonce` and `state` are the ones from the [Quickstart](#quickstart).

Mandate types:

| Factory                               | `TX_DATA_TYPE`          | Payload type                 | Use it for                         |
| ------------------------------------- | ----------------------- | ---------------------------- | ---------------------------------- |
| `transactionData.paymentItemized`     | `PAYMENT_ITEMIZED`      | `PaymentItemizedPayload`     | A purchase with line items         |
| `transactionData.wireInstructions`    | `WIRE_INSTRUCTIONS`     | `WireInstructionsPayload`    | A wire transfer                    |
| `transactionData.paymentMandate`      | `PAYMENT_MANDATE`       | `PaymentMandatePayload`      | An AI agent that pays for the user |
| `transactionData.mppPaymentChallenge` | `MPP_PAYMENT_CHALLENGE` | `MppPaymentChallengePayload` | An MPP payment challenge           |
| `transactionData.sessionData`         | `SESSION_DATA`          | `SessionDataPayload`         | The user's IP address and device   |

#### Read the signed mandate

After you verify the presentation, `getTransactionData` returns the mandate that the user signed:

```js
import { TX_DATA_TYPE } from "@proof.com/proof-vc-server";

const wire = credential.getTransactionData(TX_DATA_TYPE.WIRE_INSTRUCTIONS);
```

`credential` is the one from the [Quickstart](#quickstart).

### Secure the request

#### Use a pushed authorization request

With [Pushed Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9126) (PAR), your
server sends the request parameters to Proof, and the URL holds only a reference to them. The
parameters stay out of the browser, and the URL stays short. To use PAR, set
`usePushedAuthorizationRequest: true` and your client secret. Then `authorizationUrl` sends the
parameters to Proof and returns the short URL. Each request needs a `loginHint`.

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

const url = await proof.authorizationUrl({
  nonce,
  state,
  loginHint: email,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

`nonce` and `state` are the ones from the [Quickstart](#quickstart). `email` is the email address of
the user.

#### Sign the request

With [JWT-Secured Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9101) (JAR),
proof-vc-server signs the request parameters with your ES256 (P-256) private key. To use JAR, set
`useSecuredAuthorizationRequest: true` and a `privateKeyFactory`. Then `authorizationUrl` returns a
URL with the signed request. You can use JAR with PAR.

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

const url = await proof.authorizationUrl({
  nonce,
  state,
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

`privateKeyFactory` returns a JWK, a `CryptoKey` or a `KeyObject`. Add the matching public key to
your OAuth application.

Without PAR, the signed request can make the URL too long. To send it by reference, get it with
`signedAuthorizationRequest`, serve it from your server with
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
request, and the user's AI agent presents their Proof Digital ID. To protect an endpoint on Cloudflare
Workers, use [x401-workers](https://github.com/proof/x401-workers).

#### Enroll an x401 _Verifier_

An x401 _Verifier_'s client ID is the URL of its
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

Then create your _Verifier_ account. Proof sends an activation link to the email address. In
`production`, the email address must be on the document's domain.

```sh
npx @proof.com/proof-vc-server enroll https://example.com/.well-known/proof-client.json \
  --email you@example.com --key private-key.pem --environment sandbox
```

#### Protect an endpoint

This example uses [x401-node](https://github.com/proof/x401-node) (`npm install @proof.com/x401-node`)
to read and write the x401 headers. When the request has no `PROOF-RESPONSE` header, the endpoint
answers `401` with a signed request for a Proof Digital ID. When the AI agent retries with the
presentation, the endpoint verifies it.

```js
import {
  agentsTrustListUrl,
  createClient,
  createVerifier,
} from "@proof.com/proof-vc-server";
import {
  DC_API_PROTOCOL,
  HEADER,
  verifier as x401,
} from "@proof.com/x401-node";

const clientId = "https://example.com/.well-known/proof-client.json";
const proof = createClient({
  environment: "sandbox",
  clientId,
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => privateKey,
});
const verifier = createVerifier({
  environment: "sandbox",
  clientId,
  privateKeyFactory: () => privateKey,
});
const nonces = new Set(); // Use your database in production.

app.get("/protected", async (req, res) => {
  const proofResponse = req.get(HEADER.PROOF_RESPONSE);
  if (!proofResponse) {
    const nonce = crypto.randomUUID();
    nonces.add(nonce);
    const request = await proof.signedDcApiRequest({
      nonce,
      scope: "urn:proof:params:scope:verifiable-credentials:basic",
      expectedOrigins: [agentsTrustListUrl("sandbox")],
    });
    const payload = x401.buildPayload({
      credentialRequirements: {
        digital: {
          requests: [{ protocol: DC_API_PROTOCOL.SIGNED, data: { request } }],
        },
      },
    });
    return res
      .status(401)
      .set(HEADER.PROOF_REQUEST, x401.encodePayload(payload))
      .end();
  }

  const artifact = x401.decodeResultArtifact(proofResponse);
  const credentialResult =
    artifact.credential_result ??
    (await (await fetch(artifact.credential_result_uri)).json());
  const presentation = await verifier.verifyVPToken({
    encodedVPToken: credentialResult.data.vp_token,
    aud: clientId,
  });
  const credential = presentation.proof_id_default?.[0];
  if (!nonces.delete(credential?.getNonce())) {
    return res.status(401).end();
  }

  res.json(credential.toJSON());
});
```

`app` is the one from the [Quickstart](#quickstart). `privateKey` is the private key of your
_Verifier_. Proof sends the presentation by reference, so the endpoint fetches
`credential_result_uri` when it is set. x401 presentations have detached signatures:
`verifyVPToken` gets them from Proof with your client ID and private key.

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
  environment: "sandbox",
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

| Parameter         | Required | Description                                                                    |
| ----------------- | -------- | ------------------------------------------------------------------------------ |
| `nonce`           | yes      | A new random value for each request; compare it when you verify                |
| `scope`           | yes      | The claims to request; see [Request specific claims](#request-specific-claims) |
| `transactionData` | no       | A Signed Mandate; see [Signed Mandates](#signed-mandates)                      |
| `state`           | no       | A value that Proof sends back with the presentation                            |
| `loginHint`       | with PAR | The user's email, pre-filled on Proof                                          |

`createVerifier` options:

| Option              | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `environment`       | `"sandbox"` or `"production"`; use the same one as the request                  |
| `clientId`          | Your client ID; required for [x401 presentations](#protect-an-endpoint)         |
| `privateKeyFactory` | Your ES256 private key; required for [x401 presentations](#protect-an-endpoint) |
| `timeout`, `fetch`  | As in `createClient`                                                            |

| Function                         | Description                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `createClient`                   | Creates a client that builds authorization requests                            |
| `createVerifier`                 | Creates a _Verifier_ with `verifyVPToken`, and `verify` for a single SD-JWT-VC |
| `createClientIdMetadataDocument` | Builds a Client ID Metadata Document                                           |
| `enroll`                         | Creates a _Verifier_ account, as the `enroll` command does                     |
| `agentsTrustListUrl`             | The redirect URI for x401 _Verifiers_                                          |

## Credentials

`verifyVPToken` returns the credentials by result key, such as `proof_id_default`. Each credential
is a `ProofCredentialV1`, or a `DefaultProofCredential` when this SDK does not know its type.

| Claim                  | `ProofCredentialV1` property | Type    |
| ---------------------- | ---------------------------- | ------- |
| `given_name`           | `givenName`                  | string  |
| `family_name`          | `familyName`                 | string  |
| `age_equal_or_over.18` | `isOver18`                   | boolean |
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

Proof issues Proof Digital IDs from its
[certificate authority](https://www.proof.com/legal/certificate-policy). `production` verifies them
against the [Proof Root CA R1](http://cert.proof.com/proof-root-ca-r1.crt)
([in this repository](packages/server/src/certificates/trust_store/proof_root_ca_r1.ts)). `sandbox`
verifies them against the
[development root](packages/server/src/certificates/trust_store/proof_root_ca_r1_development.ts).

## Links

- [Read the Proof Digital ID guides](https://dev.proof.com/docs/digital-credentials-overview)
- [Read the API documentation](https://dev.proof.com/reference/authorizeverifiablecredentialpresentation)
- [Add a "Continue with Proof" button with proof-vc-web](https://github.com/proof/proof-vc-web)
- [Protect an endpoint with x401-workers](https://github.com/proof/x401-workers)
- [Try Proof Digital IDs](https://try.proof.com)

## Contributing

[Contribution guidelines for this project](CONTRIBUTING.md)

## License

[Apache-2.0](LICENSE)
