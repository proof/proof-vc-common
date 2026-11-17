import { randomUUID } from "node:crypto";
import {
  ProofVCError,
  type Environment,
  type Scope,
} from "@proof.com/proof-vc-common";
import { assertNonEmptyString } from "@proof.com/proof-vc-common/internal";
import { createClient, type PrivateKeyFactory } from "./client.ts";
import type { HttpConfig } from "./http.ts";
import type { ProofCredential } from "./types.ts";
import { renderVerificationPage } from "./verification_page.ts";
import { createVerifier } from "./verifier.ts";

export type IdentityCheckConfig = HttpConfig & {
  environment: Environment;
  clientId: string;
  privateKeyFactory: PrivateKeyFactory;
  scope: Scope;
  /** Where Proof posts the presentation; one of your client's redirect URIs. */
  callbackUri: string;
  /** Your URL that serves the signed request of a check. */
  requestUri: (id: string) => string;
  /** Your URL that returns the content after the check. */
  resultUrl: (id: string) => string;
  /** Your domain name or your name, shown as the requester on the page. */
  verifierName: string;
  /** What the protected content is, shown on the page. */
  description: string;
};

export type IdentityCheckStart = {
  id: string;
  nonce: string;
};

export type IdentityCheck = {
  /** Content type of the signed request that `request` returns. */
  readonly requestContentType: string;
  /** Returns a new check ID and nonce. Store both. */
  start(): IdentityCheckStart;
  /** Returns the verification page of a check, with the link to Proof and the result URL. */
  page(id: string): string;
  /** Returns the signed request of a check, with `state` set to `id`. */
  request(id: string, nonce: string): Promise<string>;
  /**
   * Verifies the presentation that Proof posts to `callbackUri`. Returns the
   * credential, or `undefined` when the user declined, the presentation is
   * invalid or its nonce is not `nonce`.
   */
  verify(
    body: unknown,
    nonce: string | undefined,
  ): Promise<ProofCredential | undefined>;
};

const REQUEST_CONTENT_TYPE = "application/oauth-authz-req+jwt";

const REJECTED_PRESENTATION_CODES: ReadonlySet<string> = new Set([
  "invalid_input",
  "verification_failed",
]);

function bodyField(body: unknown, name: string): unknown {
  return typeof body === "object" && body !== null && name in body
    ? (body as Record<string, unknown>)[name]
    : undefined;
}

export function identityCheck(config: IdentityCheckConfig): IdentityCheck {
  assertNonEmptyString(config.scope, "scope");
  assertNonEmptyString(config.verifierName, "verifierName");
  assertNonEmptyString(config.description, "description");
  if (
    typeof config.requestUri !== "function" ||
    typeof config.resultUrl !== "function"
  ) {
    throw new ProofVCError(
      "invalid_config",
      "`requestUri` and `resultUrl` must be functions that take the check ID",
    );
  }
  const http = {
    ...(config.timeout !== undefined && { timeout: config.timeout }),
    ...(config.fetch !== undefined && { fetch: config.fetch }),
  };
  const client = createClient({
    environment: config.environment,
    clientId: config.clientId,
    callbackUri: config.callbackUri,
    responseMode: "direct_post",
    useSecuredAuthorizationRequest: true,
    privateKeyFactory: config.privateKeyFactory,
    ...http,
  });
  const verifier = createVerifier({ environment: config.environment, ...http });

  return {
    requestContentType: REQUEST_CONTENT_TYPE,

    start() {
      return { id: randomUUID(), nonce: randomUUID() };
    },

    page(id) {
      return renderVerificationPage({
        authorizationUrl: client.jarByReferenceAuthorizationUrl({
          requestUri: config.requestUri(id),
        }),
        resultUrl: config.resultUrl(id),
        verifierName: config.verifierName,
        description: config.description,
      });
    },

    request(id, nonce) {
      return client.signedAuthorizationRequest({
        nonce,
        state: id,
        scope: config.scope,
      });
    },

    async verify(body, nonce) {
      const vpToken = bodyField(body, "vp_token");
      if (
        nonce === undefined ||
        typeof vpToken !== "string" ||
        bodyField(body, "error") !== undefined
      ) {
        return undefined;
      }
      let credentials: ProofCredential[];
      try {
        const presentation = await verifier.verifyVPToken({
          encodedVPToken: vpToken,
          aud: config.clientId,
        });
        credentials = Object.values(presentation).flatMap((list) => list ?? []);
      } catch (error) {
        if (
          error instanceof ProofVCError &&
          REJECTED_PRESENTATION_CODES.has(error.code)
        ) {
          return undefined;
        }
        throw error;
      }
      if (
        credentials.length === 0 ||
        credentials.some((c) => c.getNonce() !== nonce)
      ) {
        return undefined;
      }
      return credentials[0];
    },
  };
}
