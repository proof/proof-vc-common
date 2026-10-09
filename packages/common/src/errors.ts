export type ProofVCErrorCode =
  | "invalid_config"
  | "invalid_input"
  | "authorization_server_error"
  | "verification_failed"
  | "payment_required";

export class ProofVCError extends Error {
  readonly code: ProofVCErrorCode;
  readonly status?: number;

  constructor(
    code: ProofVCErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, options);
    this.name = "ProofVCError";
    this.code = code;
    if (options?.status !== undefined) {
      this.status = options.status;
    }
  }
}
