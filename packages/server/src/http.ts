import { ProofVCError } from "@proof.com/proof-vc-common";

export const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpConfig = {
  timeout?: number;
  fetch?: typeof globalThis.fetch;
};

export type RequestOptions = {
  signal?: AbortSignal;
};

type JsonRequest = {
  url: string;
  description: string;
  init?: RequestInit;
  config: HttpConfig;
  options?: RequestOptions | undefined;
  acceptStatus?: (status: number) => boolean;
};

function excerpt(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

export async function fetchJson({
  url,
  description,
  init,
  config,
  options,
  acceptStatus,
}: JsonRequest): Promise<{
  status: number;
  headers: Headers;
  data: Record<string, unknown>;
}> {
  const signals = [AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT_MS)];
  if (options?.signal !== undefined) {
    signals.push(options.signal);
  }

  let response: Response;
  try {
    response = await (config.fetch ?? fetch)(url, {
      ...init,
      signal: AbortSignal.any(signals),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ProofVCError(
      "authorization_server_error",
      `${description} could not be completed: ${detail}`,
      { cause },
    );
  }

  const body = await response.text();
  const accepted = acceptStatus?.(response.status) ?? response.ok;
  if (!accepted) {
    const json = response.headers.get("content-type")?.includes("json");
    throw new ProofVCError(
      "authorization_server_error",
      `${description} failed (${response.status})${json ? `: ${excerpt(body)}` : ""}`,
      { status: response.status },
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (cause) {
    throw new ProofVCError(
      "authorization_server_error",
      `${description} returned a non-JSON body (${response.status}): ${excerpt(body)}`,
      { cause },
    );
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new ProofVCError(
      "authorization_server_error",
      `${description} returned a non-object JSON body (${response.status})`,
    );
  }
  return {
    status: response.status,
    headers: response.headers,
    data: data as Record<string, unknown>,
  };
}
