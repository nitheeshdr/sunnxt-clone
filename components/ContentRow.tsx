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
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const scroll = (dir: "left" | "right") => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "right" ? el.clientWidth * 0.8 : -(el.clientWidth * 0.8), behavior: "smooth" });
  };

  const onScroll = () => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  if (!items.length) return null;

  return (
    <div className="relative py-3">
      {/* Row header */}
      <div className="flex items-center justify-between mb-3 px-4 sm:px-6 lg:px-10">
        <h2 className="text-white font-bold text-sm sm:text-[15px]">{title}</h2>
        {showViewAll && (
          <button className="text-gray-400 hover:text-white text-xs sm:text-sm font-medium transition-colors">
            View All
          </button>
        )}
      </div>

      {/* Scroll container */}
      <div className="relative group/row">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-linear-to-r from-black/80 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity hidden sm:flex items-center"
            aria-label="Scroll left"
          >
            <div className="bg-black/70 hover:bg-black rounded-full p-2">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </div>
          </button>
        )}

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-linear-to-l from-black/80 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity hidden sm:flex items-center"
            aria-label="Scroll right"
          >
            <div className="bg-black/70 hover:bg-black rounded-full p-2">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        )}

        {/* Scrollable items */}
        <div
          ref={rowRef}
          onScroll={onScroll}
          className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 px-4 sm:px-6 lg:px-10 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {items.map((item, idx) => (
            <ContentCard key={item._id} item={item} layout={layout} size="md" priority={idx < 5} />
          ))}
        </div>
      </div>
    </div>
  );
}
