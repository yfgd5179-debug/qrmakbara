"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Labels = {
  title: string;
  text: string;
  png: string;
  svg: string;
  copy: string;
  copied: string;
  error: string;
};

/**
 * Renders a print-quality QR code pointing at the memorial page,
 * with PNG (2048px) and SVG downloads for the engraver.
 */
export function QrBox({
  path,
  labels,
}: {
  path: string;
  labels: Labels;
}) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const absolute = new URL(path, window.location.origin).toString();
    QRCode.toDataURL(absolute, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "H",
    })
      // State is only set once the async generation settles — never
      // synchronously inside the effect body.
      .then((dataUrl) => {
        setUrl(absolute);
        setPreview(dataUrl);
        setError(false);
      })
      .catch(() => setError(true));
  }, [path]);

  const ready = !!url && !!preview;

  async function downloadPng() {
    if (!ready) return;
    const dataUrl = await QRCode.toDataURL(url, {
      width: 2048,
      margin: 4,
      errorCorrectionLevel: "H",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qr-makbara.png";
    a.click();
  }

  async function downloadSvg() {
    if (!ready) return;
    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 4,
      errorCorrectionLevel: "H",
    });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "qr-makbara.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyLink() {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const secondaryBtn =
    "rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-50 disabled:hover:border-slate-600";

  return (
    <div className="card p-6 text-center">
      <h3 className="font-bold text-white">{labels.title}</h3>
      <p className="mt-1 text-sm text-slate-400">{labels.text}</p>

      <div className="mx-auto mt-4 w-full max-w-[280px] rounded-xl bg-white p-3">
        {error ? (
          <div className="flex h-48 items-center justify-center px-3 text-sm text-red-500">
            {labels.error}
          </div>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="QR code" className="h-auto w-full" />
        ) : (
          <div
            aria-hidden
            className="mx-auto h-48 w-48 animate-pulse rounded-lg bg-slate-200"
          />
        )}
      </div>

      <p dir="ltr" className="mt-3 break-all text-xs text-slate-500">
        {url || "…"}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          onClick={downloadPng}
          disabled={!ready}
          className="btn-gold !py-2 text-sm"
        >
          {labels.png}
        </button>
        <button onClick={downloadSvg} disabled={!ready} className={secondaryBtn}>
          {labels.svg}
        </button>
        <button onClick={copyLink} disabled={!ready} className={secondaryBtn}>
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </div>
  );
}
