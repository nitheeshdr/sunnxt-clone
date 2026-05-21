# SunNXT Clone

A full-featured Next.js web client that replicates the SunNXT streaming experience using the real `pwaapi.sunnxt.com` / `www.sunnxt.com` APIs. Built for personal/educational use — no mock data, no static fixtures.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [API Layer](#api-layer)
5. [Session Management & Auto-Login](#session-management--auto-login)
6. [Stream Proxy & CORS Bypass](#stream-proxy--cors-bypass)
7. [Video Playback Pipeline](#video-playback-pipeline)
8. [DRM Handling](#drm-handling)
9. [Geo-Block & Roaming Detection](#geo-block--roaming-detection)
10. [Security Findings (Research Notes)](#security-findings-research-notes)
11. [Setup](#setup)
12. [Environment Variables](#environment-variables)
13. [API Reference](#api-reference)

---

## Features

- Home feed with carousels (Trending, New Releases, Live TV, Movies, TV Shows)
- Search with content-type filters (Movies, TV Shows, Comedy, Music, Short Films, Live TV)
- Detail pages with cast, genres, subtitles, and related content
- Video player with MPEG-DASH + HLS adaptive streaming via Shaka Player
- Live TV channels with real-time stream
- Auto login / session refresh with device-limit handling
- Geo-block detection with clear user-facing error
- Heartbeat API to track watch session

---

## Architecture

```
Browser (Next.js Client)
        │
        │  /api/*  (Next.js Route Handlers — server-side only)
        ▼
┌──────────────────────────────────────────────────────┐
│                   Next.js App Router                  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  /api/media │  │ /api/stream- │  │ /api/search│  │
│  │  [contentId]│  │    proxy     │  │            │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                │                │          │
│  ┌──────▼──────────────────────────────────▼──────┐  │
│  │           lib/sunnxt-session.ts               │  │
│  │   (AES encrypt/decrypt · cookie cache ·       │  │
│  │    auto-login · device slot management)       │  │
│  └───────────────────────┬───────────────────────┘  │
└──────────────────────────┼───────────────────────────┘
                           │ HTTPS
                           ▼
              ┌────────────────────────┐
              │   www.sunnxt.com       │
              │   pwaapi.sunnxt.com    │
              │   (SunNXT API origin)  │
              └────────────┬───────────┘
                           │ CDN segment URLs (Akamai / direct)
                           ▼
              ┌────────────────────────┐
              │  livestream*.sunnxt.com│
              │  *-suntvvod*.akamaized │
              │  (media CDN)           │
              └────────────────────────┘
```

**Key design principle:** The browser never talks directly to SunNXT APIs or CDN. All requests are proxied through Next.js route handlers which inject auth cookies server-side, keeping credentials out of the browser entirely.

---

## Directory Structure

```
app/
  page.tsx                   # Home feed — carousel groups
  layout.tsx                 # Root layout, Navbar
  search/page.tsx            # Search with type filters
  [slug]/detail/[serviceId]/ # Content detail page (by serviceId)
  detail/[id]/               # Content detail page (by content ID)
  player/[contentId]/        # Video player page
  api/
    content/[id]/            # Content metadata proxy
    media/[contentId]/       # Media/stream URL resolver
    search/                  # Search proxy
    heartbeat/               # Playback heartbeat
    stream-proxy/            # CDN CORS proxy + manifest rewriter
    license/                 # Widevine/PlayReady license proxy
    auth/clear-session/      # Force re-login endpoint (debug)

components/
  Navbar.tsx
  HeroBanner.tsx
  CarouselSection.tsx
  ContentCard.tsx
  ContentRow.tsx

lib/
  api.ts                     # Client-side API helpers + image URL builder
  sunnxt-session.ts          # Server-side session: login, cookie cache, device mgmt

types/
  index.ts                   # Shared TypeScript types (ContentItem, etc.)
```

---

## API Layer

### SunNXT API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `POST /next/api/login` | Login with encrypted payload |
| `POST /next/api/logout` | Invalidate session |
| `GET /next/api/media/{id}` | Resolve stream URLs for a content item |
| `GET /next/api/content/{id}` | Content metadata |
| `GET /pwaapi.sunnxt.com/content/v4/...` | Search, browse, carousel groups |
| `GET /api/sunnxt.com/user/v4/removeDevice/` | Remove a registered device |

### Carousel Group IDs

| Group | API key |
|---|---|
| Home trending/featured | `portalHome` |
| Movies | `portalMovies` |
| TV Shows | `portalTvShows` |
| Live channels | `liveChannels` |

---

## Session Management & Auto-Login

File: [`lib/sunnxt-session.ts`](lib/sunnxt-session.ts)

### Flow

```
getSunnxtCookies()
  │
  ├─ cachedCookies set? → return immediately
  │
  └─ loginPromise in-flight? → await it (deduplicates concurrent calls)
       │
       └─ doLogin()
            │
            ├─ attemptLogin() → POST /next/api/login with AES-encrypted payload
            │
            ├─ code 200 → cache cookies, return
            │
            └─ code 423 (device limit reached)
                 │
                 ├─ fetch ManageDevices webview HTML
                 ├─ extract deviceId values via regex
                 ├─ call removeDevice API to free a slot
                 └─ retry attemptLogin()
```

### Login Payload Encryption

SunNXT's login API requires an AES-128-CBC encrypted JSON payload:

```typescript
// Key: 16-byte UTF-8 string (from API traffic analysis)
// IV:  all-zero 16 bytes
// Mode: CBC, PKCS7 padding
// Encoding: Base64

const encrypted = CryptoJS.AES.encrypt(
  JSON.stringify({ userid, password }),
  CryptoJS.enc.Utf8.parse(MEDIA_KEY),
  { iv: CryptoJS.enc.Hex.parse("00000000000000000000000000000000"),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7 }
).toString();
```

### Response Decryption

API responses (media URLs, user info) are returned as Base64-encoded AES ciphertext using the same key/IV. The `decrypt()` function in both `sunnxt-session.ts` and the media route handler decodes them.

### Session Cache

`cachedCookies` is a module-level string — persists across requests within the same Node.js process. On 401/403 responses, `invalidateSession()` clears it. On geo/roaming errors, `forceRelogin()` calls the SunNXT logout endpoint first to force a fresh session from the current IP.

---

## Stream Proxy & CORS Bypass

File: [`app/api/stream-proxy/route.ts`](app/api/stream-proxy/route.ts)

SunNXT's media CDN does not allow cross-origin requests from arbitrary domains. All CDN requests are proxied through `/api/stream-proxy?url=<encoded-url>`.

### Allowed Domains

```
*.sunnxt.com           (livestream2.sunnxt.com, suntvvod1.sunnxt.com, etc.)
*-suntvvod*.akamaized.net  (movies1-suntvvod-dd.akamaized.net, movies2-suntvvod.akamaized.net, etc.)
```

### DASH Manifest Rewriting (MPD)

When the proxy fetches an `.mpd` manifest, it injects a `<BaseURL>` element pointing to the original upstream directory:

```xml
<!-- Before proxy -->
<MPD ...>
  <Period>
    <AdaptationSet>
      <SegmentTemplate media="video/$Number$.mp4" />
    </AdaptationSet>
  </Period>
</MPD>

<!-- After rewriting -->
<MPD ...>
  <BaseURL>https://movies2-suntvvod.akamaized.net/.../</BaseURL>
  ...
</MPD>
```

This allows Shaka Player to resolve relative segment paths back to the original CDN domain. The player's `registerRequestFilter` then intercepts those resolved CDN URLs and routes them back through the proxy.

### HLS Manifest Rewriting (M3U8)

For HLS streams, every URI line and `URI=` attribute in the manifest is rewritten to an absolute proxied URL:

```
# Before
video_1280x720/seg001.ts
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"

# After
/api/stream-proxy?url=https%3A%2F%2F...%2Fvideo_1280x720%2Fseg001.ts
/api/stream-proxy?url=https%3A%2F%2F...%2Fkey.bin
```

### Request Filter (Player Side)

In the player, a Shaka `registerRequestFilter` intercepts all outgoing requests:

```typescript
player.getNetworkingEngine().registerRequestFilter((_type, request) => {
  const url = request.uris[0];
  if (url.includes("/api/stream-proxy")) return; // skip already-proxied
  if (isSunnxtCdnUrl(url)) {
    request.uris[0] = `/api/stream-proxy?url=${encodeURIComponent(url)}`;
  }
});
```

The manifest URL itself is also pre-proxied before being passed to `player.load()`, ensuring the very first request (manifest fetch) is routed through the proxy before Shaka's internal filter processes it.

---

## Video Playback Pipeline

File: [`app/player/[contentId]/page.tsx`](app/player/[contentId]/page.tsx)

```
loadAndPlay(contentId)
    │
    ├─ GET /api/media/{id}
    │     │
    │     ├─ geo_blocked? → show roaming error UI, stop
    │     ├─ video_unavailable? → show "not available" message, stop
    │     └─ extract videos.values[]
    │
    ├─ Build ordered format list (deduplicated by URL):
    │     [clearDash, cencDash, hlsVideo, videos[0]]
    │
    └─ For each format:
          startPlayback(video)
              │
              ├─ Destroy existing Shaka instance
              ├─ Register request filter (CDN proxy)
              ├─ Configure DRM if licenseUrl present
              ├─ buildQualityFallbacks(video.link)
              │     └─ [original, _est_sd→_est_hd, _est_sd→_hd, _est_hd→_hd, _est_4k→_4k]
              │
              └─ For each quality URL:
                    player.load(proxied_url)
                    └─ 404? → try next quality
                    └─ other error? → throw (triggers format fallback)
```

### Quality Fallback

SunNXT Akamai CDN often returns 404 for SD (`_est_sd.mpd`) manifests. The `buildQualityFallbacks()` function generates variant filenames to try:

```
82850_est_sd.mpd  →  82850_est_hd.mpd  →  82850_hd.mpd  →  82850_sd.mpd
```

Only 404 responses trigger the next fallback; any other error (network, DRM, parse) surfaces immediately to prevent silent failures.

### Format Fallback

When all DASH quality variants return 404, the player automatically falls back to the HLS stream (if one was returned by the media API). The `loadingDone` flag prevents the error overlay from flashing during fallback attempts.

---

## DRM Handling

File: [`app/api/license/route.ts`](app/api/license/route.ts)

Some SunNXT content uses Widevine/PlayReady DRM (CENC-encrypted DASH). License server requests require the same SunNXT session cookie. The license proxy:

1. Receives the Widevine challenge from Shaka (binary `POST` body)
2. Forwards it to the SunNXT license server URL with auth cookies injected
3. Returns the license response binary to Shaka

```
Shaka → POST /api/license?url=<encoded-license-url>  (with Widevine challenge)
           ↓
        Next.js proxy → POST <sunnxt-license-url>  (with cookie header)
           ↓
        License binary → Shaka → decrypt segments
```

---

## Geo-Block & Roaming Detection

### Detection

SunNXT returns a roaming/geo-block error when an account flagged for Indian IP access is used from abroad, or when the "International Roaming" add-on has expired:

```json
{
  "blocked_reason": "roaming_expired_30",
  "home_country": "IN",
  "notify_type": "error_notify"
}
```

The media route checks for `blocked_reason` or `notify_type === "error_notify"` in the API response.

### Resolution

On first detection, the server attempts `forceRelogin()`:
1. Calls `POST /next/api/logout` to invalidate the existing session
2. Logs in fresh from the server's current IP
3. SunNXT re-evaluates the IP on fresh login and clears the flag if the IP is Indian

If still blocked after fresh login, the API returns HTTP 451 with `error: "geo_blocked"` and the player shows:

> 🌍 International Roaming Expired

### Video Unavailable

When a content item exists in the catalogue but has no playable stream (e.g. promotional content), SunNXT returns:

```json
{ "videos": { "status": "ERR_UPSTREAM_SERVER_ERROR", "message": "Video is not available" } }
```

The media route detects `videos.status` present without `videos.values` and returns `{ error: "video_unavailable" }` immediately, skipping the re-login retry cycle.

---

## Security Findings (Research Notes)

These findings were identified through traffic analysis during development. Documented here for reference.

### 1. AES Key Reuse Across Endpoints

The same 16-byte key is used to encrypt both the login request payload and decrypt all API responses (media URLs, user data). A single key capture via MITM or client-side decompilation exposes both directions.

### 2. Static IV

The AES initialization vector is 16 zero bytes (`0x00 * 16`) across all operations. Combined with CBC mode, identical plaintext blocks at the start of different messages will produce identical ciphertext blocks, which is exploitable via chosen-plaintext analysis.

### 3. Token Bound to Quality Parameter

CDN manifest URLs include `q=<level>` and `nid=<type>` parameters in signed tokens. Live streams use `q=3`, while VOD content defaults to `q=4`. Some `q=4` manifests return 404 (file not uploaded), but the token doesn't prevent requesting other `q` values — only CDN file existence limits playback.

### 4. Device Registration Not Verified

The device-limit bypass works by:
1. Fetching the Manage Devices webview HTML (no server-side auth check on the HTML endpoint)
2. Extracting `deviceId` values from `removeDevice` links with a simple regex
3. Calling the `removeDevice` API with the extracted token

No CSRF token or secondary confirmation is required to remove a device.

### 5. Session Cookie Longevity

SunNXT session cookies do not appear to have a short TTL. A cached `sessionid` cookie remains valid for extended periods, enabling persistent access without repeated credential use.

---

## Setup

### Prerequisites

- Node.js 20+
- A SunNXT account with an active subscription

### Install

```bash
git clone https://github.com/nitheeshdr/sunnxt-clone.git
cd sunnxt-clone
npm install
```

### Configure

```bash
cp .env.local.example .env.local
# Edit .env.local and fill in your credentials
```

### Run

```bash
npm run dev
# Open http://localhost:3000
```

### Force Session Reset

If playback fails with an auth error, hit:

```
http://localhost:3000/api/auth/clear-session
```

This calls SunNXT logout and triggers a fresh login on the next request.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUNNXT_USERID` | Yes | SunNXT login — phone number or email |
| `SUNNXT_PASSWORD` | Yes | SunNXT account password |

Create `.env.local` (never committed — covered by `.gitignore`):

```env
SUNNXT_USERID=your_phone_or_email
SUNNXT_PASSWORD=your_password
```

---

## API Reference

### `GET /api/media/[contentId]`

Resolves stream URLs for a content item. Handles decryption, session refresh, roaming detection, and video-unavailable detection.

**Response (success):**
```json
{
  "code": 200,
  "results": [{
    "videos": {
      "values": [
        { "format": "dash", "link": "https://...mpd?...", "profile": "hd" },
        { "format": "hls",  "link": "https://...m3u8?...", "profile": "sd" }
      ]
    }
  }]
}
```

**Response (geo-blocked):** HTTP 451
```json
{ "code": 451, "error": "geo_blocked", "title": "...", "message": "..." }
```

**Response (no video):** HTTP 404
```json
{ "code": 404, "error": "video_unavailable", "message": "Video is not available" }
```

---

### `GET /api/stream-proxy?url=<encoded-url>`

Proxies a SunNXT CDN request with auth cookies. Rewrites DASH/HLS manifests for correct segment URL resolution.

**Allowed:** `*.sunnxt.com`, `*-suntvvod*.akamaized.net`

---

### `POST /api/license?url=<encoded-license-url>`

Proxies a Widevine/PlayReady license request with auth cookies injected.

---

### `POST /api/heartbeat`

```json
{ "contentId": "123456", "action": "Start" | "Stop" }
```

Sends a playback heartbeat to SunNXT. Called on play start (every 30 s) and on pause/end.

---

### `GET /api/auth/clear-session`

Forces logout + re-login. Returns `{ success: true }` on success.
