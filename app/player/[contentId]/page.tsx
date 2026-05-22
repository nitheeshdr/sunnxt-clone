"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { getImageUrl } from "@/lib/api";
import type { ContentItem } from "@/types";

interface VideoEntry {
  link: string;
  licenseUrl?: string;
  format: string;
  profile: string;
  resolution?: string;
}

interface Props {
  params: Promise<{ contentId: string }>;
}

export default function PlayerPage({ params }: Props) {
  const [contentId, setContentId] = useState("");
  const [item, setItem] = useState<ContentItem | null>(null);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeoBlocked, setIsGeoBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentVideoRef = useRef<VideoEntry | null>(null);
  const failedDrmLinksRef = useRef<Set<string>>(new Set());
  const failedFormatsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    params.then(({ contentId: id }) => {
      setContentId(id);
      fetchContent(id);
      loadAndPlay(id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  async function fetchContent(id: string) {
    try {
      const res = await fetch(`/api/content/${id}`);
      const data = await res.json();
      const results = data.results || [];
      if (results[0]) setItem(results[0]);
    } catch { /* non-critical — content info is supplementary */ }
  }

  async function loadAndPlay(id: string) {
    setMediaLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${id}`);
      const data = await res.json();

      if (data.error === "geo_blocked") {
        setIsGeoBlocked(true);
        setError(data.message || data.title || "This content is not available in your region.");
        return;
      }

      if (data.error === "login_required" || data.code === 401) {
        setError("login_required");
        return;
      }

      if (data.error === "video_unavailable") {
        setError(data.message || "Video is not available for this content.");
        return;
      }

      if (data.code !== 200 || !data.results?.[0]?.videos?.values?.length) {
        setError("Stream unavailable.");
        return;
      }

      // media API normalizes videos: resolves relative URLs, propagates licenseUrl
      const videos: VideoEntry[] = data.results[0].videos.values;

      // Priority:
      //  1. Unencrypted DASH (format=dash, no licenseUrl) — Akamai CDN, no DRM needed
      //  2. Widevine DASH (format=dash with licenseUrl) — requires Widevine CDM
      //  3. PlayReady DASH (dash-cenc) — Edge/Windows only
      //  4. HLS (any hls* format) — fallback
      //  5. First available entry
      // Skip any format whose stream URL already failed this session.
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const clearDash  = videos.find((v) => v.format === "dash" && !v.licenseUrl);
      const widevineDash = videos.find((v) => v.format === "dash" && v.licenseUrl);
      const cencDash = videos.find((v) => v.format === "dash-cenc" && v.licenseUrl);
      const hlsVideo = videos.find((v) => v.format?.includes("hls") && v.format !== "hls-fp-aapl");
      const ordered = [clearDash, widevineDash, cencDash, hlsVideo, videos[0]]
        .filter((v): v is VideoEntry => !!v)
        .filter((v, i, arr) => arr.findIndex((x) => x.link === v.link) === i)
        .filter((v) => !failedDrmLinksRef.current.has(v.link))
        .filter((v) => !failedFormatsRef.current.has(v.format))
        .filter((v) => isSafari || v.format !== "hls-fp-aapl");

      // Akamai DASH manifests include ContentProtection elements even for nominally
      // unencrypted streams — Shaka throws 6012 (NO_LICENSE_SERVER_GIVEN) if no
      // server is configured.  Pass the best available license URL as a fallback so
      // clearDash (and any other format without its own licenseUrl) can still load.
      const fallbackLicenseUrl =
        videos.find((v) => v.licenseUrl)?.licenseUrl ?? null;

      console.log("Player: formats available:", videos.map((v) => ({
        format: v.format,
        hasLicense: !!v.licenseUrl,
        url: v.link.split("?")[0].split("/").slice(-2).join("/"),
      })));

      let lastErr: unknown = null;
      for (const video of ordered) {
        try {
          console.log("Player: trying format", video.format, video.link.split("?")[0].split("/").pop());
          await startPlayback(video, id, fallbackLicenseUrl);
          return; // success
        } catch (e) {
          lastErr = e;
          console.warn("Player: format", video.format, "failed — trying next");
        }
      }
      throw lastErr ?? new Error("No playable stream found.");
    } catch (e: unknown) {
      if (e && typeof e === "object" && "category" in e) {
        const err = e as { code?: number; category?: number; data?: unknown[] };
        const d = Array.isArray(err.data) ? err.data : [];
        const isDrm = err.category === 6 || ((err.code ?? 0) >= 6000 && (err.code ?? 0) < 7000);
        console.error("Shaka load failed:", { code: err.code, category: err.category, url: d[0], httpStatus: d[1] });
        if (isDrm) {
          setError(`DRM error [${err.code}]: Could not obtain a license. The content may require a subscription or a different DRM system.`);
        } else {
          setError("Failed to load stream.");
        }
      } else {
        console.error("Load error:", e);
        setError("Failed to load stream.");
      }
    } finally {
      setMediaLoading(false);
    }
  }

  async function sendHeartbeat(id: string, action: "Start" | "Stop") {
    await fetch("/api/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentId: id, action }),
    }).catch(() => {});
  }

  function startHeartbeat(id: string) {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    sendHeartbeat(id, "Start");
    heartbeatRef.current = setInterval(() => sendHeartbeat(id, "Start"), 30_000);
  }

  function isSunnxtCdnUrl(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      // sunnxt.com subdomains (livestream, suntvvod1, etc.)
      if (hostname.endsWith(".sunnxt.com") || hostname === "sunnxt.com") return true;
      // Akamai CDN: movies1-suntvvod-dd.akamaized.net, movies2-suntvvod.akamaized.net …
      if (hostname.endsWith(".akamaized.net") && hostname.includes("suntvvod")) return true;
      return false;
    } catch { return false; }
  }

  async function startPlayback(video: VideoEntry, id: string, fallbackLicenseUrl?: string | null) {
    if (!videoRef.current) return;
    currentVideoRef.current = video;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shaka: any = await import("shaka-player");
    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
      setError("Your browser does not support this player.");
      return;
    }

    if (playerRef.current) await playerRef.current.destroy();

    const player = new shaka.Player();
    await player.attach(videoRef.current);
    playerRef.current = player;

    // Only surface errors that happen DURING playback (not during the load
    // phase — those are caught by the quality-fallback loop below).
    let loadingDone = false;
    player.addEventListener("error", (event: Event) => {
      if (!loadingDone) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (event as any).detail;
      const code: number = detail?.code ?? 0;
      // Shaka error category 6 = DRM errors
      const isDrm = detail?.category === 6 || (code >= 6000 && code < 7000);
      const errData = Array.isArray(detail?.data) ? detail.data : [];
      console.error("Player runtime error:", { code, category: detail?.category, message: detail?.message, url: errData[0], httpStatus: errData[1] });

      if (isDrm && currentVideoRef.current) {
        console.warn(`DRM [${code}] on ${currentVideoRef.current.format} — trying next format`);
        if (code === 6008) {
          // LICENSE_REQUEST_FAILED — license server rejected the challenge.
          // The hdnea token changes with each media refetch so tracking by URL
          // doesn't help; track by format so the entire format is skipped.
          failedFormatsRef.current.add(currentVideoRef.current.format);
        } else {
          failedDrmLinksRef.current.add(currentVideoRef.current.link);
        }
        loadAndPlay(id);
        return;
      }

      const msg = isDrm
        ? `DRM error [${code}]: ${detail?.message || "License request failed"}`
        : `Playback error [${code}]: ${detail?.message || "unknown"}`;
      setError(msg);
    });

    // Akamai EdgeAuth token (hdnea) from the manifest URL.
    // DASH segment URLs are resolved from the MPD <BaseURL> which is the directory
    // path only — query strings (including hdnea) are not inherited during relative
    // URL resolution per RFC 3986.  We re-inject it into every CDN segment request
    // so Akamai doesn't reject them with 403.
    let hdnea: string | null = null;
    try { hdnea = new URL(video.link).searchParams.get("hdnea"); } catch { /* no-op */ }

    // Proxy requests to CORS-blocked / auth-required SunNXT domains.
    // Skip already-proxied URLs to prevent double-proxying.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    player.getNetworkingEngine().registerRequestFilter((_type: any, request: any) => {
      const url: string = request.uris[0];
      if (url.includes("/api/stream-proxy")) return;
      if (isSunnxtCdnUrl(url)) {
        let cdnUrl = url;
        if (hdnea && !cdnUrl.includes("hdnea=")) {
          cdnUrl += (cdnUrl.includes("?") ? "&" : "?") + `hdnea=${encodeURIComponent(hdnea)}`;
        }
        request.uris[0] = `/api/stream-proxy?url=${encodeURIComponent(cdnUrl)}`;
      }
    });

    // For genuinely-clear DASH streams (no licenseUrl from API) we don't use the
    // fallback — using it triggers a license request → subscription rejection (6008).
    // Instead we strip ContentProtection from the MPD and attempt clear playback.
    const effectiveLicenseUrl = video.licenseUrl ?? (video.format !== "dash" ? fallbackLicenseUrl : null) ?? null;
    const proxyLicenseUrl = effectiveLicenseUrl
      ? `/api/license?url=${encodeURIComponent(effectiveLicenseUrl)}`
      : null;

    if (proxyLicenseUrl) {
      // Configure both Widevine and PlayReady regardless of format — DASH manifests
      // (including dash-cenc) typically list both ContentProtection schemes and
      // Chrome will pick Widevine even for dash-cenc content.  Omitting Widevine
      // here causes Shaka error 6012 on Chrome for any DASH manifest.
      player.configure({
        drm: {
          servers: {
            "com.widevine.alpha": proxyLicenseUrl,
            "com.microsoft.playready": proxyLicenseUrl,
          },
        },
      });
      console.log("Player: DRM configured for", video.format, "→ Widevine + PlayReady");
    }

    const fallbacks = buildQualityFallbacks(video.link);
    let loaded = false;
    for (const url of fallbacks) {
      try {
        // For Widevine DASH, pass the license URL so stream-proxy can inject
        // <dashif:Laurl> into the MPD — fixes Shaka error 6012 on Akamai streams.
        const licenseParam =
          video.format === "dash" && proxyLicenseUrl
            ? `&licenseUrl=${encodeURIComponent(proxyLicenseUrl)}`
            : "";
        // For unencrypted DASH (no licenseUrl), strip ContentProtection from the MPD
        // so Shaka never initiates a license request.  If segments are truly clear,
        // playback succeeds without any subscription.
        const stripDrmParam =
          video.format === "dash" && !video.licenseUrl ? "&stripDrm=true" : "";
        const loadUrl = isSunnxtCdnUrl(url)
          ? `/api/stream-proxy?url=${encodeURIComponent(url)}${licenseParam}${stripDrmParam}`
          : url;
        console.log("Player: trying", url.split("?")[0].split("/").pop());
        await player.load(loadUrl);
        loaded = true;
        break;
      } catch (e: unknown) {
        const httpStatus = (e as { data?: unknown[] })?.data?.[1];
        // Only continue fallback on 404 — other errors should surface immediately
        if (httpStatus !== 404) throw e;
        console.warn("Player: 404 for", url.split("?")[0].split("/").pop(), "— trying next quality");
      }
    }
    if (!loaded) throw new Error("All quality variants returned 404");
    loadingDone = true;
    videoRef.current.play();
    startHeartbeat(id);
  }

  function buildQualityFallbacks(originalUrl: string): string[] {
    const urls = [originalUrl];
    const base = originalUrl.split("?")[0];
    const qs = originalUrl.includes("?") ? originalUrl.slice(originalUrl.indexOf("?")) : "";

    // e.g. 82850_est_sd.mpd → try _est_hd, _hd, _sd (without est), plain
    const filename = base.split("/").pop() || "";
    const dir = base.slice(0, base.lastIndexOf("/") + 1);

    const variants = [
      filename.replace(/_est_sd\.mpd/, "_est_hd.mpd"),
      filename.replace(/_est_sd\.mpd/, "_hd.mpd"),
      filename.replace(/_est_sd\.mpd/, "_sd.mpd"),
      filename.replace(/_est_hd\.mpd/, "_hd.mpd"),
      filename.replace(/_est_4k\.mpd/, "_4k.mpd"),
    ].filter((v) => v && v !== filename);

    for (const v of variants) {
      const candidate = dir + v + qs;
      if (!urls.includes(candidate)) urls.push(candidate);
    }
    return urls;
  }

  const backdropUrl = item
    ? getImageUrl(item.images, "preview", "xxhdpi") || getImageUrl(item.images, "landscape", "xxhdpi")
    : null;
  const posterUrl = item
    ? getImageUrl(item.images, "poster", "xhdpi") || getImageUrl(item.images, "preview", "hdpi")
    : null;
  const title = item?.generalInfo?.title || item?.globalServiceName || item?.title || "";
  const description = item?.generalInfo?.description || item?.generalInfo?.briefDescription || "";
  const genres = item?.genreInfo?.values?.map((g) => g.title) || [];
  const cast = item?.relatedCast?.values || [];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Player area */}
      <div className="relative w-full bg-black" style={{ aspectRatio: "16/9", maxHeight: "80vh" }}>
        {/* Backdrop shown while loading */}
        {backdropUrl && (
          <Image
            src={backdropUrl}
            alt={title || "Content backdrop"}
            fill
            unoptimized
            priority
            className={`object-cover transition-opacity duration-500 ${mediaLoading ? "opacity-30" : "opacity-0"}`}
          />
        )}

        {/* Video element — always mounted so shaka can attach */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full"
          controls
          playsInline
          onPause={() => {
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;
            }
            sendHeartbeat(contentId, "Stop");
          }}
          onEnded={() => {
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;
            }
            sendHeartbeat(contentId, "Stop");
          }}
        />

        {/* Loading spinner overlay */}
        {mediaLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 border-4 border-white/20 border-t-red-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Error overlay */}
        {error && !mediaLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
            {error === "login_required" ? (
              <>
                <svg className="w-14 h-14 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="text-white font-bold text-lg">Login Required</p>
                <p className="text-gray-400 text-sm max-w-xs">Sign in with your SunNXT account to watch this content.</p>
                <a
                  href={`/login?next=/player/${contentId}`}
                  className="mt-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-8 py-2.5 rounded-full transition-colors"
                >
                  Sign In
                </a>
                <button onClick={() => history.back()} className="text-gray-500 text-xs hover:text-gray-300 mt-1">
                  Go Back
                </button>
              </>
            ) : isGeoBlocked ? (
              <>
                <div className="text-5xl">🌍</div>
                <p className="text-white font-bold text-base sm:text-lg">International Roaming Expired</p>
                <p className="text-gray-300 text-xs sm:text-sm max-w-sm leading-relaxed">{error}</p>
                <button
                  onClick={() => history.back()}
                  className="mt-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-6 py-2 rounded transition-colors"
                >
                  Go Back
                </button>
              </>
            ) : (
              <>
                <p className="text-yellow-400 text-sm max-w-md">{error}</p>
                <button
                  onClick={() => { failedDrmLinksRef.current.clear(); failedFormatsRef.current.clear(); loadAndPlay(contentId); }}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-6 py-2 rounded transition-colors"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        )}

        {/* Back button */}
        <div className="absolute top-4 left-4 z-10">
          <button
            onClick={() => history.back()}
            className="bg-black/50 hover:bg-black/80 text-white p-2 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content info */}
      <div className="max-w-350 mx-auto px-6 sm:px-10 py-8">
        <div className="flex gap-6">
          {posterUrl && (
            <div className="shrink-0 hidden sm:block w-32">
              <div className="relative aspect-2/3 rounded-lg overflow-hidden">
                <Image src={posterUrl} alt={title || "Poster"} fill unoptimized className="object-cover" />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-white mb-2">{title}</h2>

            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-3">
              {item?.releaseDate && <span>{new Date(item.releaseDate).getFullYear()}</span>}
              {item?.generalInfo?.type && (
                <span className="bg-gray-800 px-2 py-0.5 rounded text-xs uppercase">
                  {item.generalInfo.type}
                </span>
              )}
              {genres.length > 0 && <span>{genres.join(" • ")}</span>}
              {item?.generalInfo?.isDolby && (
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">DOLBY</span>
              )}
            </div>

            {description && (
              <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-2xl">{description}</p>
            )}

            {item?.subtitles?.values?.length ? (
              <div className="mb-4">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Subtitles</p>
                <div className="flex flex-wrap gap-2">
                  {item.subtitles.values.map((sub) => (
                    <span key={sub.language} className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded">
                      {sub.language}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {cast.length > 0 && (
          <div className="mt-8">
            <h3 className="text-white font-bold text-base mb-4">Cast</h3>
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
    </div>
  );
}
