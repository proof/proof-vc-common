import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// A real sandbox presentation: see verify.test.mjs for its client ID, nonce and
// the time when it is valid.
const SANDBOX_VP_TOKEN = readFileSync(
  new URL("./fixtures/sandbox-vp-token.txt", import.meta.url),
  "utf8",
).trim();
const SANDBOX_CLIENT_ID = "caqnb6rwn";
const SANDBOX_NONCE = "3f947e15-fcf0-4cd7-9030-61fde6632322";
const SANDBOX_MS = (1790603873 + 60) * 1000;

const RealDate = Date;
async function atSandboxTime(fn) {
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length > 0) {
        super(...args);
      } else {
        super(SANDBOX_MS);
      }
    }
    static now() {
      return SANDBOX_MS;
    }
  };
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

// The sandbox presentation with its KB JWT marked as detached: the check has no
// key to fetch the signatures, so verification fails with `invalid_config`.
function detachedVPToken() {
  const vc = JSON.parse(
    Buffer.from(SANDBOX_VP_TOKEN, "base64url").toString("utf8"),
  ).proof_id_default[0];
  const parts = vc.split("~");
  const kb = parts[parts.length - 1].split(".");
  const header = JSON.parse(Buffer.from(kb[0], "base64url").toString());
  const patched = {
    ...header,
    crit: ["proof.com#sig-1"],
    "proof.com#sig-1": "record-123",
  };
  parts[parts.length - 1] =
    `${Buffer.from(JSON.stringify(patched)).toString("base64url")}.${kb[1]}.`;
  return Buffer.from(
    JSON.stringify({ proof_id_default: [parts.join("~")] }),
  ).toString("base64url");
}

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

test("verify returns the credential when its nonce matches", async () => {
  const check = create({ clientId: SANDBOX_CLIENT_ID });
  const credential = await atSandboxTime(() =>
    check.verify({ vp_token: SANDBOX_VP_TOKEN, state: "42" }, SANDBOX_NONCE),
  );
  assert.equal(credential.getNonce(), SANDBOX_NONCE);
  assert.equal(credential.givenName, "Alexander J");
});

test("verify returns undefined when the nonce does not match", async () => {
  const check = create({ clientId: SANDBOX_CLIENT_ID });
  const credential = await atSandboxTime(() =>
    check.verify({ vp_token: SANDBOX_VP_TOKEN, state: "42" }, "n-other"),
  );
  assert.equal(credential, undefined);
});

test("verify rejects on an error that is not a rejected presentation", async () => {
  const check = create({ clientId: SANDBOX_CLIENT_ID });
  await assert.rejects(
    atSandboxTime(() =>
      check.verify({ vp_token: detachedVPToken(), state: "42" }, SANDBOX_NONCE),
    ),
    (error) => error instanceof ProofVCError && error.code === "invalid_config",
  );
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
