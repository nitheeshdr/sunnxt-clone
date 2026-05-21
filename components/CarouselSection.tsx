import { getCarouselItems } from "@/lib/api";
import ContentRow from "./ContentRow";
import HeroBanner from "./HeroBanner";
import type { CarouselSection as CarouselSectionType, ContentItem } from "@/types";

interface Props {
  section: CarouselSectionType;
  isFirst?: boolean;
}

export default async function CarouselSection({ section, isFirst }: Props) {
  let items: ContentItem[] = [];
  try {
    const res = await getCarouselItems(section.name, section.pageSize || 20);
    items = ((res as { results?: ContentItem[] }).results || []) as ContentItem[];
  } catch {
    return null;
  }

  if (!items.length) return null;

  const isBanner = section.layoutType === "banner" || section.layoutType === "bannerV1";
  const isPortrait =
    section.layoutType === "verticalList" ||
    section.layoutType === "portraitList" ||
    section.layoutType?.includes("portrait");

  if (isBanner && isFirst) {
    return <HeroBanner items={items.slice(0, 8)} />;
  }

  if (isBanner) return null; // skip non-first banners

  return (
    <ContentRow
      title={section.title}
      items={items}
      layout={isPortrait ? "portrait" : "landscape"}
      showViewAll={section.enableShowAll}
    />
  );
}
