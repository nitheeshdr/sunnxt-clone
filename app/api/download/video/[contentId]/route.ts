import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const CDN_HEADERS = {
  "user-agent": UA,
  origin: "https://www.sunnxt.com",
  referer: "https://www.sunnxt.com/",
};

interface SegmentInfo {
  initUrl: string;
  segmentUrls: string[];
  codec: string;
  bandwidth: number;
  width: number;
  height: number;
  durationSec: number;
}

// Parse a DASH MPD and return segment URLs for the highest-quality track of the
// given mimeType ("video" or "audio"). Handles SegmentTemplate + SegmentTimeline.
function parseMpdTrack(
  mpdXml: string,
  mpdUrl: string,
  mimeType: "video" | "audio"
): SegmentInfo | null {
  // Directory of the MPD (used to resolve relative BaseURL / segment paths)
  const mpdBaseDir = mpdUrl.split("?")[0].replace(/\/[^/]+$/, "/");
  // Query string carries Akamai auth tokens — attach to every segment URL
  const qs = mpdUrl.includes("?") ? mpdUrl.slice(mpdUrl.indexOf("?")) : "";

  // Grab all AdaptationSets whose mimeType starts with the target mimeType
  const adaptPattern = new RegExp(
    `<AdaptationSet\\b([^>]*)>([\\s\\S]*?)<\\/AdaptationSet>`,
    "gi"
  );

  let best: SegmentInfo | null = null;

  for (const adaptMatch of mpdXml.matchAll(adaptPattern)) {
    const adaptAttrs = adaptMatch[1];
    const adaptBody = adaptMatch[2];

    // Match on contentType OR mimeType attribute
    const mimeAttr =
      adaptAttrs.match(/mimeType="([^"]+)"/i)?.[1] ||
      adaptAttrs.match(/contentType="([^"]+)"/i)?.[1] ||
      adaptBody.match(/mimeType="([^"]+)"/i)?.[1] ||
      "";
    if (!mimeAttr.toLowerCase().startsWith(mimeType)) continue;

    // AdaptationSet-level BaseURL (optional)
    const adaptBaseUrl = (() => {
      const m = adaptBody.match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i);
      if (!m) return mpdBaseDir;
      return m[1].startsWith("http") ? m[1] : mpdBaseDir + m[1];
    })();

    // SegmentTemplate attributes (may be on AdaptationSet or Representation)
    const tmplBlock = adaptBody.match(/<SegmentTemplate\b([^>]*)>/i)?.[1] ?? "";
    const initAttr = tmplBlock.match(/initialization="([^"]+)"/i)?.[1] ?? "init.mp4";
    const mediaAttr = tmplBlock.match(/\bmedia="([^"]+)"/i)?.[1];
    const startNum = parseInt(tmplBlock.match(/startNumber="(\d+)"/i)?.[1] ?? "1");
    const timescale = parseInt(tmplBlock.match(/timescale="(\d+)"/i)?.[1] ?? "1");

    if (!mediaAttr) continue;

    // Segment count and total duration from SegmentTimeline
    const timelineBody = adaptBody.match(
      /<SegmentTimeline\b[^>]*>([\s\S]*?)<\/SegmentTimeline>/i
    )?.[1] ?? "";
    let segCount = 0;
    let totalTicks = 0;
    for (const sMatch of timelineBody.matchAll(/<S\b([^/]*)\/>/gi)) {
      const d = parseInt(sMatch[1].match(/\bd="(\d+)"/i)?.[1] ?? "0");
      const r = parseInt(sMatch[1].match(/\br="(\d+)"/i)?.[1] ?? "0");
      segCount += r + 1;
      totalTicks += d * (r + 1);
    }
    if (segCount === 0) continue;
    const durationSec = totalTicks / timescale;

    // Walk Representations and pick the highest bandwidth
    for (const repMatch of adaptBody.matchAll(/<Representation\b([^>]*)>/gi)) {
      const repAttrs = repMatch[1];
      const bw = parseInt(repAttrs.match(/bandwidth="(\d+)"/i)?.[1] ?? "0");
      if (best && bw <= best.bandwidth) continue;

      const codec = repAttrs.match(/codecs="([^"]+)"/i)?.[1] ?? "";
      const width = parseInt(repAttrs.match(/width="(\d+)"/i)?.[1] ?? "0");
      const height = parseInt(repAttrs.match(/height="(\d+)"/i)?.[1] ?? "0");
      const repId = repAttrs.match(/\bid="([^"]+)"/i)?.[1] ?? "";

      // Representation-level overrides for SegmentTemplate (rare but possible)
      const repTmplBlock = repMatch[0].match(/<SegmentTemplate\b([^>]*)>/i)?.[1] ?? tmplBlock;
      const repInitAttr = repTmplBlock.match(/initialization="([^"]+)"/i)?.[1] ?? initAttr;
      const repMediaAttr = repTmplBlock.match(/\bmedia="([^"]+)"/i)?.[1] ?? mediaAttr;
      const repStartNum = parseInt(repTmplBlock.match(/startNumber="(\d+)"/i)?.[1] ?? String(startNum));

      const expand = (tpl: string, num?: number) =>
        tpl
          .replace(/\$Bandwidth\$/g, String(bw))
          .replace(/\$RepresentationID\$/g, repId)
          .replace(/\$Number(?:%0(\d+)d)?\$/g, (_, pad) =>
            num === undefined ? "0" : pad ? String(num).padStart(parseInt(pad), "0") : String(num)
          );

      const resolve = (filename: string) =>
        filename.startsWith("http") ? filename + qs : adaptBaseUrl + filename + qs;

      const initUrl = resolve(expand(repInitAttr));
      const segmentUrls = Array.from({ length: segCount }, (_, i) =>
        resolve(expand(repMediaAttr, repStartNum + i))
      );

      best = { initUrl, segmentUrls, codec, bandwidth: bw, width, height, durationSec };
    }
  }

  return best;
}

async function fetchBytes(url: string, cookie?: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { ...CDN_HEADERS, ...(cookie ? { cookie } : {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url.split("?")[0].split("/").pop()}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;
  const wantStream = request.nextUrl.searchParams.get("stream") === "1";
  const track = (request.nextUrl.searchParams.get("track") ?? "video") as "video" | "audio";

  // --- Fetch media info via our own /api/media route (handles bypass/auth) ---
  const origin = new URL(request.url).origin;
  const mediaRes = await fetch(`${origin}/api/media/${contentId}`, { cache: "no-store" });
  if (!mediaRes.ok) {
    return NextResponse.json({ error: "Media API unavailable" }, { status: mediaRes.status });
  }
  const data = await mediaRes.json();

  if (!data.results?.[0]?.videos?.values?.length) {
    return NextResponse.json({ error: "No streams found for this content" }, { status: 404 });
  }

  type VideoEntry = { link: string; licenseUrl?: string; format: string };
  const videos: VideoEntry[] = data.results[0].videos.values;
  const title: string =
    data.results?.[0]?.generalInfo?.title ||
    data.results?.[0]?.globalServiceName ||
    data.results?.[0]?.title ||
    contentId;

  // Prefer unencrypted DASH, then encrypted DASH (downloads encrypted segments for research)
  const clearDash = videos.find((v) => v.format === "dash" && !v.licenseUrl);
  const encDash =
    videos.find((v) => v.format === "dash" && v.licenseUrl) ||
    videos.find((v) => v.format === "dash-cenc");
  const target = clearDash || encDash;

  if (!target) {
    return NextResponse.json(
      { error: "No DASH stream available — only HLS formats found" },
      { status: 404 }
    );
  }

  const isEncrypted = !clearDash;
  const safeName = title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 80);

  // --- Info-only response (no stream param) ---
  if (!wantStream) {
    return NextResponse.json({
      title,
      contentId,
      encrypted: isEncrypted,
      format: target.format,
      mpdUrl: target.link,
      licenseUrl: target.licenseUrl ?? null,
      videoDownloadUrl: `${origin}/api/download/video/${contentId}?stream=1&track=video`,
      audioDownloadUrl: `${origin}/api/download/video/${contentId}?stream=1&track=audio`,
      note: isEncrypted
        ? "Segments are Widevine CENC encrypted. Decryption requires a content key (obtainable via /api/license)."
        : "Clear DASH stream — segments are unencrypted and directly playable.",
    });
  }

  // --- Streaming download mode ---
  const cookie = await getSunnxtCookies().catch(() => "");

  // Fetch the MPD manifest directly from CDN (server-side, no CORS needed)
  const mpdRes = await fetch(target.link, {
    headers: { ...CDN_HEADERS, ...(cookie ? { cookie } : {}) },
    cache: "no-store",
  });
  if (!mpdRes.ok) {
    return NextResponse.json(
      { error: `Manifest fetch failed: HTTP ${mpdRes.status}` },
      { status: 502 }
    );
  }
  const mpdXml = await mpdRes.text();

  const segInfo = parseMpdTrack(mpdXml, target.link, track);
  if (!segInfo || segInfo.segmentUrls.length === 0) {
    return NextResponse.json(
      { error: `No ${track} segments found in manifest` },
      { status: 404 }
    );
  }

  const filename = `${safeName}_${track}_${segInfo.width > 0 ? `${segInfo.height}p` : "audio"}.mp4`;
  const durationMin = Math.round(segInfo.durationSec / 60);
  console.log(
    `Download: ${contentId} "${title}" — ${track} ${segInfo.width}x${segInfo.height} ` +
    `${Math.round(segInfo.bandwidth / 1000)}kbps · ${segInfo.segmentUrls.length} segs · ` +
    `~${durationMin}min · encrypted=${isEncrypted}`
  );

  // Stream segments: init.mp4 followed by all media segments.
  // The result is a valid fragmented MP4 (fMP4/CMAF) that most players can open.
  // For encrypted content the segments are CENC-encrypted and need the content key to play.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      // Init segment (moov / ftyp box — required for a valid fMP4)
      const initBytes = await fetchBytes(segInfo.initUrl, cookie);
      await writer.write(initBytes);

      // Media segments in order
      for (let i = 0; i < segInfo.segmentUrls.length; i++) {
        const segBytes = await fetchBytes(segInfo.segmentUrls[i], cookie);
        await writer.write(segBytes);
        // Log progress every 50 segments
        if ((i + 1) % 50 === 0) {
          console.log(`Download ${contentId}: ${i + 1}/${segInfo.segmentUrls.length} segments`);
        }
      }
      await writer.close();
      console.log(`Download ${contentId}: complete — ${segInfo.segmentUrls.length} segments`);
    } catch (e) {
      console.error(`Download ${contentId}: stream error —`, e);
      await writer.abort(e);
    }
  })();

  return new Response(readable as ReadableStream, {
    headers: {
      "content-type": "video/mp4",
      "content-disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "x-encrypted": String(isEncrypted),
      "x-segments": String(segInfo.segmentUrls.length),
      "x-duration-sec": String(Math.round(segInfo.durationSec)),
      "x-resolution": segInfo.width > 0 ? `${segInfo.width}x${segInfo.height}` : "audio",
    },
  });
}
