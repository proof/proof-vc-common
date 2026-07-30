import { resolveBaseUrl } from "@proof.com/proof-vc-common/internal";
import type { ServerClientConfig } from "./client.ts";

const AS_METADATA_URL =
  "/.well-known/oauth-authorization-server/verifiable-credentials/v1/presentation";

export async function authorizationServerIssuer(
  config: ServerClientConfig,
): Promise<string> {
  const metadataURL = new URL(
    AS_METADATA_URL,
    resolveBaseUrl(config.environment),
  ).toString();
  const response = await fetch(metadataURL);
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `failed to fetch authorization server metadata (${response.status})`,
    );
  }
  const issuer = data["issuer"];
  if (typeof issuer !== "string") {
    throw new Error(
      "authorization server metadata is missing a string `issuer`",
    );
  }
  return issuer;
}
