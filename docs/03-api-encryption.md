# 03 — API Layer & Encryption

**[← Architecture](02-architecture.md) · [Next: Session & Auth →](04-session-auth.md)**

---

## Overview

SunNXT does not use plain JSON. Both the **login request payload** and most **API responses** are AES-encrypted. Understanding this encryption scheme is the foundation for everything else in this project — and it's also the source of VULN-01 and VULN-02 (see [Security Report](../SECURITY_REPORT.md)).

---

## The Encryption Scheme

| Parameter | Value | Security Note |
|---|---|---|
| Algorithm | AES-128-CBC | Standard symmetric cipher |
| Key | `A3s68aORSgHs$71P` (16 bytes UTF-8) | **HARDCODED in client JS — Critical flaw** |
| IV | 16 zero bytes (`0x00 × 16`) | **Static IV — weakens CBC security** |
| Padding | PKCS7 | Standard |
| Input encoding | UTF-8 JSON string | |
| Output encoding | Base64 | |

---

## Understanding AES-CBC (With Diagrams)

AES (Advanced Encryption Standard) in CBC (Cipher Block Chaining) mode works by splitting plaintext into 16-byte blocks and chaining them:

```
Plaintext:  [Block 1]  [Block 2]  [Block 3]
                ↓          ↓          ↓
            XOR with IV  XOR with   XOR with
                ↓        prev C1     prev C2
            AES(Key)   AES(Key)   AES(Key)
                ↓          ↓          ↓
Ciphertext: [  C1   ]  [  C2   ]  [  C3   ]
```

**Why IV matters:**
The IV (Initialization Vector) is XORed with the first plaintext block before encryption. If the IV is always the same (all zeros in SunNXT's case):
- Same plaintext → same C1 every single time
- An attacker who captures multiple login requests can immediately tell if two users have the same password (identical C1 values)
- This is called **deterministic encryption** and is a known weakness

---

## Encrypting the Login Payload

When logging in, you cannot send credentials in plain JSON. SunNXT expects:

```
POST https://www.sunnxt.com/next/api/login
Content-Type: application/x-www-form-urlencoded

payload=<base64-aes-ciphertext>&version=1
```

### Step-by-Step Implementation

```typescript
import CryptoJS from "crypto-js";

const MEDIA_KEY = "A3s68aORSgHs$71P";  // extracted from SunNXT's client JS

function encryptPayload(obj: Record<string, string>): string {
  // Step 1: Parse the key as UTF-8 bytes (gives a WordArray)
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);

  // Step 2: All-zero IV — 32 hex chars = 16 bytes
  const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");

  // Step 3: Encrypt JSON string with AES-128-CBC + PKCS7 padding
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(obj),  // e.g. '{"userid":"9876543210","password":"****"}'
    keyWA,
    {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  // Step 4: Return Base64 string (e.g. "Uk3pA4+Q0z...")
  return encrypted.toString();
}

// Usage:
const ciphertext = encryptPayload({ userid: "9876543210", password: "mypassword" });
const body = `payload=${encodeURIComponent(ciphertext)}&version=1`;
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

  // Step 1: Decrypt → returns CryptoJS WordArray (raw bytes as 32-bit ints)
  const bytes = CryptoJS.AES.decrypt(ciphertext, keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Step 2: Convert WordArray to hex string
  // e.g. "7b22636f6465223a3230302c22726573756c7473..." (JSON as hex bytes)
  const hex = bytes.toString(CryptoJS.enc.Hex);

  // Step 3: Decode hex bytes → UTF-8 → parse JSON
  return JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
}
```

### Why Two Conversion Steps?

```
WordArray  →  hex string  →  Buffer  →  UTF-8 string  →  JSON.parse
(CryptoJS)    (CryptoJS)    (Node.js)   (Node.js)         (JS built-in)
```

CryptoJS works internally with 32-bit integer arrays ("WordArrays"). There's no direct WordArray → UTF-8 path that handles arbitrary byte sequences correctly. Converting to hex first ensures every byte is preserved exactly, then `Buffer.from(hex, "hex")` interprets those bytes as binary data before converting to the final string.

---

## Why Is the Static Key a Vulnerability?

### What "Client-Side Key" Means

The key `A3s68aORSgHs$71P` is **delivered to your browser in SunNXT's own JavaScript bundle**. This means:

1. Open Chrome DevTools → Sources tab
2. Search for `CryptoJS.AES.encrypt` in any minified `.js` file
3. The key string appears adjacent to that call
4. Total time: about 30 seconds

This is not "hacking" — SunNXT shipped the key to you. The "encryption" of login credentials is essentially cosmetic.

### What an Attacker Can Do With It

Given the key + static IV, an attacker who can intercept TLS-decrypted traffic (e.g., on a corporate network, through a malicious router, or via SSL stripping) can:

- Decrypt every login request → extract credentials
- Decrypt every API response → get stream URLs, DRM license URLs, user metadata
- Replay modified requests to the API

### The Fix

The correct approach is **asymmetric encryption** for credential exchange:
1. Server generates an RSA key pair; the **public key** is sent to the client
2. Client encrypts credentials with the server's public key
3. Only the server's **private key** (never sent to the browser) can decrypt it

Or more practically: **HTTPS is the encryption layer** — no application-level encryption is needed at all if TLS is properly implemented. The application-level AES encryption adds complexity without meaningful security.

---

## SunNXT API Endpoints Reference

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `https://www.sunnxt.com/next/api/login` | Login (encrypted payload) |
| `POST` | `https://www.sunnxt.com/next/api/logout` | Invalidate session |
| `GET` | `https://api.sunnxt.com/user/v4/removeDevice/` | Remove a registered device |

### Content

| Method | Endpoint | Purpose | Auth Required |
|---|---|---|---|
| `GET` | `https://www.sunnxt.com/next/api/media/{id}` | Resolve stream URLs + DRM | Yes |
| `GET` | `https://pwaapi.sunnxt.com/content/v7/browse` | Browse carousels | No |
| `GET` | `https://pwaapi.sunnxt.com/content/v7/search` | Search content | No |
| `GET` | `https://pwaapi.sunnxt.com/channel/v1/liveChannels` | Live TV list | No |

### Media API Parameters

```
https://www.sunnxt.com/next/api/media/{contentId}
  ?playbackCounter=1
  &fields=contents,user/currentdata,images,generalInfo,subtitles,
          relatedCast,globalServiceName,globalServiceId,
          relatedMedia,videos,thumbnailSeekPreview
  &bw=5000000     ← request 5 Mbps quality (HD CDN URLs)
  &nid=4          ← network type: 4 = WiFi
```

Setting `bw=5000000&nid=4` tells SunNXT to return HD CDN URLs. The default `q=4` (SD) often points to files that don't exist on Akamai.

---

## Required Request Headers

Every SunNXT API request requires these headers:

```typescript
const REQUIRED_HEADERS = {
  "x-myplex-platform": "browser",  // identifies the client type
  "x-ucv": "5",                    // client version
  "origin": "https://www.sunnxt.com",
  "referer": "https://www.sunnxt.com/",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...",
};
```

Without `x-myplex-platform` and `x-ucv`, the server returns `{"code": 400}` for valid credentials.

---

## Sample Decrypted Media API Response

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
            "link": "https://movies2-suntvvod.akamaized.net/.../82850_est_hd.mpd?hdntl=exp=1779436600~acl=...",
            "licenseUrl": "https://api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy/?content_id=82850&token=<JWT>",
            "profile": "hd",
            "resolution": "1280x720"
          },
          {
            "format": "hls-fp-aapl",
            "link": "https://suntvvod1.sunnxt.com/.../hd_index.m3u8?...",
            "licenseUrl": "https://api.sunnxt.com/licenseproxy/v3/fairplayDRMProxy/?...",
            "profile": "hd"
          }
        ]
      }
    }
  ]
}
```

### Video Unavailable Response

Some content returns an error object instead of values:

```json
{
  "videos": {
    "status": "ERR_UPSTREAM_SERVER_ERROR",
    "message": "Video is not available"
  }
}
```

Our media route detects `videos.status` without `videos.values` and returns HTTP 404 with `{ error: "video_unavailable" }` — no wasteful re-login retry.

---

**[Next: Session & Auth →](04-session-auth.md)**
