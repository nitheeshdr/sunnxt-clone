# 08 — Geo-block, Roaming & Security Research

**[← DRM](07-drm.md) · [Next: Deployment →](09-deployment.md)**

---

## Geo-block vs Roaming Error

SunNXT distinguishes between two types of access restrictions:

| Type | Condition | Error |
|---|---|---|
| **Roaming expired** | Account accessed from non-Indian IP, add-on expired | `blocked_reason: "roaming_expired_30"` |
| **Geo-blocked content** | Specific content not licensed for this region | `notify_type: "error_notify"` |

Both return a `results[0]` object instead of a `videos.values` array.

---

## What the Error Response Looks Like

```json
{
  "code": 200,
  "results": [
    {
      "blocked_reason": "roaming_expired_30",
      "home_country": "IN",
      "notify_type": "error_notify",
      "title": "International Roaming Expired",
      "p1": "International access expired.",
      "p2": "You can continue streaming free content. Paid content will be accessible when you return to India."
    }
  ]
}
```

Note: SunNXT returns HTTP 200 even for blocked content. The block is communicated inside the JSON body.

---

## Detection in the Media Route

```typescript
function getRoamingError(data: Record<string, unknown>): string | null {
  const results = data.results as Array<Record<string, unknown>> | undefined;
  const r0 = results?.[0];

  if (r0?.blocked_reason || r0?.notify_type === "error_notify") {
    return (r0.title as string) || (r0.p1 as string) || "Content blocked";
  }

  return null;
}
```

---

## Recovery Strategy

```
1. First fetch → roaming error detected
        │
        ▼
2. forceRelogin()
        │
        ├─ POST /next/api/logout  (clear old roaming-flagged session)
        └─ Fresh login from current server IP
        │
        ▼
3. Retry fetchMedia() with fresh cookies
        │
        ├─ Success (Indian IP, no roaming flag) → return data ✓
        └─ Still blocked → return HTTP 451 { error: "geo_blocked" }
```

### Why Logout First?

SunNXT caches the roaming status on the **session**. Even if you log in from India, if the old session was created abroad, it stays flagged. Calling logout invalidates that session, and a fresh login from an Indian IP creates a new, unflagged session.

---

## The Player's Geo-block UI

When the media route returns `{ error: "geo_blocked" }`:

```tsx
{isGeoBlocked && (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
    <div className="text-5xl">🌍</div>
    <p className="text-white font-bold">International Roaming Expired</p>
    <p className="text-gray-300 text-sm max-w-sm">{error}</p>
    <button onClick={() => history.back()}>Go Back</button>
  </div>
)}
```

For non-geo errors (stream unavailable, network issues), a "Retry" button re-calls `loadAndPlay()`:

```tsx
<button onClick={() => loadAndPlay(contentId)}>Retry</button>
```

---

## Why the Vercel Mumbai Region Fixes This

The geo-block happens because SunNXT checks the **server's IP address** during session validation. When we run on Vercel's default US regions, all requests originate from US datacenters.

```
Without bom1:  Request IP = 76.76.21.x (Vercel US) → geo-blocked
With bom1:     Request IP = 103.21.x.x (Vercel Mumbai) → accepted ✓
```

`vercel.json`:
```json
{ "regions": ["bom1"] }
```

This pins all serverless functions to Vercel's Mumbai data center. Every SunNXT API call — login, media resolution, CDN segment proxying — originates from an Indian IP.

---

## Security Research Findings

These findings were identified through network traffic analysis during development. They are documented here for educational purposes.

---

### Finding 1: Static Encryption Key

**What:** The AES-128-CBC key `A3s68aORSgHs$71P` is embedded in SunNXT's client-side JavaScript bundle.

**Impact:** Anyone with access to the web app's JavaScript can extract this key. There is no key rotation mechanism.

**How it was found:** Browser DevTools → Sources tab → search for `CryptoJS.AES.encrypt` in the minified bundle.

**Why it matters:** The key encrypts login credentials in transit. With the key, an attacker on the network can decrypt login payloads if TLS is stripped.

---

### Finding 2: Static IV (All-Zero)

**What:** The AES initialization vector is always 16 zero bytes.

**Impact:** In CBC mode, a static IV means identical plaintexts produce identical ciphertexts. This is a known weakness:
- **Deterministic encryption:** Two users with the same password will have the same encrypted login payload
- **Pattern analysis:** If an attacker sees multiple encrypted payloads, they can identify users with the same credentials

**Best practice would be:** A random IV per request, sent alongside the ciphertext.

---

### Finding 3: Device Registration Bypass

**What:** The device-limit enforcement (code 423) can be bypassed by:
1. Fetching the ManageDevices HTML page (no server-side auth required beyond a URL token)
2. Parsing device IDs from `removeDevice` links in the HTML
3. Calling the remove endpoint — no CSRF token, no secondary confirmation

**Impact:** The device limit (meant to prevent account sharing) provides no real security — it can be bypassed in ~3 HTTP requests.

---

### Finding 4: Long-Lived Sessions

**What:** SunNXT session cookies (`sessionid`) do not appear to have a short TTL. Once obtained, a session cookie remains valid for an extended period.

**Impact:** If a session cookie is extracted from a browser, it provides persistent access until explicitly invalidated. There is no automatic short-expiry or sliding-window timeout.

---

### Finding 5: ManageDevices HTML Endpoint — No Auth Check

**What:** The ManageDevices webview (`https://www.sunnxt.com/managedevices?token=...`) returns device IDs in the HTML without verifying the token is associated with the requesting session.

**Impact:** Anyone with a valid `token` value (extractable from a 423 login response) can view and remove all registered devices for an account, even from a different session/device.

---

### Finding 6: CDN Token in URL

**What:** Akamai CDN auth tokens (`hdntl=exp=...~acl=...~hmac=...`) are embedded in segment URLs returned by the media API.

**Impact:** These tokens are time-limited (typically 4-8 hours based on `exp=` value), but during their validity window, the URL can be shared and used by anyone — no IP binding. The `acl` parameter limits which paths the token is valid for, providing some constraint.

---

## Summary Table

| Finding | Severity | Root Cause |
|---|---|---|
| Static AES key | Medium | Key embedded in client JS |
| Static IV | Low-Medium | Implementation shortcut |
| Device limit bypass | Low | Weak enforcement |
| Long-lived sessions | Low | No TTL policy |
| ManageDevices no auth | Low | Missing access control |
| Shareable CDN tokens | Low | No IP binding |

---

> [!NOTE]
> These findings are based on black-box analysis of publicly accessible client-side code and network traffic. They have been documented here for educational purposes in the context of understanding how OTT platforms implement (and sometimes misimplement) security controls.

---

**[Next: Deployment →](09-deployment.md)**
