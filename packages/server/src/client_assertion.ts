import { randomUUID } from "node:crypto";
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  type CryptoKey,
  type JWK,
  type KeyObject,
} from "jose";
import { ProofVCError } from "@proof.com/proof-vc-common";
import { REQUEST_OBJECT_ALG } from "./secured_request.ts";

export type PrivateKey = JWK | CryptoKey | KeyObject;

export const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
export const CLIENT_ASSERTION_LIFETIME_SECONDS = 300;

export type ClientAssertionParams = {
  clientId: string;
  privateKey: PrivateKey;
  kid: string;
  audience: string;
};

function isJwk(key: PrivateKey): key is JWK {
  return typeof key === "object" && "kty" in key;
}

export async function privateKeyJwk(privateKey: PrivateKey): Promise<JWK> {
  try {
    return isJwk(privateKey) ? privateKey : await exportJWK(privateKey);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ProofVCError("invalid_config", `invalid private key: ${detail}`, {
      cause,
    });
  }
}

export async function jwkThumbprint(jwk: unknown): Promise<string | undefined> {
  try {
    return await calculateJwkThumbprint(jwk as JWK);
  } catch {
    return undefined;
  }
}

/**
 * Signs an RFC 7523 `private_key_jwt` client assertion addressed to one Proof
 * endpoint. Each assertion carries a fresh `jti`: Proof accepts it once.
 */
export function signClientAssertion({
  clientId,
  privateKey,
  kid,
  audience,
}: ClientAssertionParams): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: REQUEST_OBJECT_ALG, kid })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + CLIENT_ASSERTION_LIFETIME_SECONDS)
    .setJti(randomUUID())
    .sign(privateKey);
}

export function clientAssertionParams(
  assertion: string,
): Record<string, string> {
  return {
    client_assertion_type: CLIENT_ASSERTION_TYPE,
    client_assertion: assertion,
  };
}
