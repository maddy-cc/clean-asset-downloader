import { buildAssetFilename } from "../core/filename";
import type { Asset, AssetType, ParsedPost, Platform } from "../core/types";

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escapedKey}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(match[1].trim());
    }
  }

  return undefined;
}

function titleFromHtml(html: string): string {
  const ogTitle = metaContent(html, "og:title");
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return decodeHtml(ogTitle ?? titleMatch?.[1]?.trim() ?? "未命名素材");
}

function absoluteUrl(baseUrl: string, value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function assetTypeFromUrl(url: string, mimeType?: string): AssetType | undefined {
  const normalizedMime = mimeType?.split(";")[0].trim().toLowerCase();

  if (normalizedMime?.startsWith("image/")) {
    return "image";
  }

  if (normalizedMime?.startsWith("video/")) {
    return "video";
  }

  const pathname = new URL(url).pathname.toLowerCase();

  if (/\.(jpe?g|png|webp|gif|avif)$/.test(pathname)) {
    return "image";
  }

  if (/\.(mp4|webm|mov|m4v)$/.test(pathname)) {
    return "video";
  }

  return undefined;
}

function uniqueAssets(assets: Omit<Asset, "id" | "filename">[], title: string): Asset[] {
  const seen = new Set<string>();

  return assets
    .filter((asset) => {
      if (seen.has(asset.url)) {
        return false;
      }

      seen.add(asset.url);
      return true;
    })
    .map((asset, index) => ({
      ...asset,
      id: `asset_${index + 1}`,
      filename: buildAssetFilename(title, index, asset.type, asset.url, asset.mimeType)
    }));
}

export function parseGenericResource(params: {
  platform: Platform;
  sourceUrl: string;
  resolvedUrl: string;
  contentType: string;
  html?: string;
}): ParsedPost {
  const directType = assetTypeFromUrl(params.resolvedUrl, params.contentType);

  if (directType) {
    const title = "直接素材链接";
    return {
      platform: params.platform,
      title,
      sourceUrl: params.sourceUrl,
      resolvedUrl: params.resolvedUrl,
      warnings: [],
      assets: uniqueAssets(
        [
          {
            type: directType,
            url: params.resolvedUrl,
            mimeType: params.contentType
          }
        ],
        title
      )
    };
  }

  const html = params.html ?? "";
  const title = titleFromHtml(html);
  const author = metaContent(html, "author") ?? metaContent(html, "og:site_name");
  const candidates = [
    ["og:image", "image"],
    ["og:image:secure_url", "image"],
    ["twitter:image", "image"],
    ["image", "image"],
    ["og:video", "video"],
    ["og:video:secure_url", "video"],
    ["twitter:player:stream", "video"]
  ] as const;

  const assets = candidates
    .map(([key, type]) => ({
      type,
      url: absoluteUrl(params.resolvedUrl, metaContent(html, key))
    }))
    .filter((asset): asset is Omit<Asset, "id" | "filename" | "mimeType"> => Boolean(asset.url));

  const warnings =
    assets.length === 0
      ? [
          "没有在公开页面 metadata 中找到可直接下载的素材。需要平台官方接口、作者授权导出，或登录后合法可访问的资源。"
        ]
      : [];

  return {
    platform: params.platform,
    title,
    author,
    sourceUrl: params.sourceUrl,
    resolvedUrl: params.resolvedUrl,
    warnings,
    assets: uniqueAssets(assets, title)
  };
}
