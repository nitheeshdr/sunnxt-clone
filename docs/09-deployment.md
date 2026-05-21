# 09 — Deployment

**[← Geo-block & Security](08-geo-security.md) · [Back to README →](../README.md)**

---

## Overview

This app is designed to run on **Vercel** with the **Mumbai (`bom1`)** region. The region setting is the most critical production configuration — without it, SunNXT will geo-block all requests.

---

## Step 1: Fork / Clone the Repo

```bash
git clone https://github.com/nitheeshdr/sunnxt-clone.git
cd sunnxt-clone
npm install
```

---

## Step 2: Set Up Environment Variables Locally

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
SUNNXT_USERID=your_phone_number_or_email
SUNNXT_PASSWORD=your_sunnxt_password
```

> [!WARNING]
> Never commit `.env.local`. It is already in `.gitignore`. If you accidentally commit it, rotate your password immediately.

---

## Step 3: Test Locally

```bash
npm run dev
```

Open `http://localhost:3000`. The server will auto-login to SunNXT on first request (~1 second). If you're running this from India, playback should work immediately.

### Verifying Login

Check the terminal logs when loading the home page. You should see requests to SunNXT's browse API with HTTP 200 responses, not 401.

### Forcing a Session Reset

If you see auth errors:

```
http://localhost:3000/api/auth/clear-session
```

This calls SunNXT logout and re-login. Returns `{ "success": true }`.

---

## Step 4: Deploy to Vercel

### Option A: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

During the first deploy, Vercel will prompt for environment variables. Add:
- `SUNNXT_USERID` = your phone/email
- `SUNNXT_PASSWORD` = your password

### Option B: GitHub Integration

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Select the repo
4. Add environment variables in the Vercel dashboard
5. Deploy

---

## Step 5: Verify the Mumbai Region

Check `vercel.json` in the root of the project:

```json
{ "regions": ["bom1"] }
```

This file is already committed. Vercel reads it automatically during deployment. You do **not** need to configure the region manually in the Vercel dashboard.

### Verify Region After Deploy

```bash
vercel logs --prod | grep region
```

Or check the "Function" tab in the Vercel deployment dashboard — each serverless function should show `bom1 - Mumbai, India`.

---

## Step 6: First Deployment — Clear Session

After the first Vercel deploy, the function instances start cold. On the first request, the server will log in from the Mumbai node. SunNXT will see an Indian IP and grant a valid session.

If you previously had a roaming-blocked session cached (from a non-Mumbai deploy), hit the reset endpoint once:

```
https://your-app.vercel.app/api/auth/clear-session
```

---

## Environment Variables on Vercel

In the Vercel dashboard: **Project → Settings → Environment Variables**

| Name | Value | Environments |
|---|---|---|
| `SUNNXT_USERID` | Phone number or email | Production, Preview, Development |
| `SUNNXT_PASSWORD` | Your SunNXT password | Production, Preview, Development |

---

## Build Configuration

No special build config needed. Vercel auto-detects Next.js and uses the default build command:

```bash
next build
```

The `vercel.json` only configures region — everything else uses Vercel defaults.

---

## Troubleshooting

### "International Roaming Expired" on Vercel

**Cause:** The deployment is not running in the `bom1` region, or the cached session was created from a non-Indian IP.

**Fix:**
1. Verify `vercel.json` has `"regions": ["bom1"]`
2. Trigger a redeployment (push any commit)
3. After deploy: hit `https://your-app.vercel.app/api/auth/clear-session`

---

### "Stream Unavailable" for All Content

**Cause:** Session cookie is invalid — SunNXT returned 401/403.

**Fix:** Hit `https://your-app.vercel.app/api/auth/clear-session`

---

### Video Starts Then Freezes

**Cause:** CDN token expired mid-playback (tokens expire ~4-8 hours after issue).

**Fix:** Reload the player page. The media route will fetch a fresh CDN URL with a new token.

---

### "Video is not available" Message

**Cause:** This specific content has no playable stream on SunNXT (common for promotional content and trailers with type `"promotion"`).

**Fix:** This is expected — there is no stream to play. Use the back button.

---

### 404 on All DASH Quality Variants

**Cause:** SunNXT's Akamai CDN doesn't have any MPD file uploaded for this content.

**Fix:** The player automatically falls through to HLS. If HLS also fails, the content genuinely has no available stream.

---

### Vercel Build Fails: "Module not found: shaka-player"

**Cause:** Shaka Player has native module dependencies that conflict with SSR.

**Fix:** Already handled — the player uses `await import("shaka-player")` (dynamic import, client-only). This is correct. If you see this error, check that you haven't imported shaka-player at the top level of any file.

---

## Vercel Regions Reference

| Region Code | Location |
|---|---|
| `bom1` | Mumbai, India ← **use this** |
| `iad1` | Washington DC, USA |
| `sfo1` | San Francisco, USA |
| `sin1` | Singapore |
| `hnd1` | Tokyo, Japan |

---

## Local Development with a Different IP

If you're developing outside India and want to test locally without geo-blocking, you have two options:

1. **VPN to India** — Connect to an Indian VPN server before running `npm run dev`. The server-side SunNXT requests will originate from the Indian IP.

2. **Test the Vercel deployment** — Deploy to Vercel with `bom1` and test at your Vercel URL. The server runs in Mumbai regardless of where you are.

---

**[Back to README →](../README.md)**
