"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";

/**
 * A physical-looking stainless-steel memorial plaque: brushed metal, bevelled
 * edges, four countersunk screws, the QR code plate on the left and the
 * engraved name + years on the right.
 *
 * The plaque is built as one SVG string so the on-screen preview, the PNG
 * export and the vector SVG export are literally the same artwork (the
 * browser shapes the Arabic text in all three cases).
 */

const W = 880;
const H = 520;

const FONT_RTL =
  "'Noto Naskh Arabic','Amiri','Traditional Arabic','Segoe UI',serif";
const FONT_LTR = "'Georgia','Times New Roman',serif";

const HONORIFIC: Record<string, { male: string; female: string }> = {
  ar: { male: "المرحوم", female: "المرحومة" },
  ku: { male: "المرحوم", female: "المرحومة" },
  en: { male: "In loving memory of", female: "In loving memory of" },
  tr: { male: "Rahmetli", female: "Rahmetli" },
};

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
        c
      ] as string
  );
}

/** Deterministic PRNG so the brushed grain never flickers between renders. */
function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Word-wrap that treats the text as plain space-separated words. */
function wrapWords(text: string, perLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > perLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

/** Picks the largest font size that keeps the name on at most two lines. */
function layoutName(name: string, maxWidth: number) {
  for (const size of [52, 46, 40, 34, 28]) {
    const perLine = Math.max(6, Math.floor(maxWidth / (size * 0.54)));
    const lines = wrapWords(name, perLine);
    if (lines.length <= 2) return { size, lines };
  }
  const perLine = Math.max(6, Math.floor(maxWidth / (28 * 0.54)));
  return { size: 28, lines: wrapWords(name, perLine).slice(0, 2) };
}

/** Vector QR modules (crisp at any print size, no embedded raster). */
function qrPath(url: string, size: number, margin = 4): string {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const matrix = qr.modules;
  const total = matrix.size + margin * 2;
  const scale = size / total;
  let d = "";
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.data[row * matrix.size + col]) continue;
      const x = (col + margin) * scale;
      const y = (row + margin) * scale;
      d += `M${x.toFixed(2)} ${y.toFixed(2)}h${scale.toFixed(2)}v${scale.toFixed(2)}h-${scale.toFixed(2)}z`;
    }
  }
  return d;
}

type PlaqueParts = {
  url: string;
  name: string;
  birthYear?: string;
  deathYear?: string;
  lang: string;
  gender?: string;
};

function buildPlaque({
  url,
  name,
  birthYear,
  deathYear,
  lang,
  gender,
}: PlaqueParts): string {
  const rnd = mulberry32(20261105);
  const rtl = lang === "ar" || lang === "ku";
  const font = rtl ? FONT_RTL : FONT_LTR;

  // Plate geometry (the whole artwork is 880 x 520).
  const px = 16;
  const py = 12;
  const pw = W - px * 2;
  const ph = H - py * 2;

  // Fine horizontal brushing.
  const strokes: string[] = [];
  for (let y = py + 8; y < py + ph - 8; y += 2.4) {
    const light = rnd() > 0.45;
    strokes.push(
      `<line x1="${px + 6}" y1="${y.toFixed(1)}" x2="${px + pw - 6}" y2="${(
        y + 0.6
      ).toFixed(1)}" stroke="${light ? "#ffffff" : "#4d535a"}" stroke-opacity="${(
        0.05 +
        rnd() * 0.14
      ).toFixed(3)}" stroke-width="${(0.6 + rnd() * 1.1).toFixed(2)}"/>`
    );
  }

  // Brighter reflection bands, as on a real brushed plate.
  const bands: string[] = [];
  for (let i = 0; i < 26; i++) {
    const y = py + 10 + rnd() * (ph - 20);
    bands.push(
      `<line x1="${px + 8}" y1="${y.toFixed(1)}" x2="${px + pw - 8}" y2="${(
        y + 1.5
      ).toFixed(1)}" stroke="#ffffff" stroke-opacity="${(
        0.06 +
        rnd() * 0.16
      ).toFixed(3)}" stroke-width="${(1.4 + rnd() * 2.6).toFixed(2)}"/>`
    );
  }

  // QR plate on the left.
  const qSize = 328;
  const qx = 62;
  const qy = (H - qSize) / 2;
  const qrModules = qSize - 48;
  const modules = qrPath(url, qrModules);

  // Divider and text column.
  const dividerX = qx + qSize + 34;
  const textLeft = dividerX + 26;
  const textRight = px + pw - 46;
  const textCenter = (textLeft + textRight) / 2;
  const textWidth = textRight - textLeft;

  const displayName = name.trim() || "—";
  const { size: nameSize, lines } = layoutName(displayName, textWidth);
  const lineHeight = nameSize * 1.18;

  const years =
    birthYear && deathYear
      ? `${birthYear} – ${deathYear}`
      : birthYear || deathYear || "";

  const honorific = HONORIFIC[lang] ?? HONORIFIC.en;
  // Without a recorded gender the masculine form is the conventional default.
  const title = honorific[gender === "female" ? "female" : "male"];

  const nameBlockHeight = lines.length * lineHeight;
  // Without a year range the text block is nudged down so it stays optically
  // centred on the plate instead of clinging to the top.
  const blockTop = years ? 236 : 262;
  const yearsY = blockTop + nameBlockHeight + 44;

  const engraved = (
    text: string,
    y: number,
    size: number,
    opts: {
      letterSpacing?: number;
      fill?: string;
      weight?: number;
      ltr?: boolean;
    } = {}
  ) => {    const attrs = `x="${textCenter.toFixed(
      1
    )}" y="${y.toFixed(
      1
    )}" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="${
      opts.weight ?? 600
    }"${opts.letterSpacing ? ` letter-spacing="${opts.letterSpacing}"` : ""}${
      opts.ltr ? ' direction="ltr" unicode-bidi="isolate"' : ""
    }`;
    return (
      `<text ${attrs} fill="#fbfcfd" opacity="0.42" transform="translate(0,1.3)">${esc(
        text
      )}</text>` +
      `<text ${attrs} fill="${opts.fill ?? "#3b4047"}">${esc(text)}</text>`
    );
  };

  const nameText = lines
    .map((line, i) =>
      engraved(line, blockTop + i * lineHeight, nameSize, { weight: 600 })
    )
    .join("");

  const screw = (cx: number, cy: number) => `
    <g>
      <circle cx="${cx}" cy="${cy + 1}" r="15" fill="#2b3036" opacity="0.4"/>
      <circle cx="${cx}" cy="${cy}" r="14.5" fill="#8b939b"/>
      <circle cx="${cx}" cy="${cy}" r="14.5" fill="none" stroke="#4a5058" stroke-opacity="0.85" stroke-width="1.8"/>
      <circle cx="${cx}" cy="${cy}" r="11.8" fill="url(#screwHead)"/>
      <circle cx="${cx}" cy="${cy}" r="11.8" fill="none" stroke="#4f565e" stroke-opacity="0.55" stroke-width="1"/>
      <path d="M${cx - 8} ${cy} H${cx + 8}" stroke="#5b6269" stroke-width="3" stroke-linecap="round"/>
      <path d="M${cx - 8} ${cy - 1.4} H${cx + 4}" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
      <circle cx="${cx - 3.8}" cy="${cy - 4.6}" r="3.6" fill="#ffffff" opacity="0.4"/>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" style="display:block;width:100%;height:auto">
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0.12" y2="1">
      <stop offset="0" stop-color="#b0b6be"/>
      <stop offset="0.13" stop-color="#dde1e6"/>
      <stop offset="0.31" stop-color="#9fa6ae"/>
      <stop offset="0.54" stop-color="#cfd4da"/>
      <stop offset="0.73" stop-color="#93999f"/>
      <stop offset="0.89" stop-color="#bcc1c8"/>
      <stop offset="1" stop-color="#767c84"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.85">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/>
      <stop offset="0.28" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.52" stop-color="#ffffff" stop-opacity="0.2"/>
      <stop offset="0.74" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#0b0e12" stop-opacity="0.16"/>
    </linearGradient>
    <linearGradient id="bevel" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="0.45" stop-color="#d6dae0" stop-opacity="0.5"/>
      <stop offset="0.75" stop-color="#6f767e" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#40464d" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="divider" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5f666e" stop-opacity="0.15"/>
      <stop offset="0.2" stop-color="#5f666e" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="0.8" stop-color="#5f666e" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#5f666e" stop-opacity="0.15"/>
    </linearGradient>
    <radialGradient id="screwHead" cx="0.34" cy="0.28" r="0.82">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.32" stop-color="#d5dae0"/>
      <stop offset="0.7" stop-color="#8f969e"/>
      <stop offset="1" stop-color="#5a6169"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.44" r="0.78">
      <stop offset="0.5" stop-color="#0a0d11" stop-opacity="0"/>
      <stop offset="0.82" stop-color="#0a0d11" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#0a0d11" stop-opacity="0.26"/>
    </radialGradient>
    <filter id="drop" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#05070a" flood-opacity="0.55"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0015 0.85" numOctaves="3" seed="11" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.5" intercept="0"/>
      </feComponentTransfer>
    </filter>
    <clipPath id="plateClip">
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="22"/>
    </clipPath>
  </defs>

  <rect x="${px + 4}" y="${py + 12}" width="${pw - 8}" height="${ph - 4}" rx="24" fill="#0b0f14" opacity="0.6" filter="url(#drop)"/>
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="22" fill="url(#plate)"/>

  <g clip-path="url(#plateClip)">
    ${strokes.join("")}
    ${bands.join("")}
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" filter="url(#grain)" opacity="0.26"/>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#sheen)" opacity="0.8"/>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#vignette)"/>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="10"/>
  </g>

  <rect x="${px + 1.5}" y="${py + 1.5}" width="${pw - 3}" height="${ph - 3}" rx="20.5" fill="none" stroke="url(#bevel)" stroke-width="3"/>
  <rect x="${px + 9}" y="${py + 9}" width="${pw - 18}" height="${ph - 18}" rx="16" fill="none" stroke="#6a7179" stroke-opacity="0.35" stroke-width="1.6"/>

  ${screw(px + 38, py + 36)}
  ${screw(px + pw - 38, py + 36)}
  ${screw(px + 38, py + ph - 36)}
  ${screw(px + pw - 38, py + ph - 36)}

  <rect x="${qx}" y="${qy}" width="${qSize}" height="${qSize}" rx="6" fill="#f7f8f9"/>
  <rect x="${qx}" y="${qy}" width="${qSize}" height="${qSize}" rx="6" fill="none" stroke="#8d949c" stroke-opacity="0.55" stroke-width="1.6"/>
  <svg x="${qx + 24}" y="${qy + 24}" width="${qrModules}" height="${qrModules}" viewBox="0 0 ${qrModules} ${qrModules}">
    <path d="${modules}" fill="#101820" shape-rendering="crispEdges"/>
  </svg>

  <rect x="${dividerX}" y="${py + 78}" width="2" height="${ph - 156}" fill="url(#divider)"/>

  ${
    title
      ? engraved(title, 166, 31, {
          letterSpacing: rtl ? 0 : 2.4,
          fill: "#3f454c",
          weight: 500,
        })
      : ""
  }
  ${nameText}
  ${
    years
      ? engraved(years, yearsY, 44, {
          fill: "#31363d",
          weight: 600,
          ltr: true,
        })
      : ""
  }
</svg>`;
}

type Labels = {
  title: string;
  text: string;
  png: string;
  svg: string;
  copy: string;
  copied: string;
  error: string;
};

export function MetalPlaque({
  path,
  name,
  birthYear = "",
  deathYear = "",
  gender = "",
  lang,
  labels,
}: {
  path: string;
  name: string;
  birthYear?: string;
  deathYear?: string;
  gender?: string;
  lang: string;
  labels: Labels;
}) {
  const [copied, setCopied] = useState(false);
  const fileBase = `plaque-${path.split("/").filter(Boolean).pop() ?? "memorial"}`;

  // The absolute URL only exists in the browser: useSyncExternalStore reads it
  // without a setState-inside-effect, and returns "" during server rendering.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );
  const url = origin ? new URL(path, origin).toString() : "";

  // "" = not mounted yet (skeleton), null = generation failed.
  const art = useMemo(() => {
    if (!url) return "";
    try {
      return buildPlaque({ url, name, birthYear, deathYear, lang, gender });
    } catch {
      return null;
    }
  }, [url, name, birthYear, deathYear, lang, gender]);

  async function downloadPng() {
    if (!art) return;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art)}`;
    await img.decode();
    const scale = 3; // 2640 x 1560 — comfortably print-ready
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${fileBase}.png`;
    a.click();
    URL.revokeObjectURL(href);
  }

  function downloadSvg() {
    if (!art) return;
    const blob = new Blob([art], { type: "image/svg+xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${fileBase}.svg`;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  const secondaryBtn =
    "rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-50";

  return (
    <div className="card p-6">
      <h3 className="font-bold text-white">{labels.title}</h3>
      <p className="mt-1 text-sm text-slate-400">{labels.text}</p>

      <div className="mt-4 rounded-xl bg-slate-950/60 p-2 sm:p-4">
        {art ? (
          // The plaque is one self-contained SVG string (preview + exports).
          <div dangerouslySetInnerHTML={{ __html: art }} />
        ) : art === null ? (
          <div className="flex aspect-[880/520] items-center justify-center rounded-lg bg-slate-900 px-4 text-center text-sm text-red-400">
            {labels.error}
          </div>
        ) : (
          <div
            aria-hidden
            className="aspect-[880/520] w-full animate-pulse rounded-lg bg-slate-800/70"
          />
        )}
      </div>

      <p dir="ltr" className="mt-3 break-all text-xs text-slate-500">
        {url || "…"}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          onClick={downloadPng}
          disabled={!art}
          className="btn-gold !py-2 text-sm"
        >
          {labels.png}
        </button>
        <button onClick={downloadSvg} disabled={!art} className={secondaryBtn}>
          {labels.svg}
        </button>
        <button onClick={copyLink} disabled={!url} className={secondaryBtn}>
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </div>
  );
}
