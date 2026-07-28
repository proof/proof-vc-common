import { SignJWT, calculateJwkThumbprint } from "jose";
import type { ServerClientConfig } from "./client.ts";
import { authorizationServerIssuer } from "./issuer_metadata.ts";

const REQUEST_OBJECT_TYP = "oauth-authz-req+jwt";
const REQUEST_OBJECT_ALG = "ES256";

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
    throw new Error(
      "signing a request object requires `useSecuredAuthorizationRequest` in the client config",
    );
  }
  if (config.privateKeyFactory === undefined) {
    throw new Error(
      "signing a request object requires `privateKeyFactory` in the client config",
    );
  }
  const privateKey = await config.privateKeyFactory();
  const kid = await calculateJwkThumbprint(privateKey);
  const aud = await authorizationServerIssuer(config);
  return new SignJWT(claims)
    .setProtectedHeader({
      typ: REQUEST_OBJECT_TYP,
      alg: REQUEST_OBJECT_ALG,
      kid,
    })
    .setIssuer(config.clientId)
    .setAudience(aud)
    .sign(privateKey);
}
