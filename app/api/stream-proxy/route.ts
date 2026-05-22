import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";
import { DEFAULT_HEADERS } from "@/lib/api";

const ALLOWED_HOSTS = [
  "livestream.sunnxt.com",
  "suntvvod1.sunnxt.com",
  "sunnxt.com",        // matches *.sunnxt.com
  "akamaized.net",     // checked together with suntvvod guard below
  "cloudfront.net",    // SunNXT subtitle CDN
];

// Inject a <BaseURL> into an MPD so Shaka resolves relative segment paths
// against the original upstream domain.  The request filter in the player then
// catches those resolved URLs (they contain the blocked domain) and re-routes
// them through this proxy.  This is safer than rewriting SegmentTemplate
// media= attributes because those contain $Number$/$Time$ tokens that Shaka
// must expand itself.
//
// When licenseUrl is provided, also injects <dashif:Laurl> into Widevine
// ContentProtection elements.  Shaka 5 uses TXml.findChildNS with namespace
// "https://dashif.org/CPS" to locate the Laurl element — it maps URIs to
// prefixes via xmlns: declarations in the parsed XML, then matches on
// "prefix:Laurl" tagNames.  Injecting the license URL directly into the
// manifest bypasses the drm.servers config propagation path that silently
// fails for Akamai DASH manifests that have a Widevine PSSH but no embedded
// LaURL element (Shaka error 6012 NO_LICENSE_SERVER_GIVEN).
function rewriteMpd(xml: string, manifestUrl: string, licenseUrl?: string): string {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);
  const baseUrlTag = `<BaseURL>${baseDir}</BaseURL>`;

  let result = xml;

  // Register the DASHIF CPS namespace on the MPD root so Shaka's
  // TXml.findChildNS can resolve "dashif:Laurl" child elements
  if (licenseUrl && !result.includes("https://dashif.org/CPS")) {
    result = result.replace(/(<MPD\b)/, '$1 xmlns:dashif="https://dashif.org/CPS"');
  }

  // Inject <BaseURL> right after the opening <MPD …> tag
  if (/<MPD[^>]*>/.test(result)) {
    result = result.replace(/(<MPD[^>]*>)/, `$1\n  ${baseUrlTag}`);
  } else {
    result = `${baseUrlTag}\n${result}`;
  }

  // Inject <dashif:Laurl> into Widevine ContentProtection elements so Shaka
  // finds the license server URI directly in the manifest (case-insensitive UUID)
  if (licenseUrl) {
    const widevineScheme = "urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed";
    const laUrlTag = `<dashif:Laurl>${licenseUrl}</dashif:Laurl>`;
    result = result.replace(
      new RegExp(`(<ContentProtection\\b[^>]*schemeIdUri="${widevineScheme}"[^>]*>)`, "gi"),
      `$1\n      ${laUrlTag}`
    );
    // Self-closing variant
    result = result.replace(
      new RegExp(`<ContentProtection(\\b[^>]*schemeIdUri="${widevineScheme}"[^>]*)\/>`, "gi"),
      `<ContentProtection$1>\n      ${laUrlTag}\n    </ContentProtection>`
    );
  }

  return result;
}

// Strip all ContentProtection elements from a DASH manifest.
// Used for potentially-unencrypted "format=dash" streams that have ContentProtection
// metadata in the MPD but carry clear (unencrypted) segments.  Removing the DRM
// signalling prevents Shaka from initiating a license request; if the segments are
// genuinely clear, playback succeeds without a subscription.
function stripContentProtection(xml: string): string {
  return xml
    .replace(/<ContentProtection\b[^>]*>[\s\S]*?<\/ContentProtection>/gi, "")
    .replace(/<ContentProtection\b[^>]*\/>/gi, "");
}

// Rewrite an HLS manifest: make every URI / segment line absolute+proxied.
// HLS doesn't have a template-variable system so full rewriting is safe.
function rewriteM3u8(text: string, manifestUrl: string): string {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);

  function resolveAndProxy(href: string): string {
    try {
      // Already absolute
      const abs = new URL(href).href;
      return `/api/stream-proxy?url=${encodeURIComponent(abs)}`;
    } catch {
      return `/api/stream-proxy?url=${encodeURIComponent(new URL(href, baseDir).href)}`;
    }
  }

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_, val) => `URI="${resolveAndProxy(val)}"`);
      }
      if (trimmed && !trimmed.startsWith("#")) {
        return resolveAndProxy(trimmed);
      }
      return line;
    })
    .join("\n");
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  // Optional license URL to embed in Widevine DASH manifests (fixes Shaka 6012).
  // Player passes a relative path (/api/license?url=...); make it absolute so
  // Shaka can use it directly without resolving against the manifest URL.
  const licenseUrlRaw = request.nextUrl.searchParams.get("licenseUrl");
  const licenseUrl = licenseUrlRaw
    ? licenseUrlRaw.startsWith("/")
      ? `${request.nextUrl.origin}${licenseUrlRaw}`
      : licenseUrlRaw
    : undefined;

  // stripDrm=true: remove ContentProtection from the MPD so Shaka never initiates
  // a license request.  Used for format=dash entries that carry clear (unencrypted)
  // segments but still include ContentProtection metadata in the manifest.
  const stripDrm = request.nextUrl.searchParams.get("stripDrm") === "true";

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  const allowed =
    ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`)) &&
    // For akamaized.net, only allow SunNXT VOD subdomains (e.g. movies2-suntvvod.akamaized.net)
    (hostname.endsWith(".akamaized.net") ? hostname.includes("suntvvod") : true);

  if (!allowed) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  try {
    const cookie = await getSunnxtCookies().catch(() => "");
    const upstream = await fetch(url, {
      headers: {
        ...DEFAULT_HEADERS,
        ...(cookie ? { cookie } : {}),
      },
    });

    if (!upstream.ok) {
      console.error(`stream-proxy: ${upstream.status} ${upstream.statusText} for ${url}`);
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const cacheControl = upstream.headers.get("cache-control") ?? "no-cache";

    const isMpd =
      contentType.includes("dash+xml") ||
      contentType.includes("mpd") ||
      url.split("?")[0].endsWith(".mpd");

    const isM3u8 =
      contentType.includes("mpegurl") ||
      url.split("?")[0].endsWith(".m3u8");

    if (isMpd) {
      const xml = await upstream.text();
      let rewritten = rewriteMpd(xml, url, licenseUrl);
      if (stripDrm) rewritten = stripContentProtection(rewritten);
      console.log(`stream-proxy: MPD rewrite for ${url.split("?")[0]}, injected BaseURL${licenseUrl ? " + Laurl" : ""}${stripDrm ? " + stripDRM" : ""}`);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "content-type": "application/dash+xml",
          "access-control-allow-origin": "*",
          "cache-control": cacheControl,
        },
      });
    }

    if (isM3u8) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, url);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "access-control-allow-origin": "*",
          "cache-control": cacheControl,
        },
      });
    }

    // Binary video segments — stream directly without buffering
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "access-control-allow-origin": "*",
        "cache-control": cacheControl,
      },
    });
  } catch (e) {
    console.error("Stream proxy error:", e);
    return new NextResponse("Proxy error", { status: 500 });
  }
}
