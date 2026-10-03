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

import { enroll, EnrollmentError, ProofVCError } from "../dist/index.js";

const CLIENT_ID = "https://example.com/.well-known/proof-client.json";
const ENROLL_URL =
  "https://api.fairfax.proof.com/verifiable-credentials/v1/x401-enroll";
const PENDING = {
  status: "pending",
  organization: { id: "or1", name: "Acme" },
  owner_email: "bob@example.com",
  activation: "email_sent",
};

const { publicKey, privateKey } = await generateKeyPair("ES256", {
  extractable: true,
});
const privateJwk = await exportJWK(privateKey);
const publicJwk = await exportJWK(publicKey);
const thumbprint = await calculateJwkThumbprint(publicJwk);

function cimd(overrides = {}) {
  return {
    client_id: CLIENT_ID,
    client_name: "Acme",
    redirect_uris: [
      "https://api.fairfax.proof.com/.well-known/agents-trust-list",
    ],
    token_endpoint_auth_method: "private_key_jwt",
    jwks: { keys: [publicJwk] },
    ...overrides,
  };
}

async function withServer({ document = cimd(), respond }, fn) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href === CLIENT_ID) return Response.json(document);
    if (href === ENROLL_URL) return respond(init);
    assert.fail(`unexpected fetch of ${href}`);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function params(overrides = {}) {
  return {
    environment: "sandbox",
    clientId: CLIENT_ID,
    email: "bob@example.com",
    privateKey: privateJwk,
    ...overrides,
  };
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

test("PUTs a client assertion for the enroll audience and returns the response", async () => {
  await withServer(
    { respond: () => Response.json(PENDING, { status: 202 }) },
    async (calls) => {
      const result = await enroll(params());

      assert.deepEqual(result, PENDING);
      const [, put] = calls;
      assert.equal(put.init.method, "PUT");
      const body = new URLSearchParams(put.init.body);
      assert.equal(
        body.get("client_assertion_type"),
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      );
      assert.equal(body.get("email"), "bob@example.com");
      const assertion = body.get("client_assertion");
      assert.equal(decodeProtectedHeader(assertion).kid, thumbprint);
      const { payload } = await jwtVerify(assertion, publicKey);
      assert.equal(payload.iss, CLIENT_ID);
      assert.equal(payload.sub, CLIENT_ID);
      assert.equal(payload.aud, ENROLL_URL);
      assert.equal(payload.exp, payload.iat + 300);
      assert.match(payload.jti, /^[0-9a-f-]{36}$/);
    },
  );
});

test("signs with the kid published in the client metadata document", async () => {
  await withServer(
    {
      document: cimd({ jwks: { keys: [{ ...publicJwk, kid: "my-key" }] } }),
      respond: () => Response.json(PENDING, { status: 202 }),
    },
    async (calls) => {
      await enroll(params({ privateKey }));
      const assertion = new URLSearchParams(calls[1].init.body).get(
        "client_assertion",
      );
      assert.equal(decodeProtectedHeader(assertion).kid, "my-key");
    },
  );
});

test("accepts a KeyObject private key", async () => {
  await withServer(
    { respond: () => Response.json(PENDING, { status: 202 }) },
    async () => {
      const key = createPrivateKey({ key: privateJwk, format: "jwk" });
      assert.deepEqual(await enroll(params({ privateKey: key })), PENDING);
    },
  );
});

test("returns a rejection instead of throwing", async () => {
  const rejected = {
    status: "rejected",
    reason: "existing_account",
    manual_setup_url: "https://dev.proof.com/docs/x401-manual-setup",
  };
  await withServer(
    { respond: () => Response.json(rejected, { status: 422 }) },
    async () => {
      assert.deepEqual(await enroll(params()), rejected);
    },
  );
});

test("reports an invalid client assertion with the server's description and link", async () => {
  await withServer(
    {
      respond: () =>
        Response.json(
          {
            error: "invalid_client",
            error_description: "invalid client assertion",
            error_uri: "https://dev.proof.com/docs/x401-manual-setup",
          },
          { status: 401 },
        ),
    },
    () =>
      assert.rejects(
        enroll(params()),
        (error) =>
          error instanceof EnrollmentError &&
          error.code === "invalid_config" &&
          error.status === 401 &&
          error.message === "invalid client assertion" &&
          error.response.error === "invalid_client" &&
          error.response.error_uri ===
            "https://dev.proof.com/docs/x401-manual-setup",
      ),
  );
});

test("reports a clean server error with the server's description and link", async () => {
  await withServer(
    {
      respond: () =>
        Response.json(
          {
            error: "server_error",
            error_description: "enrollment could not be completed",
            error_uri: "https://dev.proof.com/docs/x401-manual-setup",
          },
          { status: 500 },
        ),
    },
    () =>
      assert.rejects(enroll(params()), (error) => {
        assert.ok(error instanceof EnrollmentError);
        assert.equal(error.code, "authorization_server_error");
        assert.equal(error.status, 500);
        assert.deepEqual(error.response, {
          error: "server_error",
          error_description: "enrollment could not be completed",
          error_uri: "https://dev.proof.com/docs/x401-manual-setup",
        });
        return true;
      }),
  );
});

test("rejects a document whose client_id differs from its URL", async () => {
  await withServer(
    { document: cimd({ client_id: "https://example.com/other" }) },
    () =>
      rejectsWithInvalidConfig(
        enroll(params()),
        /declares a different client_id/,
      ),
  );
});

test("rejects a private key that is not published in the document", async () => {
  const other = await exportJWK(
    (await generateKeyPair("ES256", { extractable: true })).publicKey,
  );
  await withServer({ document: cimd({ jwks: { keys: [other] } }) }, () =>
    rejectsWithInvalidConfig(
      enroll(params()),
      /private key is not in the client metadata document/,
    ),
  );
});

test("rejects a document without an inline key set", async () => {
  await withServer(
    {
      document: cimd({ jwks: undefined, jwks_uri: "https://example.com/jwks" }),
    },
    () => rejectsWithInvalidConfig(enroll(params()), /has no jwks\.keys/),
  );
});

test("rejects non-public client ids without fetching", async () => {
  await withServer(
    { respond: () => assert.fail("must not enroll") },
    async (calls) => {
      for (const clientId of [
        "http://example.com/client.json",
        "https://localhost:3000/client.json",
        "https://app.localhost/client.json",
        "https://127.0.0.1/client.json",
        "https://[::1]/client.json",
        "https://dev.local/client.json",
      ]) {
        await rejectsWithInvalidConfig(
          enroll(params({ clientId })),
          /client id must be a public https URL/,
        );
      }
      await rejectsWithInvalidConfig(
        enroll(params({ clientId: "example.com" })),
        /client id must be a URL/,
      );
      assert.deepEqual(calls, []);
    },
  );
});

test("validates environment and email before fetching", async () => {
  await withServer(
    { respond: () => assert.fail("must not enroll") },
    async (calls) => {
      await rejectsWithInvalidConfig(
        enroll(params({ environment: "prod" })),
        /environment must be one of/,
      );
      await rejectsWithInvalidConfig(
        enroll(params({ email: "" })),
        /email address is required/,
      );
      assert.deepEqual(calls, []);
    },
  );
});

test("a missing document is reported without the raw status", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<!DOCTYPE html><html><body>Not Found</body></html>", {
      status: 404,
      headers: { "content-type": "text/html" },
    });
  try {
    await assert.rejects(
      enroll(params()),
      (error) =>
        error instanceof ProofVCError &&
        error.code === "invalid_config" &&
        error.status === 404 &&
        error.message ===
          `no client metadata document was found at ${CLIENT_ID}`,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an enrollment endpoint that is not deployed is reported per environment", async () => {
  await withServer(
    {
      respond: () =>
        new Response("<html>offline</html>", {
          status: 404,
          headers: { "content-type": "text/html" },
        }),
    },
    () =>
      assert.rejects(
        enroll(params()),
        (error) =>
          error instanceof ProofVCError &&
          error.code === "authorization_server_error" &&
          error.status === 404 &&
          error.message ===
            "the enrollment endpoint is not available in the sandbox environment",
      ),
  );
});

test("an unreachable document fails with authorization_server_error", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  try {
    await assert.rejects(
      enroll(params()),
      (error) =>
        error instanceof ProofVCError &&
        error.code === "authorization_server_error" &&
        error.message ===
          "client metadata document fetch could not be completed: fetch failed",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
