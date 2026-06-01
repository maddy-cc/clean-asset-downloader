import { fetchWithTimeout } from "./http";

export type ResolvedResource = {
  inputUrl: string;
  resolvedUrl: string;
  contentType: string;
  html?: string;
};

export async function resolveUrl(inputUrl: string): Promise<ResolvedResource> {
  const response = await fetchWithTimeout(inputUrl);

  if (!response.ok) {
    throw new Error(`链接访问失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");

  return {
    inputUrl,
    resolvedUrl: response.url || inputUrl,
    contentType,
    html: isHtml ? await response.text() : undefined
  };
}
