"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { getImageUrl } from "@/lib/api";
import type { ContentItem } from "@/types";

interface HeroBannerProps {
  items: ContentItem[];
}

export default function HeroBanner({ items }: HeroBannerProps) {
  const [current, setCurrent] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const goTo = useCallback(
    (idx: number) => {
      if (transitioning || idx === current) return;
      setTransitioning(true);
      setTimeout(() => {
        setCurrent(idx);
        setTransitioning(false);
      }, 300);
    },
    [current, transitioning]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      goTo((current + 1) % items.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [current, items.length, goTo]);

  if (!items.length) return null;

  const item = items[current];
  const imgUrl =
    getImageUrl(item.images, "preview", "xxhdpi") ||
    getImageUrl(item.images, "landscape", "xxhdpi") ||
    getImageUrl(item.images, "banner", "xxhdpi");

  const genreList =
    item.genreInfo?.values?.map((g) => g.title).join(" • ") ||
    item.generalInfo?.altLanguage ||
    "";

  const isLive = item.generalInfo?.type === "live";
  const effectiveTitle = item.generalInfo?.title || item.globalServiceName || item.title || "";
  const titleSlug = effectiveTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const detailHref =
    item.globalServiceId && item.globalServiceId !== item._id
      ? `/${titleSlug}/detail/${item.globalServiceId}/${item._id}`
      : `/${titleSlug}/detail/${item._id}`;

  return (
    <div className="relative w-full h-[72vw] sm:h-[56vw] max-h-170 min-h-65 overflow-hidden bg-black">
      {/* Background image */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          transitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        {imgUrl ? (
          <Image
            src={imgUrl}
            alt={effectiveTitle || ""}
            fill
            priority
            unoptimized
            className="object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 sm:px-8 pb-10 sm:pb-16 md:pb-20 transition-all duration-500 ${
          transitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        }`}
      >
        <div className="max-w-[1400px] mx-auto">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-2">
            {item.generalInfo?.heroBannerLabelText && (
              <span className="bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                {item.generalInfo.heroBannerLabelText}
              </span>
            )}
            {isLive && (
              <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded uppercase">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                LIVE
              </span>
            )}
            {item.generalInfo?.isDolby && (
              <span className="bg-blue-600/80 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded">
                DOLBY
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-white mb-1 sm:mb-2 drop-shadow-lg leading-tight max-w-2xl line-clamp-2">
            {effectiveTitle}
          </h1>

          {/* Genre */}
          {genreList && (
            <p className="text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2 line-clamp-1">{genreList}</p>
          )}

          {/* Description — hidden on very small screens */}
          <p className="hidden sm:block text-gray-300 text-sm md:text-base max-w-xl mb-4 sm:mb-6 line-clamp-2">
            {item.generalInfo?.briefDescription}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={detailHref}
              className="flex items-center gap-1.5 sm:gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded text-sm sm:text-base transition-all hover:scale-105 active:scale-95"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {isLive ? "Watch Live" : "Watch Now"}
            </Link>
            <Link
              href={detailHref}
              className="flex items-center gap-1.5 sm:gap-2 bg-white/20 hover:bg-white/30 backdrop-blur text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded text-sm sm:text-base transition-all"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">More Info</span>
              <span className="sm:hidden">Info</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-3 sm:bottom-6 right-4 sm:right-8 flex gap-1.5">
        {items.slice(0, 8).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`transition-all duration-300 rounded-full ${
              i === current ? "w-5 sm:w-6 h-1.5 sm:h-2 bg-red-500" : "w-1.5 sm:w-2 h-1.5 sm:h-2 bg-white/40 hover:bg-white/60"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
