import Image from "next/image";
import Link from "next/link";
import { getImageUrl } from "@/lib/api";
import type { ContentItem } from "@/types";

interface ContentCardProps {
  item: ContentItem;
  layout?: "landscape" | "portrait";
  size?: "sm" | "md" | "lg";
  priority?: boolean;
}

function buildDetailHref(item: ContentItem): string {
  const title = item.generalInfo?.title || item.globalServiceName || item.title || "watch";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (item.globalServiceId && item.globalServiceId !== item._id)
    return `/${slug}/detail/${item.globalServiceId}/${item._id}`;
  return `/${slug}/detail/${item._id}`;
}

function isFreeItem(item: ContentItem) {
  return (
    item.generalInfo?.isSellable === false ||
    item.generalInfo?.heroBannerLabelText?.toLowerCase() === "free" ||
    item.generalInfo?.bottomCenterLabel?.toLowerCase() === "free"
  );
}

const BADGE_COLORS: Record<string, string> = {
  "new episode":   "bg-red-600",
  "new release":   "bg-green-600",
  "most viewed":   "bg-orange-500",
  "# trending":    "bg-purple-600",
  "trending":      "bg-purple-600",
  "exclusive":     "bg-red-700",
  "sun exclusive": "bg-red-700",
  "third episode": "bg-red-600",
  "second episode":"bg-red-600",
  "first episode": "bg-red-600",
};

function getBadgeColor(label: string) {
  const key = label.toLowerCase();
  for (const [k, v] of Object.entries(BADGE_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "bg-red-600";
}

export default function ContentCard({ item, layout = "landscape", size = "md", priority = false }: ContentCardProps) {
  const href  = buildDetailHref(item);
  const isLive = item.generalInfo?.type === "live";
  const free   = isFreeItem(item);
  const label  = item.generalInfo?.heroBannerLabelText;
  const showLabel = label && label.toLowerCase() !== "free";

  const imgType     = layout === "portrait" ? "poster"   : "preview";
  const fallbackType = layout === "portrait" ? "preview"  : "landscape";
  const imgUrl =
    getImageUrl(item.images, imgType, "xhdpi") ||
    getImageUrl(item.images, fallbackType, "xhdpi") ||
    getImageUrl(item.images, "preview", "xhdpi");

  const effectiveTitle =
    item.generalInfo?.displayTitle ||
    item.generalInfo?.title ||
    item.title ||
    item.globalServiceName || "";

  // Width classes per size + layout
  const widthCls = {
    sm: layout === "portrait" ? "w-[88px]  sm:w-[104px]" : "w-[148px] sm:w-[172px]",
    md: layout === "portrait" ? "w-[104px] sm:w-[128px]" : "w-[172px] sm:w-[210px]",
    lg: layout === "portrait" ? "w-[128px] sm:w-[156px]" : "w-[220px] sm:w-[270px]",
  }[size];

  const aspectCls = layout === "portrait" ? "aspect-[2/3]" : "aspect-video";

  return (
    <Link href={href} className={`group shrink-0 ${widthCls}`}>
      <div className={`relative ${aspectCls} rounded-lg overflow-hidden bg-gray-800`}>

        {/* Thumbnail */}
        {imgUrl ? (
          <Image
            src={imgUrl}
            alt={effectiveTitle}
            fill
            unoptimized
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-gray-700 to-gray-900 flex items-center justify-center p-2">
            <span className="text-gray-500 text-[10px] text-center leading-tight">{effectiveTitle}</span>
          </div>
        )}

        {/* Hover overlay with play button */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors duration-200 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-red-600 hover:bg-red-500 rounded-full p-2.5 sm:p-3 shadow-lg">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Free ribbon — diagonal top-right */}
        {free && !isLive && (
          <div className="absolute top-0 right-0 w-14 h-14 overflow-hidden pointer-events-none">
            <div className="absolute top-2.5 -right-4.5 bg-red-600 text-white text-[9px] font-bold px-6 py-0.5 rotate-45 tracking-wide shadow-sm">
              Free
            </div>
          </div>
        )}

        {/* Live badge */}
        {isLive && (
          <div className="absolute top-1.5 left-1.5">
            <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
              <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
              LIVE
            </span>
          </div>
        )}

        {/* Dolby badge */}
        {item.generalInfo?.isDolby && (
          <div className="absolute top-1.5 right-1.5">
            <span className="bg-blue-600/80 text-white text-[8px] font-bold px-1 py-0.5 rounded">DOLBY</span>
          </div>
        )}

        {/* Bottom label badge (New Episode, Trending, etc.) */}
        {showLabel && (
          <div className="absolute bottom-0 left-0 right-0">
            <span className={`block w-full text-center text-white text-[9px] sm:text-[10px] font-bold py-0.5 ${getBadgeColor(label)} tracking-wide`}>
              {label}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-1.5 px-0.5">
        <p className="text-white text-[11px] sm:text-xs font-medium line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
          {effectiveTitle}
        </p>
        {item.globalServiceName && item.globalServiceName !== effectiveTitle && (
          <p className="text-gray-500 text-[10px] line-clamp-1 mt-0.5">{item.globalServiceName}</p>
        )}
      </div>
    </Link>
  );
}
