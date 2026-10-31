"use client";

import { useEffect, useRef, useState } from "react";

export function Gallery({
  photos,
  alt,
  closeLabel,
  prevLabel,
  nextLabel,
}: {
  photos: string[];
  alt: string;
  closeLabel: string;
  prevLabel?: string;
  nextLabel?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Arrow keys follow the reading direction: in RTL layouts the visual
  // "next" button sits on the left, so ArrowLeft advances instead.
  useEffect(() => {
    if (index === null) return;
    const rtl =
      document.documentElement.dir === "rtl" ||
      document.documentElement.lang === "ar" ||
      document.documentElement.lang === "ku";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIndex(null);
      if (e.key === forward)
        setIndex((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === backward)
        setIndex((i) =>
          i === null ? i : (i - 1 + photos.length) % photos.length
        );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length]);

  // Lock background scrolling while the lightbox is open.
  useEffect(() => {
    if (index === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [index]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((src, i) => (
          <button
            key={src}
            onClick={() => setIndex(i)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${alt} ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {index !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setIndex(null)}
        >
          <button
            ref={closeRef}
            aria-label={closeLabel}
            className="absolute end-4 top-4 rounded-full border border-slate-600 px-3 py-1 text-slate-200 hover:bg-slate-800"
            onClick={() => setIndex(null)}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[index]}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <>
              <button
                aria-label={prevLabel ?? "Previous"}
                className="absolute start-4 top-1/2 -translate-y-1/2 rounded-full bg-slate-800/80 px-4 py-3 text-white hover:bg-slate-700"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length);
                }}
              >
                ‹
              </button>
              <button
                aria-label={nextLabel ?? "Next"}
                className="absolute end-4 top-1/2 -translate-y-1/2 rounded-full bg-slate-800/80 px-4 py-3 text-white hover:bg-slate-700"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => ((i ?? 0) + 1) % photos.length);
                }}
              >
                ›
              </button>
              <p
                aria-hidden
                className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-slate-300"
              >
                {index + 1} / {photos.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
