"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { getImageUrl } from "@/lib/api";
import type { ContentItem } from "@/types";

export default function HeroBanner({ items }: { items: ContentItem[] }) {
  const [current, setCurrent]           = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const goTo = useCallback((idx: number) => {
    if (transitioning || idx === current) return;
    setTransitioning(true);
    setTimeout(() => { setCurrent(idx); setTransitioning(false); }, 300);
  }, [current, transitioning]);

  useEffect(() => {
    const t = setInterval(() => goTo((current + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [current, items.length, goTo]);

  if (!items.length) return null;

  const item = items[current];
  const imgUrl =
    getImageUrl(item.images, "preview", "xxhdpi") ||
    getImageUrl(item.images, "landscape", "xxhdpi") ||
    getImageUrl(item.images, "banner", "xxhdpi");

  const title = item.generalInfo?.title || item.globalServiceName || item.title || "";
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const href = item.globalServiceId && item.globalServiceId !== item._id
    ? `/${titleSlug}/detail/${item.globalServiceId}/${item._id}`
    : `/${titleSlug}/detail/${item._id}`;

  const isLive   = item.generalInfo?.type === "live";
  const isFree   = item.generalInfo?.isSellable === false || item.generalInfo?.heroBannerLabelText?.toLowerCase() === "free";
  const isDolby  = item.generalInfo?.isDolby;
  const language = item.generalInfo?.altLanguage || item.language || "";
  const genres   = item.genreInfo?.values?.map((g) => g.title).join(", ") || item.generalInfo?.category || "";
  const label    = item.generalInfo?.heroBannerLabelText;

  // Build meta string: "Tamil | Talk Show, Entertainment | 46 Min"
  const metaParts = [language, genres, item.duration].filter(Boolean);

  return (
    <div className="relative w-full overflow-hidden bg-black" style={{ height: "min(72vw, 680px)", minHeight: 280 }}>
      {/* Background */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${transitioning ? "opacity-0" : "opacity-100"}`}>
        {imgUrl ? (
          <Image src={imgUrl} alt={title} fill priority unoptimized className="object-cover object-top" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
        )}
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
      </div>

      {/* Content overlay */}
      <div className={`absolute inset-0 flex flex-col justify-end pb-8 sm:pb-14 px-4 sm:px-8 lg:px-14 transition-all duration-500 ${transitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
        <div className="max-w-2xl">

          {/* WATCH FOR FREE badge */}
          {isFree && (
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-white rounded px-2 py-1 flex flex-col leading-none">
                <span className="text-[8px] font-bold text-gray-700 tracking-widest uppercase">WATCH FOR</span>
                <div className="flex items-center gap-0.5 mt-0.5">
                  <div className="bg-red-600 rounded-sm px-0.5">
                    <span className="text-white font-black text-[10px] tracking-tight">SUN</span>
                  </div>
                  <div className="bg-white border border-gray-300 rounded-sm px-0.5">
                    <span className="text-red-600 font-black text-[10px] tracking-tight">NXT</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Label badge (New Episode, etc.) */}
          {label && label.toLowerCase() !== "free" && (
            <div className="mb-2">
              <span className="bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                {label}
              </span>
            </div>
          )}

          {/* Live badge */}
          {isLive && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded uppercase tracking-wide">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                LIVE
              </span>
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white drop-shadow-xl leading-tight line-clamp-2 mb-2">
            {title}
          </h1>

          {/* Meta row */}
          {metaParts.length > 0 && (
            <p className="text-gray-300 text-[11px] sm:text-sm mb-1 line-clamp-1">
              {metaParts.join(" | ")}
            </p>
          )}

          {/* Quality badges */}
          <div className="flex items-center gap-2 mb-4 sm:mb-5">
            {isDolby && (
              <span className="bg-blue-600/80 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide">
                DOLBY
              </span>
            )}
            {item.generalInfo?.videoQualityImage ? (
              <span className="bg-gray-800/80 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded">
                4K
              </span>
            ) : null}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={`/player/${item._id}`}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-bold px-5 sm:px-7 py-2.5 sm:py-3 rounded text-sm sm:text-base transition-all border border-white/30"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Watch Now
            </Link>
            <Link
              href={href}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-white/60 hover:border-white flex items-center justify-center text-white transition-all hover:bg-white/10"
              aria-label="Add to list"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-3 sm:bottom-5 right-4 sm:right-8 flex gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all duration-300 ${
              i === current ? "w-5 sm:w-6 h-1.5 sm:h-2 bg-red-500" : "w-1.5 sm:w-2 h-1.5 sm:h-2 bg-white/40 hover:bg-white/60"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
