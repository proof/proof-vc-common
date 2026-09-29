export type ProofVCErrorCode =
  | "invalid_config"
  | "invalid_input"
  | "authorization_server_error"
  | "verification_failed";

export class ProofVCError extends Error {
  readonly code: ProofVCErrorCode;

  constructor(
    code: ProofVCErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProofVCError";
    this.code = code;
  }
}
