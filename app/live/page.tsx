import { Suspense } from "react";
import { getLiveCarouselInfo } from "@/lib/api";
import CarouselSection from "@/components/CarouselSection";
import type { CarouselSection as CarouselSectionType } from "@/types";

export const revalidate = 60;

export default async function LivePage() {
  let sections: CarouselSectionType[] = [];
  try {
    const res = await getLiveCarouselInfo();
    sections = ((res as { results?: CarouselSectionType[] }).results || []) as CarouselSectionType[];
    sections.sort((a, b) => (a.weightage || 0) - (b.weightage || 0));
  } catch (err) {
    console.error("Failed to load live sections:", err);
  }

  const bannerIdx = sections.findIndex(
    (s) => s.layoutType === "banner" || s.layoutType === "bannerV1"
  );

  return (
    <div className="bg-[#0f0f0f] min-h-screen">
      <div className="px-8 py-6 max-w-350 mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Live TV</h1>
        <p className="text-gray-400 text-sm flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
          Watch live channels streaming now
        </p>
      </div>
      {sections.map((section, idx) => (
        <Suspense key={section.name} fallback={<div className="h-64 skeleton rounded mx-8 mb-4" />}>
          <CarouselSection section={section} isFirst={idx === bannerIdx} />
        </Suspense>
      ))}
      {sections.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-500">
          No live channels available right now.
        </div>
      )}
    </div>
  );
}
