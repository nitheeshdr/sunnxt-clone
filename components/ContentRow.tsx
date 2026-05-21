"use client";

import { useRef, useState } from "react";
import ContentCard from "./ContentCard";
import type { ContentItem } from "@/types";

interface ContentRowProps {
  title: string;
  items: ContentItem[];
  layout?: "landscape" | "portrait";
  showViewAll?: boolean;
}

export default function ContentRow({ title, items, layout = "landscape", showViewAll }: ContentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const scroll = (dir: "left" | "right") => {
    if (!rowRef.current) return;
    const el = rowRef.current;
    el.scrollBy({ left: dir === "right" ? el.clientWidth * 0.8 : -(el.clientWidth * 0.8), behavior: "smooth" });
  };

  const onScroll = () => {
    if (!rowRef.current) return;
    const el = rowRef.current;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  if (!items.length) return null;

  return (
    <div className="relative py-2">
      <div className="flex items-center justify-between mb-3 px-4 sm:px-8 max-w-350 mx-auto">
        <h2 className="text-white font-bold text-sm sm:text-base md:text-lg">{title}</h2>
        {showViewAll && (
          <button className="text-red-400 hover:text-red-300 text-xs sm:text-sm font-medium transition-colors">
            View All
          </button>
        )}
      </div>

      <div className="relative group/row">
        {/* Left arrow — visible on hover (desktop) */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-2 sm:p-3 rounded-r-lg opacity-0 group-hover/row:opacity-100 transition-opacity hidden sm:flex items-center"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-2 sm:p-3 rounded-l-lg opacity-0 group-hover/row:opacity-100 transition-opacity hidden sm:flex items-center"
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Scrollable row */}
        <div
          ref={rowRef}
          onScroll={onScroll}
          className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-8 pb-2 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {items.map((item, idx) => (
            <ContentCard key={item._id} item={item} layout={layout} size="md" priority={idx < 4} />
          ))}
        </div>
      </div>
    </div>
  );
}
