import type { JWK } from "jose";
import { ProofVCError, type Environment } from "@proof.com/proof-vc-common";
import { BASE_URLS, resolveBaseUrl } from "@proof.com/proof-vc-common/internal";
import { fetchJson, type HttpConfig, type RequestOptions } from "./http.ts";
import {
  clientAssertionParams,
  jwkThumbprint,
  privateKeyJwk,
  signClientAssertion,
  type PrivateKey,
} from "./client_assertion.ts";

export const ENROLLMENT_PATH = "/verifiable-credentials/v1/x401-enroll";
const LOCAL_HOST =
  /^(localhost|.*\.localhost|.*\.local|127\..*|0\.0\.0\.0|\[::1\])$/;

export type EnrollParams = HttpConfig & {
  environment: Environment;
  clientId: string;
  email: string;
  privateKey: PrivateKey;
};

export type EnrollmentPending = {
  status: "pending";
  activation: "email_sent";
  email: string;
};

export type EnrollmentApproved = {
  status: "approved";
  activation: "complete";
};

export type EnrollmentRejected = {
  status: "rejected";
  reason:
    | "public_suffix_host"
    | "invalid_email"
    | "email_domain_mismatch"
    | "unauthorized";
  message?: string;
};

export type EnrollResult =
  EnrollmentPending | EnrollmentApproved | EnrollmentRejected;

export type EnrollmentErrorResponse = {
  error: string;
  error_description?: string;
};

export class EnrollmentError extends ProofVCError {
  readonly status: number;
  readonly response: EnrollmentErrorResponse;

  constructor(status: number, response: EnrollmentErrorResponse) {
    super(
      status >= 500 ? "authorization_server_error" : "invalid_config",
      response.error_description ?? response.error,
      { status },
    );
    this.name = "EnrollmentError";
    this.status = status;
    this.response = response;
  }
}

function invalid(message: string): never {
  throw new ProofVCError("invalid_config", message);
}

function assertPublicClientIdUrl(clientId: string): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    invalid("the client id must be a URL");
  }
  if (url.protocol !== "https:" || LOCAL_HOST.test(url.hostname)) {
    invalid("the client id must be a public https URL");
  }
  return url;
}

async function registeredKid(
  clientId: string,
  privateKey: PrivateKey,
  config: HttpConfig,
  options: RequestOptions | undefined,
): Promise<string> {
  let data: Record<string, unknown>;
  try {
    ({ data } = await fetchJson({
      url: clientId,
      description: "client metadata document fetch",
      config,
      options,
    }));
  } catch (error) {
    if (!(error instanceof ProofVCError) || error.status === undefined) {
      throw error;
    }
    throw new ProofVCError(
      "invalid_config",
      error.status === 404
        ? `no client metadata document was found at ${clientId}`
        : `the client metadata document at ${clientId} could not be fetched`,
      { status: error.status, cause: error },
    );
  }
  if (data["client_id"] !== clientId) {
    invalid(
      `the client metadata document at ${clientId} declares a different client_id`,
    );
  }
  const jwks = data["jwks"];
  const keys =
    jwks !== null && typeof jwks === "object" && "keys" in jwks
      ? jwks.keys
      : undefined;
  if (!Array.isArray(keys)) {
    invalid(`the client metadata document at ${clientId} has no jwks.keys`);
  }
  const own = await jwkThumbprint(await privateKeyJwk(privateKey));
  const published = await Promise.all(keys.map(jwkThumbprint));
  const index = published.findIndex(
    (candidate) => candidate !== undefined && candidate === own,
  );
  if (index === -1) {
    invalid(
      `the private key is not in the client metadata document at ${clientId}`,
    );
  }
  const kid = (keys[index] as JWK).kid;
  return kid ?? published[index]!;
}

export async function enroll(
  { environment, clientId, email, privateKey, ...config }: EnrollParams,
  options?: RequestOptions,
): Promise<EnrollResult> {
  if (!Object.hasOwn(BASE_URLS, environment)) {
    invalid(
      `the environment must be one of ${Object.keys(BASE_URLS).join(", ")}`,
    );
  }
  const host = assertPublicClientIdUrl(clientId).hostname.replace(/^www\./, "");
  if (typeof email !== "string" || email.length === 0) {
    invalid("an email address is required");
  }
  const emailDomain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (
    environment !== "localhost" &&
    emailDomain !== host &&
    !(emailDomain.includes(".") && host.endsWith(`.${emailDomain}`))
  ) {
    invalid(`the email address must be on ${host} or its registrable domain`);
  }

  const kid = await registeredKid(clientId, privateKey, config, options);
  const audience = new URL(
    ENROLLMENT_PATH,
    resolveBaseUrl(environment),
  ).toString();
  const assertion = await signClientAssertion({
    clientId,
    privateKey,
    kid,
    audience,
  });

  let status: number;
  let data: Record<string, unknown>;
  try {
    ({ status, data } = await fetchJson({
      url: audience,
      description: "enrollment",
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ...clientAssertionParams(assertion),
          email,
        }).toString(),
      },
      config,
      options,
      acceptStatus: (code) =>
        (code >= 200 && code < 300) || [400, 401, 422, 500].includes(code),
    }));
  } catch (error) {
    if (!(error instanceof ProofVCError) || error.status === undefined) {
      throw error;
    }
    throw new ProofVCError(
      "authorization_server_error",
      error.status === 404
        ? `the enrollment endpoint is not available in the ${environment} environment`
        : "Proof did not accept the enrollment request",
      { status: error.status, cause: error },
    );
  }
  if (status >= 400 && status !== 422) {
    throw new EnrollmentError(status, {
      error: String(data["error"] ?? "server_error"),
      ...(typeof data["error_description"] === "string" && {
        error_description: data["error_description"],
      }),
    });
  }
  return data as EnrollResult;
}
