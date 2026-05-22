# 08 — Geo-block, Roaming & Security Findings

**[← DRM](07-drm.md) · [Next: Deployment →](09-deployment.md)**

---

## Geo-block vs Roaming Error

SunNXT restricts paid content to Indian IP addresses. Two distinct error types exist:

| Type | Condition | `blocked_reason` |
|---|---|---|
| **Roaming expired** | Account accessed from non-Indian IP, international add-on expired | `roaming_expired_30` |
| **Geo-blocked content** | Specific content not licensed for this region | `notify_type: "error_notify"` |

Both return HTTP `200` with an error object inside the body instead of a `videos.values` array.

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

SunNXT returns HTTP 200 even for blocked content — the block is in the JSON body. This is VULN-09 (see [Security Report](../SECURITY_REPORT.md)).

---

## Recovery Strategy

```
1. First fetch → roaming error detected (blocked_reason field present)
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

SunNXT caches the roaming status **on the session object**. Even if you log in from India, a session created abroad stays flagged until that specific session is invalidated. Calling logout clears the flag.

---

## The Geo-Block Bypass (VULN-07)

Since geo-checking happens at **session creation** (not per-request), routing the login through an Indian server creates an India-flagged session that works from anywhere:

```
Normal user (US):   Login IP = 72.x.x.x (US) → geo-blocked session
This project:       Login IP = 103.21.x.x (Vercel Mumbai bom1) → unrestricted session

Subsequent requests from the US browser → session already geo-cleared → streams work
```

`vercel.json`:
```json
{ "regions": ["bom1"] }
```

This pins all serverless functions to Vercel's Mumbai data center. The fix SunNXT should implement: **validate the client IP on every media API request**, not just at session creation.

---

## Why the Player Shows a Geo-Block UI

When the media route returns `{ error: "geo_blocked", code: 451 }`:

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

HTTP 451 is the correct status code for "Unavailable For Legal Reasons" — SunNXT currently returns 200 for this case (see VULN-09).

---

## Security Findings Summary

All 10 vulnerabilities found during this project:

| ID | Finding | Severity |
|---|---|---|
| VULN-01 | Static AES key in client JavaScript | **High** |
| VULN-02 | Static all-zero IV in AES-CBC | **Medium** |
| VULN-03 | Device registration limit bypass | **Medium** |
| VULN-04 | Long-lived sessions without TTL | **Medium** |
| VULN-05 | ManageDevices missing access control | **Medium** |
| VULN-06 | CDN tokens without IP binding | **Low** |
| VULN-07 | Geo-block bypass via server proxy | **Medium** |
| VULN-08 | DRM JWT reuse window | **Low** |
| VULN-09 | HTTP 200 for blocked/error states | **Informational** |
| VULN-10 | No rate limiting on login API | **Medium** |

See [SECURITY_REPORT.md](../SECURITY_REPORT.md) for the full detailed report with CVSS scores, proof-of-concept steps, and remediation recommendations.

For an in-depth explanation of how each vulnerability works and how to fix it, see [10-vulnerability-deep-dive.md](10-vulnerability-deep-dive.md).

---

## Browse API — Works Without Authentication

The browse/catalogue API (`pwaapi.sunnxt.com`) was tested without any session cookie:

| Endpoint | Result |
|---|---|
| Homepage carousels | ✓ Works |
| Trending content | ✓ Works |
| Live TV channel list | ✓ Works |
| Content search | ✓ Works |
| Content detail metadata | ✓ Works |
| **Stream URL resolution** | **✗ Requires session** |
| **DRM license acquisition** | **✗ Requires session + subscription** |

This means: metadata browsing is publicly accessible. Actual video streaming is correctly gated.

---

**[Next: Deployment →](09-deployment.md)**
