import { buildAssetFilename, sanitizeFilename } from "../core/filename";
import type { Asset, ParsedPost } from "../core/types";

const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function encodeBase62(input: string): string {
  let value = BigInt(input);
  let output = "";

  if (value === 0n) {
    return "0";
  }

  while (value > 0n) {
    output = BASE62[Number(value % 62n)] + output;
    value /= 62n;
  }

  return output;
}

export function weiboMidToBase62(mid: string): string {
  let output = "";

  for (let end = mid.length; end > 0; end -= 7) {
    const start = Math.max(end - 7, 0);
    const chunk = mid.slice(start, end);
    const encoded = encodeBase62(chunk);
    output = (start > 0 ? encoded.padStart(4, "0") : encoded) + output;
  }

  return output;
}

export function extractWeiboMid(url: string): string | undefined {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const numeric = [...parts].reverse().find((part) => /^\d{12,}$/.test(part));

  return numeric;
}

export function buildWeiboLegacyUrl(sourceUrl: string): string | undefined {
  const mid = extractWeiboMid(sourceUrl);

  if (!mid) {
    return undefined;
  }

  return `https://weibo.cn/comment/${weiboMidToBase62(mid)}`;
}

function extractAuthor(html: string): string | undefined {
  const match = html.match(/<div class="c" id="M_">[\s\S]*?<a href="\/\d+">([\s\S]*?)<\/a>/i);
  return match?.[1] ? decodeHtml(match[1]) : undefined;
}

function extractTitle(html: string): string {
  const match = html.match(/<span class="ctt">([\s\S]*?)<\/span>/i);
  const text = match?.[1] ? decodeHtml(match[1]).replace(/^[:：]\s*/, "") : "";

  return text || "微博素材";
}

function extractImageAssets(html: string, title: string): Asset[] {
  const assets: Asset[] = [];
  const seen = new Set<string>();
  const imagePattern = /<img[^>]+src="(https?:\/\/[^"]+sinaimg\.cn\/[^"]+)"[^>]*alt="图片"[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(html))) {
    const rawUrl = decodeHtml(match[1]);
    const originalUrl = rawUrl.replace(/\/(?:wap180|thumbnail|bmiddle|mw\d+)\//, "/large/");

    if (seen.has(originalUrl)) {
      continue;
    }

    seen.add(originalUrl);
    assets.push({
      id: `asset_${assets.length + 1}`,
      type: "image",
      url: originalUrl,
      previewUrl: rawUrl,
      filename: buildAssetFilename(title, assets.length, "image", originalUrl, "image/jpeg"),
      mimeType: "image/jpeg"
    });
  }

  const originalPattern = /\/mblog\/oripic\?[^"]*u=([^"&]+)[^"]*/gi;

  while ((match = originalPattern.exec(html))) {
    const imageId = decodeURIComponent(match[1]);
    const hostMatch = html.match(/https?:\/\/(wx\d+\.sinaimg\.cn)\//i);
    const originalUrl = `https://${hostMatch?.[1] ?? "wx1.sinaimg.cn"}/large/${imageId}.jpg`;

    if (seen.has(originalUrl)) {
      continue;
    }

    seen.add(originalUrl);
    assets.push({
      id: `asset_${assets.length + 1}`,
      type: "image",
      url: originalUrl,
      previewUrl: originalUrl.replace("/large/", "/wap180/"),
      filename: `${sanitizeFilename(title)}-${String(assets.length + 1).padStart(2, "0")}.jpg`,
      mimeType: "image/jpeg"
    });
  }

  return assets;
}

export function parseWeiboLegacyResource(params: {
  sourceUrl: string;
  resolvedUrl: string;
  html?: string;
}): ParsedPost | undefined {
  if (!params.html || params.html.includes("target weibo does not exist")) {
    return undefined;
  }

  const title = extractTitle(params.html);
  const assets = extractImageAssets(params.html, title);

  if (assets.length === 0) {
    return undefined;
  }

  return {
    platform: "weibo",
    title,
    author: extractAuthor(params.html),
    sourceUrl: params.sourceUrl,
    resolvedUrl: params.resolvedUrl,
    assets,
    warnings: ["已从微博旧移动公开页识别图片素材。"]
  };
}
