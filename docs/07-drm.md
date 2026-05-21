# 07 — DRM Handling

**[← Video Player](06-video-player.md) · [Next: Geo-block & Security →](08-geo-security.md)**

---

## What Is DRM?

DRM (Digital Rights Management) prevents users from downloading or recording premium video content. SunNXT uses **Widevine** (Google, used on Chrome/Android) and **PlayReady** (Microsoft, used on Edge/Windows) to encrypt video streams.

Without a valid license, an encrypted video segment is just random bytes — the player can't decode it.

---

## How Widevine Works (Simplified)

```
1. Shaka loads encrypted MPD
        ↓
2. Shaka detects encryption → needs a license
        ↓
3. Shaka generates a "challenge" (binary blob with device info)
        ↓
4. Shaka POST challenge to license server URL
        ↓
5. License server verifies → returns license (binary blob)
        ↓
6. Shaka uses license to decrypt segments → video plays
```

The challenge is typically `Content-Type: application/octet-stream`. The license response is also binary.

---

## The Problem: License Server Requires Auth

SunNXT's Widevine license server requires the same session cookie as all other API requests:

```
POST https://license.sunnxt.com/...
Cookie: sessionid=abc123...    ← required
Body: <binary widevine challenge>
```

Shaka makes this request from the **browser**, which can't include HttpOnly session cookies in cross-origin requests.

---

## The Solution: License Proxy

`app/api/license/route.ts` is a thin proxy that injects the auth cookie:

```
Browser (Shaka)
  │ POST /api/license?url=<encoded-license-url>
  │ Body: <binary widevine challenge>
  ▼
Next.js Server
  │ Attach SunNXT session cookie
  │ POST <sunnxt-license-url>
  │ Body: <binary widevine challenge> (forwarded as-is)
  ▼
SunNXT License Server
  │ Validates session + challenge
  │ Returns binary license
  ▼
Next.js Server
  │ Forwards binary response unchanged
  ▼
Browser (Shaka)
  └─ Uses license to decrypt video ✓
```

---

## Configuring DRM in the Player

When a video entry has a `licenseUrl`, DRM is configured before calling `player.load()`:

```typescript
if (video.licenseUrl) {
  // Route license requests through our proxy instead of directly to SunNXT
  const proxyLicenseUrl = `/api/license?url=${encodeURIComponent(video.licenseUrl)}`;

  player.configure({
    drm: {
      servers: {
        "com.widevine.alpha":    proxyLicenseUrl,  // Chrome, Android, Firefox
        "com.microsoft.playready": proxyLicenseUrl, // Edge, Windows
      },
    },
  });
}
```

The same proxy URL handles both DRM systems — the license proxy forwards whatever challenge binary Shaka sends and returns whatever license binary the server responds with.

---

## Identifying Encrypted vs Clear Streams

In the format selection code:

```typescript
// Clear DASH (no DRM) — preferred
const clearDash = videos.find((v) => v.format === "dash" && !v.licenseUrl);

// CENC-encrypted DASH (requires DRM)
const cencDash = videos.find((v) =>
  v.format?.includes("cenc") ||          // "dashcenc", "cenc"
  (v.format?.includes("dash") && v.licenseUrl) // dash with licenseUrl
);
```

`clearDash` is tried first because it avoids the DRM overhead and is compatible with all browsers. CENC-encrypted DASH is a fallback for content that requires DRM enforcement.

---

## What Is CENC?

CENC (Common Encryption) is the ISO standard for encrypting MPEG-DASH content. The `.mpd` manifest declares the encryption method:

```xml
<ContentProtection
  schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"
  value="Widevine">
  <cenc:pssh>...</cenc:pssh>
</ContentProtection>
```

The `pssh` (Protection System Specific Header) contains the key ID and encryption parameters Shaka uses to build the Widevine challenge.

---

## Does This Actually Work?

Widevine has three security levels:

| Level | Where | Can be used? |
|---|---|---|
| L1 | Hardware TEE (phones, Smart TVs) | Yes, up to 1080p |
| L2 | Software + hardware hybrid | Yes |
| L3 | Software only (most desktop browsers) | Yes, usually SD/720p only |

Most desktop browsers use **Widevine L3**, which means HD content may be downgraded to SD by the license server even with a valid license. SunNXT's license server determines the quality cap — our proxy just forwards the binary challenge without modification.

---

## License Proxy Implementation

```typescript
// app/api/license/route.ts (simplified)
export async function POST(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  const cookie = await getSunnxtCookies().catch(() => "");
  const challenge = await request.arrayBuffer(); // Read binary challenge

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      ...(cookie ? { cookie } : {}),
    },
    body: challenge,
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "access-control-allow-origin": "*",
    },
  });
}
```

The binary challenge and binary license response are both forwarded without decoding — the proxy doesn't need to understand the DRM protocol, just relay it with auth.

---

**[Next: Geo-block & Security →](08-geo-security.md)**
