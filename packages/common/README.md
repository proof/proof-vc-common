# proof-vc-common

proof-vc-common is the code that [proof-vc-web](https://github.com/proof/proof-vc-web) and
[proof-vc-server](https://github.com/proof/proof-vc-common/tree/main/packages/server) share. It
builds [OID4VP](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html) authorization
URLs for Proof Digital IDs, and reads the presentation (`vp_token`) from the redirect. It runs in
the browser and in Node, and has no dependencies.

To request and verify Proof Digital IDs on your server, and to use Signed Mandates and x401, use
[proof-vc-server](https://github.com/proof/proof-vc-common/tree/main/packages/server). It includes
proof-vc-common. To request Proof Digital IDs on your website in a one-click button, use
[proof-vc-web](https://github.com/proof/proof-vc-web).

- [Installation](#installation)
- [Reference](#reference)
- [Links](#links)
- [Contributing](#contributing)
- [License](#license)

## Installation

```sh
npm install @proof.com/proof-vc-common
```

## Reference

| Export                       | Description                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `createClient(config)`       | Creates a client; its `authorizationUrl(params)` returns the URL that sends the user to Proof  |
| `buildAuthorizationUrl`      | `createClient(config).authorizationUrl(params)` in one call                                    |
| `parseAuthorizationResponse` | Reads `vp_token` and `state`, or the error, from the callback URL (the current URL by default) |
| `agentsTrustListUrl`         | The redirect URI for x401 _Verifiers_                                                          |
| `ProofVCError`               | The error that the SDK throws; read its `code`                                                 |

`createClient` options:

| Option         | Default    | Description                                                                                    |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `environment`  |            | `"sandbox"` or `"production"`                                                                  |
| `clientId`     |            | Your Proof client ID                                                                           |
| `callbackUri`  |            | Where Proof sends the presentation; one of your client's redirect URIs                         |
| `responseMode` | `fragment` | `direct_post` posts the presentation to `callbackUri`; `fragment` sends the user there with it |

`authorizationUrl` parameters:

| Parameter   | Required | Description                                                     |
| ----------- | -------- | --------------------------------------------------------------- |
| `nonce`     | yes      | A new random value for each request; compare it when you verify |
| `scope`     | yes      | The claims to request                                           |
| `state`     | no       | A value that Proof sends back with the presentation             |
| `loginHint` | no       | The user's email, pre-filled on Proof                           |

## Links

- [Request and verify Proof Digital IDs with proof-vc-server](https://github.com/proof/proof-vc-common/tree/main/packages/server)
- [Add a "Continue with Proof" button with proof-vc-web](https://github.com/proof/proof-vc-web)
- [Read the Proof Digital ID guides](https://dev.proof.com/docs/digital-credentials-overview)

## Contributing

[Contribution guidelines for this project](https://github.com/proof/proof-vc-common/blob/main/CONTRIBUTING.md)

## License

[Apache-2.0](https://github.com/proof/proof-vc-common/blob/main/LICENSE)
