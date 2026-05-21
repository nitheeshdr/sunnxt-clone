import Image from "next/image";
import Link from "next/link";
import { getSimilarContent, getImageUrl } from "@/lib/api";
import ContentRow from "@/components/ContentRow";
import type { ContentItem } from "@/types";

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string; serviceId: string; contentId: string }>;
}

export default async function DetailPage({ params }: Props) {
  const { contentId, serviceId, slug } = await params;

  let item: ContentItem | null = null;
  let similarItems: ContentItem[] = [];

  // Try contentId first (with devicemax), then fallback to devicemin for free content
  for (const id of [contentId, serviceId]) {
    for (const level of ["devicemax", "devicemin"]) {
      try {
        const res = await fetch(
          `https://pwaapi.sunnxt.com/content/v3/contentDetail/${id}/?level=${level}&fields=contents,user%2Fcurrentdata,images,generalInfo,subtitles,relatedCast,globalServiceName,globalServiceId,relatedMedia,thumbnailSeekPreview,tags,publishingHouse`,
          {
            headers: {
              "x-myplex-platform": "browser",
              "x-ucv": "5",
              "contentlanguage": "tamil,telugu,malayalam,kannada,hindi,bengali,marathi,english",
              origin: "https://www.sunnxt.com",
              referer: "https://www.sunnxt.com/",
              "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            },
            next: { revalidate: 120 },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const r = (data as { results?: ContentItem[] }).results || [];
          if (r[0]) { item = r[0]; break; }
        }
      } catch { /* try next */ }
    }
    if (item) break;
  }

  try {
    const res = await getSimilarContent(contentId || serviceId);
    similarItems = ((res as { results?: ContentItem[] }).results || []) as ContentItem[];
  } catch { /* ignore */ }

  if (!item) {
    const sunnxtUrl = `https://www.sunnxt.com/${slug}/detail/${serviceId}/${contentId}`;
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-5xl mb-4">🎬</div>
          <h1 className="text-white font-bold text-xl mb-2">
            {slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Sign in to view full details and watch this content.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-lg transition-colors"
            >
              Sign In to Watch
            </Link>
            <a
              href={sunnxtUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3 rounded-lg transition-colors text-sm"
            >
              Open on SunNXT ↗
            </a>
            <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm underline">
              Go Home
            </Link>
          </div>
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
            loading="eager"
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
          {posterUrl && (
            <div className="shrink-0 w-36 sm:w-48 hidden sm:block">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-2xl">
                <Image src={posterUrl} alt={item.generalInfo?.title || item.globalServiceName || item.title || ""} fill unoptimized className="object-cover" />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
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
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">DOLBY</span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white mb-1 leading-tight">
              {item.generalInfo?.title || item.globalServiceName || item.title}
            </h1>
            {item.generalInfo?.displayTitle && (
              <p className="text-gray-400 text-sm mb-3">{item.generalInfo.displayTitle}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-4">
              {item.releaseDate && <span>{new Date(item.releaseDate).getFullYear()}</span>}
              {genres.length > 0 && <span>{genres.join(" • ")}</span>}
              {item.generalInfo?.isDownloadable && (
                <span className="flex items-center gap-1 text-green-400 text-xs">
                  ↓ Download
                </span>
              )}
            </div>

            <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
              {item.generalInfo?.description || item.generalInfo?.briefDescription}
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              <a
                href={`/player/${contentId}`}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-lg transition-all hover:scale-105"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {isLive ? "Watch Live" : "Watch Now"}
              </a>
              <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3 rounded-lg transition-colors border border-white/10">
                + Add to List
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
          <div className="mt-10">
            <h2 className="text-white font-bold text-lg mb-4">Cast</h2>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {cast.slice(0, 12).map((member, idx) => {
                const castImg = getImageUrl(member.images, "squareimage", "hdpi");
                return (
                  <div key={`${member._id}-${idx}`} className="shrink-0 text-center w-20">
                    <div className="relative w-16 h-16 mx-auto rounded-full overflow-hidden bg-gray-800 mb-2">
                      {castImg ? (
                        <Image src={castImg} alt={member.name} fill unoptimized className="object-cover" />
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

      {similarItems.length > 0 && (
        <div className="mt-6">
          <ContentRow title="You May Also Like" items={similarItems} />
        </div>
      )}
    </div>
  );
}
