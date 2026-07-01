import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createClient,
  buildAuthorizationUrl,
  parseAuthorizationResponse,
  DCQL_QUERY_BASIC,
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

test("rejects supplying both scope and dcqlQuery", () => {
  assert.throws(
    () =>
      createClient(CONFIG).authorizationUrl({
        nonce: "n",
        scope: "urn:proof:params:scope:verifiable-credentials:basic",
        dcqlQuery: DCQL_QUERY_BASIC,
      }),
    /exactly one of `scope` or `dcqlQuery`/,
  );
});

test("parseAuthorizationResponse reads vp_token and state from a fragment", () => {
  const parsed = parseAuthorizationResponse("#vp_token=abc123&state=xyz");
  assert.deepEqual(parsed, { vpToken: "abc123", state: "xyz" });
});

test("parseAuthorizationResponse returns null when no vp_token is present", () => {
  assert.equal(parseAuthorizationResponse("#error=access_denied"), null);
});
