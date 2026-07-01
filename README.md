# Proof Digital Credentials

<img src="docs/proof-logo.svg" alt="drawing" width="450"/>

_A digital passport. Verified once, usable everywhere._

Read our [documentation](https://dev.proof.com/docs/digital-credentials-overview) or [try it](https://try.proof.com)!

## Table of Contents

- [Packages](#packages)
- [Installation](#installation)
- [Getting Started](#getting-started)
  - [Client Side](#client-side)
  - [Server Side](#server-side)
  - [Response Modes](#response-modes)
  - [Pushed Authorization Requests](#pushed-authorization-requests)
- [Verifiable Credential Presentation](#verifiable-credential-presentation)
  - [Credential Types](#credential-type)
  - [Request](#request)
    - [Scopes](#scopes)
    - [Transaction Templates](#transaction-templates)
  - [Verify](#verify)
    - [Nonce](#nonce)
- [Certificate Authority](#certificate-authority)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Packages

| Package                                             | Runtime             | Usage                                                                                                      | Runtime deps |
| --------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| **[`@proof.com/proof-vc-common`](packages/common)** | browser **or** Node | Request a Verifiable Presentation                                                                          | **0** ✅     |
| **[`@proof.com/proof-vc-server`](packages/server)** | Node                | `proof-vc-common` **plus** Presentation Verification, Pushed Authorization Requests, Transaction Templates | sd-jwt, owf  |

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

### Client Side

You can request a Verifiable Presentation in the browser by using `createClient` and `authorizationUrl` to craft an Authorization Request URL.
Either `fragment` or `direct_post` [Response Mode](#response-modes) are supported (defaults to `fragment`).

- if using `fragment`, at the callback URI, use `parseAuthorizationResponse` to extract the `vp_token` from it and send it to your verification endpoint
- if using `direct_post`, the `vp_token` is sent directly to your verification endpoint

```javascript
import {
  createClient,
  parseAuthorizationResponse,
} from "@proof.com/proof-vc-common";

const proof = createClient({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/verify_vp_token",
});

button.onclick = () => {
  window.location.href = proof.authorizationUrl({
    nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
    scope: "urn:proof:params:scope:verifiable-credentials:basic",
  });
};

const response = parseAuthorizationResponse(); // reads window.location.hash
if (response) {
  await fetch("/verify_vp_token", {
    method: "POST",
    body: JSON.stringify(response),
  });
}
```

You can also use `buildAuthorizationUrl` to provide all the Authorization Request parameters at once:

```javascript
import { buildAuthorizationUrl } from "@proof.com/proof-vc-common";

window.location.href = buildAuthorizationUrl({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/verify_vp_token",
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

### Server Side

You can request a Verifiable Presentation from our backend by using `createClient` and `authorizationUrl` to craft an Authorization Request URL.
Either `fragment` or `direct_post` [Response Mode](#response-modes) are supported (defaults to `fragment`).

With [`@proof.com/proof-vc-server`](packages/server) you can also use [Pushed Authorization Requests](#pushed-authorization-requests) and [Transaction Templates](#transaction-templates).

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
  loginHint: "frodo.baggins@theshire",
});
```

### Response Modes

Proof supports `fragment` and `direct_post` response modes (default `fragment`).

#### fragment

Using `fragment` the `vp_token` is returned as a fragment of the `callbackUri` when the user is 302 redirected from Proof to your website. Use `parseAuthorizationResponse()` in the browser to read it.

```
GET https://example.com/verify_vp_token#vp_token=eyJwcm9vZl9pZF9...
```

#### direct_post

Using `direct_post` the `vp_token` is returned in the JSON body of a POST request to the `callbackUri` from Proof to your server. See the [OID4VP specification](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-response-mode-direct_post) for more details.

```
POST https://example.com/verify_vp_token
{ "vp_token": "eyJwcm9vZl9pZF9..." }
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
  clientSecret: "…",
  callbackUri: "https://example.com/verify_vp_token",
  responseMode: "direct_post",
  usePushedAuthorizationRequest: true,
});

const redirect = await proof.authorizationUrl({
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
});
```

## Verifiable Credential Presentation

### Credential Type

Proof issues Verifiable Credentials according to the [SD-JWT-VC specification](https://www.ietf.org/archive/id/draft-ietf-oauth-sd-jwt-vc-16.html) and publishes its [OID4VCI Credential Issuer Metadata](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-credential-issuer-metadata) at https://api.proof.com/.well-known/openid-credential-issuer.

`ProofCredentialV1`

| claim          | type    | description                                                        |
| -------------- | ------- | ------------------------------------------------------------------ |
| given_name     | string  | user's given name as it appears on the verified identity document  |
| family_name    | string  | user's family name as it appears on the verified identity document |
| birthdate      | string  | user's date of birth in ISO 8601 format (`YYYY-MM-DD`)             |
| age_is_over.18 | boolean | boolean confirming the user is 18 or older                         |
| age_is_over.21 | boolean | boolean confirming the user is 21 or older                         |
| age_is_over.65 | boolean | boolean confirming the user is 65 or older                         |

All attributes are selectively disclosable and will return `undefined` if the claim wasn't disclosed.

### Request

Request a Verifiable Credential Presentation with an [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) Authorization Request. See [Frontend](#frontend-request-a-presentation) and [Backend](#backend-request-a-presentation) above for the two entry points.

#### Scopes

Proof supports the `scope` parameter of the [OID4VP specification](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-using-scope-parameter-to-re). Each scope maps to a pre-defined DCQL query and returns a specific [Credential Type](#credential-type).

Supported `scope` and their associated [Credential Type](#credential-type):

| scope                                                 | Credential Type     |
| ----------------------------------------------------- | ------------------- |
| `urn:proof:params:scope:verifiable-credentials:basic` | `ProofCredentialV1` |

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
  loginHint: "frodo.baggins@theshire",
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
  loginHint: "frodo.baggins@theshire",
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
  loginHint: "frodo.baggins@theshire",
  transactionData: data,
});
```

### Verify

Verification runs server-side. Create a verifier bound to a trust root and reuse it.

Decode and verify a Verifiable Presentation's `vp_token`:

```javascript
import { createVerifier } from "@proof.com/proof-vc-server";

const verifier = createVerifier({ trustRoot: "production" });

const vpToken = "eyJwcm9vZl9pZ...";
const presentation = await verifier.verifyVPToken({ encodedVPToken: vpToken });
const verifiableCredential = presentation["proof_id_default"][0];

if (verifiableCredential.isOver18) {
  purchaseItem();
} else {
  userNotOver18();
}
```

Verify a single SD-JWT-VC:

```javascript
import { createVerifier } from "@proof.com/proof-vc-server";

const verifier = createVerifier({ trustRoot: "production" });

const encodedSDJWT = "eyJraWQiOiI3...";
const verifiableCredential = await verifier.verify({ encodedSDJWT });

if (verifiableCredential.isOver18) {
  purchaseItem();
} else {
  userNotOver18();
}
```

#### Nonce

Validating the `nonce` is out of scope of `verify` and `verifyVPToken`. The `nonce` signed in the Key Binding JWT is exposed on the returned credential and should be validated by the caller against the `nonce` sent in the [Request](#request):

```javascript
const verifiableCredential = await verifier.verify({ encodedSDJWT });

if (
  verifiableCredential.getNonce() !== "3e8e4918-e9fb-453a-a538-81152be15c1b"
) {
  throw new Error("nonce mismatch");
}
```

## Certificate Authority

Proof's Verifiable Credentials are issued by our [Certificate Authority](https://www.proof.com/legal/certificate-policy)
following the CA/B Forum Baseline Requirements for the Issuance and Management of Publicly-Trusted TLS Server Certificates published at https://www.cabforum.org.

The Proof Root CA R1 Certificate is published at http://cert.proof.com/proof-root-ca-r1.crt and
is also committed in this repository [proof-root-ca-r1.crt](packages/server/src/certificates/trust_store/proof_root_ca_r1.ts).

The sandbox Root CA R1 Development certificate is also committed in this repository [proof-root-ca-r1-development.crt](packages/server/src/certificates/trust_store/proof_root_ca_r1_development.ts) and used when `trustRoot: "development"`.

## Documentation

_Digital Credentials_ guides https://dev.proof.com/docs/digital-credentials-overview \
_API Documentation_ https://dev.proof.com/reference/authorizeverifiablecredentialpresentation

## Contributing

[Contribution guidelines for this project](CONTRIBUTING.md)
