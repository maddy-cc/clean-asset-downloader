export type Platform = "douyin" | "xiaohongshu" | "weibo" | "generic";

export type AssetType = "image" | "video";

export type AssetDownloadHints = {
  douyinVideoId?: string;
  douyinAwemeId?: string;
  douyinHeight?: number;
  douyinWidth?: number;
};

export type Asset = {
  id: string;
  type: AssetType;
  url: string;
  previewUrl?: string;
  filename: string;
  mimeType?: string;
  qualityLabel?: string;
  downloadHints?: AssetDownloadHints;
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
