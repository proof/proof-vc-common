import { Buffer } from "node:buffer";
import { ProofVCError } from "@proof.com/proof-vc-common";
import { resolveBaseUrl } from "@proof.com/proof-vc-common/internal";
import { fetchJson, type RequestOptions } from "./http.ts";
import {
  clientAssertionParams,
  jwkThumbprint,
  privateKeyJwk,
  signClientAssertion,
} from "./client_assertion.ts";
import type { VerifierConfig } from "./verifier.ts";

const DETACHED_SIGNATURE_HEADER = "proof.com#sig-1";
const SIGNATURES_PATH = "/verifiable-credentials/v1/x401-signatures";
const PENDING_RETRY_LIMIT = 10;
const DEFAULT_RETRY_AFTER_SECONDS = 2;

type DetachedSignatures = {
  issuer_signature: string;
  kb_signature: string;
};

type Segments = [header: string, payload: string, signature: string];

type Compact = {
  parts: string[];
  issuer: Segments;
  kb: Segments;
};

function segments(jwt: string): Segments | undefined {
  const split = jwt.split(".");
  return split.length === 3 ? (split as Segments) : undefined;
}

// Splits a presentation into its Issuer-signed JWT and Key Binding JWT.
// Returns undefined when the presentation has no Key Binding JWT.
function compact(encodedSDJWT: string): Compact | undefined {
  const parts = encodedSDJWT.split("~");
  const issuer = segments(parts[0]!);
  const kb = parts.length > 1 ? segments(parts[parts.length - 1]!) : undefined;
  return issuer !== undefined && kb !== undefined
    ? { parts, issuer, kb }
    : undefined;
}

function decodeHeader(encoded: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

// Reads the detached signatures id from the Key Binding JWT header. Throws
// when the header lists a critical parameter this SDK does not support.
// Returns undefined when the header has no `crit`.
function detachedSignatureId({ kb }: Compact): string | undefined {
  const header = decodeHeader(kb[0]);
  const crit = header?.["crit"];
  if (header === undefined || crit === undefined) {
    return undefined;
  }
  if (!Array.isArray(crit) || crit.length === 0) {
    throw new ProofVCError(
      "verification_failed",
      "KB JWT crit header must be a non-empty array",
    );
  }
  for (const name of crit) {
    if (name !== DETACHED_SIGNATURE_HEADER) {
      throw new ProofVCError(
        "verification_failed",
        `KB JWT critical header parameter ${String(name)} is not supported by this version of the Proof VC SDK; upgrade to a newer version`,
      );
    }
  }
  const id = header[DETACHED_SIGNATURE_HEADER];
  if (typeof id !== "string" || id.length === 0) {
    throw new ProofVCError(
      "verification_failed",
      `KB JWT header ${DETACHED_SIGNATURE_HEADER} must be a non-empty string`,
    );
  }
  return id;
}

function attach(
  { parts, issuer, kb }: Compact,
  { issuer_signature, kb_signature }: DetachedSignatures,
): string {
  parts[0] = `${issuer[0]}.${issuer[1]}.${issuer_signature}`;
  parts[parts.length - 1] = `${kb[0]}.${kb[1]}.${kb_signature}`;
  return parts.join("~");
}

function retryAfterMs(headers: Headers): number {
  const header = headers.get("retry-after");
  const seconds = header === null ? Number.NaN : Number(header);
  return (
    (Number.isFinite(seconds) && seconds >= 0
      ? seconds
      : DEFAULT_RETRY_AFTER_SECONDS) * 1000
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function reason(data: Record<string, unknown>): string {
  const detail = data["error_description"] ?? data["error"];
  return typeof detail === "string" ? `: ${detail}` : "";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Fetches the detached signatures of an x401 presentation, retrying while they
 * are not available yet. Pass an x402-capable `fetch` in the config to pay
 * for them with x402.
 */
export async function fetchDetachedSignatures(
  config: VerifierConfig,
  id: string,
  options?: RequestOptions,
): Promise<DetachedSignatures> {
  if (config.clientId === undefined || config.privateKeyFactory === undefined) {
    throw new ProofVCError(
      "invalid_config",
      "fetching detached signatures requires `clientId` and `privateKeyFactory` in the verifier config",
    );
  }
  const url = new URL(
    SIGNATURES_PATH,
    resolveBaseUrl(config.environment),
  ).toString();
  const privateKey = await config.privateKeyFactory();
  const kid = await jwkThumbprint(await privateKeyJwk(privateKey));
  if (kid === undefined) {
    throw new ProofVCError("invalid_config", "invalid private key");
  }

  for (let attempt = 0; ; attempt += 1) {
    const assertion = await signClientAssertion({
      clientId: config.clientId,
      privateKey,
      kid,
      audience: url,
    });
    const { status, headers, data } = await fetchJson({
      url,
      description: "detached signatures fetch",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...clientAssertionParams(assertion) }),
      },
      config,
      options,
      acceptStatus: (code) =>
        code === 200 || [401, 402, 404, 409].includes(code),
    });

    if (status === 409) {
      if (attempt < PENDING_RETRY_LIMIT) {
        await sleep(retryAfterMs(headers), options?.signal);
        continue;
      }
      throw new ProofVCError(
        "authorization_server_error",
        `detached signatures are still pending after ${PENDING_RETRY_LIMIT} retries${reason(data)}`,
        { status },
      );
    }
    if (status === 402) {
      throw new ProofVCError(
        "payment_required",
        `detached signatures require an x402 payment${reason(data)}`,
        { status },
      );
    }
    if (status !== 200) {
      throw new ProofVCError(
        "verification_failed",
        `detached signatures fetch failed (${status})${reason(data)}`,
        { status },
      );
    }
    const issuerSignature = data["issuer_signature"];
    const kbSignature = data["kb_signature"];
    if (!nonEmptyString(issuerSignature) || !nonEmptyString(kbSignature)) {
      throw new ProofVCError(
        "authorization_server_error",
        "detached signatures fetch returned no signatures",
      );
    }
    return { issuer_signature: issuerSignature, kb_signature: kbSignature };
  }
}

/**
 * Returns the presentation with its signatures in place: unchanged unless its
 * Key Binding JWT header marks them as detached and they are missing.
 */
export async function resolveDetachedSignatures(
  config: VerifierConfig,
  encodedSDJWT: string,
  options?: RequestOptions,
): Promise<string> {
  const parsed = compact(encodedSDJWT);
  const id = parsed === undefined ? undefined : detachedSignatureId(parsed);
  if (
    parsed === undefined ||
    id === undefined ||
    (parsed.issuer[2].length > 0 && parsed.kb[2].length > 0)
  ) {
    return encodedSDJWT;
  }
  return attach(parsed, await fetchDetachedSignatures(config, id, options));
}
