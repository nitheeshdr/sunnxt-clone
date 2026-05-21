# 01 — Project Overview

**[← Back to README](../README.md) · [Next: Architecture →](02-architecture.md)**

---

## What Is This Project?

SunNXT Clone is a fully functional web streaming client that communicates with the real SunNXT APIs. Unlike tutorial projects that use fake data, every piece of content — thumbnails, stream URLs, cast info, subtitles — comes from live SunNXT servers.

This was built to answer a single question: **"How does a real OTT platform actually work?"**

---

## What Problems Does It Solve?

Building this project required solving five non-trivial engineering problems:

| Problem | What Makes It Hard | Our Solution |
|---|---|---|
| **API is undocumented** | No public docs, no SDK | Network traffic analysis |
| **Responses are encrypted** | JSON payloads are AES ciphertext | Reverse-engineer the key and mode |
| **CDN is CORS-locked** | Browsers can't fetch segments directly | Server-side proxy with auth injection |
| **Sessions expire / geo-block** | India-only content, roaming restrictions | Auto re-login from Mumbai server |
| **DRM-encrypted content** | Widevine license requires server auth | License proxy forwarding |

---

## Scope and Boundaries

### What This Project Covers

- Full home feed with carousels from real SunNXT editorial data
- Search with content-type filtering
- Detail pages with cast, subtitles, genres
- Live TV and VOD streaming (DASH + HLS)
- DRM-encrypted stream support (Widevine / PlayReady)
- Auto-login, device management, session refresh
- Geo-block detection and recovery

### What This Project Does NOT Cover

- Offline downloads
- User profile management
- Subscription / payment flows
- Push notifications
- Watchlist syncing (read-only display only)

---

## Why Next.js?

Three reasons:

1. **Server-side Route Handlers** — We need a server layer to inject auth cookies into CDN requests. Browsers can't do this (CORS). Next.js API routes give us this for free.

2. **No separate backend** — A single `npm run dev` runs both the React UI and the API proxy layer. No separate Express/FastAPI server to manage.

3. **Vercel deployment** — One-command deploy with region control (`bom1` = Mumbai), which is critical for SunNXT's geo-check.

---

## Why Shaka Player?

SunNXT uses MPEG-DASH for both live TV and VOD. Native `<video>` elements cannot play DASH. Shaka Player is Google's open-source DASH/HLS player with:

- Built-in Widevine + PlayReady DRM via EME
- `registerRequestFilter` — intercept every segment request to route through our proxy
- Robust 404 and error handling

---

## Key Concepts to Understand Before Going Deeper

Before reading the other docs, make sure you're familiar with:

- **HTTP cookies and session tokens** — how websites stay logged in
- **CORS (Cross-Origin Resource Sharing)** — why browsers block direct CDN access
- **AES encryption** — symmetric block cipher (we use CBC mode)
- **MPEG-DASH** — adaptive bitrate video format using XML manifests (`.mpd` files)
- **HLS** — Apple's streaming format using text playlists (`.m3u8` files)
- **Widevine DRM** — Google's system for preventing unauthorised video copying

You don't need to be an expert — each subsequent doc explains these as they come up.

---

## Reading Order

```
01-overview.md          ← you are here
02-architecture.md      ← how the pieces connect
03-api-encryption.md    ← how SunNXT's API works
04-session-auth.md      ← login, cookies, device management
05-cors-proxy.md        ← stream proxy, manifest rewriting
06-video-player.md      ← Shaka player pipeline
07-drm.md               ← DRM license proxy
08-geo-security.md      ← geo-block + security findings
09-deployment.md        ← deploying to Vercel
```

---

**[Next: System Architecture →](02-architecture.md)**
