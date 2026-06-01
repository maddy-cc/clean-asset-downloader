import { buildAssetFilename } from "../core/filename";
import type { Asset, ParsedPost } from "../core/types";

type XhsImageInfo = {
  imageScene?: string;
  url?: string;
};

type XhsImage = {
  url?: string;
  urlDefault?: string;
  urlPre?: string;
  width?: number;
  height?: number;
  infoList?: XhsImageInfo[];
};

type XhsNote = {
  noteId?: string;
  title?: string;
  desc?: string;
  type?: string;
  user?: {
    nickname?: string;
  };
  imageList?: XhsImage[];
};

type XhsInitialState = {
  note?: {
    noteDetailMap?: Record<
      string,
      {
        note?: XhsNote;
      }
    >;
  };
};

function decodeXhsState(raw: string): XhsInitialState | undefined {
  try {
    const jsonLike = raw.replace(/\bundefined\b/g, "null");
    return JSON.parse(jsonLike) as XhsInitialState;
  } catch {
    return undefined;
  }
}

function extractInitialState(html: string): XhsInitialState | undefined {
  const match = html.match(/window\.__INITIAL_STATE__=(\{[\s\S]*?\})<\/script>/);

  if (!match?.[1]) {
    return undefined;
  }

  return decodeXhsState(match[1]);
}

function selectImageUrl(image: XhsImage): string | undefined {
  const defaultInfo = image.infoList?.find((info) => info.imageScene?.includes("DFT"));
  const previewInfo = image.infoList?.find((info) => info.imageScene?.includes("PRV"));

  return image.urlDefault || defaultInfo?.url || image.url || image.urlPre || previewInfo?.url;
}

function buildImageAssets(note: XhsNote, title: string): Asset[] {
  const imageUrls = (note.imageList ?? []).map(selectImageUrl).filter(Boolean) as string[];
  const seen = new Set<string>();

  return imageUrls
    .filter((url) => {
      if (seen.has(url)) {
        return false;
      }

      seen.add(url);
      return true;
    })
    .map((url, index) => ({
      id: `asset_${index + 1}`,
      type: "image",
      url,
      filename: buildAssetFilename(title, index, "image", url, "image/jpeg"),
      mimeType: "image/jpeg"
    }));
}

export function parseXiaohongshuResource(params: {
  sourceUrl: string;
  resolvedUrl: string;
  html?: string;
}): ParsedPost | undefined {
  if (!params.html) {
    return undefined;
  }

  const state = extractInitialState(params.html);
  const detailMap = state?.note?.noteDetailMap;
  const detail = detailMap ? Object.values(detailMap).find((item) => item.note) : undefined;
  const note = detail?.note;

  if (!note) {
    return undefined;
  }

  const title = note.title?.trim() || note.desc?.trim() || note.noteId || "小红书素材";
  const assets = buildImageAssets(note, title);
  const warnings =
    assets.length > 0
      ? ["已从小红书公开 SSR 数据中识别素材；未使用登录绕过、签名逆向或风控规避。"]
      : ["已识别到小红书笔记，但公开 SSR 数据中没有可下载的图片素材。"];

  return {
    platform: "xiaohongshu",
    title,
    author: note.user?.nickname,
    sourceUrl: params.sourceUrl,
    resolvedUrl: params.resolvedUrl,
    assets,
    warnings
  };
}
