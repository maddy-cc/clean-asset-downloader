import path from "node:path";
import type { AssetType } from "./types";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov"
};

export function sanitizeFilename(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.slice(0, 120) || "asset";
}

export function extensionFromMime(mimeType?: string): string | undefined {
  if (!mimeType) {
    return undefined;
  }

  return EXT_BY_MIME[mimeType.split(";")[0].trim().toLowerCase()];
}

export function extensionFromUrl(url: string): string | undefined {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();

  return ext && ext.length <= 6 ? ext : undefined;
}

export function buildAssetFilename(
  title: string,
  index: number,
  type: AssetType,
  url: string,
  mimeType?: string
): string {
  const base = sanitizeFilename(title || "asset");
  const ext =
    extensionFromUrl(url) ?? extensionFromMime(mimeType) ?? (type === "video" ? ".mp4" : ".jpg");

  return `${base}-${String(index + 1).padStart(2, "0")}${ext}`;
}
