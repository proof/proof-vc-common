import type {
  VCPresentationClientParams,
  AuthorizationRequestParams,
} from "./presentation/base_client.ts";
import {
  NodeVCPresentationClient,
  type VerifyParams,
  type VerifyVPTokenParams,
} from "./presentation/node_client.ts";
import type { ProofCredential, VPToken } from "./types.ts";

let instance: NodeVCPresentationClient | null = null;

export function init(params: VCPresentationClientParams): void {
  if (params.environment === "production" && instance)
    throw new Error("NodeVCPresentationClient already initialized (node)");
  instance = new NodeVCPresentationClient(params);
}

export async function getAuthorizationRequestURL(
  params: AuthorizationRequestParams,
): Promise<string> {
  if (!instance)
    throw "NodeVCPresentationClient not initialized — call init() first (node)";
  return instance.getAuthorizationRequestURL(params);
}

export async function verify(params: VerifyParams): Promise<ProofCredential> {
  if (!instance)
    throw "NodeVCPresentationClient not initialized — call init() first (node)";
  return instance.verify(params);
}

export async function verifyVPToken(
  params: VerifyVPTokenParams,
): Promise<VPToken> {
  if (!instance)
    throw "NodeVCPresentationClient not initialized — call init() first (node)";
  return instance.verifyVPToken(params);
}
