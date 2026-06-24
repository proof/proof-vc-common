import {
  VCPresentationClient,
  type BrowserInitParams,
  type AuthorizationRequestParams,
  type DCAPIAuthorizationRequestParams,
  type AuthorizationRequest,
} from "./presentation/base_client.ts";

let instance: VCPresentationClient | null = null;

export function init(params: BrowserInitParams): void {
  if (params.environment === "production" && instance)
    throw "VCPresentationClient already initialized (browser)";
  instance = new VCPresentationClient(params);
}

export async function getAuthorizationRequestURL(
  params: AuthorizationRequestParams,
): Promise<string> {
  if (!instance)
    throw "VCPresentationClient not initialized — call init() first (browser)";
  return instance.getAuthorizationRequestURL(params);
}

export function getDCAPIAuthorizationRequest(
  params: DCAPIAuthorizationRequestParams,
): AuthorizationRequest {
  if (!instance)
    throw "VCPresentationClient not initialized — call init() first (browser)";
  return instance.getDCAPIAuthorizationRequest(params);
}
