"use client";

import {
  ClipboardPaste,
  Download,
  DownloadCloud,
  FileVideo,
  Link as LinkIcon,
  Loader2
} from "lucide-react";
import { useState } from "react";

type Asset = {
  id: string;
  type: "image" | "video";
  url: string;
  previewUrl?: string;
  filename: string;
};

type ParsedPost = {
  platform: "douyin" | "xiaohongshu" | "weibo" | "generic";
  title: string;
  author?: string;
  sourceUrl: string;
  resolvedUrl: string;
  assets: Asset[];
  warnings: string[];
};

const platformLabels: Record<ParsedPost["platform"], string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  weibo: "微博",
  generic: "通用链接"
};

export function DownloaderApp() {
  const [input, setInput] = useState("");
  const [parsedPost, setParsedPost] = useState<ParsedPost | null>(null);
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [downloadingAssetId, setDownloadingAssetId] = useState("");
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  const canSubmit = input.trim().length > 0 && !isParsing;
  const hasAssets = Boolean(parsedPost?.assets.length);

  function proxyUrl(url: string) {
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  }

  async function requestParse() {
    setError("");
    setParsedPost(null);
    setIsParsing(true);

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input })
      });
      const data = (await response.json()) as { post?: ParsedPost; error?: string };

      if (!response.ok || !data.post) {
        throw new Error(data.error ?? "解析失败");
      }

      setParsedPost(data.post);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "解析失败");
    } finally {
      setIsParsing(false);
    }
  }

  function filenameFromDisposition(disposition: string | null, fallback: string) {
    if (!disposition) {
      return fallback;
    }

    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);

    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return fallback;
      }
    }

    return plainMatch?.[1] ?? fallback;
  }

  async function downloadAsset(asset: Asset): Promise<boolean> {
    if (!input.trim()) {
      setError("请输入分享文本或链接");
      return false;
    }

    setError("");
    setDownloadingAssetId(asset.id);

    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "素材下载失败");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filenameFromDisposition(
        response.headers.get("content-disposition"),
        asset.filename
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "素材下载失败");
      return false;
    } finally {
      setDownloadingAssetId("");
    }

    return true;
  }

  async function downloadAllAssets() {
    if (!parsedPost?.assets.length) {
      return;
    }

    setIsBatchDownloading(true);
    setError("");

    try {
      const failedAssets: string[] = [];

      for (const asset of parsedPost.assets) {
        const ok = await downloadAsset(asset);

        if (!ok) {
          failedAssets.push(asset.filename);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 320));
      }

      if (failedAssets.length > 0) {
        setError(`批量下载完成，${failedAssets.length} 个素材失败：${failedAssets.join("、")}`);
      }
    } finally {
      setIsBatchDownloading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-band" aria-labelledby="page-title">
        <div className="top-bar">
          <div className="brand-mark" aria-hidden="true">
            <Download size={22} />
          </div>
          <div>
            <p className="eyebrow">Clean Asset Downloader</p>
            <h1 id="page-title">素材解析下载</h1>
          </div>
        </div>
      </section>

      <section className="workspace" aria-label="素材解析工作区">
        <div className="panel input-panel">
          <label className="field-label" htmlFor="share-input">
            分享文本或链接
          </label>
          <div className="textarea-wrap">
            <ClipboardPaste size={20} aria-hidden="true" />
            <textarea
              id="share-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="粘贴小红书、微博、抖音分享文本或素材直链"
              rows={6}
            />
          </div>

          <div className="action-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={requestParse}
              disabled={!canSubmit}
            >
              {isParsing ? <Loader2 className="spin" size={18} /> : <LinkIcon size={18} />}
              <span>{isParsing ? "解析中" : "解析"}</span>
            </button>
          </div>
        </div>

        <div className="panel result-panel">
          <div className="section-heading">
            <span>解析结果</span>
            {parsedPost ? (
              <span className="pill">{platformLabels[parsedPost.platform]}</span>
            ) : null}
          </div>

          {parsedPost ? (
            <div className="result-content">
              <div>
                <h2>{parsedPost.title}</h2>
                <p className="muted-text">
                  {parsedPost.author ? `${parsedPost.author} · ` : ""}
                  {parsedPost.assets.length} 个素材
                </p>
              </div>

              {hasAssets ? (
                <div className="result-actions">
                  <button
                    type="button"
                    className="button button-secondary button-compact"
                    onClick={downloadAllAssets}
                    disabled={isBatchDownloading || Boolean(downloadingAssetId)}
                  >
                    {isBatchDownloading ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <DownloadCloud size={17} />
                    )}
                    <span>{isBatchDownloading ? "批量下载中" : "批量下载"}</span>
                  </button>
                </div>
              ) : null}

              <div className="asset-list">
                {parsedPost.assets.map((asset) => (
                  <div className="asset-card" key={asset.id}>
                    <a
                      className="asset-preview"
                      href={proxyUrl(asset.previewUrl ?? asset.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {asset.previewUrl || asset.type === "image" ? (
                        <>
                          <img
                            src={proxyUrl(asset.previewUrl ?? asset.url)}
                            alt={asset.filename}
                            loading="lazy"
                          />
                          {asset.type === "video" ? (
                            <span className="preview-badge">
                              <FileVideo size={14} />
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="video-preview">
                          <FileVideo size={26} />
                        </span>
                      )}
                    </a>
                    <div className="asset-meta">
                      <strong>{asset.filename}</strong>
                      <small>{asset.type === "video" ? "视频素材" : "图片素材"}</small>
                      <button
                        type="button"
                        className="download-chip"
                        onClick={() => void downloadAsset(asset)}
                        disabled={downloadingAssetId === asset.id || isBatchDownloading}
                      >
                        {downloadingAssetId === asset.id ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Download size={16} />
                        )}
                        <span>{downloadingAssetId === asset.id ? "下载中" : "下载"}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!hasAssets ? <p className="empty-text">这个页面暂未暴露可直接下载素材。</p> : null}
            </div>
          ) : (
            <div className="empty-state">
              <LinkIcon size={26} />
              <p>粘贴链接后先解析，可以查看识别到的平台和素材列表。</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
