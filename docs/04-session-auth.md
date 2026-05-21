# 04 — Session Management & Authentication

**[← API & Encryption](03-api-encryption.md) · [Next: CORS Proxy →](05-cors-proxy.md)**

---

## Overview

`lib/sunnxt-session.ts` is the heart of the backend. It handles:

- Automatic login using environment variable credentials
- Cookie caching to avoid logging in on every request
- Deduplication of concurrent login attempts
- Device-limit bypass (SunNXT allows max ~2-3 devices per account)
- Force re-login when geo/roaming issues are detected

---

## The Module-Level Cache

```typescript
// lib/sunnxt-session.ts

let cachedCookies = "";                        // SunNXT session cookie string
let loginPromise: Promise<string> | null = null; // in-flight login deduplicated
```

These are **module-level variables** — they live in the Node.js process for as long as it runs. On Vercel, a serverless function instance is reused across requests within a short window (warm starts). The cache means:

- First request: full login (~500ms)
- Subsequent requests: instant cookie return (~0ms)
- After process restart / cold start: full login again

---

## `getSunnxtCookies()` — The Public API

```typescript
export async function getSunnxtCookies(): Promise<string> {
  // Fast path: return cached cookies immediately
  if (cachedCookies) return cachedCookies;

  // Deduplicate: if a login is in-flight, wait for it
  if (!loginPromise) {
    loginPromise = doLogin().finally(() => { loginPromise = null; });
  }
  return loginPromise;
}
```

### Why Deduplicate?

On a cold start, multiple API routes might call `getSunnxtCookies()` simultaneously (e.g., the home page loads 6 carousel sections at once). Without deduplication, each call would independently call `doLogin()`, resulting in 6 simultaneous login requests to SunNXT — which would likely trigger rate limiting or device conflicts.

The `loginPromise` pattern ensures only **one** login happens at a time, and all callers await the same promise.

---

## `doLogin()` — The Login Flow

```
doLogin()
    │
    ├─ attemptLogin() ──→ POST /next/api/login with AES-encrypted payload
    │
    ├─ code 200 ──→ cache cookies ✓
    │
    ├─ code 423 (device limit reached)
    │       │
    │       ├─ Extract token from ManageDevices webview URL
    │       ├─ Fetch the webview HTML (contains device list)
    │       ├─ Parse deviceId values from removeDevice links
    │       ├─ Call removeDevice API to free a slot
    │       └─ attemptLogin() again ──→ code 200 ✓
    │
    └─ other error ──→ throw
```

---

## Handling the Device Limit (Code 423)

SunNXT limits simultaneous logins (typically 2-3 devices). When you hit the limit, the login response is:

```json
{
  "code": 423,
  "ui": {
    "buttons": [
      {
        "action": "webView",
        "buttonAction": "https://www.sunnxt.com/managedevices?token=abc123..."
      }
    ]
  }
}
```

### The Bypass

1. **Extract the token** from `buttonAction` URL using regex: `/token=([^&]+)/`
2. **Fetch the ManageDevices HTML page** (no auth check on this endpoint)
3. **Parse device IDs** from the HTML using regex: `/removeDevice[^"']*deviceId=(\d+)/g`
4. **Call `removeDevice`** for the first device in the list

```typescript
async function removeDevice(token: string, deviceId: string): Promise<void> {
  const url = `https://api.sunnxt.com/user/v4/removeDevice/`
            + `?token=${encodeURIComponent(token)}&deviceId=${deviceId}&redirectUrl=`;
  await fetch(url, { method: "GET", redirect: "manual" });
}
```

> [!NOTE]
> This endpoint requires only a `token` parameter — no CSRF token, no secondary confirmation. One GET request removes a registered device from the account.

After removal, `attemptLogin()` is retried and should succeed.

---

## Session Invalidation

### Soft Invalidation — `invalidateSession()`

```typescript
export function invalidateSession() {
  cachedCookies = "";
}
```

Called when the media API returns HTTP 401 or 403 — the cached cookies are stale but the account is fine. Next call to `getSunnxtCookies()` will trigger a fresh login.

### Hard Invalidation — `forceRelogin()`

```typescript
export async function forceRelogin(): Promise<string> {
  cachedCookies = "";
  loginPromise = null;

  // Tell SunNXT to invalidate the old session (best-effort)
  try {
    await fetch("https://www.sunnxt.com/next/api/logout", {
      method: "POST",
      headers: LOGIN_HEADERS,
    });
  } catch { /* ignore — logout is not critical */ }

  // Fresh login — SunNXT evaluates the new IP
  return getSunnxtCookies();
}
```

Called when a **roaming/geo-block** error is detected. The key difference: we call `logout` first so SunNXT re-evaluates the current IP (our Mumbai Vercel node) instead of using the cached roaming-flagged session.

---

## Cookie Extraction

SunNXT sets multiple cookies via `Set-Cookie` headers. We collect all of them:

```typescript
function extractCookies(res: Response): string {
  // Modern browsers / Node 18+: getSetCookie() returns an array
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) {
    // Extract just the key=value part (drop path=/, expires=, etc.)
    return raw.map((c) => c.split(";")[0]).join("; ");
  }

  // Fallback: older environments return a single comma-joined header
  const single = res.headers.get("set-cookie");
  if (single) {
    return single.split(",").map((c) => c.trim().split(";")[0]).join("; ");
  }

  return "";
}
```

The resulting string looks like:
```
sessionid=abc123; csrftoken=xyz789; __utma=...
```

This is then attached to all subsequent SunNXT API requests as a `Cookie` header.

---

## The Retry Logic in Media Route

When the media API is called, it doesn't always need a re-login. Here is the decision tree:

```
fetchMedia() → response
    │
    ├─ videos.status (error object) → return 404 immediately, NO retry
    │
    ├─ blocked_reason / roaming_expired → forceRelogin() → retry once
    │
    ├─ code 401 or 403 → invalidateSession() + getSunnxtCookies() → retry once
    │
    ├─ code 200 + no videos.values → getSunnxtCookies() → retry once
    │
    └─ code 200 + videos.values present → return ✓
```

> [!IMPORTANT]
> We never retry more than once. Infinite retry loops could hammer SunNXT's servers and get the IP banned.

---

## Security Note: Credentials in Environment Variables

Credentials are **never** hardcoded in source files. They live in `.env.local`:

```env
SUNNXT_USERID=your_phone_or_email
SUNNXT_PASSWORD=your_password
```

`lib/sunnxt-session.ts` reads them at runtime:

```typescript
const userid = process.env.SUNNXT_USERID;
const password = process.env.SUNNXT_PASSWORD;
if (!userid || !password) throw new Error("SUNNXT credentials not configured in .env.local");
```

`.env.local` is covered by `.gitignore` (`!.env*`) and will never be committed.

---

**[Next: CORS Proxy & Manifests →](05-cors-proxy.md)**
