import { Suspense } from "react";
import { getTvCarouselInfo } from "@/lib/api";
import CarouselSection from "@/components/CarouselSection";
import type { CarouselSection as CarouselSectionType } from "@/types";

export const revalidate = 300;

export default async function TVPage() {
  let sections: CarouselSectionType[] = [];
  try {
    const res = await getTvCarouselInfo();
    sections = ((res as { results?: CarouselSectionType[] }).results || []) as CarouselSectionType[];
    sections.sort((a, b) => (a.weightage || 0) - (b.weightage || 0));
  } catch (err) {
    console.error("Failed to load TV sections:", err);
  }

  const bannerIdx = sections.findIndex(
    (s) => s.layoutType === "banner" || s.layoutType === "bannerV1"
  );

  return (
    <div className="bg-[#0f0f0f] min-h-screen">
      <div className="px-8 py-6 max-w-350 mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">TV Shows</h1>
        <p className="text-gray-400 text-sm">
          Latest episodes from Sun TV, Vijay TV & more
        </p>
      </div>
      {sections.map((section, idx) => (
        <Suspense key={section.name} fallback={<div className="h-64 skeleton rounded mx-8 mb-4" />}>
          <CarouselSection section={section} isFirst={idx === bannerIdx} />
        </Suspense>
      ))}
      {sections.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-500">
          No content available right now.
        </div>
      )}
    </div>
  );
}
