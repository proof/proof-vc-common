import { ProofVCError } from "@proof.com/proof-vc-common";

export const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpConfig = {
  timeout?: number;
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
}: JsonRequest): Promise<{ status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      ),
    config.timeout ?? DEFAULT_TIMEOUT_MS,
  );
  const callerSignal = options?.signal;
  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted === true) {
    forwardAbort();
  } else {
    callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  }

  let body: string;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    body = await response.text();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ProofVCError(
      "authorization_server_error",
      `${description} could not be completed: ${detail}`,
      { cause },
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }

  if (!response.ok) {
    throw new ProofVCError(
      "authorization_server_error",
      `${description} failed (${response.status}): ${excerpt(body)}`,
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
  return { status: response.status, data: data as Record<string, unknown> };
}
