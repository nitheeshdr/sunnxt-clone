/**
 * CDN bypass implementation.
 *
 * Two independent mechanisms that together allow playback without a subscription:
 *
 * 1. UUID database — Maps content IDs to their internal CDN path UUID + CDN pattern.
 *    The UUID is the only piece of data not available from public endpoints.
 *    Populated from HAR analysis; grows as more sessions are observed.
 *
 * 2. hdntl token cache — Akamai wildcard token (acl=/*) that covers ALL CDN
 *    paths for 24 hours.  Extracted from any successful media API call and
 *    reused for subscription-blocked content.
 *
 * Chain: uuid + hdntl → MPD (403 without hdntl) + open segments (always 200)
 *        + modularLicense (no sub check) → full playback
 *
 * Token persistence:
 *   The hdntl token is saved to OS temp dir so it survives server restarts.
 *   On startup, the token is loaded from (in priority order):
 *     1. SUNNXT_HDNTL env var (set in .env.local — never committed)
 *     2. Disk cache at $TMPDIR/sunnxt-hdntl.json
 *   To refresh the token: update SUNNXT_HDNTL in .env.local and restart.
 *   The token is also automatically refreshed whenever a successful CDN
 *   response embeds a new hdntl value (e.g. via stream-proxy MPD processing).
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export interface VideoEntry {
  link: string;
  licenseUrl?: string;
  format: string;
  profile: string;
  resolution?: string;
}

// ---------------------------------------------------------------------------
// UUID database — maps contentId to CDN path info
//
// CDN patterns observed via HAR analysis:
//  movies1-suntvvod: /movies/{uuid}/{contentId}/hd/{contentId}_hd.mpd  (with quality subdir)
//  movies2-suntvvod: /movies2/{uuid}/{contentId}/{contentId}_hd.mpd     (no quality subdir)
//  DD variants always use no quality subdir regardless of main CDN pattern.
// ---------------------------------------------------------------------------
interface CdnEntry {
  uuid: string;
  // Base URL up to and including the /movies or /movies2 prefix
  // e.g. "https://movies1-suntvvod.akamaized.net/movies"
  cdnBase: string;
  // True when the standard CDN puts hd/sd in a subdirectory before the filename
  hasQualitySubdir: boolean;
}

const UUID_DB: Record<string, CdnEntry> = {
  "115249": {
    uuid: "f38231600b68e429d44dff546f96b29e",
    cdnBase: "https://movies1-suntvvod.akamaized.net/movies",
    hasQualitySubdir: true,
  },
  "82850": {
    uuid: "2a0b194b81d4071cf41ccfeb69d690e2",
    cdnBase: "https://movies1-suntvvod.akamaized.net/movies",
    hasQualitySubdir: true,
  },
  "251833": {
    uuid: "5bfb2a0404ec10ba52cb2d072c64cbf4",
    cdnBase: "https://movies2-suntvvod.akamaized.net/movies2",
    hasQualitySubdir: false,
  },
};

function registerContentEntry(contentId: string, entry: CdnEntry): void {
  UUID_DB[contentId] = entry;
}

function getContentEntry(contentId: string): CdnEntry | null {
  return UUID_DB[contentId] ?? null;
}

// ---------------------------------------------------------------------------
// hdntl wildcard token cache + persistence
// ---------------------------------------------------------------------------
interface HdntlCache {
  value: string;      // raw token string, e.g. "exp=...~acl=/*~hmac=..."
  expiresAt: number;  // milliseconds
}

let hdntlCache: HdntlCache | null = null;

const CACHE_FILE = join(tmpdir(), "sunnxt-hdntl.json");

function saveCacheToDisk(cache: HdntlCache): void {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf8");
  } catch { /* non-fatal */ }
}

function loadCacheFromDisk(): HdntlCache | null {
  try {
    const raw = readFileSync(CACHE_FILE, "utf8");
    const c = JSON.parse(raw) as HdntlCache;
    return Date.now() < c.expiresAt ? c : null;
  } catch { return null; }
}

function seedFromToken(token: string, source: string): boolean {
  const expM = token.match(/exp=(\d+)/);
  if (!expM) return false;
  const expiresAt = parseInt(expM[1]) * 1000;
  if (Date.now() >= expiresAt) return false;
  hdntlCache = { value: token, expiresAt };
  saveCacheToDisk(hdntlCache);
  console.log(`cdn-bypass: hdntl seeded from ${source}, expires ${new Date(expiresAt).toISOString()}`);
  return true;
}

// Seed on module load: env var first, then disk.
(function initHdntlCache() {
  const envToken = process.env.SUNNXT_HDNTL;
  if (envToken && seedFromToken(envToken, "SUNNXT_HDNTL env")) return;
  const disk = loadCacheFromDisk();
  if (disk) {
    hdntlCache = disk;
    console.log(`cdn-bypass: hdntl loaded from disk, expires ${new Date(disk.expiresAt).toISOString()}`);
  }
})();

/** Extract hdntl from any list of video entry URLs and cache it. */
export function extractAndCacheHdntl(entries: VideoEntry[]): void {
  for (const v of entries) {
    const m = v.link.match(/[?&]hdntl=([^&\s]+)/);
    if (!m) continue;
    const token = decodeURIComponent(m[1]);
    if (seedFromToken(token, "video entry URL")) return;
  }
}

/** Also accept plain URL strings (e.g. from a single licenseUrl or link). */
export function extractAndCacheHdntlFromUrl(url: string): void {
  extractAndCacheHdntl([{ link: url, format: "", profile: "" }]);
}

function getHdntl(): string | null {
  if (!hdntlCache || Date.now() >= hdntlCache.expiresAt) return null;
  return hdntlCache.value;
}

// ---------------------------------------------------------------------------
// Build synthetic video entries for subscription-blocked content
// ---------------------------------------------------------------------------

/**
 * Try to build CDN stream URLs for a content ID using the UUID database
 * and a cached hdntl token.
 *
 * Returns null if:
 * - The content UUID is not in the database, OR
 * - No valid hdntl token is cached (MPD manifests need hdntl; segments don't)
 */
export function buildBypassEntries(contentId: string): VideoEntry[] | null {
  const entry = getContentEntry(contentId);
  if (!entry) {
    console.log(`cdn-bypass: no UUID for content ${contentId}`);
    return null;
  }

  const hdntl = getHdntl();
  if (!hdntl) {
    console.log(`cdn-bypass: no valid hdntl token cached`);
    return null;
  }

  const { uuid, cdnBase, hasQualitySubdir } = entry;
  const tok = `hdntl=${encodeURIComponent(hdntl)}`;

  // Derive the DD (download/EST) CDN base from the main CDN base by inserting -dd
  // e.g. movies1-suntvvod → movies1-suntvvod-dd
  const cdnBaseDD = cdnBase.replace("-suntvvod.", "-suntvvod-dd.");

  const base    = `${cdnBase}/${uuid}/${contentId}`;
  const baseDD  = `${cdnBaseDD}/${uuid}/${contentId}`;

  // licenseUrl → pwaapi modularLicense (no subscription check — VULN-11).
  // Without this, the player strips ContentProtection from the MPD entirely,
  // which causes playback failure for Widevine-encrypted streams.
  const licenseUrl = `https://pwaapi.sunnxt.com/licenseproxy/v3/modularLicense/?content_id=${contentId}`;

  const hdLink = hasQualitySubdir
    ? `${base}/hd/${contentId}_hd.mpd?${tok}`
    : `${base}/${contentId}_hd.mpd?${tok}`;
  const sdLink = hasQualitySubdir
    ? `${base}/sd/${contentId}_sd.mpd?${tok}`
    : `${base}/${contentId}_sd.mpd?${tok}`;

  const entries: VideoEntry[] = [
    { format: "dash", profile: "High", link: hdLink,                                         licenseUrl },
    { format: "dash", profile: "Low",  link: sdLink,                                         licenseUrl },
    { format: "dash", profile: "High", link: `${baseDD}/${contentId}_est_hd.mpd?${tok}`,     licenseUrl },
    { format: "dash", profile: "Low",  link: `${baseDD}/${contentId}_est_sd.mpd?${tok}`,     licenseUrl },
  ];

  console.log(`cdn-bypass: built ${entries.length} bypass entries for content ${contentId} uuid=${uuid.slice(0, 8)}... cdnBase=${cdnBase}`);
  return entries;
}

/**
 * Scan a media API result and register any newly seen content UUIDs + CDN patterns
 * so they can be used for future bypass attempts.
 *
 * URL pattern (HAR-derived):
 *   movies1: https://movies1-suntvvod.akamaized.net/movies/{uuid}/{contentId}/hd/{id}_hd.mpd
 *   movies2: https://movies2-suntvvod.akamaized.net/movies2/{uuid}/{contentId}/{id}_hd.mpd
 */
export function learnUuidsFromEntries(contentId: string, entries: VideoEntry[]): void {
  if (UUID_DB[contentId]) return; // already known

  for (const v of entries) {
    // Skip DD (download) CDN — DD hosts don't use quality subdirs; learn from main CDN only
    if (v.link.includes("-suntvvod-dd.")) continue;

    // Capture: (cdnBase) / (uuid) / (contentId) / (optional quality subdir) / (filename)
    const m = v.link.match(
      /^(https:\/\/movies\d*-suntvvod\.akamaized\.net\/movies2?)\/([a-f0-9]{32})\/(\d+)\/(hd\/|sd\/)?[\w.-]+\.mpd/
    );
    if (!m || m[3] !== contentId) continue;

    const cdnBase = m[1];
    const uuid = m[2];
    const hasQualitySubdir = !!(m[4]); // group 4 is "hd/" or "sd/" or undefined

    registerContentEntry(contentId, { uuid, cdnBase, hasQualitySubdir });
    console.log(`cdn-bypass: learned uuid for content ${contentId}: ${uuid} cdnBase=${cdnBase} qualitySubdir=${hasQualitySubdir}`);
    return;
  }
}
