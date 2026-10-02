#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createPrivateKey, type KeyObject } from "node:crypto";
import { parseArgs } from "node:util";
import { ProofVCError, type Environment } from "@proof.com/proof-vc-common";
import { enroll, EnrollmentError } from "./enroll.ts";

const USAGE = `Usage: proof enroll <client-id-url> --email <email> --key <private-key-file> [--environment <env>]

Enroll as a Verifier on Proof using the Client ID Metadata Document served at <client-id-url>.
Prints Proof's JSON response on stdout, or a JSON error on stderr.

Options:
  --email        Email of the account owner. The activation link is sent there.
  --key          Path to the ES256 private key (PEM or JWK) whose public key is published in the document.
  --environment  production (default), sandbox, staging, next or localhost.
  --help         Show this help.
`;

function failWith(response: Record<string, unknown>): never {
  process.stderr.write(`${JSON.stringify(response, null, 2)}\n`);
  process.exit(1);
}

function fail(error: string, description: string, status?: number): never {
  failWith({
    error,
    error_description: description,
    ...(status !== undefined && { status }),
  });
}

function detail(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function loadPrivateKey(path: string): KeyObject {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (cause) {
    fail("invalid_key", `cannot read private key: ${detail(cause)}`);
  }
  try {
    return content.trimStart().startsWith("-----BEGIN")
      ? createPrivateKey(content)
      : createPrivateKey({ key: JSON.parse(content), format: "jwk" });
  } catch (cause) {
    fail("invalid_key", `cannot parse private key: ${detail(cause)}`);
  }
}

let values: {
  email?: string;
  key?: string;
  environment: string;
  help: boolean;
};
let positionals: string[];
try {
  ({ values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: "string" },
      key: { type: "string" },
      environment: { type: "string", default: "production" },
      help: { type: "boolean", default: false },
    },
  }));
} catch (cause) {
  fail("invalid_arguments", detail(cause));
}

const [command, clientId] = positionals;
if (values.help || command === undefined) {
  process.stdout.write(USAGE);
  process.exit(values.help ? 0 : 1);
}
if (command !== "enroll") {
  fail("invalid_arguments", `unknown command "${command}"; run with --help`);
}
if (
  clientId === undefined ||
  values.email === undefined ||
  values.key === undefined
) {
  fail(
    "invalid_arguments",
    "enroll requires <client-id-url>, --email and --key; run with --help",
  );
}

try {
  const result = await enroll({
    environment: values.environment as Environment,
    clientId,
    email: values.email,
    privateKey: loadPrivateKey(values.key),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === "rejected" ? 1 : 0);
} catch (error) {
  if (error instanceof EnrollmentError) {
    failWith({ ...error.response, status: error.status });
  }
  if (error instanceof ProofVCError) {
    fail(error.code, error.message, error.status);
  }
  fail("unexpected_error", detail(error));
}
