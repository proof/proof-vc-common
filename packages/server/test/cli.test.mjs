import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(...args) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [CLI, ...args],
    {
      encoding: "utf8",
    },
  );
  return { status, stdout, stderr };
}

function jsonError(stderr) {
  const parsed = JSON.parse(stderr);
  assert.deepEqual(Object.keys(parsed), ["error", "error_description"]);
  return parsed;
}

test("--help prints usage and exits 0", () => {
  const { status, stdout } = run("--help");
  assert.equal(status, 0);
  assert.match(stdout, /^Usage: proof enroll <client-id-url>/);
});

test("no command prints usage and exits 1", () => {
  const { status, stdout } = run();
  assert.equal(status, 1);
  assert.match(stdout, /^Usage:/);
});

test("an unknown command fails with a JSON error", () => {
  const { status, stderr } = run("register");
  assert.equal(status, 1);
  const error = jsonError(stderr);
  assert.equal(error.error, "invalid_arguments");
  assert.match(error.error_description, /unknown command "register"/);
});

test("enroll without --email or --key fails with a JSON error", () => {
  const { status, stderr } = run("enroll", "https://example.com/c.json");
  assert.equal(status, 1);
  const error = jsonError(stderr);
  assert.equal(error.error, "invalid_arguments");
  assert.match(
    error.error_description,
    /requires <client-id-url>, --email and --key/,
  );
});

test("an unknown option fails with a JSON error", () => {
  const { status, stderr } = run("enroll", "--bogus");
  assert.equal(status, 1);
  assert.equal(jsonError(stderr).error, "invalid_arguments");
});

test("a missing key file is reported", () => {
  const { status, stderr } = run(
    "enroll",
    "https://example.com/c.json",
    "--email",
    "bob@example.com",
    "--key",
    "/nonexistent/x401-key.pem",
  );
  assert.equal(status, 1);
  const error = jsonError(stderr);
  assert.equal(error.error, "invalid_key");
  assert.match(error.error_description, /^cannot read private key: ENOENT/);
});

test("loads an openssl SEC1 PEM key and refuses a non-public client id before any request", () => {
  const dir = mkdtempSync(join(tmpdir(), "proof-vc-"));
  const pem = join(dir, "x401-key.pem");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  writeFileSync(pem, privateKey.export({ type: "sec1", format: "pem" }));
  try {
    const { status, stderr } = run(
      "enroll",
      "https://localhost:3000/c.json",
      "--email",
      "bob@example.com",
      "--key",
      pem,
    );
    assert.equal(status, 1);
    const error = jsonError(stderr);
    assert.equal(error.error, "invalid_config");
    assert.match(
      error.error_description,
      /client id must be a public https URL/,
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("a file that is not a key is reported", () => {
  const { status, stderr } = run(
    "enroll",
    "https://example.com/c.json",
    "--email",
    "bob@example.com",
    "--key",
    fileURLToPath(new URL("./fixtures/chain/leaf.crt", import.meta.url)),
  );
  assert.equal(status, 1);
  const error = jsonError(stderr);
  assert.equal(error.error, "invalid_key");
  assert.match(error.error_description, /^cannot parse private key/);
});
