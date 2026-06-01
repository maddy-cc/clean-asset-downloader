export type Platform = "douyin" | "xiaohongshu" | "weibo" | "generic";

export type AssetType = "image" | "video";

export type Asset = {
  id: string;
  type: AssetType;
  url: string;
  previewUrl?: string;
  filename: string;
  mimeType?: string;
};

export type ParsedPost = {
  platform: Platform;
  title: string;
  author?: string;
  sourceUrl: string;
  resolvedUrl: string;
  assets: Asset[];
  warnings: string[];
};
