import { Suspense } from "react";
import { getMusicCarouselInfo } from "@/lib/api";
import CarouselSection from "@/components/CarouselSection";
import type { CarouselSection as CarouselSectionType } from "@/types";

export const revalidate = 300;

export default async function MusicPage() {
  let sections: CarouselSectionType[] = [];
  try {
    const res = await getMusicCarouselInfo();
    sections = ((res.results || []) as CarouselSectionType[]).sort(
      (a, b) => (a.weightage || 0) - (b.weightage || 0)
    );
  } catch { /* ignore */ }

  return (
    <div className="bg-[#0f0f0f] min-h-screen">
      <div className="px-8 py-6 max-w-350 mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Music Videos</h1>
        <p className="text-gray-400 text-sm">Tamil, Telugu, Malayalam &amp; more</p>
      </div>
      {sections.map((section, idx) => (
        <Suspense key={section.name} fallback={<div className="h-64 bg-gray-900 rounded mx-8 mb-4 animate-pulse" />}>
          <CarouselSection section={section} isFirst={idx === 0} />
        </Suspense>
      ))}
      {sections.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-500">No content available.</div>
      )}
    </div>
  );
}
