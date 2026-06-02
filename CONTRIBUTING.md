# Contributing

## Requirements

- `node` >= 22.0.0
- `yarn`

## Design Principles

The library provide 2 distributions, for browsers and node environments:

- [vc_presentation.browser.ts](src/vc_presentation.browser.ts): browser entrypoint
- [vc_presentation.node.ts](src/vc_presentation.node.ts): node entrypoint

The browser distribution should be kept as light as possible (no dependencies).

Cryptographic operations (e.g. VC signature verification) are only done in node environments.

## Commands

- `yarn build`
- `yarn format`
- `yarn lint`
- `yarn typcheck`
- `yarn publint`

## Pull Requests

To submit a pull request:

- Start by forking the repo and branching off of `main`.
- Include a clear title and description explaining what changed and why.
- Keep changes focused, try to limit one issue or feature per PR.

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this standard.
