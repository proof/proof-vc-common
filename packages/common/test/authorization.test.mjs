import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createClient,
  buildAuthorizationUrl,
  parseAuthorizationResponse,
  DCQL_QUERY_BASIC,
  ProofVCError,
} from "../dist/index.js";

const CONFIG = {
  environment: "production",
  clientId: "client-abc",
  callbackUri: "https://merchant.example.com/callback",
};

test("createClient builds a scope-based authorize URL (fragment default)", () => {
  const url = new URL(
    createClient(CONFIG).authorizationUrl({
      nonce: "n-123",
      scope: "urn:proof:params:scope:verifiable-credentials:basic",
    }),
  );
  assert.equal(url.origin, "https://api.proof.com");
  assert.equal(
    url.pathname,
    "/verifiable-credentials/v1/presentation/authorize",
  );
  assert.equal(url.searchParams.get("client_id"), "client-abc");
  assert.equal(url.searchParams.get("response_mode"), "fragment");
  assert.equal(url.searchParams.get("response_type"), "vp_token");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://merchant.example.com/callback",
  );
  assert.equal(url.searchParams.get("nonce"), "n-123");
  assert.equal(
    url.searchParams.get("scope"),
    "urn:proof:params:scope:verifiable-credentials:basic",
  );
});

test("createClient accepts the nationality scope", () => {
  const url = new URL(
    createClient(CONFIG).authorizationUrl({
      nonce: "n-124",
      scope: "urn:proof:params:scope:verifiable-credentials:nationality:us",
    }),
  );
  assert.equal(
    url.searchParams.get("scope"),
    "urn:proof:params:scope:verifiable-credentials:nationality:us",
  );
});

test("direct_post uses response_uri instead of redirect_uri", () => {
  const url = new URL(
    createClient({ ...CONFIG, responseMode: "direct_post" }).authorizationUrl({
      nonce: "n-1",
      dcqlQuery: DCQL_QUERY_BASIC,
    }),
  );
  assert.equal(
    url.searchParams.get("response_uri"),
    "https://merchant.example.com/callback",
  );
  assert.equal(url.searchParams.get("redirect_uri"), null);
  assert.equal(
    url.searchParams.get("dcql_query"),
    JSON.stringify(DCQL_QUERY_BASIC),
  );
});

test("buildAuthorizationUrl matches createClient for the same inputs", () => {
  const params = {
    nonce: "n-9",
    scope: "urn:proof:params:scope:verifiable-credentials:basic",
    state: "s-1",
  };
  assert.equal(
    buildAuthorizationUrl({ ...CONFIG, ...params }),
    createClient(CONFIG).authorizationUrl(params),
  );
});

test("rejects supplying both scope and dcqlQuery with invalid_config", () => {
  assert.throws(
    () =>
      createClient(CONFIG).authorizationUrl({
        nonce: "n",
        scope: "urn:proof:params:scope:verifiable-credentials:basic",
        dcqlQuery: DCQL_QUERY_BASIC,
      }),
    (error) =>
      error instanceof ProofVCError &&
      error.name === "ProofVCError" &&
      error.code === "invalid_config" &&
      /exactly one of `scope` or `dcqlQuery`/.test(error.message),
  );
});

test("rejects a missing or empty nonce", () => {
  for (const nonce of [undefined, ""]) {
    assert.throws(
      () =>
        createClient(CONFIG).authorizationUrl({
          nonce,
          scope: "urn:proof:params:scope:verifiable-credentials:basic",
        }),
      (error) =>
        error instanceof ProofVCError &&
        error.code === "invalid_config" &&
        /`nonce` must be a non-empty string/.test(error.message),
    );
  }
});

test("createClient rejects invalid config at construction", () => {
  const cases = [
    [
      { ...CONFIG, environment: "prod" },
      /`environment` must be one of "localhost", "next", "staging", "sandbox", "production"/,
    ],
    [{ ...CONFIG, clientId: "" }, /`clientId` must be a non-empty string/],
    [
      { ...CONFIG, callbackUri: undefined },
      /`callbackUri` must be a non-empty string/,
    ],
    [
      { ...CONFIG, responseMode: "query" },
      /`responseMode` must be one of "fragment", "direct_post"/,
    ],
  ];
  for (const [config, pattern] of cases) {
    assert.throws(
      () => createClient(config),
      (error) =>
        error instanceof ProofVCError &&
        error.code === "invalid_config" &&
        pattern.test(error.message),
    );
  }
});

test("an unknown scope is accepted and warns once", () => {
  const realEmitWarning = process.emitWarning;
  const warnings = [];
  process.emitWarning = (message, options) => {
    warnings.push({ message, ...options });
  };
  try {
    for (let i = 0; i < 2; i++) {
      const url = new URL(
        createClient(CONFIG).authorizationUrl({
          nonce: "n",
          scope: "urn:proof:params:scope:verifiable-credentials:future",
        }),
      );
      assert.equal(
        url.searchParams.get("scope"),
        "urn:proof:params:scope:verifiable-credentials:future",
      );
    }
  } finally {
    process.emitWarning = realEmitWarning;
  }
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, "ProofVCWarning");
  assert.equal(warnings[0].code, "PROOF_VC_UNKNOWN_SCOPE");
  assert.match(warnings[0].message, /verifiable-credentials:future/);
});

test("parseAuthorizationResponse reads vp_token and state from a fragment", () => {
  const parsed = parseAuthorizationResponse("#vp_token=abc123&state=xyz");
  assert.deepEqual(parsed, {
    type: "success",
    vpToken: "abc123",
    state: "xyz",
  });
});

test("parseAuthorizationResponse reads a form-encoded body without a prefix", () => {
  const parsed = parseAuthorizationResponse("vp_token=abc123");
  assert.deepEqual(parsed, { type: "success", vpToken: "abc123" });
});

test("parseAuthorizationResponse reads an OAuth error response", () => {
  const parsed = parseAuthorizationResponse(
    "#error=access_denied&error_description=User%20cancelled&error_uri=https%3A%2F%2Fexample.com%2Fhelp&state=xyz",
  );
  assert.deepEqual(parsed, {
    type: "error",
    error: "access_denied",
    errorDescription: "User cancelled",
    errorUri: "https://example.com/help",
    state: "xyz",
  });
  assert.deepEqual(parseAuthorizationResponse("?error=server_error"), {
    type: "error",
    error: "server_error",
  });
});

test("parseAuthorizationResponse returns null when neither vp_token nor error is present", () => {
  assert.equal(parseAuthorizationResponse("#section-2"), null);
  assert.equal(parseAuthorizationResponse(""), null);
});

test("DCQL_QUERY_BASIC is deeply frozen", () => {
  assert.ok(Object.isFrozen(DCQL_QUERY_BASIC));
  assert.ok(Object.isFrozen(DCQL_QUERY_BASIC.credentials));
  assert.ok(Object.isFrozen(DCQL_QUERY_BASIC.credentials[0]));
  assert.ok(Object.isFrozen(DCQL_QUERY_BASIC.credentials[0].meta.vct_values));
  assert.throws(() =>
    DCQL_QUERY_BASIC.credentials[0].meta.vct_values.push(
      "https://evil.example",
    ),
  );
});
