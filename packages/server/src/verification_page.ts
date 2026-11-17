import { ProofVCError } from "@proof.com/proof-vc-common";

export type VerificationPageParams = {
  /** Proof authorization URL, from `jarByReferenceAuthorizationUrl`. */
  authorizationUrl: string;
  /** Your URL that returns the content after the user presents their credential. */
  resultUrl: string;
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

function parseHttpUrl(value: unknown, name: string): URL {
  let url: URL | undefined;
  try {
    url = typeof value === "string" ? new URL(value) : undefined;
  } catch {
    url = undefined;
  }
  if (url?.protocol !== "https:" && url?.protocol !== "http:") {
    throw new ProofVCError(
      "invalid_config",
      `\`${name}\` must be an absolute HTTP(S) URL`,
    );
  }
  return url;
}

/**
 * Builds the HTML page that a protected page or endpoint returns with a `200`
 * status. The page tells the reader to open `authorizationUrl` to present a
 * credential, then `resultUrl` to get the content.
 */
export function renderVerificationPage({
  authorizationUrl,
  resultUrl,
}: VerificationPageParams): string {
  parseHttpUrl(authorizationUrl, "authorizationUrl");
  const host = escapeHtml(parseHttpUrl(resultUrl, "resultUrl").host);
  const authorization = escapeHtml(authorizationUrl);
  const result = escapeHtml(resultUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proof Required</title>
<meta http-equiv="Cache-Control" content="no-store, no-cache, max-age=0, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="robots" content="noarchive">
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 2rem 1rem 4rem; max-width: 46rem; margin-inline: auto; }
  a { word-break: break-all; }
  table { border-collapse: collapse; width: 100%; } td { border: 1px solid #8884; padding: .4rem .6rem; text-align: left; vertical-align: top; }
</style>
</head>
<body>

<main>
<table><tr><td align="center" style="text-align:center"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 154.9 157.2" fill="currentColor" aria-hidden="true" style="vertical-align:middle"><path d="m140.07,125.31c-.07-.56-.34-.99-.81-1.3-.47-.31-1.05-.46-1.73-.46-.5,0-.94.08-1.31.24-.37.16-.66.38-.87.67-.21.28-.31.61-.31.97,0,.3.07.56.22.78.15.22.33.39.56.54.23.14.47.26.72.35.25.09.48.16.69.22l1.15.31c.29.08.62.18.99.32.36.14.71.32,1.05.56.33.23.61.53.83.9s.33.81.33,1.34c0,.61-.16,1.16-.48,1.66s-.78.89-1.39,1.18-1.35.44-2.22.44c-.81,0-1.51-.13-2.1-.39s-1.06-.63-1.39-1.09-.53-1.01-.57-1.63h1.41c.04.43.18.78.43,1.06s.57.48.96.62.81.2,1.26.2c.52,0,.99-.09,1.41-.26.42-.17.75-.41.99-.72.24-.31.36-.67.36-1.08,0-.38-.1-.68-.32-.92-.21-.24-.49-.43-.83-.57-.34-.15-.71-.28-1.11-.39l-1.39-.4c-.88-.25-1.58-.62-2.1-1.09-.52-.47-.77-1.09-.77-1.85,0-.63.17-1.19.52-1.66.34-.47.81-.84,1.39-1.11.58-.26,1.24-.39,1.96-.39s1.38.13,1.95.39c.57.26,1.02.61,1.35,1.06.33.45.51.96.53,1.53h-1.33Z"/><path d="m143.8,122.48h1.64l3.85,9.39h.13l3.85-9.39h1.64v11.32h-1.28v-8.6h-.11l-3.54,8.6h-1.24l-3.54-8.6h-.11v8.6h-1.28v-11.32Z"/><path d="m78.6,23.5V0C35.2,0,0,35.2,0,78.6s35.2,78.6,78.6,78.6v-23.4c-30.5,0-55.2-24.7-55.2-55.2s24.8-55.1,55.2-55.1h0Z"/><path d="m133.8,78.6c0,30.5-24.7,55.2-55.2,55.2v-23.4c17.5,0,31.7-14.2,31.7-31.7s-14.2-31.8-31.7-31.8v-23.4c30.5,0,55.2,24.7,55.2,55.1Z"/><path d="m78.6,46.9v63.5c-17.5,0-31.7-14.2-31.7-31.7s14.2-31.8,31.7-31.8h0Z"/></svg> <strong>Proof Required</strong></td></tr></table>
<p><strong>${host}</strong> is requesting identity proof to access this content.</p>

<table><tr><td align="center" style="text-align:center">You can use the following to provide a credential to satisfy this proof request:</td></tr></table>
<table><tr><td align="center" style="text-align:center"><a href="${authorization}">Default Identity Wallet</a></td></tr></table>

<p><em>This link opens in your web browser and is specific to this request: it is the complete address, with everything after the domain, that opens the right credential request. Use the link exactly as it is.</em></p>
<hr>
<p><strong>What happens next</strong></p>
<ol>
<li>Open the link above and present your credential. This page is the normal first response, not an error.</li>
<li>Once your credential has been accepted, the content is available at this address:<br><a href="${result}">${result}</a><br><em>Wait until the credential step is complete before opening it. Opened earlier, it only shows this page again.</em></li>
</ol>
</main>
</body>
</html>
`;
}
