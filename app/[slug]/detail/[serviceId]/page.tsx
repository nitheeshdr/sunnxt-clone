import Image from "next/image";
import Link from "next/link";
import { getContentDetail, getSimilarContent, getImageUrl } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import type { ContentItem } from "@/types";

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string; serviceId: string }>;
}

export default async function MovieDetailPage({ params }: Props) {
  const { serviceId, slug } = await params;

  let item: ContentItem | null = null;
  let similarItems: ContentItem[] = [];

  try {
    const res = await getContentDetail(serviceId);
    const results = (res as { results?: ContentItem[] }).results || [];
    if (results[0]) item = results[0];
  } catch { /* ignore */ }

  try {
    const res = await getSimilarContent(serviceId);
    similarItems = ((res as { results?: ContentItem[] }).results || []) as ContentItem[];
  } catch { /* ignore */ }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">
            {slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <p className="text-gray-600 text-sm mb-6">Sign in to view full details</p>
          <Link
            href="/login"
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-lg transition-colors mr-3"
          >
            Sign In
          </Link>
          <Link href="/" className="text-gray-400 hover:text-white underline text-sm">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const backdropUrl =
    getImageUrl(item.images, "preview", "xxhdpi") ||
    getImageUrl(item.images, "landscape", "xxhdpi");
  const posterUrl =
    getImageUrl(item.images, "poster", "xhdpi") ||
    getImageUrl(item.images, "preview", "hdpi");

  const isLive = item.generalInfo?.type === "live";
  const genres = item.genreInfo?.values?.map((g) => g.title) || [];
  const cast = item.relatedCast?.values || [];

  return (
    <div className="bg-[#0f0f0f] min-h-screen">
      {/* Hero backdrop */}
      <div className="relative w-full h-[60vw] sm:h-[50vw] max-h-150 min-h-55">
        {backdropUrl ? (
          <Image
            src={backdropUrl}
            alt={item.generalInfo?.title || item.globalServiceName || item.title || ""}
            fill
            priority
            unoptimized
            className="object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-gray-900 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>

      {/* Main content */}
      <div className="relative -mt-20 sm:-mt-32 px-4 sm:px-10 max-w-350 mx-auto pb-10">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
          {posterUrl && (
            <div className="shrink-0 w-28 sm:w-48 hidden sm:block">
              <div className="relative aspect-2/3 rounded-xl overflow-hidden shadow-2xl">
                <Image src={posterUrl} alt={item.generalInfo?.title || item.globalServiceName || item.title || ""} fill unoptimized className="object-cover" />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {isLive ? (
                <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded uppercase">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="bg-gray-700 text-gray-300 text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded uppercase">
                  {item.generalInfo?.type || "VOD"}
                </span>
              )}
              {item.generalInfo?.isDolby && (
                <span className="bg-blue-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded">DOLBY</span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-white mb-1 leading-tight">
              {item.generalInfo?.title || item.globalServiceName || item.title}
            </h1>
            {item.generalInfo?.displayTitle && (
              <p className="text-gray-400 text-xs sm:text-sm mb-2">{item.generalInfo.displayTitle}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-400 mb-3">
              {item.releaseDate && <span>{new Date(item.releaseDate).getFullYear()}</span>}
              {genres.length > 0 && <span className="line-clamp-1">{genres.join(" • ")}</span>}
              {item.generalInfo?.isDownloadable && (
                <span className="flex items-center gap-1 text-green-400 text-xs">↓ Download</span>
              )}
            </div>

            <p className="text-gray-300 text-xs sm:text-sm md:text-base leading-relaxed mb-4 sm:mb-6 max-w-2xl line-clamp-3 sm:line-clamp-none">
              {item.generalInfo?.description || item.generalInfo?.briefDescription}
            </p>

            <div className="flex gap-2 sm:gap-3 mb-6 sm:mb-8">
              <a
                href={`/player/${serviceId}`}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-5 sm:px-8 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base transition-all hover:scale-105 active:scale-95"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {isLive ? "Watch Live" : "Watch Now"}
              </a>
              <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base transition-colors border border-white/10">
                + List
              </button>
            </div>

            {item.subtitles?.values?.length ? (
              <div className="mb-6">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Subtitles</p>
                <div className="flex flex-wrap gap-2">
                  {item.subtitles.values.map((sub) => (
                    <span key={sub.language} className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded">
                      {sub.language}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {cast.length > 0 && (
          <div className="mt-6 sm:mt-10">
            <h2 className="text-white font-bold text-sm sm:text-lg mb-3 sm:mb-4">Cast</h2>
            <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-2" style={{ scrollbarWidth: "none" }}>
              {cast.slice(0, 12).map((member) => {
                const castImg = getImageUrl(member.images, "squareimage", "hdpi");
                return (
                  <div key={member._id} className="shrink-0 text-center w-16 sm:w-20">
                    <div className="relative w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-full overflow-hidden bg-gray-800 mb-1.5">
                      {castImg ? (
                        <Image src={castImg} alt={member.name} fill unoptimized className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-lg font-bold">
                          {member.name[0]}
                        </div>
                      )}
                    </div>
                    <p className="text-gray-300 text-[10px] sm:text-xs leading-tight line-clamp-2">{member.name}</p>
                    {member.types[0] && (
                      <p className="text-gray-500 text-[9px] sm:text-[10px] mt-0.5">{member.types[0]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {similarItems.length > 0 && (
        <div className="mt-6">
          <ContentRow title="You May Also Like" items={similarItems} />
        </div>
      )}
    </div>
  );
}
