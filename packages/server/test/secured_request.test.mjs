import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey } from "node:crypto";
import {
  generateKeyPair,
  exportJWK,
  calculateJwkThumbprint,
  jwtVerify,
  decodeProtectedHeader,
} from "jose";

import { createClient, DCQL_QUERY_BASIC, ProofVCError } from "../dist/index.js";

const CLIENT_ID = "https://verifier.example.com";
const CALLBACK_URI = "https://verifier.example.com/callback";
const AS_ISSUER =
  "https://api.proof.com/verifiable-credentials/v1/presentation";

const { publicKey, privateKey } = await generateKeyPair("ES256", {
  extractable: true,
});
const privateJwk = await exportJWK(privateKey);
const publicJwk = await exportJWK(publicKey);
const expectedKid = await calculateJwkThumbprint(publicJwk);

async function withStubbedFetch(fn, { requestUri = "urn:par:123" } = {}) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    calls.push({ url: href, body: options?.body, signal: options?.signal });
    assert.ok(href.endsWith("/par"), `unexpected fetch of ${href}`);
    return Response.json({ request_uri: requestUri }, { status: 201 });
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
      state: "state-xyz",
      loginHint: "user@example.com",
      expectedOrigins: ["https://verifier.example.com"],
    });

    assert.deepEqual(calls, []);

    const header = decodeProtectedHeader(jwt);
    assert.equal(header.typ, "oauth-authz-req+jwt");
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, expectedKid);

    const { payload } = await jwtVerify(jwt, publicKey);
    assert.equal(payload.iss, CLIENT_ID);
    assert.equal(payload.aud, AS_ISSUER);
    const now = Math.floor(Date.now() / 1000);
    assert.ok(Math.abs(payload.iat - now) <= 2, `iat ${payload.iat} vs ${now}`);
    assert.equal(payload.exp, payload.iat + 300);
    assert.match(payload.jti, /^[0-9a-f-]{36}$/);
    assert.equal(payload.client_id, CLIENT_ID);
    assert.equal(payload.response_type, "vp_token");
    assert.equal(payload.response_mode, "dc_api");
    assert.equal(payload.nonce, "nonce-123");
    assert.deepEqual(payload.dcql_query, DCQL_QUERY_BASIC);
    assert.deepEqual(payload.expected_origins, [
      "https://verifier.example.com",
    ]);
    assert.equal(payload.response_uri, undefined);
    assert.equal(payload.state, "state-xyz");
    assert.equal(payload.login_hint, "user@example.com");
    assert.equal(payload.scope, undefined);
  });
});

test("signedDcApiRequest does not need callbackUri", async () => {
  await withStubbedFetch(async () => {
    const client = securedClient({ callbackUri: undefined });
    const jwt = await client.signedDcApiRequest({
      dcqlQuery: DCQL_QUERY_BASIC,
      nonce: "nonce-123",
      expectedOrigins: ["https://verifier.example.com"],
    });

    const { payload } = await jwtVerify(jwt, publicKey);
    assert.deepEqual(payload.expected_origins, [
      "https://verifier.example.com",
    ]);
    assert.equal(payload.response_uri, undefined);
  });
});

test("signedDcApiRequest rejects missing, empty or non-string expectedOrigins", async () => {
  await withStubbedFetch(async () => {
    const client = securedClient();
    for (const expectedOrigins of [undefined, [], [42]]) {
      await assert.rejects(
        client.signedDcApiRequest({
          dcqlQuery: DCQL_QUERY_BASIC,
          nonce: "nonce-123",
          expectedOrigins,
        }),
        (error) =>
          error instanceof ProofVCError &&
          error.code === "invalid_config" &&
          /`expectedOrigins` must be a non-empty array of origin strings/.test(
            error.message,
          ),
      );
    }
  });
});

test("authorizationUrl and signedAuthorizationRequest require callbackUri", async () => {
  const client = createClient({
    environment: "production",
    clientId: CLIENT_ID,
  });
  await assert.rejects(
    client.authorizationUrl({ scope: "openid", nonce: "n" }),
    /require `callbackUri`/,
  );
  await assert.rejects(
    securedClient({ callbackUri: undefined }).signedAuthorizationRequest({
      scope: "openid",
      nonce: "n",
    }),
    /require `callbackUri`/,
  );
});

test("signedDcApiRequest supports a scope-based request", async () => {
  await withStubbedFetch(async () => {
    const client = securedClient();
    const jwt = await client.signedDcApiRequest({
      scope: "openid",
      nonce: "nonce-123",
      expectedOrigins: ["https://verifier.example.com"],
    });

    const { payload } = await jwtVerify(jwt, publicKey);
    assert.equal(payload.scope, "openid");
    assert.equal(payload.dcql_query, undefined);
    assert.equal(payload.response_uri, undefined);
  });
});

test("signedDcApiRequest rejects supplying both scope and dcqlQuery", async () => {
  await withStubbedFetch(async () => {
    const client = securedClient();
    await assert.rejects(
      client.signedDcApiRequest({
        scope: "openid",
        dcqlQuery: DCQL_QUERY_BASIC,
        nonce: "nonce-123",
        expectedOrigins: ["https://verifier.example.com"],
      }),
      /exactly one of `scope` or `dcqlQuery`/,
    );
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
    assert.equal(payload.aud, AS_ISSUER);
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
  const client = securedClient({
    usePushedAuthorizationRequest: true,
    clientSecret: "s3cret",
  });
  assert.throws(
    () =>
      client.jarByReferenceAuthorizationUrl({
        requestUri: "https://verifier.example.com/jar/42",
      }),
    /cannot be combined with pushed authorization requests/,
  );
});

test("createClient rejects an invalid server config at construction", () => {
  const base = {
    environment: "production",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
  };
  const cases = [
    [{ ...base, environment: "prod" }, /`environment` must be one of/],
    [
      { ...base, usePushedAuthorizationRequest: true },
      /`clientSecret` must be a non-empty string/,
    ],
    [
      { ...base, useSecuredAuthorizationRequest: true },
      /requires a `privateKeyFactory` function/,
    ],
    [{ ...base, timeout: 0 }, /`timeout` must be a positive integer/],
    [
      { ...base, requestObjectLifetime: 1.5 },
      /`requestObjectLifetime` must be a positive integer/,
    ],
  ];
  for (const [config, pattern] of cases) {
    assert.throws(
      () => createClient(config),
      (error) =>
        error instanceof ProofVCError &&
        error.code === "invalid_config" &&
        pattern.test(error.message),
      `expected ${JSON.stringify(config)} to be rejected`,
    );
  }
});

test("signed methods require useSecuredAuthorizationRequest", async () => {
  const client = createClient({
    environment: "production",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
    privateKeyFactory: () => privateJwk,
  });
  await assert.rejects(
    client.signedDcApiRequest({
      dcqlQuery: DCQL_QUERY_BASIC,
      nonce: "n",
      expectedOrigins: ["https://verifier.example.com"],
    }),
    /useSecuredAuthorizationRequest/,
  );
});

function parClient(overrides = {}) {
  return createClient({
    environment: "production",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
    clientSecret: "s3cret",
    usePushedAuthorizationRequest: true,
    ...overrides,
  });
}

async function withFetch(stub, fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

const hangUntilAborted = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  });

async function rejectsWithServerError(promise, messagePattern) {
  await assert.rejects(
    promise,
    (error) =>
      error instanceof ProofVCError &&
      error.code === "authorization_server_error" &&
      messagePattern.test(error.message),
  );
}

test("a PAR error response fails with authorization_server_error and the body excerpt", async () => {
  await withFetch(
    async () =>
      Response.json(
        { error: "invalid_request", error_description: "bad scope" },
        { status: 400 },
      ),
    () =>
      rejectsWithServerError(
        parClient().authorizationUrl({ scope: "openid", nonce: "n" }),
        /^pushed authorization request failed \(400\): \{"error":"invalid_request"/,
      ),
  );
});

test("a non-JSON error page reports the status instead of a SyntaxError", async () => {
  await withFetch(
    async () =>
      new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    () =>
      rejectsWithServerError(
        parClient().authorizationUrl({ scope: "openid", nonce: "n" }),
        /^pushed authorization request failed \(502\): <html>/,
      ),
  );
});

test("a 200 with a non-JSON body fails with authorization_server_error", async () => {
  await withFetch(
    async () => new Response("not json", { status: 200 }),
    () =>
      rejectsWithServerError(
        parClient().authorizationUrl({ scope: "openid", nonce: "n" }),
        /returned a non-JSON body \(200\): not json/,
      ),
  );
});

test("a network failure is wrapped with its cause", async () => {
  const cause = new TypeError("fetch failed");
  await withFetch(
    async () => {
      throw cause;
    },
    () =>
      assert.rejects(
        parClient().authorizationUrl({ scope: "openid", nonce: "n" }),
        (error) =>
          error instanceof ProofVCError &&
          error.code === "authorization_server_error" &&
          error.message ===
            "pushed authorization request could not be completed: fetch failed" &&
          error.cause === cause,
      ),
  );
});

test("the configured timeout aborts a hanging request", async () => {
  await withFetch(hangUntilAborted, () =>
    rejectsWithServerError(
      parClient({ timeout: 20 }).authorizationUrl({
        scope: "openid",
        nonce: "n",
      }),
      /could not be completed: The operation was aborted due to timeout/,
    ),
  );
});

test("a per-call signal aborts the request", async () => {
  await withFetch(hangUntilAborted, async () => {
    const controller = new AbortController();
    const pending = parClient().authorizationUrl(
      { scope: "openid", nonce: "n" },
      { signal: controller.signal },
    );
    controller.abort(new Error("caller gave up"));
    await rejectsWithServerError(
      pending,
      /could not be completed: caller gave up/,
    );
  });
});

test("the PAR request is a POST carrying the default timeout signal", async () => {
  const calls = [];
  await withFetch(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ request_uri: "urn:par:custom" }, { status: 201 });
    },
    async () => {
      const url = await parClient().authorizationUrl({
        scope: "openid",
        nonce: "n",
      });
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.endsWith("/par"));
      assert.ok(calls[0].init.signal instanceof AbortSignal);
      assert.equal(calls[0].init.method, "POST");
      assert.equal(
        new URL(url).searchParams.get("request_uri"),
        "urn:par:custom",
      );
    },
  );
});

test("privateKeyFactory may return a KeyObject or a CryptoKey", async () => {
  await withStubbedFetch(async () => {
    for (const key of [
      privateKey,
      createPrivateKey({ key: privateJwk, format: "jwk" }),
    ]) {
      const client = securedClient({ privateKeyFactory: () => key });
      const jwt = await client.signedAuthorizationRequest({
        scope: "openid",
        nonce: "n",
      });
      assert.equal(decodeProtectedHeader(jwt).kid, expectedKid);
      const { payload } = await jwtVerify(jwt, publicKey);
      assert.equal(payload.iss, CLIENT_ID);
    }
  });
});

test("requestObjectLifetime sets exp and each JAR gets a fresh jti", async () => {
  await withStubbedFetch(async () => {
    const client = securedClient({ requestObjectLifetime: 60 });
    const params = { scope: "openid", nonce: "n" };
    const [{ payload: first }, { payload: second }] = await Promise.all([
      client
        .signedAuthorizationRequest(params)
        .then((jwt) => jwtVerify(jwt, publicKey)),
      client
        .signedAuthorizationRequest(params)
        .then((jwt) => jwtVerify(jwt, publicKey)),
    ]);
    assert.equal(first.exp, first.iat + 60);
    assert.notEqual(first.jti, second.jti);
  });
});

test("the JAR audience is the environment's authorization server issuer", async () => {
  const sandbox = createClient({
    environment: "sandbox",
    clientId: CLIENT_ID,
    callbackUri: CALLBACK_URI,
    useSecuredAuthorizationRequest: true,
    privateKeyFactory: () => privateJwk,
  });
  const jwt = await sandbox.signedAuthorizationRequest({
    scope: "openid",
    nonce: "n",
  });
  const { payload } = await jwtVerify(jwt, publicKey);
  assert.equal(
    payload.aud,
    "https://api.fairfax.proof.com/verifiable-credentials/v1/presentation",
  );
});
