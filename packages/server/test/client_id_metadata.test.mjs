import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { calculateJwkThumbprint } from "jose";

import { createClientIdMetadataDocument, ProofVCError } from "../dist/index.js";

const CLIENT_ID = "https://example.com/x401-client";
const REDIRECT_URIS = ["https://proof.com/agents-trust-list"];
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });

function create(overrides = {}) {
  return createClientIdMetadataDocument({
    environment: "sandbox",
    clientId: CLIENT_ID,
    redirectUris: REDIRECT_URIS,
    jwks: [publicJwk],
    ...overrides,
  });
}

async function rejectsWithInvalidConfig(promise, pattern) {
  await assert.rejects(
    promise,
    (error) =>
      error instanceof ProofVCError &&
      error.code === "invalid_config" &&
      pattern.test(error.message),
  );
}

test("builds a CIMD with private_key_jwt and a JWK Set", async () => {
  const document = await create({ clientName: "Example" });
  assert.deepEqual(Object.keys(document), [
    "client_id",
    "client_name",
    "redirect_uris",
    "token_endpoint_auth_method",
    "jwks",
  ]);
  assert.equal(document.client_id, CLIENT_ID);
  assert.equal(document.client_name, "Example");
  assert.deepEqual(document.redirect_uris, REDIRECT_URIS);
  assert.equal(document.token_endpoint_auth_method, "private_key_jwt");
  assert.deepEqual(document.jwks.keys, [
    { ...publicJwk, kid: await calculateJwkThumbprint(publicJwk) },
  ]);
});

test("omits client_name when not given and keeps an existing kid", async () => {
  const document = await create({ jwks: [{ ...publicJwk, kid: "my-key" }] });
  assert.equal("client_name" in document, false);
  assert.equal(document.jwks.keys[0].kid, "my-key");
});

test("accepts http://localhost outside production only", async () => {
  const clientId = "http://localhost:3000/x401-client";
  const document = await create({ clientId });
  assert.equal(document.client_id, clientId);
  for (const rejected of [
    { environment: "production", clientId },
    { clientId: "http://127.0.0.1:3000/x401-client" },
    { clientId: "http://example.com/x401-client" },
  ]) {
    await rejectsWithInvalidConfig(create(rejected), /https scheme/);
  }
});

test("rejects a clientId that is not a valid CIMD URL", async () => {
  for (const [clientId, pattern] of [
    ["example.com/client", /https URL/],
    ["https://example.com", /path component/],
    ["https://example.com/client#frag", /fragment/],
    ["https://user:pw@example.com/client", /user information/],
    ["", /`clientId` must be a non-empty string/],
  ]) {
    await rejectsWithInvalidConfig(create({ clientId }), pattern);
  }
});

test("rejects an unknown environment", async () => {
  await rejectsWithInvalidConfig(
    create({ environment: "prod" }),
    /`environment` must be one of/,
  );
});

test("rejects private, non-ES256 and malformed jwks", async () => {
  const rsaJwk = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).publicKey.export({ format: "jwk" });
  const p384Jwk = generateKeyPairSync("ec", {
    namedCurve: "P-384",
  }).publicKey.export({ format: "jwk" });
  await rejectsWithInvalidConfig(
    create({ jwks: [privateJwk] }),
    /public ES256 keys only/,
  );
  await rejectsWithInvalidConfig(
    create({ jwks: [{ kty: "oct", k: "AAAA" }] }),
    /public ES256 keys only/,
  );
  for (const jwks of [[rsaJwk], [p384Jwk], ["not-a-jwk"], [{ kty: "EC" }]]) {
    await rejectsWithInvalidConfig(create({ jwks }), /invalid JWK/);
  }
  for (const jwks of [[], undefined]) {
    await rejectsWithInvalidConfig(
      create({ jwks }),
      /`jwks` must be a non-empty array/,
    );
  }
});

test("rejects empty redirectUris", async () => {
  for (const redirectUris of [[], undefined, [""]]) {
    await rejectsWithInvalidConfig(create({ redirectUris }), /redirectUris/);
  }
});
