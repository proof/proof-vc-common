import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
} from "jose";

import { identityCheck, ProofVCError } from "../dist/index.js";

const CLIENT_ID = "abc";
const { privateKey } = await generateKeyPair("ES256", { extractable: true });
const privateJwk = await exportJWK(privateKey);

function create(overrides = {}) {
  return identityCheck({
    environment: "sandbox",
    clientId: CLIENT_ID,
    privateKeyFactory: () => privateJwk,
    scope: "urn:proof:params:scope:verifiable-credentials:basic",
    callbackUri: "https://example.com/identity-check/callback",
    requestUri: (id) => `https://example.com/identity-check/requests/${id}`,
    resultUrl: (id) => `https://example.com/article/${id}`,
    verifierName: "Example News",
    description: "The full article on the medical study.",
    ...overrides,
  });
}

test("start returns a new random id and nonce", () => {
  const check = create();
  const a = check.start();
  const b = check.start();
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.notEqual(a.id, a.nonce);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.nonce, b.nonce);
});

test("page links to Proof with the request URI and to the result URL", () => {
  const html = create().page("42");
  const authorize = html
    .match(/href="([^"]+)">[\s\S]*?Present Identity/)[1]
    .replaceAll("&amp;", "&");
  const url = new URL(authorize);
  assert.equal(url.origin, "https://api.fairfax.proof.com");
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(
    url.searchParams.get("request_uri"),
    "https://example.com/identity-check/requests/42",
  );
  assert.ok(html.includes('href="https://example.com/article/42"'));
  assert.ok(html.includes("<strong>Example News</strong>"));
  assert.ok(html.includes("The full article on the medical study."));
});

test("page escapes HTML in the result URL, the name and the description", () => {
  const html = create({
    resultUrl: () => 'https://example.com/a"><script>x</script>',
    verifierName: "<script>name</script>",
    description: "<script>description</script>",
  }).page("42");
  assert.ok(!html.includes("<script>"));
});

test("page rejects a result URL that is not absolute HTTP(S)", () => {
  assert.throws(
    () => create({ resultUrl: () => "/article/42" }).page("42"),
    (error) =>
      error instanceof ProofVCError &&
      error.code === "invalid_config" &&
      /resultUrl/.test(error.message),
  );
});

test("request signs a direct_post request with state = id and the given nonce", async () => {
  const jwt = await create().request("42", "n-1");
  assert.equal(decodeProtectedHeader(jwt).typ, "oauth-authz-req+jwt");
  const claims = decodeJwt(jwt);
  assert.equal(claims.state, "42");
  assert.equal(claims.nonce, "n-1");
  assert.equal(claims.client_id, CLIENT_ID);
  assert.equal(claims.response_mode, "direct_post");
  assert.equal(
    claims.response_uri,
    "https://example.com/identity-check/callback",
  );
});

test("verify returns undefined for a declined, unknown or invalid presentation", async () => {
  const check = create();
  assert.equal(
    await check.verify({ error: "access_denied", state: "42" }, "n-1"),
    undefined,
  );
  assert.equal(
    await check.verify({ vp_token: "x", state: "42" }, undefined),
    undefined,
  );
  assert.equal(await check.verify({ state: "42" }, "n-1"), undefined);
  assert.equal(
    await check.verify({ vp_token: "not-base64-json", state: "42" }, "n-1"),
    undefined,
  );
  assert.equal(await check.verify(undefined, "n-1"), undefined);
});

test("rejects requestUri or resultUrl that are not functions", () => {
  assert.throws(
    () => create({ requestUri: "https://example.com/requests" }),
    (error) => error instanceof ProofVCError && error.code === "invalid_config",
  );
});

test("rejects an empty verifierName or description", () => {
  for (const overrides of [{ verifierName: "" }, { description: "" }]) {
    assert.throws(
      () => create(overrides),
      (error) =>
        error instanceof ProofVCError && error.code === "invalid_config",
    );
  }
});
