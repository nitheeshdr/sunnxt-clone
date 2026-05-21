# 03 — API Layer & Encryption

**[← Architecture](02-architecture.md) · [Next: Session & Auth →](04-session-auth.md)**

---

## Overview

SunNXT's API does not use plain JSON. Both the **login request payload** and most **API responses** are AES-encrypted. Understanding this is the foundation for everything else in the project.

---

## The Encryption Scheme

| Parameter | Value |
|---|---|
| Algorithm | AES-128-CBC |
| Key | 16-byte UTF-8 string (from traffic analysis) |
| IV | 16 zero bytes (`0x00 × 16`) |
| Padding | PKCS7 |
| Encoding | Base64 (encrypt output) / Hex (intermediate decrypt) |

> [!NOTE]
> AES-128-CBC is a symmetric cipher — the same key and IV are used for both encryption and decryption. SunNXT uses a **static key and IV** across all clients and all API calls.

---

## Encrypting the Login Payload

When logging in, you cannot send `{ "userid": "...", "password": "..." }` directly. SunNXT expects:

```
POST https://www.sunnxt.com/next/api/login
Content-Type: application/x-www-form-urlencoded

payload=<base64-aes-ciphertext>&version=1
```

### Step-by-Step

```typescript
import CryptoJS from "crypto-js";

const MEDIA_KEY = "A3s68aORSgHs$71P";

function encryptPayload(obj: Record<string, string>): string {
  // Step 1: Parse the key as UTF-8 bytes
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);

  // Step 2: Create an all-zero IV (16 bytes)
  const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");

  // Step 3: Encrypt
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(obj),   // plaintext
    keyWA,                 // key
    {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  // Step 4: Return Base64 string
  return encrypted.toString();
}

// Usage:
const payload = encryptPayload({ userid: "9894511531", password: "****" });
const body = `payload=${encodeURIComponent(payload)}&version=1`;
```

---

## Decrypting API Responses

Most API responses come back as:

```json
{ "response": "<base64-aes-ciphertext>" }
```

You need to decrypt `response` to get the actual data:

```typescript
function decrypt(ciphertext: string): unknown {
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);
  const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");

  // Step 1: Decrypt → gives a WordArray of bytes
  const bytes = CryptoJS.AES.decrypt(ciphertext, keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Step 2: Convert to hex string
  const hex = bytes.toString(CryptoJS.enc.Hex);

  // Step 3: Decode hex → UTF-8 string → parse JSON
  return JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
}
```

### Why Two Conversions?

CryptoJS's `.decrypt()` returns a `WordArray` (32-bit integers). Converting to hex first (`toString(CryptoJS.enc.Hex)`) gives raw bytes as a hex string. Then `Buffer.from(hex, "hex")` decodes those bytes to a binary Buffer, which `.toString("utf8")` converts to the final JSON string.

---

## SunNXT API Endpoints Reference

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `https://www.sunnxt.com/next/api/login` | Login — encrypted payload |
| `POST` | `https://www.sunnxt.com/next/api/logout` | Invalidate session |
| `GET` | `https://api.sunnxt.com/user/v4/removeDevice/` | Remove a registered device |

### Content

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `https://www.sunnxt.com/next/api/media/{id}` | Resolve stream URLs |
| `GET` | `https://pwaapi.sunnxt.com/content/v7/browse` | Browse carousels |
| `GET` | `https://pwaapi.sunnxt.com/content/v7/search` | Search |

### Media API Parameters

The media endpoint accepts several query parameters that influence the quality of returned stream URLs:

```
https://www.sunnxt.com/next/api/media/{contentId}
  ?playbackCounter=1
  &fields=contents,user/currentdata,images,generalInfo,subtitles,
          relatedCast,globalServiceName,globalServiceId,
          relatedMedia,videos,thumbnailSeekPreview
  &bw=5000000     ← request 5 Mbps quality (often ignored by server)
  &nid=4          ← network type: 4 = WiFi
```

---

## Request Headers

Every SunNXT API request must include these headers, or the server returns errors:

```typescript
const REQUIRED_HEADERS = {
  "x-myplex-platform": "browser",  // identifies the client type
  "x-ucv": "5",                    // client version
  "origin": "https://www.sunnxt.com",
  "referer": "https://www.sunnxt.com/",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...",
};
```

> [!WARNING]
> Without `x-myplex-platform` and `x-ucv`, SunNXT returns `{"code": 400}` even for valid credentials.

---

## What a Decrypted Media Response Looks Like

```json
{
  "code": 200,
  "results": [
    {
      "globalServiceName": "Ponniyin Selvan",
      "generalInfo": { "type": "movie", "title": "Ponniyin Selvan" },
      "videos": {
        "values": [
          {
            "format": "dash",
            "link": "https://movies2-suntvvod.akamaized.net/movies2/.../82850_est_hd.mpd?op=SUNNXT&cid=82850&userid=...&q=4&nid=4&hdntl=exp=...",
            "profile": "hd",
            "resolution": "1280x720"
          },
          {
            "format": "hls",
            "link": "https://movies2-suntvvod.akamaized.net/movies2/.../82850.m3u8?...",
            "profile": "sd"
          }
        ]
      }
    }
  ]
}
```

### Video Unavailable Response

Some content has no playable stream (e.g., promotions):

```json
{
  "videos": {
    "status": "ERR_UPSTREAM_SERVER_ERROR",
    "message": "Video is not available"
  }
}
```

Our media route detects `videos.status` without `videos.values` and returns HTTP 404 with `{ error: "video_unavailable" }` immediately — no wasteful re-login retry.

---

## How We Found the Encryption Key

The key was discovered by inspecting the SunNXT web app's minified JavaScript bundle with browser DevTools. The key string appears in a CryptoJS call in their client-side code.

> [!NOTE]
> This is a **client-side** key — it was already delivered to your browser inside SunNXT's own JavaScript. We are not breaking server-side security; we are using a key that SunNXT themselves ship to every browser that visits their site.

---

**[Next: Session & Auth →](04-session-auth.md)**
