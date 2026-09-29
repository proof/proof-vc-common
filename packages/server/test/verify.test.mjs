import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createVerifier,
  ProofVCError,
  ProofCredentialV1,
} from "../dist/index.js";

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8").trim();

// A real sandbox presentation issued to the test identity "Alexander J Sample":
// iss https://api.fairfax.proof.com, leaf CN=Proof.com issued by
// "Proof Organization Authenticity Issuing CA R1 Development", KB-JWT bound to
// client_id caqnb6rwn. The leaf certificate is valid 2026-03-10..2027-03-10 and
// the KB-JWT iat is 1790603873, so the clock is pinned just after that.
const SANDBOX_VP_TOKEN = fixture("sandbox-vp-token.txt");
const SANDBOX_VC = JSON.parse(
  Buffer.from(SANDBOX_VP_TOKEN, "base64url").toString("utf8"),
).proof_id_default[0];
const SANDBOX_AUD = "caqnb6rwn";
const SANDBOX_NONCE = "3f947e15-fcf0-4cd7-9030-61fde6632322";
const SANDBOX_MS = (1790603873 + 60) * 1000;

// A generic identity VC (vct https://credentials.example.com/identity, iss
// https://issuer.example.com) whose leaf is issued by "Proof Document Signing
// Issuing CA R1 Development" under the development root. It is cryptographically
// valid (KB-JWT iat 1782294273, leaf valid 2025-09-25..2026-09-25) and serves as
// the negative case: its iss is not Proof's credential issuer.
const EXAMPLE_VC = fixture("example-identity-vc.txt");
const EXAMPLE_ISS = "https://issuer.example.com";
const EXAMPLE_MS = (1782294273 + 3600) * 1000;

const RealDate = Date;
async function withFixedTime(fn, fixedMs = SANDBOX_MS) {
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length > 0) {
        super(...args);
      } else {
        super(fixedMs);
      }
    }
    static now() {
      return fixedMs;
    }
  };
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

async function rejectsWith(fn, code, substring, fixedMs) {
  try {
    await withFixedTime(fn, fixedMs);
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

// Flip the first character of a segment's signature so the signature bytes
// actually change (flipping the last base64url char only alters padding bits).
function tamperSignature(vc, segmentIndex) {
  const segments = vc.split("~");
  const parts = segments[segmentIndex].split(".");
  parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  segments[segmentIndex] = parts.join(".");
  return segments.join("~");
}

function withHeader(vc, patch) {
  const segments = vc.split("~");
  const parts = segments[0].split(".");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  parts[0] = Buffer.from(JSON.stringify({ ...header, ...patch })).toString(
    "base64url",
  );
  segments[0] = parts.join(".");
  return segments.join("~");
}

function encodeVPToken(value) {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(json, "utf8").toString("base64url");
}

async function withCapturedWarnings(fn) {
  const realEmitWarning = process.emitWarning;
  const warnings = [];
  process.emitWarning = (message, options) => {
    warnings.push({ message, ...options });
  };
  try {
    await fn();
  } finally {
    process.emitWarning = realEmitWarning;
  }
  return warnings;
}

const sandbox = createVerifier({ environment: "sandbox" });
const production = createVerifier({ environment: "production" });

test("createVerifier rejects an unknown environment at construction", () => {
  assert.throws(
    () => createVerifier({ environment: "prod" }),
    (error) =>
      error instanceof ProofVCError &&
      error.code === "invalid_config" &&
      /`environment` must be one of/.test(error.message),
  );
});

test("a sandbox ProofCredentialV1 passes signature, KB, sd_hash, chain, issuer and aud checks", async () => {
  const credential = await withFixedTime(() =>
    sandbox.verify({ encodedSDJWT: SANDBOX_VC, aud: SANDBOX_AUD }),
  );
  assert.ok(credential instanceof ProofCredentialV1);
  assert.equal(credential.credentialType(), "ProofCredentialV1");
  assert.equal(credential.givenName, "Alexander J");
  assert.equal(credential.familyName, "Sample");
  assert.equal(credential.isOver18, true);
  assert.equal(credential.isOver21, undefined);
  assert.equal(credential.birthDate, undefined);
  assert.equal(credential.getNonce(), SANDBOX_NONCE);
});

test("aud is optional and skipped when omitted", async () => {
  const credential = await withFixedTime(() =>
    sandbox.verify({ encodedSDJWT: SANDBOX_VC }),
  );
  assert.ok(credential instanceof ProofCredentialV1);
});

test("a presentation without a KB JWT verifies, with or without aud, and has no nonce", async () => {
  const withoutKb = SANDBOX_VC.slice(0, SANDBOX_VC.lastIndexOf("~") + 1);
  assert.notEqual(withoutKb, SANDBOX_VC);
  for (const params of [{}, { aud: SANDBOX_AUD }]) {
    const credential = await withFixedTime(() =>
      sandbox.verify({ encodedSDJWT: withoutKb, ...params }),
    );
    assert.ok(credential instanceof ProofCredentialV1);
    assert.equal(credential.givenName, "Alexander J");
    assert.equal(credential.getNonce(), undefined);
  }
});

test("verifyVPToken verifies a raw sandbox vp_token", async () => {
  const vpToken = await withFixedTime(() =>
    sandbox.verifyVPToken({
      encodedVPToken: SANDBOX_VP_TOKEN,
      aud: SANDBOX_AUD,
    }),
  );
  assert.equal(vpToken.proof_id_default.length, 1);
  assert.deepEqual(vpToken.proof_id_nationality_us, []);
  assert.equal(vpToken.proof_id_default[0].getNonce(), SANDBOX_NONCE);
});

test("verifyVPToken verifies presentations under an unknown credential id", async () => {
  const encodedVPToken = encodeVPToken({ proof_id_future: [SANDBOX_VC] });
  const vpToken = await withFixedTime(() =>
    sandbox.verifyVPToken({ encodedVPToken, aud: SANDBOX_AUD }),
  );
  assert.deepEqual(Object.keys(vpToken).sort(), [
    "proof_id_default",
    "proof_id_future",
    "proof_id_nationality_us",
  ]);
  assert.ok(vpToken.proof_id_future[0] instanceof ProofCredentialV1);
});

test("rejects a mismatched aud", async () => {
  await rejectsWith(
    () =>
      sandbox.verify({ encodedSDJWT: SANDBOX_VC, aud: "https://evil.example" }),
    "verification_failed",
    "does not match expected aud",
  );
});

test("rejects a tampered issuer signature and keeps the cause", async () => {
  const error = await rejectsWith(
    () => sandbox.verify({ encodedSDJWT: tamperSignature(SANDBOX_VC, 0) }),
    "verification_failed",
    "SD-JWT-VC verification failed",
  );
  assert.equal(error.cause?.constructor?.name, "SDJWTException");
});

test("rejects a tampered key-binding signature", async () => {
  const segments = SANDBOX_VC.split("~");
  await rejectsWith(
    () =>
      sandbox.verify({
        encodedSDJWT: tamperSignature(SANDBOX_VC, segments.length - 1),
      }),
    "verification_failed",
    "SD-JWT-VC verification failed",
  );
});

test("rejects an altered presentation (sd_hash mismatch)", async () => {
  const segments = SANDBOX_VC.split("~");
  const withoutFirstDisclosure = [
    segments[0],
    ...segments.slice(2, -1),
    segments[segments.length - 1],
  ].join("~");
  await rejectsWith(
    () => sandbox.verify({ encodedSDJWT: withoutFirstDisclosure }),
    "verification_failed",
    "SD-JWT-VC verification failed",
  );
});

test("rejects a credential whose iss is not the environment's issuer", async () => {
  await rejectsWith(
    () => production.verify({ encodedSDJWT: SANDBOX_VC }),
    "verification_failed",
    "Credential iss https://api.fairfax.proof.com does not match expected issuer https://api.proof.com",
  );
  await rejectsWith(
    () => sandbox.verify({ encodedSDJWT: EXAMPLE_VC }),
    "verification_failed",
    `Credential iss ${EXAMPLE_ISS} does not match expected issuer https://api.fairfax.proof.com`,
    EXAMPLE_MS,
  );
});

test("rejects a JWT whose typ is not dc+sd-jwt", async () => {
  await rejectsWith(
    () =>
      sandbox.verify({
        encodedSDJWT: withHeader(SANDBOX_VC, { typ: "vc+sd-jwt" }),
      }),
    "verification_failed",
    "JWT header typ vc+sd-jwt is not dc+sd-jwt",
  );
});

test("rejects a malformed SD-JWT as invalid_input", async () => {
  await rejectsWith(
    () => sandbox.verify({ encodedSDJWT: "not-a-jwt" }),
    "invalid_input",
    "malformed SD-JWT-VC",
  );
});

test("rejects a vp_token that is not base64url JSON as invalid_input", async () => {
  await rejectsWith(
    () => sandbox.verifyVPToken({ encodedVPToken: "%%%" }),
    "invalid_input",
    "malformed vp_token",
  );
});

test("keeps unknown credential ids and warns once per id", async () => {
  const encodedVPToken = encodeVPToken({ proof_id_other: [] });
  const warnings = await withCapturedWarnings(async () => {
    const first = await sandbox.verifyVPToken({ encodedVPToken });
    const second = await sandbox.verifyVPToken({ encodedVPToken });
    assert.deepEqual(first, {
      proof_id_default: [],
      proof_id_nationality_us: [],
      proof_id_other: [],
    });
    assert.deepEqual(second, first);
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, "ProofVCWarning");
  assert.equal(warnings[0].code, "PROOF_VC_UNKNOWN_CREDENTIAL_ID");
  assert.match(warnings[0].message, /"proof_id_other"/);
});

test("rejects credential ids that collide with Object.prototype", async () => {
  for (const key of ["__proto__", "constructor", "toString"]) {
    await rejectsWith(
      () =>
        sandbox.verifyVPToken({
          encodedVPToken: encodeVPToken(`{"${key}":[]}`),
        }),
      "invalid_input",
      `invalid credential id "${key}"`,
    );
  }
});

test("rejects a vp_token that is not a JSON object", async () => {
  for (const value of ['"just a string"', 5, null, []]) {
    await rejectsWith(
      () => sandbox.verifyVPToken({ encodedVPToken: encodeVPToken(value) }),
      "invalid_input",
      "must decode to a JSON object",
    );
  }
});

test("rejects a credential id whose value is not an array of strings", async () => {
  for (const value of ["abc", 5, [5], [{}]]) {
    await rejectsWith(
      () =>
        sandbox.verifyVPToken({
          encodedVPToken: encodeVPToken({ proof_id_default: value }),
        }),
      "invalid_input",
      'vp_token["proof_id_default"] must be an array of SD-JWT-VC strings',
    );
  }
});

test("verifyVPToken populates every credential id absent from the response", async () => {
  const vpToken = await sandbox.verifyVPToken({
    encodedVPToken: encodeVPToken({}),
  });
  assert.deepEqual(vpToken, {
    proof_id_default: [],
    proof_id_nationality_us: [],
  });
});
