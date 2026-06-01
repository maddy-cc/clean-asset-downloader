import { fetchWithTimeout } from "../core/http";

export const DOUYIN_WEB_REFERER = "https://www.douyin.com/";

export const DOUYIN_WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export function readDouyinCookieFromEnv(): string | undefined {
  return process.env.DOUYIN_COOKIE?.trim() || undefined;
}

export type ResolveDouyinOptions = {
  awemeId?: string;
  videoId?: string;
  height?: number;
  width?: number;
};

export type ResolvedDouyinMedia = {
  url: string;
  bytes: number;
  br: number;
  qs: number;
  source: "web_detail" | "play_api";
  gearName?: string;
};

export function isDouyinPlayApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return (
      parsed.hostname.includes("snssdk.com") && parsed.pathname.includes("/aweme/v1/play")
    );
  } catch {
    return false;
  }
}

export function isDouyinWatermarkedCdnUrl(url: string): boolean {
  return url.includes("/mps/logo/") || url.includes("logo_type=");
}

export function toDouyinPlayApiUrl(url: string): string {
  return url.replace(/playwm/g, "play");
}

function parseVideoId(rawUrl: string, explicitVideoId?: string): string | undefined {
  if (explicitVideoId) {
    return explicitVideoId;
  }

  try {
    return new URL(rawUrl).searchParams.get("video_id") ?? undefined;
  } catch {
    return undefined;
  }
}

function ratiosForDimensions(height?: number, width?: number): string[] {
  const longEdge = Math.max(height ?? 0, width ?? 0);

  if (longEdge >= 2160) {
    return ["2160p", "4k", "1080p", "720p", "540p"];
  }

  if (longEdge >= 1080) {
    return ["1080p", "720p", "540p"];
  }

  return ["720p", "1080p", "540p", "480p"];
}

function buildPlayApiCandidates(videoId: string, height?: number, width?: number): string[] {
  const candidates = new Set<string>();
  const ratios = ratiosForDimensions(height, width);
  const longEdge = Math.max(height ?? 0, width ?? 0);
  const lines =
    longEdge >= 2160
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      : [0, 1, 2, 3, 4, 5, 6];

  for (const ratio of ratios) {
    for (const line of lines) {
      const params = new URLSearchParams({
        video_id: videoId,
        ratio,
        line: String(line)
      });
      candidates.add(`https://aweme.snssdk.com/aweme/v1/play/?${params.toString()}`);
    }
  }

  return [...candidates];
}

function mediaScore(bytes: number, br: number, qs: number): number {
  return bytes * 1_000_000 + br * 1_000 + qs;
}

function readBitrateHints(url: string): { br: number; qs: number } {
  const brMatch = url.match(/[?&]br=(\d+)/);
  const qsMatch = url.match(/[?&]qs=(\d+)/);

  return {
    br: brMatch ? Number(brMatch[1]) : 0,
    qs: qsMatch ? Number(qsMatch[1]) : 0
  };
}

async function probeCdnUrl(cdnUrl: string): Promise<{ bytes: number; br: number; qs: number } | undefined> {
  const response = await fetchWithTimeout(cdnUrl, {
    method: "HEAD",
    headers: {
      referer: DOUYIN_WEB_REFERER,
      "user-agent": DOUYIN_WEB_USER_AGENT
    }
  });

  if (!response.ok) {
    return undefined;
  }

  const bytes = Number(response.headers.get("content-length") ?? 0);
  const hints = readBitrateHints(cdnUrl);

  return {
    bytes,
    br: hints.br,
    qs: hints.qs
  };
}

async function resolvePlayApiCandidate(playApiUrl: string): Promise<ResolvedDouyinMedia | undefined> {
  const response = await fetchWithTimeout(toDouyinPlayApiUrl(playApiUrl), {
    method: "GET",
    redirect: "follow",
    headers: {
      referer: DOUYIN_WEB_REFERER,
      "user-agent": DOUYIN_WEB_USER_AGENT
    }
  });

  const finalUrl = response.url;

  if (!response.ok || !finalUrl?.includes("douyinvod.com") || isDouyinWatermarkedCdnUrl(finalUrl)) {
    return undefined;
  }

  const probed = await probeCdnUrl(finalUrl);
  const hints = probed ?? readBitrateHints(finalUrl);

  return {
    url: finalUrl,
    bytes: probed?.bytes ?? 0,
    br: hints.br,
    qs: hints.qs,
    source: "play_api"
  };
}

const PLAY_PROBE_BATCH_SIZE = 8;

async function safeResolvePlayApiCandidate(
  playApiUrl: string
): Promise<ResolvedDouyinMedia | undefined> {
  try {
    return await resolvePlayApiCandidate(playApiUrl);
  } catch {
    return undefined;
  }
}

async function safeProbeCdnUrl(
  cdnUrl: string
): Promise<{ bytes: number; br: number; qs: number } | undefined> {
  try {
    return await probeCdnUrl(cdnUrl);
  } catch {
    return undefined;
  }
}

function considerCandidate(
  best: ResolvedDouyinMedia | undefined,
  resolved: ResolvedDouyinMedia | undefined
): ResolvedDouyinMedia | undefined {
  if (!resolved) {
    return best;
  }

  const score = mediaScore(resolved.bytes, resolved.br, resolved.qs);

  if (!best || score > mediaScore(best.bytes, best.br, best.qs)) {
    return resolved;
  }

  return best;
}

async function pickBestFromPlayCandidates(candidates: string[]): Promise<ResolvedDouyinMedia | undefined> {
  let best: ResolvedDouyinMedia | undefined;

  for (let index = 0; index < candidates.length; index += PLAY_PROBE_BATCH_SIZE) {
    const batch = candidates.slice(index, index + PLAY_PROBE_BATCH_SIZE);
    const resolvedBatch = await Promise.all(
      batch.map((candidate) => safeResolvePlayApiCandidate(candidate))
    );

    for (const resolved of resolvedBatch) {
      best = considerCandidate(best, resolved);
    }
  }

  return best;
}

async function resolveFromWebDetail(awemeId: string): Promise<ResolvedDouyinMedia | undefined> {
  const cookie = readDouyinCookieFromEnv();

  if (!cookie) {
    return undefined;
  }

  const { collectDouyinPlayApiCandidates, fetchDouyinWebAwemeDetail } = await import("./douyin-web");
  const detail = await fetchDouyinWebAwemeDetail(awemeId, cookie);

  if (!detail?.aweme_detail?.video || detail.status_code !== 0) {
    return undefined;
  }

  const candidates = collectDouyinPlayApiCandidates(detail);
  let best: ResolvedDouyinMedia | undefined;

  for (const candidate of candidates) {
    const resolved = await safeResolvePlayApiCandidate(candidate);

    if (!resolved) {
      continue;
    }

    const score = mediaScore(resolved.bytes, resolved.br, resolved.qs);

    if (!best || score > mediaScore(best.bytes, best.br, best.qs)) {
      best = {
        ...resolved,
        source: "web_detail"
      };
    }
  }

  return best;
}

export async function resolveDouyinCdnUrl(
  rawUrl: string,
  options: ResolveDouyinOptions = {}
): Promise<ResolvedDouyinMedia | undefined> {
  if (rawUrl.includes("douyinvod.com") && !isDouyinWatermarkedCdnUrl(rawUrl)) {
    const probed = await safeProbeCdnUrl(rawUrl);
    const hints = probed ?? readBitrateHints(rawUrl);

    return {
      url: rawUrl,
      bytes: probed?.bytes ?? 0,
      br: hints.br,
      qs: hints.qs,
      source: "play_api"
    };
  }

  if (options.awemeId) {
    const fromWeb = await resolveFromWebDetail(options.awemeId);

    if (fromWeb) {
      return fromWeb;
    }
  }

  const videoId = parseVideoId(rawUrl, options.videoId);
  const playCandidates = new Set<string>();

  if (isDouyinPlayApiUrl(rawUrl) || rawUrl.includes("playwm")) {
    playCandidates.add(toDouyinPlayApiUrl(rawUrl));
  }

  if (videoId) {
    for (const candidate of buildPlayApiCandidates(videoId, options.height, options.width)) {
      playCandidates.add(candidate);
    }
  }

  if (playCandidates.size === 0) {
    return undefined;
  }

  return pickBestFromPlayCandidates([...playCandidates]);
}

export function formatDouyinQualityWarning(media: ResolvedDouyinMedia): string {
  const sizeMb = media.bytes > 0 ? `${(media.bytes / (1024 * 1024)).toFixed(2)}MB` : "未知大小";
  const sourceLabel = media.source === "web_detail" ? "网页端详情接口" : "play 播放接口";

  if (media.br >= 1500 || media.qs >= 10) {
    return `已解析最高清档位（${sourceLabel}，约 ${sizeMb}，br=${media.br}，qs=${media.qs}）。`;
  }

  if (readDouyinCookieFromEnv()) {
    return `已选择当前可解析的最高画质（${sourceLabel}，约 ${sizeMb}，br=${media.br}）。网页 Cookie 已配置但可能已过期，可在浏览器重新复制 DOUYIN_COOKIE。`;
  }

  return `已选择当前可解析的最高画质（${sourceLabel}，约 ${sizeMb}，br=${media.br}）。要与浏览器 Network 完全一致，请在 .env 配置登录后的 DOUYIN_COOKIE 后重试。`;
}
