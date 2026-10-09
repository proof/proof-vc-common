import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPair, jwtVerify } from "jose";

import { createVerifier, ProofVCError } from "../dist/index.js";

const DETACHED_SIGNATURE_HEADER = "proof.com#sig-1";

const SANDBOX_VP_TOKEN = readFileSync(
  new URL("./fixtures/sandbox-vp-token.txt", import.meta.url),
  "utf8",
).trim();
const SANDBOX_VC = JSON.parse(
  Buffer.from(SANDBOX_VP_TOKEN, "base64url").toString("utf8"),
).proof_id_default[0];
const SIGNATURES_URL =
  "https://api.fairfax.proof.com/verifiable-credentials/v1/x401-signatures";
const RECORD_ID = "record-123";
const CLIENT_ID = "https://verifier.example/.well-known/proof-client.json";

const { privateKey, publicKey } = await generateKeyPair("ES256", {
  extractable: true,
});
const verifierConfig = {
  environment: "sandbox",
  clientId: CLIENT_ID,
  privateKeyFactory: () => privateKey,
};

function split(vc) {
  const parts = vc.split("~");
  const issuer = parts[0].split(".");
  const kb = parts[parts.length - 1].split(".");
  return { parts, issuer, kb };
}

// Strips both signatures and marks the KB JWT header as detached. Editing the
// KB JWT header invalidates its signature, so a detached fixture can only
// prove the fetch and splice wiring: the final verification fails on the KB
// signature instead of on a missing one.
function detach(vc, headerPatch = {}) {
  const { parts, issuer, kb } = split(vc);
  const header = JSON.parse(Buffer.from(kb[0], "base64url").toString());
  const patched = {
    ...header,
    crit: [DETACHED_SIGNATURE_HEADER],
    [DETACHED_SIGNATURE_HEADER]: RECORD_ID,
    ...headerPatch,
  };
  parts[0] = `${issuer[0]}.${issuer[1]}.`;
  parts[parts.length - 1] =
    `${Buffer.from(JSON.stringify(patched)).toString("base64url")}.${kb[1]}.`;
  return {
    detached: parts.join("~"),
    signatures: { issuer_signature: issuer[2], kb_signature: kb[2] },
  };
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function withFetch(responses, fn) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    assert.ok(next !== undefined, `unexpected fetch of ${String(url)}`);
    return typeof next === "function" ? next() : next;
  };
  await fn(createVerifier({ ...verifierConfig, fetch }), calls);
  assert.equal(responses.length, 0, "every stubbed response was consumed");
  return calls;
}

async function rejectsWith(fn, code, substring) {
  try {
    await fn();
  } catch (error) {
    assert.ok(
      error instanceof ProofVCError,
      `expected a ProofVCError, got ${error?.constructor?.name}: ${error?.message}`,
    );
    assert.equal(error.code, code);
    assert.ok(
      error.message.includes(substring),
      `expected an error containing "${substring}", got "${error.message}"`,
    );
    return error;
  }
  assert.fail(`expected a rejection containing "${substring}"`);
}

test("fetches the detached signatures with a client assertion and splices them before verifying", async () => {
  const { detached, signatures } = detach(SANDBOX_VC);
  const calls = await withFetch([jsonResponse(200, signatures)], (verifier) =>
    rejectsWith(
      () => verifier.verify({ encodedSDJWT: detached }),
      "verification_failed",
      "SD-JWT-VC verification failed",
    ),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SIGNATURES_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.id, RECORD_ID);
  assert.equal(
    body.client_assertion_type,
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
  );
  const { payload, protectedHeader } = await jwtVerify(
    body.client_assertion,
    publicKey,
    { issuer: CLIENT_ID, subject: CLIENT_ID, audience: SIGNATURES_URL },
  );
  assert.equal(protectedHeader.alg, "ES256");
  assert.ok(typeof protectedHeader.kid === "string");
  assert.ok(typeof payload.jti === "string");
  assert.ok(payload.exp - payload.iat <= 300);
});

test("verifyVPToken fetches the signatures of each detached presentation", async () => {
  const { detached, signatures } = detach(SANDBOX_VC);
  const encodedVPToken = Buffer.from(
    JSON.stringify({ proof_id_default: [detached] }),
  ).toString("base64url");
  const calls = await withFetch([jsonResponse(200, signatures)], (verifier) =>
    rejectsWith(
      () => verifier.verifyVPToken({ encodedVPToken }),
      "verification_failed",
      "SD-JWT-VC verification failed",
    ),
  );
  assert.equal(calls.length, 1);
});

test("retries while the transaction charges are pending, honouring Retry-After", async () => {
  const { detached, signatures } = detach(SANDBOX_VC);
  const calls = await withFetch(
    [
      jsonResponse(409, { error: "charges_pending" }, { "retry-after": "0" }),
      jsonResponse(200, signatures),
    ],
    (verifier) =>
      rejectsWith(
        () => verifier.verify({ encodedSDJWT: detached }),
        "verification_failed",
        "SD-JWT-VC verification failed",
      ),
  );
  assert.equal(calls.length, 2);
  assert.notEqual(
    JSON.parse(calls[0].init.body).client_assertion,
    JSON.parse(calls[1].init.body).client_assertion,
  );
});

test("surfaces a 402 as payment_required when the fetch cannot pay", async () => {
  const { detached } = detach(SANDBOX_VC);
  await withFetch(
    [jsonResponse(402, { x402Version: 2, accepts: [] })],
    async (verifier) => {
      const error = await rejectsWith(
        () => verifier.verify({ encodedSDJWT: detached }),
        "payment_required",
        "x402 payment",
      );
      assert.equal(error.status, 402);
    },
  );
});

test("rejects an unknown or foreign record as verification_failed", async () => {
  const { detached } = detach(SANDBOX_VC);
  for (const status of [401, 404]) {
    await withFetch(
      [jsonResponse(status, { error: "nope" })],
      async (verifier) => {
        const error = await rejectsWith(
          () => verifier.verify({ encodedSDJWT: detached }),
          "verification_failed",
          `detached signatures fetch failed (${status})`,
        );
        assert.equal(error.status, status);
      },
    );
  }
});

test("requires clientId and privateKeyFactory before fetching", async () => {
  const { detached } = detach(SANDBOX_VC);
  const verifier = createVerifier({
    environment: "sandbox",
    fetch: () => assert.fail("must not fetch"),
  });
  await rejectsWith(
    () => verifier.verify({ encodedSDJWT: detached }),
    "invalid_config",
    "requires `clientId` and `privateKeyFactory`",
  );
});

test("rejects a critical header parameter it does not implement without fetching", async () => {
  const { detached } = detach(SANDBOX_VC, { crit: ["proof.com#sig-2"] });
  await withFetch([], (verifier) =>
    rejectsWith(
      () => verifier.verify({ encodedSDJWT: detached }),
      "verification_failed",
      "critical header parameter proof.com#sig-2 is not supported",
    ),
  );
});

test("does not fetch when a presentation marked detached still carries its signatures", async () => {
  const { parts, issuer, kb } = split(SANDBOX_VC);
  const header = JSON.parse(Buffer.from(kb[0], "base64url").toString());
  const patched = {
    ...header,
    crit: [DETACHED_SIGNATURE_HEADER],
    [DETACHED_SIGNATURE_HEADER]: RECORD_ID,
  };
  parts[parts.length - 1] =
    `${Buffer.from(JSON.stringify(patched)).toString("base64url")}.${kb[1]}.${kb[2]}`;
  assert.equal(issuer[2].length > 0, true);
  await withFetch([], (verifier) =>
    rejectsWith(
      () => verifier.verify({ encodedSDJWT: parts.join("~") }),
      "verification_failed",
      "SD-JWT-VC verification failed",
    ),
  );
});

test("validates clientId, privateKeyFactory and timeout at construction", () => {
  for (const config of [
    { environment: "sandbox", clientId: "" },
    { environment: "sandbox", privateKeyFactory: "not-a-function" },
    { environment: "sandbox", timeout: 0 },
  ]) {
    assert.throws(
      () => createVerifier(config),
      (error) =>
        error instanceof ProofVCError && error.code === "invalid_config",
    );
  }
});
