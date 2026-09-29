export const WARNING_TYPE = "ProofVCWarning";

type NodeWarningEmitter = {
  emitWarning?: (
    warning: string,
    options: { type: string; code: string },
  ) => void;
};

const emitted = new Set<string>();

export function warnOnce(code: string, message: string): void {
  const key = `${code}:${message}`;
  if (emitted.has(key)) {
    return;
  }
  emitted.add(key);
  const nodeProcess = (globalThis as { process?: NodeWarningEmitter }).process;
  if (typeof nodeProcess?.emitWarning === "function") {
    nodeProcess.emitWarning(message, { type: WARNING_TYPE, code });
    return;
  }
  console.warn(`${WARNING_TYPE} [${code}]: ${message}`);
}
