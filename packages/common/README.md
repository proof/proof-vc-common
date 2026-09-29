# Proof Digital Credentials

<img src="https://raw.githubusercontent.com/proof/proof-vc-common/main/docs/proof-logo.svg" alt="drawing" width="450"/>

_A digital passport. Verified once, usable everywhere._

Read our [documentation](https://dev.proof.com/docs/digital-credentials-overview) or [try it](https://try.proof.com)!

## Table of Contents

- [Packages](#packages)
- [Installation](#installation)
- [Getting Started](#getting-started)
  - [Client Side](#client-side)
  - [Response Modes](#response-modes)
- [Verifiable Credential Presentation](#verifiable-credential-presentation)
  - [Credential Type](#credential-type)
  - [Request](#request)
    - [Scopes](#scopes)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Packages

| Package                                                                                                | Runtime             | Usage                                                                                                                                                                     | Runtime deps      |
| ------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **[`@proof.com/proof-vc-common`](https://github.com/proof/proof-vc-common/blob/main/packages/common)** | browser **or** Node | Request a Verifiable Presentation                                                                                                                                         | **0** ✅          |
| **[`@proof.com/proof-vc-server`](https://github.com/proof/proof-vc-common/blob/main/packages/server)** | Node                | `proof-vc-common` **plus** Presentation Verification, Pushed Authorization Requests, Secured Authorization Requests (JAR), Digital Credentials API, Transaction Templates | sd-jwt, owf, jose |

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
  callbackUri: "https://example.com/callback",
});

button.onclick = () => {
  window.location.href = proof.authorizationUrl({
    nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
    scope: "urn:proof:params:scope:verifiable-credentials:basic",
  });
};

// at https://example.com/callback
const response = parseAuthorizationResponse(); // reads window.location.hash
if (response?.type === "success") {
  fetch("/verify_vp_token", {
    method: "POST",
    body: new URLSearchParams({ vp_token: response.vpToken }),
  });
} else if (response?.type === "error") {
  console.error(response.error, response.errorDescription);
}
```

`parseAuthorizationResponse` returns `{ type: "success", vpToken, state? }`, `{ type: "error", error, errorDescription?, errorUri?, state? }` when the authorization server answered with an [OAuth 2.0 error response](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1), or `null` when neither is present.

You can also use `buildAuthorizationUrl` to provide all the Authorization Request parameters at once:

```javascript
import { buildAuthorizationUrl } from "@proof.com/proof-vc-common";

window.location.href = buildAuthorizationUrl({
  environment: "sandbox",
  clientId: "verifier-demo",
  callbackUri: "https://example.com/callback",
  nonce: "3e8e4918-e9fb-453a-a538-81152be15c1b",
  scope: "urn:proof:params:scope:verifiable-credentials:basic",
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

Using `direct_post` the `vp_token` and `state` (optional) are returned in the `application/x-www-form-urlencoded` body of a POST request to the `callbackUri` from Proof to your server. Pass the `vp_token` value as received to [`verifyVPToken`](https://github.com/proof/proof-vc-common#verify). See the [OID4VP specification](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-response-mode-direct_post) for more details.

```
POST https://example.com/verify_vp_token
Content-Type: application/x-www-form-urlencoded

vp_token=eyJwcm9vZl9pZF9...&state=6A2B4CD830
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

Request a Verifiable Credential Presentation with an [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) Authorization Request. See [Client Side](#client-side) and [Server Side](https://github.com/proof/proof-vc-common#server-side) above for the two entry points. Exactly one of `scope` or `dcqlQuery` must be given.

#### Scopes

Proof supports the `scope` parameter of the [OID4VP specification](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-using-scope-parameter-to-re). Each scope maps to a pre-defined DCQL query and returns a specific [Credential Type](#credential-type).

Supported `scope` and their associated [Credential Type](#credential-type):

| scope                                                          | Credential Type     | claims                                              | Key Binding JWT |
| -------------------------------------------------------------- | ------------------- | --------------------------------------------------- | --------------- |
| `urn:proof:params:scope:verifiable-credentials:basic`          | `ProofCredentialV1` | `given_name`, `family_name`, `age_equal_or_over.18` | yes             |
| `urn:proof:params:scope:verifiable-credentials:nationality:us` | `ProofCredentialV1` | `age_equal_or_over.18`, `is_national.us`            | yes             |

A scope unknown to this SDK is accepted and emits a one-time `ProofVCWarning`.

## Documentation

_Digital Credentials_ guides https://dev.proof.com/docs/digital-credentials-overview \
_API Documentation_ https://dev.proof.com/reference/authorizeverifiablecredentialpresentation

## Contributing

[Contribution guidelines for this project](https://github.com/proof/proof-vc-common/blob/main/CONTRIBUTING.md)
