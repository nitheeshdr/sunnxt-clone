import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { getContentDetail, getSimilarContent, getImageUrl } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import type { ContentItem } from "@/types";

export const revalidate = 300;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DetailPage({ params }: Props) {
  const { id } = await params;

  let item: ContentItem | null = null;
  let similarItems: ContentItem[] = [];

  try {
    const res = await getContentDetail(id);
    const results = (res as { results?: ContentItem[] }).results || [];
    item = results[0] ?? null;
  } catch (err) {
    console.error("Failed to load content detail:", err);
  }

  try {
    const res = await getSimilarContent(id);
    similarItems = ((res as { results?: ContentItem[] }).results || []) as ContentItem[];
  } catch {
    // ignore
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Content not found</p>
          <Link href="/" className="text-red-500 hover:text-red-400 underline">
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
      <div className="relative w-full h-[50vw] max-h-[600px] min-h-[300px]">
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
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>

      {/* Main content */}
      <div className="relative -mt-32 px-6 sm:px-10 max-w-350 mx-auto pb-10">
        <div className="flex flex-col sm:flex-row gap-8">
          {/* Poster */}
          {posterUrl && (
            <div className="shrink-0 w-36 sm:w-48 hidden sm:block">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-2xl">
                <Image
                  src={posterUrl}
                  alt={item.generalInfo?.title || item.globalServiceName || item.title || ""}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Type badge */}
            <div className="flex items-center gap-2 mb-3">
              {isLive ? (
                <span className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded uppercase">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="bg-gray-700 text-gray-300 text-xs font-medium px-2 py-1 rounded uppercase">
                  {item.generalInfo?.type || "VOD"}
                </span>
              )}
              {item.generalInfo?.isDolby && (
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                  DOLBY
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white mb-1 leading-tight">
              {item.globalServiceName || item.title}
            </h1>

            {item.generalInfo?.displayTitle && (
              <p className="text-gray-400 text-sm mb-3">{item.generalInfo.displayTitle}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-4">
              {item.releaseDate && (
                <span>{new Date(item.releaseDate).getFullYear()}</span>
              )}
              {genres.length > 0 && (
                <span>{genres.join(" • ")}</span>
              )}
              {item.generalInfo?.isDownloadable && (
                <span className="flex items-center gap-1 text-green-400">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                  </svg>
                  Download
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
              {item.generalInfo?.description || item.generalInfo?.briefDescription}
            </p>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-8">
              <button className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-lg transition-all hover:scale-105 active:scale-95">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {isLive ? "Watch Live" : "Watch Now"}
              </button>
              <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3 rounded-lg transition-colors border border-white/10">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add to List
              </button>
            </div>

            {/* Subtitles */}
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

        {/* Cast section */}
        {cast.length > 0 && (
          <div className="mt-10">
            <h2 className="text-white font-bold text-lg mb-4">Cast</h2>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {cast.slice(0, 10).map((member) => {
                const castImg = getImageUrl(member.images, "squareimage", "hdpi");
                return (
                  <div key={member._id} className="shrink-0 text-center w-20">
                    <div className="relative w-16 h-16 mx-auto rounded-full overflow-hidden bg-gray-800 mb-2">
                      {castImg ? (
                        <Image
                          src={castImg}
                          alt={member.name}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xl font-bold">
                          {member.name[0]}
                        </div>
                      )}
                    </div>
                    <p className="text-gray-300 text-xs leading-tight line-clamp-2">{member.name}</p>
                    {member.types[0] && (
                      <p className="text-gray-500 text-[10px] mt-0.5">{member.types[0]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Similar content */}
      {similarItems.length > 0 && (
        <div className="mt-6">
          <Suspense fallback={null}>
            <ContentRow title="Similar Content" items={similarItems} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
