# 02 — System Architecture

**[← Overview](01-overview.md) · [Next: API & Encryption →](03-api-encryption.md)**

---

## The Big Picture

Every request in this application flows through three layers:

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Browser (React + Shaka Player)                        │
│                                                                  │
│  • Renders pages                                                 │
│  • Calls /api/* on the SAME origin (no CORS issues)             │
│  • Shaka Player: DASH/HLS playback, DRM decryption              │
└──────────────────────────────┬───────────────────────────────────┘
                               │ /api/* calls
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Next.js Server (Vercel Mumbai bom1)                   │
│                                                                  │
│  • Injects SunNXT auth cookies into upstream requests           │
│  • Decrypts AES-encrypted API responses                         │
│  • Rewrites DASH/HLS manifests for correct segment routing      │
│  • Manages sessions: auto-login, refresh, device management     │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Authenticated HTTPS requests
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 3 — SunNXT Infrastructure                                 │
│                                                                  │
│  www.sunnxt.com          — Login, media URL resolver            │
│  pwaapi.sunnxt.com       — Content browse, search               │
│  livestream*.sunnxt.com  — Live TV DASH manifests               │
│  *-suntvvod*.akamaized.net — VOD segments (Akamai CDN)          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Why a Server Proxy?

The browser can't talk to SunNXT directly for two reasons:

### 1. CORS

SunNXT CDN servers (`*.sunnxt.com`, `*.akamaized.net`) do not include `Access-Control-Allow-Origin: *` in their responses. Browsers enforce this — if the header is missing, the request is blocked.

```
Browser → GET https://livestream2.sunnxt.com/...SunTVHDB_IN_index.mpd
                                                                    ↑
                          CORS ERROR: No 'Access-Control-Allow-Origin' header
```

Our proxy fetches this server-to-server (no CORS rules apply) and adds the header:

```
Browser → GET /api/stream-proxy?url=https%3A%2F%2Flivestream2...
             ↓ (same origin — no CORS issue)
        Next.js Server → GET https://livestream2.sunnxt.com/...
                       ← 200 OK + rewritten manifest
Browser ← 200 OK + Access-Control-Allow-Origin: *
```

### 2. Auth Cookies Are HttpOnly

SunNXT session cookies are `HttpOnly` — JavaScript cannot read them. Only the server can include them in upstream requests.

---

## Request Flow: Watching a Video

Here is the complete journey from clicking "Play" to video starting:

```
1. User clicks Play on content ID 82850
   │
   ▼
2. Browser → GET /api/media/82850
   │   Server fetches https://www.sunnxt.com/next/api/media/82850
   │   Decrypts AES response → extracts video URLs
   │   Detects geo-block / video-unavailable → returns error early
   │
   ▼
3. Browser receives { videos: [{ format: "dash", link: "https://movies1-suntvvod-dd.akamaized.net/.../82850_est_sd.mpd?..." }] }
   │
   ▼
4. Shaka Player: player.load("/api/stream-proxy?url=<encoded-mpd-url>")
   │   (manifest URL pre-proxied before passing to Shaka)
   │
   ▼
5. Browser → GET /api/stream-proxy?url=https%3A%2F%2Fmovies1-suntvvod-dd...82850_est_sd.mpd
   │   Server fetches MPD from Akamai CDN
   │   If 404 → returns 404 → Shaka tries next quality variant (_est_hd.mpd)
   │   If 200 → rewrites MPD: injects <BaseURL> pointing to original CDN dir
   │
   ▼
6. Shaka parses rewritten MPD, resolves segment URLs using <BaseURL>
   → https://movies1-suntvvod-dd.akamaized.net/.../video/avc1/4/init.mp4?hdntl=...
   │
   ▼
7. Shaka request filter intercepts CDN URL → rewrites to /api/stream-proxy?url=<segment-url>
   │
   ▼
8. Browser → GET /api/stream-proxy?url=<segment-url>
   Server fetches segment from Akamai with auth cookies, streams binary back
   │
   ▼
9. Shaka decodes and renders video ✓
```

---

## Request Flow: Login

```
App starts (server-side)
   │
   ▼
lib/sunnxt-session.ts: getSunnxtCookies()
   │
   ├─ cachedCookies present? → return (fast path)
   │
   └─ POST https://www.sunnxt.com/next/api/login
         payload = AES-CBC-encrypt({ userid, password })
         body = "payload=<base64>&version=1"
         │
         ├─ code 200 → cache cookies, return
         ├─ code 423 (device limit) → remove stale device → retry
         └─ error → throw
```

---

## Key Files and Their Roles

| File | Role |
|---|---|
| `lib/sunnxt-session.ts` | **The core engine.** Session cache, AES crypto, login, device management |
| `app/api/media/[contentId]/route.ts` | Resolves and decrypts stream URLs. Detects geo-block, video errors, triggers re-login |
| `app/api/stream-proxy/route.ts` | Proxies CDN requests. Rewrites DASH/HLS manifests. Adds CORS headers |
| `app/api/license/route.ts` | Proxies Widevine/PlayReady license requests |
| `app/player/[contentId]/page.tsx` | Shaka player setup. Format fallback loop. Quality fallback loop |
| `app/api/search/route.ts` | Proxies SunNXT search with optional type filter |
| `app/api/heartbeat/route.ts` | Sends Start/Stop watch events to SunNXT |

---

## Data Flow Diagram: The Proxy Pattern

```
        ┌──────────┐
        │  Browser │
        └────┬─────┘
             │ GET /api/stream-proxy?url=<encoded>
             ▼
        ┌─────────────────────────────────┐
        │  /api/stream-proxy              │
        │                                 │
        │  1. Validate domain (allowlist) │
        │  2. Fetch upstream with cookie  │
        │  3. If MPD → inject <BaseURL>   │
        │  4. If M3U8 → rewrite all URIs  │
        │  5. Add CORS headers            │
        │  6. Stream binary response      │
        └─────────────────────────────────┘
             │ GET https://*.sunnxt.com/...
             ▼
        ┌──────────────────┐
        │  SunNXT CDN      │
        │  (no CORS rules) │
        └──────────────────┘
```

---

## What Happens on Vercel vs Localhost?

| Environment | SunNXT sees... | Result |
|---|---|---|
| `localhost` (India) | Your home IP (Indian) | ✅ Works |
| Vercel (default — US) | Vercel US datacenter IP | ❌ Geo-blocked |
| Vercel (`bom1` — Mumbai) | Vercel Mumbai IP (Indian) | ✅ Works |

This is why `vercel.json` has `"regions": ["bom1"]`. See [doc 09](09-deployment.md) for details.

---

**[Next: API & Encryption →](03-api-encryption.md)**
