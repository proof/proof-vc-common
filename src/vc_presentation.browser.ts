import {
  VCPresentationClient,
  type VCPresentationClientParams,
  type AuthorizationRequestParams,
} from "./presentation/base_client.ts";

let instance: VCPresentationClient | null = null;

export function init(params: VCPresentationClientParams): void {
  if (params.environment === "production" && instance)
    throw new Error("VCPresentationClient already initialized (browser)");
  instance = new VCPresentationClient(params);
}

export async function getAuthorizationRequestURL(
  params: AuthorizationRequestParams,
): Promise<string> {
  if (!instance)
    throw "VCPresentationClient not initialized — call init() first (browser)";
  return instance.getAuthorizationRequestURL(params);
}
