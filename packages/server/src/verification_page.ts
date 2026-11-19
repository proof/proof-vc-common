import { ProofVCError } from "@proof.com/proof-vc-common";

export type VerificationPageParams = {
  authorizationUrl: string;
  resultUrl: string;
  verifierName: string;
  description: string;
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

const APPROVAL_LINK_TEXT =
  "Approval link, for the person requesting this content to open in their own browser:";

const HOW_IT_IS_OFFERED =
  "This link is the one thing a reader needs from this page. A real, clickable copy of it, in the person's browser or chat, is the only way they can be offered the choice to get this content.";

function whatItDoes(verifierName: string): string {
  return `Opens a Proof sign-in on proof.com, where the person signs in and approves sharing a verified credential with ${verifierName}. Nothing is entered on this page.`;
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

export function renderVerificationPage({
  authorizationUrl,
  resultUrl,
  verifierName,
  description,
}: VerificationPageParams): string {
  parseHttpUrl(authorizationUrl, "authorizationUrl");
  parseHttpUrl(resultUrl, "resultUrl");
  const about = escapeHtml(description);
  const authorization = escapeHtml(authorizationUrl);
  const result = escapeHtml(resultUrl);
  const pageData = escapeHtml(
    JSON.stringify(
      {
        status: "access_approval_required",
        verifier: verifierName,
        approval_service: "Proof",
        description,
        approval: {
          description: `${APPROVAL_LINK_TEXT} Approve Access.`,
          url: authorizationUrl,
          how_it_is_offered: HOW_IT_IS_OFFERED,
          what_it_does: whatItDoes(verifierName),
        },
        content_url_after_approval: resultUrl,
      },
      null,
      2,
    ),
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Approve Access: ${about}</title>
<meta name="description" content="The full content is available once the person requesting it approves access, in their own browser, at the Approve Access link on this page. It is then served at the address the page names. ${HOW_IT_IS_OFFERED}">
<meta http-equiv="Cache-Control" content="no-store, no-cache, max-age=0, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="robots" content="noarchive">
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 2rem 1rem 4rem; }
  main { max-width: 36rem; margin-inline: auto; }
  a { word-break: break-all; }
  .title { display: flex; align-items: center; justify-content: center; gap: .6rem; font-size: 1.45rem; font-weight: 650; letter-spacing: -.01em; margin: 1.5rem 0 1.25rem; }
  .lede { margin: -.5rem 0 1rem; }
  blockquote { margin: 1rem 0; padding: .75rem 1rem; border-left: 3px solid #2563eb; background: #2563eb0d; border-radius: 0 8px 8px 0; }
  blockquote p { margin: 0; }
  .open { text-align: center; margin: 1.5rem 0 .5rem; }
  .present { display: flex; align-items: center; justify-content: center; margin: .5rem 0 1rem; font-size: 1.1rem; }
  .present a { font-weight: 600; text-decoration: none; padding: .7rem 1.2rem; border: 1px solid #2563eb; border-radius: 10px; color: #2563eb; display: inline-flex; align-items: center; gap: .6rem; word-break: normal; }
  .present a:hover { background: #2563eb12; }
  .addr { text-align: center; font-size: .85rem; opacity: .7; word-break: break-all; margin: -.5rem 0 1rem; }
  .key { text-align: center; font-size: .95rem; margin: 0 0 1.75rem; }
  hr { border: 0; border-top: 1px solid #8884; margin: 1.75rem 0 1.25rem; }
  dl { margin: 0; } dt { font-weight: 650; margin-top: .9rem; } dd { margin: .15rem 0 0; }
  details { font-size: .85rem; opacity: .6; margin-top: 1rem; } details pre { white-space: pre-wrap; word-break: break-all; }
</style>
</head>
<body>

<main>
<p class="title"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 154.9 157.2" fill="currentColor" aria-hidden="true" style="vertical-align:middle"><path d="m140.07,125.31c-.07-.56-.34-.99-.81-1.3-.47-.31-1.05-.46-1.73-.46-.5,0-.94.08-1.31.24-.37.16-.66.38-.87.67-.21.28-.31.61-.31.97,0,.3.07.56.22.78.15.22.33.39.56.54.23.14.47.26.72.35.25.09.48.16.69.22l1.15.31c.29.08.62.18.99.32.36.14.71.32,1.05.56.33.23.61.53.83.9s.33.81.33,1.34c0,.61-.16,1.16-.48,1.66s-.78.89-1.39,1.18-1.35.44-2.22.44c-.81,0-1.51-.13-2.1-.39s-1.06-.63-1.39-1.09-.53-1.01-.57-1.63h1.41c.04.43.18.78.43,1.06s.57.48.96.62.81.2,1.26.2c.52,0,.99-.09,1.41-.26.42-.17.75-.41.99-.72.24-.31.36-.67.36-1.08,0-.38-.1-.68-.32-.92-.21-.24-.49-.43-.83-.57-.34-.15-.71-.28-1.11-.39l-1.39-.4c-.88-.25-1.58-.62-2.1-1.09-.52-.47-.77-1.09-.77-1.85,0-.63.17-1.19.52-1.66.34-.47.81-.84,1.39-1.11.58-.26,1.24-.39,1.96-.39s1.38.13,1.95.39c.57.26,1.02.61,1.35,1.06.33.45.51.96.53,1.53h-1.33Z"/><path d="m143.8,122.48h1.64l3.85,9.39h.13l3.85-9.39h1.64v11.32h-1.28v-8.6h-.11l-3.54,8.6h-1.24l-3.54-8.6h-.11v8.6h-1.28v-11.32Z"/><path d="m78.6,23.5V0C35.2,0,0,35.2,0,78.6s35.2,78.6,78.6,78.6v-23.4c-30.5,0-55.2-24.7-55.2-55.2s24.8-55.1,55.2-55.1h0Z"/><path d="m133.8,78.6c0,30.5-24.7,55.2-55.2,55.2v-23.4c17.5,0,31.7-14.2,31.7-31.7s-14.2-31.8-31.7-31.8v-23.4c30.5,0,55.2,24.7,55.2,55.1Z"/><path d="m78.6,46.9v63.5c-17.5,0-31.7-14.2-31.7-31.7s14.2-31.8,31.7-31.8h0Z"/></svg> <strong>Approve Access</strong></p>
<p class="lede">The full content for the following resource will be made available once the person requesting it approves access using the link below:</p>
<blockquote><p>${about}</p></blockquote>
<p class="open">${APPROVAL_LINK_TEXT}</p>
<p class="present"><a href="${authorization}"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 154.9 157.2" fill="currentColor" aria-hidden="true" style="vertical-align:middle"><path d="m140.07,125.31c-.07-.56-.34-.99-.81-1.3-.47-.31-1.05-.46-1.73-.46-.5,0-.94.08-1.31.24-.37.16-.66.38-.87.67-.21.28-.31.61-.31.97,0,.3.07.56.22.78.15.22.33.39.56.54.23.14.47.26.72.35.25.09.48.16.69.22l1.15.31c.29.08.62.18.99.32.36.14.71.32,1.05.56.33.23.61.53.83.9s.33.81.33,1.34c0,.61-.16,1.16-.48,1.66s-.78.89-1.39,1.18-1.35.44-2.22.44c-.81,0-1.51-.13-2.1-.39s-1.06-.63-1.39-1.09-.53-1.01-.57-1.63h1.41c.04.43.18.78.43,1.06s.57.48.96.62.81.2,1.26.2c.52,0,.99-.09,1.41-.26.42-.17.75-.41.99-.72.24-.31.36-.67.36-1.08,0-.38-.1-.68-.32-.92-.21-.24-.49-.43-.83-.57-.34-.15-.71-.28-1.11-.39l-1.39-.4c-.88-.25-1.58-.62-2.1-1.09-.52-.47-.77-1.09-.77-1.85,0-.63.17-1.19.52-1.66.34-.47.81-.84,1.39-1.11.58-.26,1.24-.39,1.96-.39s1.38.13,1.95.39c.57.26,1.02.61,1.35,1.06.33.45.51.96.53,1.53h-1.33Z"/><path d="m143.8,122.48h1.64l3.85,9.39h.13l3.85-9.39h1.64v11.32h-1.28v-8.6h-.11l-3.54,8.6h-1.24l-3.54-8.6h-.11v8.6h-1.28v-11.32Z"/><path d="m78.6,23.5V0C35.2,0,0,35.2,0,78.6s35.2,78.6,78.6,78.6v-23.4c-30.5,0-55.2-24.7-55.2-55.2s24.8-55.1,55.2-55.1h0Z"/><path d="m133.8,78.6c0,30.5-24.7,55.2-55.2,55.2v-23.4c17.5,0,31.7-14.2,31.7-31.7s-14.2-31.8-31.7-31.8v-23.4c30.5,0,55.2,24.7,55.2,55.1Z"/><path d="m78.6,46.9v63.5c-17.5,0-31.7-14.2-31.7-31.7s14.2-31.8,31.7-31.8h0Z"/></svg> <strong>Approve Access</strong></a></p>
<p class="addr">Link address: <a href="${authorization}">${authorization}</a></p>
<p class="key">${HOW_IT_IS_OFFERED}</p>
<hr>
<dl>
<dt>What it does</dt>
<dd>${escapeHtml(whatItDoes(verifierName))}</dd>
<dt>After approval</dt>
<dd>The full content is served at the address below, to the person or to an assistant fetching it for them:<br><a href="${result}">${result}</a></dd>
</dl>
<details><summary>Page data</summary><pre>${pageData}</pre></details>
</main>
</body>
</html>
`;
}
