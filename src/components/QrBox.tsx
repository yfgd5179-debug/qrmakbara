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
    setUrl(absolute);
    QRCode.toDataURL(absolute, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "H",
    })
      .then(setPreview)
      .catch(() => setError(true));
  }, [path]);

  async function downloadPng() {
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
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card p-6 text-center">
      <h3 className="font-bold text-white">{labels.title}</h3>
      <p className="mt-1 text-sm text-slate-400">{labels.text}</p>

      <div className="mx-auto mt-4 w-full max-w-[280px] rounded-xl bg-white p-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="QR code" className="h-auto w-full" />
        ) : (
          <div className="flex h-48 items-center justify-center text-slate-500">
            {error ? "…" : "…"}
          </div>
        )}
      </div>

      <p dir="ltr" className="mt-3 break-all text-xs text-slate-500">
        {url}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button onClick={downloadPng} className="btn-gold !py-2 text-sm">
          {labels.png}
        </button>
        <button
          onClick={downloadSvg}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
        >
          {labels.svg}
        </button>
        <button
          onClick={copyLink}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </div>
  );
}
