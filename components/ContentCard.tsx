import Image from "next/image";
import Link from "next/link";
import { getImageUrl } from "@/lib/api";
import type { ContentItem } from "@/types";

interface ContentCardProps {
  item: ContentItem;
  layout?: "landscape" | "portrait";
  size?: "sm" | "md" | "lg";
}

function buildDetailHref(item: ContentItem): string {
  const title =
    item.generalInfo?.title || item.globalServiceName || item.title || "watch";
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // SunNXT URL pattern: /{slug}/detail/{serviceId}/{contentId}
  if (item.globalServiceId && item.globalServiceId !== item._id) {
    return `/${slug}/detail/${item.globalServiceId}/${item._id}`;
  }
  return `/${slug}/detail/${item._id}`;
}

export default function ContentCard({ item, layout = "landscape", size = "md" }: ContentCardProps) {
  const effectiveTitle = item.title || item.generalInfo?.title || "";
  const isLive = item.generalInfo?.type === "live";
  const href = buildDetailHref(item);

  const imgType = layout === "portrait" ? "poster" : "preview";
  const fallbackType = layout === "portrait" ? "preview" : "landscape";

  const imgUrl =
    getImageUrl(item.images, imgType, "xhdpi") ||
    getImageUrl(item.images, fallbackType, "xhdpi") ||
    getImageUrl(item.images, "preview", "xhdpi");

  const sizeClasses = {
    sm: layout === "portrait" ? "w-28 sm:w-32" : "w-40 sm:w-48",
    md: layout === "portrait" ? "w-32 sm:w-40" : "w-48 sm:w-60",
    lg: layout === "portrait" ? "w-40 sm:w-48" : "w-60 sm:w-72",
  };

  const aspectRatio = layout === "portrait" ? "aspect-[2/3]" : "aspect-video";

  const displayTitle =
    item.generalInfo?.displayTitle ||
    (item.globalServiceName && item.globalServiceName !== effectiveTitle
      ? item.globalServiceName
      : null);

  return (
    <Link
      href={href}
      className={`group shrink-0 ${sizeClasses[size]} cursor-pointer`}
    >
      <div className={`relative ${aspectRatio} rounded-lg overflow-hidden bg-gray-800`}>
        {imgUrl ? (
          <Image
            src={imgUrl}
            alt={effectiveTitle || item.generalInfo?.type || "Content thumbnail"}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 160px, 240px"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
            <span className="text-gray-500 text-xs text-center px-2">{effectiveTitle}</span>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-red-600 rounded-full p-3">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          {isLive && (
            <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
              <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
              LIVE
            </span>
          )}
          {item.generalInfo?.isDolby && (
            <span className="bg-blue-600/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              DOLBY
            </span>
          )}
        </div>

        {/* Bottom label */}
        {item.generalInfo?.heroBannerLabelText && (
          <span className="absolute bottom-2 left-2 bg-red-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {item.generalInfo.heroBannerLabelText}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="mt-2 px-0.5">
        <p className="text-white text-xs sm:text-sm font-medium line-clamp-1 group-hover:text-red-400 transition-colors">
          {displayTitle || effectiveTitle}
        </p>
        {item.globalServiceName && displayTitle && (
          <p className="text-gray-500 text-[11px] line-clamp-1">{item.globalServiceName}</p>
        )}
      </div>
    </Link>
  );
}
