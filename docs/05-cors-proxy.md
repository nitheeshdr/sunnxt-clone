# 05 — CORS Proxy & Manifest Rewriting

**[← Session & Auth](04-session-auth.md) · [Next: Video Player →](06-video-player.md)**

---

## The Problem

SunNXT's CDN servers don't allow cross-origin requests:

```
Browser → fetch("https://livestream2.sunnxt.com/.../index.mpd")
                                                               ↑
❌  CORS error: No 'Access-Control-Allow-Origin' header present
```

Even if we had the URL, the browser can't fetch it. The fix: route all CDN requests through our Next.js server at `/api/stream-proxy`.

---

## How the Proxy Works

`app/api/stream-proxy/route.ts` acts as an authenticated relay:

```
Browser
  │ GET /api/stream-proxy?url=https%3A%2F%2Flivestream2.sunnxt.com%2F...
  ▼
Next.js Server
  │ 1. Validate hostname against allowlist
  │ 2. Attach SunNXT session cookie
  │ GET https://livestream2.sunnxt.com/...
  ▼
SunNXT CDN (no CORS rules server-to-server)
  │ 200 OK + raw MPD/M3U8/binary
  ▼
Next.js Server
  │ 3. If MPD → inject <BaseURL>
  │ 4. If M3U8 → rewrite all segment URIs
  │ 5. Add Access-Control-Allow-Origin: * header
  ▼
Browser
```

---

## Security: Domain Allowlist

Not just any URL can be proxied. The allowlist prevents SSRF (Server-Side Request Forgery) attacks:

```typescript
const ALLOWED_HOSTS = [
  "livestream.sunnxt.com",
  "suntvvod1.sunnxt.com",
  "sunnxt.com",       // catches *.sunnxt.com (livestream2, suntvvod1, etc.)
  "akamaized.net",    // requires suntvvod guard (below)
];

const allowed =
  ALLOWED_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`)
  ) &&
  // For Akamai: only allow SunNXT VOD subdomains
  (hostname.endsWith(".akamaized.net")
    ? hostname.includes("suntvvod")
    : true);
```

Examples:
| URL | Allowed? | Reason |
|---|---|---|
| `livestream2.sunnxt.com` | ✅ | ends with `.sunnxt.com` |
| `movies2-suntvvod.akamaized.net` | ✅ | Akamai + includes `suntvvod` |
| `evil.akamaized.net` | ❌ | Akamai but no `suntvvod` |
| `google.com` | ❌ | Not in allowlist |

---

## DASH Manifest Rewriting (MPD)

MPEG-DASH manifests (`.mpd` files) can contain **relative** segment paths:

```xml
<!-- Raw MPD from SunNXT -->
<MPD>
  <Period>
    <AdaptationSet>
      <SegmentTemplate
        initialization="video/avc1/4/init.mp4"
        media="video/avc1/4/seg$Number$.mp4"
        startNumber="1"
      />
    </AdaptationSet>
  </Period>
</MPD>
```

If Shaka sees this after loading it from `http://localhost:3000/api/stream-proxy?url=...`, it will resolve the relative path `video/avc1/4/init.mp4` against `http://localhost:3000/api/stream-proxy/` — which is wrong.

### The Fix: Inject `<BaseURL>`

We insert a `<BaseURL>` tag pointing to the original upstream directory:

```typescript
function rewriteMpd(xml: string, manifestUrl: string): string {
  // manifestUrl = "https://movies2-suntvvod.akamaized.net/movies2/.../82850_est_hd.mpd"
  // baseDir     = "https://movies2-suntvvod.akamaized.net/movies2/.../"

  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);
  const baseUrlTag = `<BaseURL>${baseDir}</BaseURL>`;

  // Inject right after the opening <MPD ...> tag
  return xml.replace(/(<MPD[^>]*>)/, `$1\n  ${baseUrlTag}`);
}
```

Result:

```xml
<MPD>
  <BaseURL>https://movies2-suntvvod.akamaized.net/movies2/.../</BaseURL>
  <Period>
    ...
  </Period>
</MPD>
```

Now when Shaka resolves `video/avc1/4/init.mp4`, it produces the correct absolute Akamai URL. The player's `registerRequestFilter` then intercepts that Akamai URL and proxies it back through `/api/stream-proxy`.

---

## HLS Manifest Rewriting (M3U8)

HLS playlists are plain text, but segment lines are also relative. We rewrite every one of them:

```
# Original .m3u8 from SunNXT
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x...
#EXTINF:6.0,
seg001.ts
seg002.ts
```

```typescript
function rewriteM3u8(text: string, manifestUrl: string): string {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);

  function resolveAndProxy(href: string): string {
    try {
      // Already absolute URL
      const abs = new URL(href).href;
      return `/api/stream-proxy?url=${encodeURIComponent(abs)}`;
    } catch {
      // Relative path → make absolute using baseDir
      return `/api/stream-proxy?url=${encodeURIComponent(new URL(href, baseDir).href)}`;
    }
  }

  return text.split("\n").map((line) => {
    const trimmed = line.trim();

    // Rewrite URI= attribute in tags like #EXT-X-KEY, #EXT-X-MAP
    if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, val) => `URI="${resolveAndProxy(val)}"`);
    }

    // Rewrite segment lines (non-empty, non-comment)
    if (trimmed && !trimmed.startsWith("#")) {
      return resolveAndProxy(trimmed);
    }

    return line;
  }).join("\n");
}
```

After rewriting:

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="/api/stream-proxy?url=https%3A%2F%2F...%2Fkey.bin",IV=0x...
#EXTINF:6.0,
/api/stream-proxy?url=https%3A%2F%2F...%2Fseg001.ts
/api/stream-proxy?url=https%3A%2F%2F...%2Fseg002.ts
```

Every request Shaka makes is now to our proxy, which fetches from SunNXT with auth.

---

## Binary Segment Streaming

For video/audio segments (`.mp4`, `.ts` chunks), the proxy streams the response body directly without buffering:

```typescript
// Binary segments — stream directly
return new NextResponse(upstream.body, {
  status: 200,
  headers: {
    "content-type": contentType,           // video/mp4 or video/MP2T
    "access-control-allow-origin": "*",
    "cache-control": cacheControl,
  },
});
```

`upstream.body` is a `ReadableStream`. Passing it directly to `NextResponse` means the bytes flow from Akamai → Next.js → Browser without loading the entire segment into memory. This is critical for performance — video segments can be several megabytes each.

---

## Player-Side: The Request Filter

On the player side, a Shaka `registerRequestFilter` intercepts every outgoing request and proxies SunNXT CDN URLs:

```typescript
player.getNetworkingEngine().registerRequestFilter((_type, request) => {
  const url = request.uris[0];

  // Skip already-proxied URLs (prevents double-proxying)
  if (url.includes("/api/stream-proxy")) return;

  // Proxy any SunNXT CDN URL
  if (isSunnxtCdnUrl(url)) {
    request.uris[0] = `/api/stream-proxy?url=${encodeURIComponent(url)}`;
  }
});
```

```typescript
function isSunnxtCdnUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (hostname.endsWith(".sunnxt.com") || hostname === "sunnxt.com") return true;
    if (hostname.endsWith(".akamaized.net") && hostname.includes("suntvvod")) return true;
    return false;
  } catch { return false; }
}
```

### Why Also Pre-Proxy the Manifest?

The manifest URL itself is also proxied **before** passing to `player.load()`:

```typescript
const loadUrl = isSunnxtCdnUrl(url)
  ? `/api/stream-proxy?url=${encodeURIComponent(url)}`
  : url;

await player.load(loadUrl);
```

The request filter runs when Shaka makes the request — but there's a subtle race condition on first load. Pre-proxying the manifest URL guarantees the very first fetch is routed correctly, regardless of filter registration timing.

---

## Summary: The Full Proxy Chain

```
1. player.load("/api/stream-proxy?url=<mpd-url>")
        ↓
2. Proxy fetches MPD from Akamai, injects <BaseURL>
        ↓
3. Shaka parses MPD, resolves segment URLs using <BaseURL>
   → absolute Akamai CDN URLs like https://movies2-suntvvod.akamaized.net/.../init.mp4
        ↓
4. Request filter intercepts → rewrites to /api/stream-proxy?url=<segment-url>
        ↓
5. Proxy fetches segment from Akamai, streams binary back
        ↓
6. Shaka decodes → video plays
```

---

**[Next: Video Player Pipeline →](06-video-player.md)**
