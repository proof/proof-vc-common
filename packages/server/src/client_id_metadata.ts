import {
  calculateJwkThumbprint,
  importJWK,
  type CryptoKey,
  type JWK,
} from "jose";
import { ProofVCError, type Environment } from "@proof.com/proof-vc-common";
import {
  assertNonEmptyString,
  assertOneOf,
  BASE_URLS,
} from "@proof.com/proof-vc-common/internal";
import { REQUEST_OBJECT_ALG } from "./secured_request.ts";

export type ClientIdMetadataDocumentParams = {
  environment: Environment;
  clientId: string;
  jwks: JWK[];
  redirectUris: string[];
  clientName?: string;
};

export type ClientIdMetadataDocument = {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "private_key_jwt";
  jwks: { keys: JWK[] };
};

function invalid(message: string): never {
  throw new ProofVCError("invalid_config", message);
}

function assertClientIdUrl(clientId: string, environment: Environment): void {
  assertNonEmptyString(clientId, "clientId");
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    invalid("`clientId` must be an https URL");
  }
  const localhost =
    environment !== "production" &&
    url.protocol === "http:" &&
    url.hostname === "localhost";
  if (url.protocol !== "https:" && !localhost) {
    invalid("`clientId` must use the https scheme");
  }
  if (url.pathname === "/" && !clientId.endsWith("/")) {
    invalid("`clientId` must have a path component");
  }
  if (url.hash !== "" || clientId.endsWith("#")) {
    invalid("`clientId` must not contain a fragment");
  }
  if (url.username !== "" || url.password !== "") {
    invalid("`clientId` must not contain user information");
  }
}

function assertStringArray(
  value: unknown,
  name: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((v) => typeof v === "string" && v.length > 0)
  ) {
    invalid(`\`${name}\` must be a non-empty array of strings`);
  }
}

async function publicKey(jwk: JWK): Promise<JWK> {
  let key: CryptoKey | Uint8Array;
  try {
    key = await importJWK(jwk, REQUEST_OBJECT_ALG);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ProofVCError("invalid_config", `invalid JWK: ${detail}`, {
      cause,
    });
  }
  if (key instanceof Uint8Array || key.type !== "public") {
    invalid(`\`jwks\` must contain public ${REQUEST_OBJECT_ALG} keys only`);
  }
  return jwk.kid === undefined
    ? { ...jwk, kid: await calculateJwkThumbprint(jwk) }
    : jwk;
}

export async function createClientIdMetadataDocument({
  environment,
  clientId,
  jwks,
  redirectUris,
  clientName,
}: ClientIdMetadataDocumentParams): Promise<ClientIdMetadataDocument> {
  assertOneOf(environment, BASE_URLS, "environment");
  assertClientIdUrl(clientId, environment);
  assertStringArray(redirectUris, "redirectUris");
  if (!Array.isArray(jwks) || jwks.length === 0) {
    invalid("`jwks` must be a non-empty array of public JWKs");
  }
  if (clientName !== undefined) {
    assertNonEmptyString(clientName, "clientName");
  }
  return {
    client_id: clientId,
    ...(clientName !== undefined && { client_name: clientName }),
    redirect_uris: [...redirectUris],
    token_endpoint_auth_method: "private_key_jwt",
    jwks: { keys: await Promise.all(jwks.map(publicKey)) },
  };
}
