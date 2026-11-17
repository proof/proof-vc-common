import { test } from "node:test";
import assert from "node:assert/strict";

import { renderVerificationPage, ProofVCError } from "../dist/index.js";

const AUTHORIZATION_URL =
  "https://api.fairfax.proof.com/verifiable-credentials/v1/presentation/authorize?client_id=abc&request_uri=https%3A%2F%2Fexample.com%2Frequests%2F42";
const RESULT_URL = "https://example.com/article/42";

function rejectsWithInvalidConfig(fn, pattern) {
  assert.throws(
    fn,
    (error) =>
      error instanceof ProofVCError &&
      error.code === "invalid_config" &&
      pattern.test(error.message),
  );
}

test("links to the authorization URL and the result URL", () => {
  const html = renderVerificationPage({
    authorizationUrl: AUTHORIZATION_URL,
    resultUrl: RESULT_URL,
  });
  assert.match(html, /^<!doctype html>/);
  assert.ok(
    html.includes(`href="${AUTHORIZATION_URL.replaceAll("&", "&amp;")}"`),
  );
  assert.ok(html.includes(`href="${RESULT_URL}"`));
  assert.ok(html.includes("<strong>example.com</strong>"));
});

test("escapes HTML in the URLs", () => {
  const html = renderVerificationPage({
    authorizationUrl: AUTHORIZATION_URL,
    resultUrl: 'https://example.com/a"><script>x</script>',
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('a">'));
});

test("rejects a URL that is not absolute HTTP(S)", () => {
  rejectsWithInvalidConfig(
    () =>
      renderVerificationPage({
        authorizationUrl: "javascript:alert(1)",
        resultUrl: RESULT_URL,
      }),
    /authorizationUrl/,
  );
  rejectsWithInvalidConfig(
    () =>
      renderVerificationPage({
        authorizationUrl: AUTHORIZATION_URL,
        resultUrl: "/article/42",
      }),
    /resultUrl/,
  );
});
