import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPair,
  exportJWK,
  calculateJwkThumbprint,
  jwtVerify,
  decodeProtectedHeader,
} from "jose";

import { createClient, DCQL_QUERY_BASIC } from "../dist/index.js";

const CLIENT_ID = "https://verifier.example.com";
const CALLBACK_URI = "https://verifier.example.com/callback";
const ISSUER = "https://api.proof.com";
const AS_METADATA_URL =
  "https://api.proof.com/.well-known/oauth-authorization-server/verifiable-credentials/v1/issuance";

const { publicKey, privateKey } = await generateKeyPair("ES256", {
  extractable: true,
});
const privateJwk = await exportJWK(privateKey);
const publicJwk = await exportJWK(publicKey);
const expectedKid = await calculateJwkThumbprint(publicJwk);

async function withStubbedFetch(
  fn,
  { issuer = ISSUER, requestUri = "urn:par:123" } = {},
) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    calls.push({ url: href, body: options?.body });
    if (href.endsWith("/par")) {
      return {
        ok: true,
        status: 201,
        json: async () => ({ request_uri: requestUri }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ issuer }),
    };
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function securedClient(overrides = {}) {
  return createClient({
    environment: "production",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
    useSecuredAuthorizationRequest: true,
    privateKeyFactory: () => privateJwk,
    ...overrides,
  });
}

test("signedDcApiRequest returns a JAR with the expected header and claims", async () => {
  await withStubbedFetch(async (calls) => {
    const client = securedClient();
    const jwt = await client.signedDcApiRequest({
      dcqlQuery: DCQL_QUERY_BASIC,
      nonce: "nonce-123",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, AS_METADATA_URL);

    const header = decodeProtectedHeader(jwt);
    assert.equal(header.typ, "oauth-authz-req+jwt");
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, expectedKid);

    const { payload } = await jwtVerify(jwt, publicKey);
    assert.equal(payload.iss, CLIENT_ID);
    assert.equal(payload.aud, ISSUER);
    assert.equal(payload.client_id, CLIENT_ID);
    assert.equal(payload.response_type, "vp_token");
    assert.equal(payload.response_mode, "dc_api");
    assert.equal(payload.nonce, "nonce-123");
    assert.deepEqual(payload.dcql_query, DCQL_QUERY_BASIC);
  });
});

test("signedAuthorizationRequest signs the plain request params and omits client_secret", async () => {
  await withStubbedFetch(async () => {
    const client = securedClient({ clientSecret: "s3cret" });
    const jwt = await client.signedAuthorizationRequest({
      scope: "openid",
      nonce: "nonce-abc",
      state: "state-xyz",
    });

    const { payload } = await jwtVerify(jwt, publicKey);
    assert.equal(payload.iss, CLIENT_ID);
    assert.equal(payload.aud, ISSUER);
    assert.equal(payload.client_id, CLIENT_ID);
    assert.equal(payload.scope, "openid");
    assert.equal(payload.nonce, "nonce-abc");
    assert.equal(payload.state, "state-xyz");
    assert.equal(payload.redirect_uri, CALLBACK_URI);
    assert.equal(payload.client_secret, undefined);
  });
});

test("authorizationUrl embeds the JAR by value without any client_secret", async () => {
  await withStubbedFetch(async () => {
    const client = securedClient({ clientSecret: "s3cret" });
    const url = await client.authorizationUrl({
      scope: "openid",
      nonce: "n",
    });

    const parsed = new URL(url);
    assert.equal(
      parsed.pathname,
      "/verifiable-credentials/v1/presentation/authorize",
    );
    assert.equal(parsed.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(parsed.searchParams.get("client_secret"), null);

    const jwt = parsed.searchParams.get("request");
    assert.ok(jwt, "expected a `request` JAR param");
    const { payload } = await jwtVerify(jwt, publicKey);
    assert.equal(payload.scope, "openid");
    assert.equal(payload.client_secret, undefined);
  });
});

test("authorizationUrl over PAR posts the JAR and client_secret in the request body", async () => {
  await withStubbedFetch(async (calls) => {
    const client = securedClient({
      clientSecret: "s3cret",
      usePushedAuthorizationRequest: true,
    });
    const url = await client.authorizationUrl({ scope: "openid", nonce: "n" });

    const parCall = calls.find((c) => c.url.endsWith("/par"));
    assert.ok(parCall, "expected a PAR request");
    const body = new URLSearchParams(parCall.body);
    assert.equal(body.get("client_id"), CLIENT_ID);
    assert.equal(body.get("client_secret"), "s3cret");
    const jwt = body.get("request");
    assert.ok(jwt, "expected the JAR in the PAR body");
    const { payload } = await jwtVerify(jwt, publicKey);
    assert.equal(payload.client_secret, undefined);

    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("request_uri"), "urn:par:123");
    assert.equal(parsed.searchParams.get("client_secret"), null);
  });
});

test("authorizationUrl never puts client_secret in a non-PAR URL", async () => {
  const client = createClient({
    environment: "production",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
    clientSecret: "s3cret",
  });
  const url = await client.authorizationUrl({ scope: "openid", nonce: "n" });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(parsed.searchParams.get("client_secret"), null);
});

test("jarByReferenceAuthorizationUrl builds an authorize URL from client_id and request_uri", () => {
  const client = securedClient();
  const url = client.jarByReferenceAuthorizationUrl({
    requestUri: "https://verifier.example.com/jar/42",
  });

  const parsed = new URL(url);
  assert.equal(
    parsed.pathname,
    "/verifiable-credentials/v1/presentation/authorize",
  );
  assert.equal(parsed.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(
    parsed.searchParams.get("request_uri"),
    "https://verifier.example.com/jar/42",
  );
  assert.equal(parsed.searchParams.get("request"), null);
});

test("jarByReferenceAuthorizationUrl rejects JAR over PAR", () => {
  const client = securedClient({ usePushedAuthorizationRequest: true });
  assert.throws(
    () =>
      client.jarByReferenceAuthorizationUrl({
        requestUri: "https://verifier.example.com/jar/42",
      }),
    /cannot be combined with pushed authorization requests/,
  );
});

test("signed methods require useSecuredAuthorizationRequest", async () => {
  const client = createClient({
    environment: "production",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
    privateKeyFactory: () => privateJwk,
  });
  await assert.rejects(
    client.signedDcApiRequest({ dcqlQuery: DCQL_QUERY_BASIC, nonce: "n" }),
    /useSecuredAuthorizationRequest/,
  );
});

test("signed methods require privateKeyFactory", async () => {
  const client = createClient({
    environment: "production",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
    useSecuredAuthorizationRequest: true,
  });
  await assert.rejects(
    client.signedDcApiRequest({ dcqlQuery: DCQL_QUERY_BASIC, nonce: "n" }),
    /privateKeyFactory/,
  );
});
