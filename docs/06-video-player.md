# 06 — Video Player Pipeline

**[← CORS Proxy](05-cors-proxy.md) · [Next: DRM →](07-drm.md)**

---

## Why Shaka Player?

Native `<video>` elements support only basic MP4 and some HLS (Safari only). SunNXT uses MPEG-DASH for most content — an adaptive streaming format that requires JavaScript to parse and request segments. Shaka Player is Google's open-source library for this.

| Capability | Native `<video>` | Shaka Player |
|---|---|---|
| MPEG-DASH | ❌ | ✅ |
| HLS (cross-browser) | ❌ (Safari only) | ✅ |
| Widevine DRM | ❌ | ✅ |
| PlayReady DRM | ❌ | ✅ |
| Request interceptors | ❌ | ✅ `registerRequestFilter` |
| Adaptive bitrate | Limited | Full |

---

## Player Initialization

Shaka is imported dynamically (client-side only) to avoid SSR issues:

```typescript
const shaka: any = await import("shaka-player");
shaka.polyfill.installAll(); // Apply browser-specific fixes

if (!shaka.Player.isBrowserSupported()) {
  setError("Your browser does not support this player.");
  return;
}

// Destroy previous instance if exists
if (playerRef.current) await playerRef.current.destroy();

// Reset CDM state so output-restricted key status from the previous session
// doesn't leak into this new player instance (causes spurious 4032 errors)
try { await videoRef.current.setMediaKeys(null); } catch { /* best effort */ }

const player = new shaka.Player();
await player.attach(videoRef.current); // Connect to <video> element
playerRef.current = player;
```

The `<video>` element is always mounted in the DOM (even before content loads) so Shaka can `attach()` immediately.

---

## The Two Fallback Loops

Playback has two nested fallback systems to handle the various failure modes of SunNXT's CDN:

```
loadAndPlay(contentId)
    │
    └─ Format Fallback Loop (outer)
           tries: [clearDash, cencDash, hlsVideo, videos[0]]
           │
           └─ for each format → startPlayback(video)
                   │
                   └─ Quality Fallback Loop (inner)
                          tries: [original, _est_hd, _hd, _sd, _4k variants]
                          only retries on HTTP 404
```

### Why Two Loops?

**Format fallback** handles the case where DASH is completely unavailable for a piece of content (server error, DRM mismatch, etc.). The player then tries HLS.

**Quality fallback** handles the case where a specific DASH quality file doesn't exist on the CDN. SunNXT sometimes doesn't upload all quality tiers to Akamai.

---

## Format Selection

The media API returns an array of video objects, each with a `format` field. We build a priority-ordered list:

```typescript
const videos: VideoEntry[] = data.results[0].videos.values;

// Priority: clear DASH > encrypted DASH > HLS > first available
const clearDash = videos.find((v) => v.format === "dash" && !v.licenseUrl);
const cencDash  = videos.find((v) =>
  v.format?.includes("cenc") ||
  (v.format?.includes("dash") && v.licenseUrl)
);
const hlsVideo  = videos.find((v) =>
  v.format?.includes("hls") || v.link?.includes(".m3u8")
);

const ordered = [clearDash, cencDash, hlsVideo, videos[0]]
  .filter((v): v is VideoEntry => !!v)
  // Remove duplicates (same URL appearing in multiple formats)
  .filter((v, i, arr) => arr.findIndex((x) => x.link === v.link) === i);
```

We prefer `clearDash` (no DRM overhead) over `cencDash` (requires license server round-trip) over `hlsVideo` (less efficient, but more widely compatible).

---

## Quality Fallback: `buildQualityFallbacks()`

SunNXT's Akamai CDN sometimes has only specific quality tiers uploaded. `_est_sd.mpd` (SD quality) often returns 404 while `_est_hd.mpd` (HD quality) works.

```typescript
function buildQualityFallbacks(originalUrl: string): string[] {
  const urls = [originalUrl]; // Always try original first
  const base = originalUrl.split("?")[0];
  const qs = originalUrl.includes("?")
    ? originalUrl.slice(originalUrl.indexOf("?"))
    : "";

  const filename = base.split("/").pop() || "";
  const dir = base.slice(0, base.lastIndexOf("/") + 1);

  const variants = [
    filename.replace(/_est_sd\.mpd/, "_est_hd.mpd"),  // SD → HD (with est prefix)
    filename.replace(/_est_sd\.mpd/, "_hd.mpd"),       // SD → HD (without est)
    filename.replace(/_est_sd\.mpd/, "_sd.mpd"),       // SD → plain SD
    filename.replace(/_est_hd\.mpd/, "_hd.mpd"),       // HD with est → plain HD
    filename.replace(/_est_4k\.mpd/, "_4k.mpd"),       // 4K with est → plain 4K
  ].filter((v) => v && v !== filename); // Only include if different from original

  for (const v of variants) {
    const candidate = dir + v + qs;
    if (!urls.includes(candidate)) urls.push(candidate);
  }

  return urls;
}
```

Example for `82850_est_sd.mpd`:
```
Try 1: 82850_est_sd.mpd  → 404 on Akamai
Try 2: 82850_est_hd.mpd  → 200 ✓
```

The query string (containing auth tokens like `hdntl=exp=...`) is preserved across all variants.

---

## The `loadingDone` Flag

Without this flag, Shaka's `error` event would trigger the error UI while we're still trying fallback formats:

```typescript
let loadingDone = false;

// Shaka error event — only show UI errors after successful load
player.addEventListener("error", (event: Event) => {
  if (!loadingDone) return; // Suppress during fallback attempts
  const detail = (event as any).detail;
  setError(`Playback error [${detail?.code ?? "?"}]: ${detail?.message || "unknown"}`);
});

// ... quality fallback loop ...

await player.load(loadUrl);    // ← throws on failure
// If we get here, load succeeded
loadingDone = true;            // ← now allow error events to show UI
videoRef.current.play();
```

This prevents a jarring flash of the error overlay when the player is silently retrying a different quality or format.

---

## Quality Only Retries on 404

Not all errors mean "try the next URL". Only HTTP 404 means "this file doesn't exist — try another":

```typescript
try {
  await player.load(loadUrl);
  loaded = true;
  break;
} catch (e: unknown) {
  const httpStatus = (e as { data?: unknown[] })?.data?.[1];

  // Shaka error structure: { code, category, data: [url, httpStatus, ...] }
  if (httpStatus !== 404) throw e; // Non-404 → bubble up, don't try next quality

  console.warn("Player: 404 for", filename, "— trying next quality");
}
```

Why? A 403 means authentication failed (wrong cookies), a 500 means server error. Trying the next quality variant won't fix those.

---

## Heartbeat

When playback starts, a heartbeat fires every 30 seconds to tell SunNXT the session is active:

```typescript
function startHeartbeat(id: string) {
  sendHeartbeat(id, "Start");
  heartbeatRef.current = setInterval(
    () => sendHeartbeat(id, "Start"),
    30_000
  );
}
```

On pause or video end, the interval is cleared and a `Stop` event is sent:

```typescript
<video
  onPause={() => {
    clearInterval(heartbeatRef.current);
    sendHeartbeat(contentId, "Stop");
  }}
  onEnded={() => {
    clearInterval(heartbeatRef.current);
    sendHeartbeat(contentId, "Stop");
  }}
/>
```

On component unmount (navigating away), the cleanup effect destroys the player and stops the interval:

```typescript
useEffect(() => {
  return () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
  };
}, []);
```

---

## Complete `startPlayback` Flow

```
startPlayback(video: VideoEntry, contentId: string)
    │
    ├─ import shaka-player (dynamic import — client only)
    ├─ shaka.polyfill.installAll()
    ├─ destroy previous player instance
    ├─ new shaka.Player() → attach to <video>
    │
    ├─ set loadingDone = false
    ├─ addEventListener("error") → guarded by loadingDone
    │
    ├─ registerRequestFilter → route SunNXT CDN URLs through proxy
    │
    ├─ if video.licenseUrl → configure DRM (doc 07)
    │
    ├─ buildQualityFallbacks(video.link) → [url1, url2, url3, ...]
    │
    └─ for each url:
           loadUrl = pre-proxy if SunNXT CDN
           player.load(loadUrl)
               ├─ success → break
               └─ 404 → continue to next quality
                  other → throw (triggers format fallback in outer loop)
    │
    ├─ if no quality loaded → throw "All quality variants returned 404"
    ├─ loadingDone = true
    ├─ videoRef.current.play()
    └─ startHeartbeat(contentId)
```

---

**[Next: DRM Handling →](07-drm.md)**
