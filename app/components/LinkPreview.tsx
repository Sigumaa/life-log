import { useEffect, useState } from "react";
import { getLinkPreview, type LinkPreview as LinkPreviewData } from "../lib/api";

const previewCache = new Map<string, LinkPreviewData | null>();
const inflight = new Map<string, Promise<LinkPreviewData | null>>();

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    const cached = previewCache.get(url);
    if (cached !== undefined) {
      setData(cached);
      return;
    }

    let active = true;
    setLoading(true);
    const existing = inflight.get(url);
    const promise =
      existing ??
      getLinkPreview(url)
        .then((preview) => preview)
        .catch(() => null);

    if (!existing) inflight.set(url, promise);

    promise
      .then((preview) => {
        previewCache.set(url, preview);
        inflight.delete(url);
        if (active) setData(preview);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url]);

  const hostname = data?.hostname || getHostname(url);
  const title = data?.title || hostname;
  const description = data?.description;
  const image = data?.image;
  const siteName = data?.siteName || hostname;

  if (!data && !loading) {
    return (
      <a
        className="link-preview link-preview-fallback"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="link-preview-body">
          <div className="link-preview-site">{hostname}</div>
          <div className="link-preview-title">{hostname}</div>
          <div className="link-preview-url">{url}</div>
        </div>
      </a>
    );
  }

  return (
    <a
      className={`link-preview ${loading ? "is-loading" : ""}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {image && <img className="link-preview-image" src={image} alt="" loading="lazy" />}
      <div className="link-preview-body">
        <div className="link-preview-site">{siteName}</div>
        <div className="link-preview-title">{title}</div>
        {description && <div className="link-preview-description">{description}</div>}
        <div className="link-preview-url">{hostname}</div>
        {loading && <div className="link-preview-loading">Loading preview…</div>}
      </div>
    </a>
  );
}
