# 07 — DRM Handling

**[← Video Player](06-video-player.md) · [Next: Geo-block & Security →](08-geo-security.md)**

---

## What Is DRM?

DRM (Digital Rights Management) prevents users from downloading or recording premium video content. Without a valid license, encrypted video segments are just random bytes — the player cannot decode them.

SunNXT uses a **multi-DRM architecture** via **Nagravision** (Kudelski Group) supporting three DRM systems simultaneously:

| DRM System | Used On | Browser/OS |
|---|---|---|
| **Widevine** | Chrome, Firefox, Android | Google CDM |
| **PlayReady** | Edge, Internet Explorer | Microsoft CDM |
| **FairPlay** | Safari, iOS, macOS | Apple CDM |

---

## How DRM Works — Step by Step

```
1. Shaka loads encrypted DASH manifest (.mpd)
          ↓
2. Shaka reads <ContentProtection> element
          ↓
   <ContentProtection schemeIdUri="urn:uuid:edef8ba9-...">  ← Widevine UUID
     <cenc:pssh>AAAA...base64...</cenc:pssh>               ← PSSH box
   </ContentProtection>
          ↓
3. Browser's CDM (e.g. Widevine) generates a "license challenge"
   (binary blob containing device info + content key request)
          ↓
4. Shaka POSTs challenge to license server URL
          ↓
5. License server validates:
   - Is this a real Widevine device?
   - Does the JWT token match a valid account?
   - Is the subscription active?
          ↓
6. License server returns a signed license (binary blob)
          ↓
7. CDM uses license to derive the content decryption key
          ↓
8. Segments are decrypted inside the CDM black-box
          ↓
9. Decoded frames go to the video element → video plays
```

---

## The PSSH Box

The PSSH (Protection System Specific Header) is a binary structure embedded in the MPD and in the encrypted stream's initialization segment. It contains:

- **System ID** (UUID identifying the DRM system)
- **KID** (Key Identifier — which encryption key to request)
- **Custom data** (system-specific parameters)

Widevine's UUID: `edef8ba9-79d6-4ace-a3c8-27dcd51d21ed`
PlayReady's UUID: `9a04f079-9840-4286-ab92-e65be0885f95`

```xml
<!-- From a SunNXT DASH manifest (Widevine CENC) -->
<ContentProtection
  schemeIdUri="urn:uuid:EDEF8BA9-79D6-4ACE-A3C8-27DCD51D21ED"
  value="Widevine">
  <cenc:pssh>AAAATHBzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAAEQIARIQjNrM...</cenc:pssh>
</ContentProtection>
```

---

## SunNXT's 14 Stream Formats (Enumerated)

For a single premium movie (content ID 82850), the media API returns 14 stream entries:

| # | Format Label | CDN | DRM System | CDN Access Without Session |
|---|---|---|---|---|
| 1 | `dash-cenc` HD | suntvvod1.sunnxt.com | PlayReady | ✓ (200 OK) |
| 2 | `hls-fp-aapl` HD | suntvvod1.sunnxt.com | FairPlay | ✓ (200 OK) |
| 3 | `wvm` 1080p | Akamai | Widevine Classic | ✓ (200 OK) |
| 4 | `wvm` 720p | Akamai | Widevine Classic | ✓ (200 OK) |
| 5 | `wvm` 480p | Akamai | Widevine Classic | ✓ (200 OK) |
| 6 | `wvm` 360p | Akamai | Widevine Classic | ✓ (200 OK) |
| 7 | `hlsaes` Low | suntvvod1.sunnxt.com | AES-128 | ✗ (403) |
| 8 | `dash` HD | Akamai | Widevine CENC | ✓ (200 OK) |
| 9 | `dash` HD alt | Akamai | Widevine CENC | ✓ (200 OK) |
| 10–14 | `dash` SD variants | Akamai | Widevine CENC | ✓ (200 OK) |

**Key insight:** CDN segments are accessible without a session cookie — **but ALL premium content is encrypted**. Having the URL is not enough. You still need a DRM license to decrypt.

---

## The Problem: License Server Requires Auth

SunNXT's Widevine license server is behind authentication:

```
POST https://api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy/?content_id=82850&token=<JWT>
Cookie: sessionid=abc123...    ← required
Content-Type: application/octet-stream
Body: <binary widevine challenge>
```

**Two problems for a browser:**
1. The license URL is on a **different domain** (`api.sunnxt.com`) — CORS blocks it
2. The `sessionid` cookie is `HttpOnly` — JavaScript cannot read it and include it in cross-origin requests

---

## The Solution: License Proxy

`app/api/license/route.ts` is a thin Next.js server-side proxy:

```
Browser (Shaka Player)
  │
  │  POST /api/license?url=https%3A%2F%2Fapi.sunnxt.com%2F...
  │  Body: <binary Widevine challenge>
  │  (same-origin — no CORS issue)
  ↓
Next.js Server (api/license/route.ts)
  │
  │  Attach SunNXT session cookie from server-side session store
  │  POST https://api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy/...
  │  Body: <binary challenge forwarded unchanged>
  ↓
Nagravision License Server
  │
  │  Validates JWT (content_id, userId, ip_address, expiry, maxUses)
  │  Checks session cookie → subscription status
  │  Returns binary license
  ↓
Next.js Server
  │  Forwards binary response unchanged
  ↓
Browser (Shaka)
  └─ CDM uses license to decrypt video ✓
```

---

## Nagravision JWT Structure

Every DRM license URL includes a signed JWT token in the query string:

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

**Security observations:**

| Field | Observation | Security Note |
|---|---|---|
| `ip_address` | Set to the **server's IP**, not the end-user browser IP | IP binding is ineffective for browser clients (VULN-08) |
| `maxUses: 2` | Can be used twice | JWT can be shared within the validity window |
| `expiryTime` | ~2 hour window | Short-lived, which is good |
| `video_format` | Nagravision validates this matches the DRM challenge | Widevine challenge rejected if JWT says `dash-cenc` |

---

## DRM Format Selection in the Player

```typescript
// Priority order (Chrome prefers Widevine, Edge prefers PlayReady)
const widevineDash = videos.find((v) => v.format === "dash" && v.licenseUrl);   // Akamai Widevine
const cencDash     = videos.find((v) => v.format?.includes("cenc"));             // suntvvod1 PlayReady
const hlsVideo     = videos.find((v) => v.format?.includes("hls"));              // FairPlay/AES-128

const ordered = [widevineDash, cencDash, hlsVideo, videos[0]]
  .filter(Boolean)
  .filter((v, i, arr) => arr.findIndex((x) => x.link === v.link) === i) // dedupe
  .filter((v) => !failedDrmLinksRef.current.has(v.link)); // skip DRM-failed
```

When DRM fails after `player.load()` (Shaka error category 6), the player automatically skips to the next format:

```typescript
if (isDrm && currentVideoRef.current) {
  failedDrmLinksRef.current.add(currentVideoRef.current.link);
  loadAndPlay(id); // retry with next format
}
```

---

## FairPlay DRM Configuration (Safari / iOS)

Safari and all iOS browsers use Apple's FairPlay DRM. FairPlay uses a different protocol from Widevine and PlayReady — it requires a **server certificate** (fetched via GET before any license challenge) and uses the `com.apple.fps.1_0` EME key system identifier.

### Format Detection

The `hls-fp-aapl` format label identifies a FairPlay-protected HLS stream:

```typescript
const isFairPlay = video.format === "hls-fp-aapl";
```

This check gates all FairPlay-specific configuration. Widevine robustness hints and `modularLicense` are not used for FairPlay — the license challenge format is incompatible.

### Shaka Configuration for FairPlay

```typescript
if (isFairPlay) {
  player.configure({
    drm: {
      servers: {
        "com.apple.fps.1_0": proxyLicenseUrl, // POST → license challenge
      },
      advanced: {
        "com.apple.fps.1_0": {
          // Shaka fetches the certificate via GET before generating the challenge
          serverCertificateUri: proxyLicenseUrl,
        },
      },
    },
  });
}
```

### License Proxy — GET Handler (FairPlay Certificate)

The license proxy route (`/api/license`) has a new `GET` handler alongside the existing `POST` handler:

```
GET /api/license?url=<nagravision-fairplay-cert-url>&isLive=1
  → Proxy-fetches the FairPlay server certificate from Nagravision
  → Attaches session cookie (fallback for certificate endpoints that require auth)
  → Returns binary certificate blob
```

Shaka calls this automatically when it sees `serverCertificateUri`. The certificate is a binary blob that the CDM uses to encrypt the FairPlay license request.

### isLive=1 Flag for FairPlay

FairPlay license requests must go directly to `nagravisionDRMProxy`, not `modularLicense`. The `isLive=1` flag in the proxy URL signals this routing:

```
POST /api/license?url=<nagravisionDRMProxy-url>&isLive=1
  → Proxy skips modularLicense routing
  → Forwards directly to nagravisionDRMProxy with session JWT + cookie
  → Returns FairPlay license binary
```

Without `isLive=1`, the proxy would route to `modularLicense` which only handles Widevine protobuf challenges — sending a FairPlay challenge there produces an invalid response.

---

## Live Channel DRM Fix (isLive=1)

### The Problem

`pwaapi.sunnxt.com/licenseproxy/v3/modularLicense/` is the zero-auth Widevine license endpoint (VULN-11). However, for **all live channel content IDs**, it returns Widevine licenses that unconditionally include `output_protection.hdcp = HDCP_V2`. This is a server-side policy baked into Nagravision's license response — it is not negotiated by the Widevine robustness hints sent in the challenge.

This means:
- `modularLicense` cannot serve playable live channel licenses on desktop browsers (HDCP blocks them)
- The fix requires routing live channel license requests to a different endpoint

### The Fix: nagravisionDRMProxy

The original authenticated DRM endpoint `api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy/` does not apply the unconditional HDCP policy. By adding `isLive=1` to the license proxy URL, the proxy switches from `modularLicense` to `nagravisionDRMProxy`:

```
# VOD content (default path):
POST /api/license?url=<modularLicense-url>
  → Proxy forwards to modularLicense (no auth required)

# Live channel content (isLive=1 path):
POST /api/license?url=<nagravisionDRMProxy-url>&isLive=1
  → Proxy attaches session JWT + cookie
  → Forwards to nagravisionDRMProxy
  → Returns license without unconditional HDCP requirement
```

### Result

| Browser | SD Live Channels | HD Live Channels |
|---|---|---|
| Chrome / Firefox / Edge | Plays (after nagravisionDRMProxy fix) | Blocked (HDCP_V2 policy — hardware path required) |
| Android (L1 Widevine) | Plays | Plays |
| Android TV / Chromecast | Plays | Plays (hardware HDCP path) |
| Safari / iOS | Plays via FairPlay | Plays via FairPlay |

HD live channels (`*HDB_IN`) remain blocked on desktop browsers because the Nagravision license policy for those specific channels enforces HDCP_V2 regardless of which endpoint or robustness level is used — the hardware display path simply cannot be verified in a browser context.

---

## Configuring DRM in Shaka 5.x

**Breaking change in Shaka 5.x:** `videoRobustness` and `audioRobustness` inside `advanced` must be `string[]` (arrays), not plain strings. Passing a string silently causes "Invalid config, wrong type" and DRM fails to initialise.

```typescript
player.configure({
  drm: {
    servers: {
      "com.widevine.alpha": proxyLicenseUrl,
      "com.microsoft.playready": proxyLicenseUrl,
    },
    // Shaka 5.x top-level robustness shorthand (simpler than advanced)
    defaultVideoRobustnessForWidevine: "SW_SECURE_DECODE",
    defaultAudioRobustnessForWidevine: "SW_SECURE_CRYPTO",
    // advanced must also be arrays in Shaka 5.x (was strings in 4.x)
    advanced: {
      "com.widevine.alpha": {
        videoRobustness: ["SW_SECURE_DECODE"],  // ← must be string[], NOT string
        audioRobustness: ["SW_SECURE_CRYPTO"],
      },
    },
  },
});
```

**Why SW_SECURE_DECODE (Widevine L3)?** Requesting L3 tells the Nagravision license server to issue a key without mandatory HDCP output protection. Without this hint, some license responses include `output_protection.hdcp = HDCP_V2`, causing the browser's Widevine CDM to report `output-restricted` key status — Shaka then throws error 4012 (`RESTRICTIONS_CANNOT_BE_MET`) and filters all stream variants.

---

## Widevine Security Levels

Widevine has three security levels that affect what content quality the license server will grant:

| Level | Where It Runs | Content Quality Cap | Notes |
|---|---|---|---|
| **L1** | Hardware TEE (phone, Smart TV) | Up to 4K | Keys never leave hardware |
| **L2** | Software + hardware crypto | Up to 1080p | Partial hardware protection |
| **L3** | Pure software (most desktop browsers) | SD/720p usually | Keys in software — theoretical extraction risk |

Desktop Chrome uses **Widevine L3**. This means:
- SunNXT's license server may cap HD content to 720p or 480p on desktop
- The license server decides the quality — our proxy just relays the challenge
- Mobile devices with L1 Widevine can receive 1080p/4K licenses

---

## HDCP Output Protection — Live HD Channels

**Live HD channels** (`KTVHDB_IN_index.mpd`, `SunTVHDB_IN_index.mpd`, etc.) have a **hard HDCP enforcement policy** set at the Nagravision license level. This is independent of Widevine robustness level:

```
Widevine CDM (browser)
  ↓ receives license with output_protection.hdcp = HDCP_V2
  ↓ checks display connection for HDCP compliance
  ↓ browser cannot verify HDCP (no hardware path)
  → reports key status = "output-restricted"
Shaka sees output-restricted → filters all variants → error 4012 (RESTRICTIONS_CANNOT_BE_MET)
```

**SW_SECURE_DECODE does NOT help here.** The HDCP requirement is baked into the license policy by Nagravision — it is not negotiated by robustness level. The CDM will always report `output-restricted` for these channels in a browser context.

**What works:** Dedicated apps on Android TV, Chromecast, or smart TVs that have a hardware-verified HDCP display path. Desktop browsers cannot satisfy this requirement.

**Shaka error sequence for live HD channels:**
1. Format 1 (`dash-cenc`) loads → 4012 fires from DRM event listener
2. Player marks `dash-cenc` as failed, retries with format 2
3. Without `setMediaKeys(null)` reset between instances, `output-restricted` CDM state leaks into the new Shaka instance → 4032 (`NO_STREAMS_PLAYABLE`) fires immediately during manifest filtering

**Fix:** Call `await videoElement.setMediaKeys(null)` after `player.destroy()` and before creating the replacement player to clear residual CDM sessions between format fallback attempts.

---

## CDM State Leakage Between Shaka Instances

When the same `<video>` element is reused across multiple `shaka.Player` instances (the common pattern for format fallback), the browser may retain the `MediaKeys` object from the previous player. Any key status set by the previous CDM session (including `output-restricted`) can survive `player.destroy()` and cause premature stream filtering in the next instance.

**Pattern:**

```typescript
// ❌ CDM state from first player leaks into second
await firstPlayer.destroy();
const secondPlayer = new shaka.Player();
await secondPlayer.attach(videoElement); // MediaKeys still attached!

// ✅ Reset CDM session explicitly
await firstPlayer.destroy();
try { await videoElement.setMediaKeys(null); } catch { /* best effort */ }
const secondPlayer = new shaka.Player();
await secondPlayer.attach(videoElement); // Clean slate
```

This matters particularly when the first format fails with a key status error (4012) and the second format uses the same key system (Widevine). The CDM may immediately report `output-restricted` for the second manifest's keys without contacting the license server again — causing 4032 instead of the expected 4012.

---

## What Is CENC?

CENC (Common Encryption) is the ISO 23001-7 standard for encrypting MPEG-DASH streams. It allows one encrypted stream to work with multiple DRM systems using the same encryption keys.

```
                 ┌─────────────────────────────┐
                 │     Single Encrypted Stream  │
                 │  (AES-128-CTR or AES-128-CBC) │
                 └──────────┬──────────────────┘
                            │ Same content key
              ┌─────────────┼──────────────┐
              ↓             ↓              ↓
       Widevine PSSH   PlayReady PSSH  FairPlay
       (Chrome, FF)    (Edge, IE)      (Safari)
```

In the MPD, each DRM system has its own `<ContentProtection>` element with its own PSSH. The actual video segments are encrypted once — different DRM systems just have different ways of requesting the same decryption key.

---

## Why DRM Cannot Be Bypassed in the Browser

1. **The CDM is a black box** — Widevine runs as a browser plugin that JavaScript cannot inspect
2. **Keys never touch JavaScript** — decryption happens inside the CDM, not in JS memory
3. **Output Protection** — the CDM checks for HDCP on connected displays before providing keys for premium content
4. **Hardware L1** — on phones, keys are stored in a hardware-isolated Trusted Execution Environment

The only known practical Widevine bypass (L3 key extraction) requires deep OS-level access and custom tooling — it is not possible from a web browser context.

---

**[Next: Geo-block & Security →](08-geo-security.md)**
