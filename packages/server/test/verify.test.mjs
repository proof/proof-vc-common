import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createVerifier } from "../dist/index.js";

const VC = readFileSync(
  new URL("./fixtures/example-identity-vc.txt", import.meta.url),
  "utf8",
).trim();

// The fixture is a generic identity VC (vct https://credentials.example.com/identity),
// not a Notarize ProofCredentialV1. It is signed by, and bound to, the same key
// (the issuer's leaf key equals cnf.jwk), and chains to the development trust root.
// Because the vct is not one this library maps, a fully valid VC reaches the
// credential-mapping step and is rejected there — so "rejects with the unknown
// vct error" is the signal that every cryptographic + chain + aud check passed.
const AUD = "https://verifier.example.com";
const VCT = "https://credentials.example.com/identity";

// The KB JWT iat is 1782294273 and the leaf cert is valid 2025-09-25..2026-09-25.
// Pin the clock inside that window so iat/nbf/exp and cert-validity checks are
// deterministic regardless of when the suite runs.
const FIXED_MS = (1782294273 + 3600) * 1000;
const RealDate = Date;
async function withFixedTime(fn) {
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length > 0) {
        super(...args);
      } else {
        super(FIXED_MS);
      }
    }
    static now() {
      return FIXED_MS;
    }
  };
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

async function rejectsContaining(fn, substring) {
  try {
    await withFixedTime(fn);
  } catch (error) {
    const message = String(error?.message ?? error);
    assert.ok(
      message.includes(substring),
      `expected an error containing "${substring}", got "${message}"`,
    );
    return;
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

const development = createVerifier({ trustRoot: "development" });
const production = createVerifier({ trustRoot: "production" });

test("a valid VC passes issuer signature, KB signature, sd_hash, chain, and aud", async () => {
  await rejectsContaining(
    () => development.verify({ encodedSDJWT: VC, aud: AUD }),
    `unknown ProofCredential for vct: ${VCT}`,
  );
});

test("aud is optional and skipped when omitted", async () => {
  await rejectsContaining(
    () => development.verify({ encodedSDJWT: VC }),
    `unknown ProofCredential for vct: ${VCT}`,
  );
});

test("rejects a mismatched aud", async () => {
  await rejectsContaining(
    () =>
      development.verify({ encodedSDJWT: VC, aud: "https://evil.example.com" }),
    "does not match expected aud",
  );
});

test("rejects a tampered issuer signature", async () => {
  await rejectsContaining(
    () => development.verify({ encodedSDJWT: tamperSignature(VC, 0) }),
    "Invalid JWT Signature",
  );
});

test("rejects a tampered key-binding signature", async () => {
  await rejectsContaining(
    () => development.verify({ encodedSDJWT: tamperSignature(VC, 2) }),
    "Invalid JWT Signature",
  );
});

test("rejects an altered presentation (sd_hash mismatch)", async () => {
  const segments = VC.split("~");
  const withoutDisclosure = [segments[0], segments[2]].join("~");
  await rejectsContaining(
    () => development.verify({ encodedSDJWT: withoutDisclosure, aud: AUD }),
    "Invalid sd_hash",
  );
});

test("rejects a chain that does not match the configured trust root", async () => {
  await rejectsContaining(
    () => production.verify({ encodedSDJWT: VC, aud: AUD }),
    "not issued by next in chain",
  );
});
