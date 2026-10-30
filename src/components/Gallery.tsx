"use client";

import { useEffect, useState } from "react";

export function Gallery({
  photos,
  alt,
  closeLabel,
}: {
  photos: string[];
  alt: string;
  closeLabel: string;
}) {
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "ArrowRight") setIndex((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft")
        setIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length]);

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setIndex(null)}
        >
          <button
            aria-label={closeLabel}
            className="absolute end-4 top-4 rounded-full border border-slate-600 px-3 py-1 text-slate-200"
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
                className="absolute start-4 top-1/2 -translate-y-1/2 rounded-full bg-slate-800/80 px-4 py-3 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length);
                }}
              >
                ‹
              </button>
              <button
                className="absolute end-4 top-1/2 -translate-y-1/2 rounded-full bg-slate-800/80 px-4 py-3 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => ((i ?? 0) + 1) % photos.length);
                }}
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
