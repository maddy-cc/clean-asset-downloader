import { buildAssetFilename } from "../core/filename";
import { fetchWithTimeout } from "../core/http";
import type { Asset, ParsedPost } from "../core/types";

const XHS_WEB_REFERER = "https://www.xiaohongshu.com/";

type XhsImageInfo = {
  imageScene?: string;
  url?: string;
};

type XhsStreamCodec = {
  masterUrl?: string;
  backupUrls?: string[];
};

type XhsStream = {
  h264?: XhsStreamCodec[];
  h265?: XhsStreamCodec[];
  av1?: XhsStreamCodec[];
  h266?: XhsStreamCodec[];
};

type XhsImage = {
  url?: string;
  urlDefault?: string;
  urlPre?: string;
  width?: number;
  height?: number;
  livePhoto?: boolean;
  stream?: XhsStream;
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

function upgradeXhsImageUrl(url: string): string {
  const match = url.match(/http:\/\/sns-webpic-qc\.xhscdn\.com\/\d+\/[0-9a-z]+\/(\S+)!/);

  if (!match?.[1]) {
    return url;
  }

  return `https://ci.xiaohongshu.com/${match[1]}?imageView2/format/png`;
}

function selectImageUrl(image: XhsImage): string | undefined {
  const sceneUrls = (image.infoList ?? [])
    .filter((info) => info.url?.startsWith("http"))
    .sort((left, right) => {
      const score = (scene?: string) => {
        if (scene?.includes("WB_DFT") || scene?.includes("PC_DFT")) {
          return 3;
        }

        if (scene?.includes("DFT")) {
          return 2;
        }

        if (scene?.includes("PRV")) {
          return 1;
        }

        return 0;
      };

      return score(right.imageScene) - score(left.imageScene);
    });

  const raw =
    sceneUrls[0]?.url ||
    image.urlDefault ||
    image.url ||
    image.infoList?.find((info) => info.url)?.url ||
    image.urlPre;

  if (!raw) {
    return undefined;
  }

  return upgradeXhsImageUrl(raw);
}

function collectLiveStreamUrls(stream?: XhsStream): string[] {
  if (!stream) {
    return [];
  }

  const urls = new Set<string>();

  for (const entries of [stream.h265, stream.h264, stream.av1, stream.h266]) {
    for (const entry of entries ?? []) {
      if (entry.masterUrl?.startsWith("http")) {
        urls.add(entry.masterUrl);
      }

      for (const backupUrl of entry.backupUrls ?? []) {
        if (backupUrl.startsWith("http")) {
          urls.add(backupUrl);
        }
      }
    }
  }

  return [...urls];
}

async function selectBestLiveStreamUrl(stream?: XhsStream): Promise<string | undefined> {
  const candidates = collectLiveStreamUrls(stream);

  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  let bestUrl = candidates[0];
  let bestBytes = 0;

  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(candidate, {
        method: "HEAD",
        headers: {
          referer: XHS_WEB_REFERER
        }
      });

      if (!response.ok) {
        continue;
      }

      const bytes = Number(response.headers.get("content-length") ?? 0);

      if (bytes >= bestBytes) {
        bestBytes = bytes;
        bestUrl = candidate;
      }
    } catch {
      continue;
    }
  }

  return bestUrl;
}

function buildSlotFilename(
  title: string,
  slot: number,
  label: "cover" | "live",
  url: string,
  type: "image" | "video"
): string {
  const base = buildAssetFilename(title, slot - 1, type, url, type === "video" ? "video/mp4" : "image/jpeg");
  const ext = base.slice(base.lastIndexOf("."));

  return base.slice(0, -ext.length) + (label === "live" ? "-live" : "-cover") + ext;
}

async function buildNoteAssets(note: XhsNote, title: string): Promise<{ assets: Asset[]; liveCount: number }> {
  const assets: Asset[] = [];
  const seen = new Set<string>();
  let liveCount = 0;
  let assetIndex = 0;

  for (const [imageIndex, image] of (note.imageList ?? []).entries()) {
    const slot = imageIndex + 1;
    const imageUrl = selectImageUrl(image);

    if (imageUrl && !seen.has(imageUrl)) {
      seen.add(imageUrl);
      assetIndex += 1;
      assets.push({
        id: `asset_${assetIndex}`,
        type: "image",
        url: imageUrl,
        filename: image.livePhoto
          ? buildSlotFilename(title, slot, "cover", imageUrl, "image")
          : buildAssetFilename(title, slot - 1, "image", imageUrl, "image/jpeg"),
        mimeType: "image/jpeg"
      });
    }

    if (!image.livePhoto) {
      continue;
    }

    const streamUrl = await selectBestLiveStreamUrl(image.stream);

    if (!streamUrl || seen.has(streamUrl)) {
      continue;
    }

    seen.add(streamUrl);
    liveCount += 1;
    assetIndex += 1;
    const liveLabel =
      image.width && image.height ? `Live 动效 ${image.width}×${image.height}` : "Live 动效";

    assets.push({
      id: `asset_${assetIndex}`,
      type: "video",
      url: streamUrl,
      previewUrl: imageUrl,
      filename: buildSlotFilename(title, slot, "live", streamUrl, "video"),
      mimeType: "video/mp4",
      qualityLabel: liveLabel
    });
  }

  return { assets, liveCount };
}

export async function parseXiaohongshuResource(params: {
  sourceUrl: string;
  resolvedUrl: string;
  html?: string;
}): Promise<ParsedPost | undefined> {
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
  const { assets, liveCount } = await buildNoteAssets(note, title);
  const warnings: string[] = [];

  if (assets.length === 0) {
    warnings.push("已识别到小红书笔记，但公开 SSR 数据中没有可下载的图片素材。");
  } else {
    warnings.push("已从小红书公开 SSR 数据中识别素材。");

    if (liveCount > 0) {
      warnings.push(
        `已识别 ${liveCount} 张 Live 图：请下载 *-live.mp4 观看动效（桌面页数据，通常为 1080p 短 MP4）；*-cover.jpg 为静态封面。勿只下封面后当视频播放。`
      );
    }
  }

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
