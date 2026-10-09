# Proof Digital Credentials

<img src="https://raw.githubusercontent.com/proof/proof-vc-common/main/docs/proof-logo.svg" alt="drawing" width="450"/>

_A digital passport. Verified once, usable everywhere._

Read our [documentation](https://dev.proof.com/docs/digital-credentials-overview) or [try it](https://try.proof.com)!

## Table of Contents

- [Packages](#packages)
- [Installation](#installation)
- [Getting Started](#getting-started)
  - [Server Side](#server-side)
  - [Response Modes](#response-modes)
  - [Pushed Authorization Requests](#pushed-authorization-requests)
  - [Secured Authorization Requests](#secured-authorization-requests)
    - [Digital Credentials API](#digital-credentials-api)
    - [Client ID Metadata Document](#client-id-metadata-document)
  - [Verifier Enrollment](#verifier-enrollment)
- [Verifiable Credential Presentation](#verifiable-credential-presentation)
  - [Credential Type](#credential-type)
  - [Request](#request)
    - [Scopes](#scopes)
    - [Transaction Templates](#transaction-templates)
  - [Verify](#verify)
    - [Detached signatures](#detached-signatures)
    - [Nonce](#nonce)
- [Certificate Authority](#certificate-authority)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Packages

| Package                                                                                                | Runtime             | Usage                                                                                                                               | Runtime deps      |
| ------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **[`@proof.com/proof-vc-common`](https://github.com/proof/proof-vc-common/blob/main/packages/common)** | browser **or** Node | Request a Verifiable Presentation                                                                                                   | **0** ✅          |
| **[`@proof.com/proof-vc-server`](https://github.com/proof/proof-vc-common/blob/main/packages/server)** | Node                | `proof-vc-common` **plus** Presentation Verification, Secured Authorization Requests, Transaction Templates and Verifier Enrollment | sd-jwt, owf, jose |

## Installation

Browser / Node:

```
npm install @proof.com/proof-vc-common
```

Node:

```
npm install @proof.com/proof-vc-server
```

Proof implements the [OpenID for Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html) specification.
[Setup an OAuth Application](https://dev.proof.com/docs/oauth-client-credentials) in your Proof account to get your `client_id`.

## Getting Started

### Server Side

You can request a Verifiable Presentation from our backend by using `createClient` and `authorizationUrl` to craft an Authorization Request URL.
Either `fragment` or `direct_post` [Response Mode](#response-modes) are supported (defaults to `fragment`).

With [`@proof.com/proof-vc-server`](https://github.com/proof/proof-vc-common/blob/main/packages/server) you can also use [Pushed Authorization Requests](#pushed-authorization-requests), [Secured Authorization Requests](#secured-authorization-requests) and [Transaction Templates](#transaction-templates).

```javascript
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/verify_vp_token",
  responseMode: "direct_post",
});

const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  state: "6A2B4CD830",
});
res.redirect(redirect);
```

`state` and `loginHint` are optional and forwarded as the `state` and `login_hint` request parameters.

### Response Modes

Proof supports `fragment` and `direct_post` response modes (default `fragment`).

#### fragment

Using `fragment` the `vp_token` is returned as a fragment of the `callbackUri` when the user is 302 redirected from Proof to your website. Use `parseAuthorizationResponse()` in the browser to read it.

```
GET https://example.com/verify_vp_token#vp_token=eyJwcm9vZl9pZF9...
```

#### direct_post

Using `direct_post` the `vp_token` and `state` (optional) are returned in the `application/x-www-form-urlencoded` body of a POST request to the `callbackUri` from Proof to your server. Pass the `vp_token` value as received to [`verifyVPToken`](#verify). See the [OID4VP specification](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-response-mode-direct_post) for more details.

```
POST https://example.com/verify_vp_token
Content-Type: application/x-www-form-urlencoded

vp_token=eyJwcm9vZl9pZF9...&state=6A2B4CD830
```

### Pushed Authorization Requests

Proof supports [Pushed Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9126) (PAR).
You may want to use this feature when using [Transaction Templates](#transaction-templates) to avoid hitting URL size limits.
PAR requires a `clientSecret` and is therefore available **only from `@proof.com/proof-vc-server`**.

```javascript
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "caxdw5a7d",
  clientSecret: process.env.PROOF_CLIENT_SECRET,
  callbackUri: "https://example.com/verify_vp_token",
  responseMode: "direct_post",
  usePushedAuthorizationRequest: true,
});

const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

The PAR request times out after `timeout` milliseconds (client config, default 10 000). Pass an `AbortSignal` as the second argument, `proof.authorizationUrl(params, { signal })`, to cancel it earlier.

### Secured Authorization Requests

Proof supports [JWT-Secured Authorization Requests](https://datatracker.ietf.org/doc/html/rfc9101) (JAR): the Authorization Request parameters are sent as a single signed JWT ("request object") instead of plain query parameters.
JAR is available **only from `@proof.com/proof-vc-server`** and requires:

- `useSecuredAuthorizationRequest: true`
- a `privateKeyFactory` returning your ES256 (P-256) private key as a JWK, `CryptoKey` or `KeyObject`

#### By value

`authorizationUrl` signs the request object and embeds it in the `request` parameter. It can be combined with [Pushed Authorization Requests](#pushed-authorization-requests).

```javascript
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "caxdw5a7d",
  callbackUri: "https://example.com/verify_vp_token",
  responseMode: "direct_post",
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => myPrivateKeyJwk,
});

const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

#### By reference

If you'd rather host the request object yourself, use `signedAuthorizationRequest` to obtain the signed JWT, store it on your backend (serve it with `Content-Type: application/oauth-authz-req+jwt`), then hand Proof a `request_uri` pointing at it with `jarByReferenceAuthorizationUrl`.
JAR by reference cannot be combined with Pushed Authorization Requests.

```javascript
import { createClient } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "caxdw5a7d",
  callbackUri: "https://example.com/verify_vp_token",
  responseMode: "direct_post",
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => myPrivateKeyJwk,
});

// a signed JWT string; store it and serve it at the request_uri below
const jar = await proof.signedAuthorizationRequest({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
await store.put("jar/42", jar);

const redirect = proof.jarByReferenceAuthorizationUrl({
  requestUri: "https://example.com/jar/42",
});
```

#### Digital Credentials API

For the [W3C Digital Credentials API](https://www.w3.org/TR/digital-credentials/) (`dc_api` response mode), `signedDcApiRequest` returns a signed request object you pass to `navigator.credentials.get`.

`expectedOrigins` is required and lists the origins the request may be made from: your own site and any intermediate party it transits through (e.g. an AI-agent VM). `callbackUri` is not used by this flow.

```javascript
import { createClient, DCQL_QUERY_BASIC } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "caxdw5a7d",
  useSecuredAuthorizationRequest: true,
  privateKeyFactory: () => myPrivateKeyJwk,
});

const request = await proof.signedDcApiRequest({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  dcqlQuery: DCQL_QUERY_BASIC,
  expectedOrigins: ["https://example.com", "https://ai-agent.com"],
});
```

#### Client ID Metadata Document

`createClientIdMetadataDocument` builds the [Client ID Metadata Document](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-02.html) to serve at your `clientId` URL.

```javascript
import {
  agentsTrustListUrl,
  createClientIdMetadataDocument,
} from "@proof.com/proof-vc-server";

const document = await createClientIdMetadataDocument({
  environment: "sandbox",
  clientId: "https://example.com/.well-known/proof-client.json", // the URL serving this document
  clientName: "Example", // Your business name
  redirectUris: [agentsTrustListUrl("sandbox")], // agentsTrustListUrl for x401 or your own redirect URIs for OID4VP
  jwks: [publicJwk],
});
```

### Verifier Enrollment

Proof creates your Verifier account from your [Client ID Metadata Document](#client-id-metadata-document).
`enroll` signs a [`private_key_jwt`](https://datatracker.ietf.org/doc/html/rfc7523) client assertion with the private key published in the document.
The email address is on the document's host or its registrable domain, with `www.` counting as the apex domain: `you@example.com` for `https://www.example.com/.well-known/proof-client.json` or `https://app.example.com/.well-known/proof-client.json`.

```
npx @proof.com/proof-vc-server enroll https://example.com/.well-known/proof-client.json --email you@example.com --key private-key.pem --environment sandbox
```

## Verifiable Credential Presentation

### Credential Type

Proof issues Verifiable Credentials according to the [SD-JWT-VC specification](https://www.ietf.org/archive/id/draft-ietf-oauth-sd-jwt-vc-16.html) and publishes its [OID4VCI Credential Issuer Metadata](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-credential-issuer-metadata) at https://api.proof.com/.well-known/openid-credential-issuer.

`ProofCredentialV1`

| claim                | accessor       | type    | description                                                        |
| -------------------- | -------------- | ------- | ------------------------------------------------------------------ |
| given_name           | `givenName`    | string  | user's given name as it appears on the verified identity document  |
| family_name          | `familyName`   | string  | user's family name as it appears on the verified identity document |
| birth_date           | `birthDate`    | string  | user's date of birth in ISO 8601 format (`YYYY-MM-DD`)             |
| age_equal_or_over.18 | `isOver18`     | boolean | boolean confirming the user is 18 or older                         |
| age_equal_or_over.21 | `isOver21`     | boolean | boolean confirming the user is 21 or older                         |
| age_equal_or_over.65 | `isOver65`     | boolean | boolean confirming the user is 65 or older                         |
| is_national.us       | `isNationalUS` | boolean | boolean confirming US nationality (`nationality:us` scope)         |

All attributes are selectively disclosable and will return `undefined` if the claim wasn't disclosed. `getClaims()` returns the disclosed claims as issued and `toJSON()` the accessors above. A credential with a `vct` unknown to this SDK is returned as a `DefaultProofCredential` with a one-time `ProofVCWarning`.

### Request

Request a Verifiable Credential Presentation with an [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) Authorization Request. See [Client Side](https://github.com/proof/proof-vc-common#client-side) and [Server Side](#server-side) above for the two entry points. Exactly one of `scope` or `dcqlQuery` must be given.

#### Scopes

Proof supports the `scope` parameter of the [OID4VP specification](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-using-scope-parameter-to-re). Each scope maps to a pre-defined DCQL query and returns a specific [Credential Type](#credential-type).

Supported `scope` and their associated [Credential Type](#credential-type):

| scope                                                          | Credential Type     | claims                                              | Key Binding JWT |
| -------------------------------------------------------------- | ------------------- | --------------------------------------------------- | --------------- |
| `urn:proof:params:scope:verifiable-credentials:basic`          | `ProofCredentialV1` | `given_name`, `family_name`, `age_equal_or_over.18` | yes             |
| `urn:proof:params:scope:verifiable-credentials:nationality:us` | `ProofCredentialV1` | `age_equal_or_over.18`, `is_national.us`            | yes             |

A scope unknown to this SDK is accepted and emits a one-time `ProofVCWarning`.

#### Transaction Templates

_Transaction Templates_ allow you to bind specific data to a Verifiable Credential Presentation. Proof uses the [Transaction Data](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-transaction-data) parameter of the OID4VP specification.
The data is shown to the user during the Presentation flow and the user signs it with a Key Binding JWT (KB-JWT). The KB-JWT is returned as part of the [Presentation](https://dev.proof.com/docs/sd-jwt-vc-format).

Transaction data is sensitive and is therefore attached **only from `@proof.com/proof-vc-server`**. The following _Transaction Templates_ are available:

**urn:proof:params:vc:transaction-data:wire-instructions:v1**

```javascript
import { createClient, transactionData } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/verify_vp_token",
});

const data = transactionData.wireInstructions({
  recipient: {
    institution_name: "Crestline Financial",
    individual_name: "Acme Corp LLC",
    routing_number: "055000123",
    account_number: "7293",
  },
  source: {
    institution_name: "Sterling & Union",
    individual_name: "Sterling & Union",
    account_number: "4821",
    routing_number: "091000456",
  },
  amount: 5000,
  currency: "USD",
  memo: "Invoice #2024-089",
});
const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  state: "6A2B4CD830",
  transactionData: data,
});
```

---

**urn:proof:params:vc:transaction-data:payment-itemized:v1**

```javascript
import { createClient, transactionData } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/verify_vp_token",
});

const data = transactionData.paymentItemized({
  title: "Drive Shaft",
  description: "The Roadhouse (18+), May 6 2026",
  currency: "USD",
  items: [
    { quantity: 2, unit_cost: 40.0, label: "General Admission" },
    { quantity: 2, unit_cost: 11.4, label: "Fees" },
  ],
});
const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  state: "6A2B4CD830",
  transactionData: data,
});
```

---

**urn:proof:params:vc:transaction-data:payment-mandate:v1**

```javascript
import { createClient, transactionData } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/verify_vp_token",
});

const data = transactionData.paymentMandate({
  payment_instrument: {
    type: "wallet",
    id: "did:example:visa-token-7829",
    description: "Visa ••••7829",
  },
  payee: {
    id: "did:example:summitco",
    name: "Summit Co",
    website: "summitco.com",
  },
  prompt_summary:
    "Find me a 4-season backpacking tent from Summit Co under $500",
  amount: 500,
  currency: "USD",
});
const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  state: "6A2B4CD830",
  transactionData: data,
});
```

---

**urn:proof:params:vc:transaction-data:session-data**

```javascript
import { createClient, transactionData } from "@proof.com/proof-vc-server";

const proof = createClient({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/verify_vp_token",
});

const data = transactionData.sessionData({
  ip_address: "203.0.113.42",
  device_id: "8f3c2a5e-4b1d-4c7e-9a0f-6d2b1e8c7f31",
});
const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
  transactionData: data,
});
```

### Verify

Verification runs server-side. Create a verifier for the same `environment` you used in the request and reuse it: `production` verifies against the Proof Root CA R1, `sandbox` against the Development root (see [Certificate Authority](#certificate-authority)). A credential issued by another environment is rejected on its `iss`. Pass your `client_id` as `aud` to check the Key Binding JWT audience when one is present.

Decode and verify a Verifiable Presentation's `vp_token`:

```javascript
import { createVerifier, ProofCredentialV1 } from "@proof.com/proof-vc-server";

const verifier = createVerifier({ environment: "sandbox" });

const vpToken = "eyJwcm9vZl9pZ..."; // the vp_token value as received
const presentation = await verifier.verifyVPToken({
  encodedVPToken: vpToken,
  aud: "verifier-demo", // your client_id
});
const [verifiableCredential] = presentation.proof_id_default;

if (
  verifiableCredential instanceof ProofCredentialV1 &&
  verifiableCredential.isOver18
) {
  purchaseItem();
}
```

`verifyVPToken` returns the verified credentials keyed by DCQL credential id (`proof_id_default` for the `basic` scope).

Verify a single SD-JWT-VC:

```javascript
import { createVerifier, ProofCredentialV1 } from "@proof.com/proof-vc-server";

const verifier = createVerifier({ environment: "sandbox" });

const encodedSDJWT = "eyJraWQiOiI3...";
const verifiableCredential = await verifier.verify({
  encodedSDJWT,
  aud: "verifier-demo",
});

if (
  verifiableCredential instanceof ProofCredentialV1 &&
  verifiableCredential.isOver18
) {
  purchaseItem();
}
```

#### Detached signatures

Presentations delivered through [x401](https://x401.proof.com) arrive with the signature segment of both the Issuer-signed JWT and the Key Binding JWT detached. The Key Binding JWT header carries a critical `proof.com#sig-1` parameter ([RFC 7515 §4.1.11](https://www.rfc-editor.org/rfc/rfc7515#section-4.1.11)) holding the id of the detached signatures. `verify` and `verifyVPToken` fetch them from `POST /verifiable-credentials/v1/x401-signatures`, authenticated with a `private_key_jwt` client assertion built from your `clientId` and `privateKeyFactory`, splice them back and verify as usual:

```javascript
import { createVerifier } from "@proof.com/proof-vc-server";

const verifier = createVerifier({
  environment: "sandbox",
  clientId: "https://verifier.example/.well-known/proof-client.json",
  privateKeyFactory: () => privateKey, // the ES256 key published in your client metadata document
});
```

Verifiers can pay for x401 presentations with [x402](https://www.x402.org), otherwise Proof charges their default account payment method. The endpoint answers `402` with payment requirements until the request is repeated with a `PAYMENT-SIGNATURE` header. Pass an x402-capable `fetch` to pay automatically; without one, `verify` rejects with the `payment_required` error code.

```javascript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const wallet = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

const verifier = createVerifier({
  environment: "production",
  clientId,
  privateKeyFactory,
  fetch: wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:*", client: new ExactEvmScheme(wallet) }],
  }),
});
```

The endpoint can answer `409`; the verifier retries after the `Retry-After` delay.

#### Nonce

Validating the `nonce` is out of scope of `verify` and `verifyVPToken`. The `nonce` signed in the Key Binding JWT is exposed on the returned credential and should be validated by the caller against the `nonce` sent in the [Request](#request). Some credentials are presented without a Key Binding JWT; `getNonce()` then returns `undefined` and there is no `nonce` to compare:

```javascript
const presentation = await verifier.verifyVPToken({
  encodedVPToken: vpToken,
  aud: "verifier-demo",
});

for (const credential of presentation.proof_id_default) {
  const nonce = credential.getNonce();
  if (nonce !== undefined && nonce !== session.nonce) {
    throw new Error("nonce mismatch");
  }
}
```

## Certificate Authority

Proof's Verifiable Credentials are issued by our [Certificate Authority](https://www.proof.com/legal/certificate-policy)
following the CA/B Forum Baseline Requirements for the Issuance and Management of Publicly-Trusted TLS Server Certificates published at https://www.cabforum.org.

The Proof Root CA R1 Certificate is published at http://cert.proof.com/proof-root-ca-r1.crt and
is also committed in this repository [proof_root_ca_r1.ts](https://github.com/proof/proof-vc-common/blob/main/packages/server/src/certificates/trust_store/proof_root_ca_r1.ts).

The sandbox Root CA R1 Development certificate is also committed in this repository [proof_root_ca_r1_development.ts](https://github.com/proof/proof-vc-common/blob/main/packages/server/src/certificates/trust_store/proof_root_ca_r1_development.ts) and used when `environment: "sandbox"`.

## Documentation

_Digital Credentials_ guides https://dev.proof.com/docs/digital-credentials-overview \
_API Documentation_ https://dev.proof.com/reference/authorizeverifiablecredentialpresentation

## Contributing

[Contribution guidelines for this project](https://github.com/proof/proof-vc-common/blob/main/CONTRIBUTING.md)
