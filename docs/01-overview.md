# 01 — Project Overview

**[← Back to README](../README.md) · [Next: Architecture →](02-architecture.md)**

---

## What Is This Project?

This is a **reverse-engineered SunNXT clone** built with Next.js 15. It replicates the core functionality of the SunNXT OTT (Over-The-Top) streaming platform by:

- Calling SunNXT's real REST APIs
- Decrypting encrypted API responses using the AES-128 key discovered in their client-side JavaScript
- Proxying video streams through a Next.js server to bypass CORS restrictions
- Handling DRM (Widevine/PlayReady) license acquisition via a server-side proxy

This project was built as a **security research and learning tool** to understand how OTT platforms implement authentication, encryption, CDN delivery, and DRM — and to identify security weaknesses for responsible disclosure to SunNXT.

---

## Why Build a Custom Client?

### The Limitation of Browser-Only Testing

Most OTT security research stops at observing network traffic in Chrome DevTools. That gives you a one-shot view:
- You see individual requests and responses
- Encrypted responses appear as opaque blobs
- You can't test behavior across session states automatically
- You can't replay requests with modified parameters at scale

### What a Programmable Client Enables

By building a full working client that:
1. **Knows the encryption key** → can decrypt ALL responses programmatically
2. **Automates session lifecycle** → login, logout, re-login, device management
3. **Proxies any request** → observe CORS and CDN behavior from server side
4. **Integrates Shaka Player** → test DRM license flows end-to-end

...we gain the ability to do **systematic, repeatable security testing** that's impossible through a browser UI alone.

---

## What Security Issues Were Found?

During this project, **10 security vulnerabilities** were identified across the SunNXT platform:

| Severity | Count | Examples |
|---|---|---|
| **High** | 1 | Static AES key hardcoded in client JS |
| **Medium** | 5 | Device limit bypass, no rate limiting, geo-block bypass |
| **Low** | 2 | CDN token sharing, DRM JWT reuse window |
| **Informational** | 2 | Wrong HTTP status codes, session TTL gaps |

See [SECURITY_REPORT.md](../SECURITY_REPORT.md) for the full detailed report.

The most impactful finding: **the AES-128 encryption key used to "secure" login credentials is shipped to every browser** in SunNXT's client-side JavaScript. Anyone who opens Chrome DevTools can extract it in 30 seconds.

---

## What Can NOT Be Bypassed

Despite the vulnerabilities found, **premium content cannot be accessed without a valid subscription**:

- All premium streams are CENC-encrypted with Widevine or PlayReady
- Decryption keys live inside the browser's hardware-protected CDM (Content Decryption Module)
- The Nagravision DRM license server validates account credentials before issuing any keys
- No unencrypted stream variants were found for premium content

This is important: the security weaknesses are in the **auth and session layer**, not in the DRM content protection layer.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server-side API proxying + React UI |
| Language | TypeScript | Type safety across all API shapes |
| Styling | Tailwind CSS | Rapid UI development |
| Video Player | Shaka Player 5.x | DASH + HLS + Widevine/PlayReady DRM |
| Encryption | CryptoJS | AES-128-CBC matching SunNXT's implementation |
| Deployment | Vercel (Mumbai region) | Indian IP for geo-unrestricted API access |

---

## Project Structure

```
sunnxt-clone/
├── app/
│   ├── page.tsx                        # Homepage (carousels, trending)
│   ├── login/page.tsx                  # Two-step login flow
│   ├── player/[contentId]/page.tsx     # Video player + DRM
│   └── api/
│       ├── auth/login/route.ts         # Login proxy
│       ├── auth/status/route.ts        # Account lookup
│       ├── media/[contentId]/route.ts  # Stream URL resolver + normalizer
│       ├── stream-proxy/route.ts       # CORS-bypass CDN proxy
│       ├── license/route.ts            # DRM license proxy
│       └── heartbeat/route.ts          # Playback heartbeat
├── lib/
│   ├── api.ts                          # Browse/search/catalogue API
│   └── sunnxt-session.ts               # Server-side session management
├── docs/                               # This documentation
└── SECURITY_REPORT.md                  # Full security assessment by Nitheesh D R
```

---

## Recommended Learning Order

| Step | Document | What You Learn |
|---|---|---|
| 1 | [Architecture](02-architecture.md) | How 3 layers (browser, server, SunNXT) interact |
| 2 | [API Encryption](03-api-encryption.md) | AES-CBC, why static keys are dangerous |
| 3 | [Session & Auth](04-session-auth.md) | Login flow, cookies, device limits |
| 4 | [CORS Proxy](05-cors-proxy.md) | Browser security model, how proxies work |
| 5 | [Video Player](06-video-player.md) | DASH/HLS adaptive streaming |
| 6 | [DRM](07-drm.md) | Widevine, PlayReady, FairPlay — content protection |
| 7 | [Geo & Security](08-geo-security.md) | Geo-blocking, all security findings |
| 8 | [Vulnerability Deep Dive](10-vulnerability-deep-dive.md) | Each vulnerability explained in depth |
| 9 | [Web Security Fundamentals](12-api-security-fundamentals.md) | Core concepts behind all findings |
| 10 | [OWASP Mapping](13-owasp-top10-mapping.md) | How findings map to the OWASP Top 10 |

---

**[Next: Architecture →](02-architecture.md)**
