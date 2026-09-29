import { randomUUID } from "node:crypto";
import { SignJWT, calculateJwkThumbprint } from "jose";
import { ProofVCError } from "@proof.com/proof-vc-common";
import { authorizationServerIssuer } from "@proof.com/proof-vc-common/internal";
import type { ServerClientConfig } from "./client.ts";

const REQUEST_OBJECT_TYP = "oauth-authz-req+jwt";
const REQUEST_OBJECT_ALG = "ES256";
export const DEFAULT_REQUEST_OBJECT_LIFETIME_SECONDS = 300;

export function requestObjectClaims(
  search: URLSearchParams,
): Record<string, string> {
  return Object.fromEntries(search.entries());
}

export async function signRequestObject(
  config: ServerClientConfig,
  claims: Record<string, unknown>,
): Promise<string> {
  if (config.useSecuredAuthorizationRequest !== true) {
    throw new ProofVCError(
      "invalid_config",
      "signing a request object requires `useSecuredAuthorizationRequest` in the client config",
    );
  }
  if (config.privateKeyFactory === undefined) {
    throw new ProofVCError(
      "invalid_config",
      "signing a request object requires `privateKeyFactory` in the client config",
    );
  }
  const lifetime =
    config.requestObjectLifetime ?? DEFAULT_REQUEST_OBJECT_LIFETIME_SECONDS;
  const privateKey = await config.privateKeyFactory();
  const kid = await calculateJwkThumbprint(privateKey);
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({
      typ: REQUEST_OBJECT_TYP,
      alg: REQUEST_OBJECT_ALG,
      kid,
    })
    .setIssuer(config.clientId)
    .setAudience(authorizationServerIssuer(config.environment))
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + lifetime)
    .setJti(randomUUID())
    .sign(privateKey);
}
