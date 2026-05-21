<div align="center">

# SunNXT Clone

**A production-grade reverse-engineered streaming client built with Next.js**

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Shaka Player](https://img.shields.io/badge/Shaka_Player-5.x-4285f4?logo=google)](https://shaka-player-demo.appspot.com)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)](https://vercel.com)

A fully functional clone of the [SunNXT](https://www.sunnxt.com) streaming platform built entirely from real API traffic. No mock data, no static fixtures — everything is live. Built for learning purposes: to understand how modern OTT platforms work under the hood.

</div>

---

## What Does This Project Do?

| Feature | Description |
|---|---|
| 🏠 **Home Feed** | Carousel groups — Trending, New Releases, Movies, TV Shows |
| 🔍 **Search** | Content-type filters: Movies, TV Shows, Comedy, Music, Short Films, Live TV |
| 📄 **Detail Pages** | Cast, genres, subtitles, release year, Dolby badge |
| ▶️ **Video Player** | MPEG-DASH + HLS adaptive streaming via Shaka Player |
| 📺 **Live TV** | Real-time live channel streaming |
| 🔐 **DRM Support** | Widevine & PlayReady encrypted streams |
| 🌍 **Geo-block Handling** | Detects roaming errors and auto re-authenticates |
| 🔄 **Auto Login** | Server-side session with automatic refresh + device-limit bypass |
| 💓 **Heartbeat** | Tracks watch sessions (Start/Stop events every 30 s) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (React / Shaka)                       │
│                                                                  │
│  Page Router    →    /api/*  (all API calls — never direct)     │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js App Router  (Vercel — Mumbai bom1)          │
│                                                                  │
│  /api/media/[id]    →  Resolve + decrypt stream URLs            │
│  /api/stream-proxy  →  CORS proxy + manifest rewriter           │
│  /api/license       →  DRM license proxy (Widevine/PlayReady)   │
│  /api/search        →  Search proxy                             │
│  /api/heartbeat     →  Playback session tracking                │
│                                                                  │
│  lib/sunnxt-session.ts  — AES encrypt/decrypt · cookie cache    │
│                           auto-login · device management         │
└──────┬──────────────────────────┬────────────────────────────────┘
       │ Login / Media API         │ CDN Segment Requests
       ▼                           ▼
┌──────────────────┐     ┌──────────────────────────────┐
│  www.sunnxt.com  │     │  livestream*.sunnxt.com       │
│  pwaapi.sunnxt   │     │  *-suntvvod*.akamaized.net    │
│  (Origin API)    │     │  (Akamai Media CDN)           │
└──────────────────┘     └──────────────────────────────┘
```

> The browser **never** contacts SunNXT directly. Every request — authentication, content metadata, stream URLs, CDN segments — is routed through Next.js route handlers that inject auth cookies server-side.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 16 App Router | Server-side API routes + RSC |
| Language | TypeScript 5 | Type safety across API contracts |
| Styling | Tailwind CSS v4 | Rapid utility-first UI |
| Video | Shaka Player 5 | DASH + HLS + Widevine DRM |
| Crypto | CryptoJS 4 | AES-128-CBC for SunNXT payloads |
| Hosting | Vercel (bom1) | Mumbai region → Indian IP for SunNXT |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/nitheeshdr/sunnxt-clone.git
cd sunnxt-clone

# 2. Install
npm install

# 3. Configure credentials
cp .env.local.example .env.local
# Edit .env.local — add your SunNXT phone number and password

# 4. Run
npm run dev
# → http://localhost:3000
```

After first launch, the server automatically logs in to SunNXT and caches the session. No manual step needed.

**Session reset** (if playback fails):
```
http://localhost:3000/api/auth/clear-session
```

---

## Environment Variables

Create `.env.local` — this file is gitignored and never committed:

```env
SUNNXT_USERID=your_phone_or_email
SUNNXT_PASSWORD=your_password
```

---

## Project Structure

```
sunnxt-clone/
├── app/
│   ├── page.tsx                    # Home feed
│   ├── search/                     # Search with filters
│   ├── player/[contentId]/         # Video player
│   ├── [slug]/detail/[serviceId]/  # Content detail
│   └── api/
│       ├── media/[contentId]/      # Stream URL resolver
│       ├── stream-proxy/           # CDN CORS proxy
│       ├── license/                # DRM license proxy
│       ├── search/                 # Search proxy
│       ├── heartbeat/              # Watch session
│       └── auth/                   # Login / logout / status
│
├── lib/
│   ├── sunnxt-session.ts           # Server-side session management
│   └── api.ts                      # Client-side API helpers
│
├── components/                     # Navbar, HeroBanner, CarouselSection, ...
├── types/index.ts                  # Shared TypeScript types
├── vercel.json                     # → region: bom1 (Mumbai)
└── docs/                           # Step-by-step learning guides ↓
```

---

## Learning Guides

Follow these in order to understand how everything works:

| # | Guide | What You'll Learn |
|---|---|---|
| 01 | [Project Overview](docs/01-overview.md) | Goals, scope, tech decisions |
| 02 | [System Architecture](docs/02-architecture.md) | Request flow, why the proxy exists |
| 03 | [API & Encryption](docs/03-api-encryption.md) | SunNXT API endpoints, AES-CBC encryption |
| 04 | [Session & Auth](docs/04-session-auth.md) | Login flow, cookie cache, device-limit bypass |
| 05 | [CORS Proxy & Manifests](docs/05-cors-proxy.md) | Stream proxy, DASH/HLS manifest rewriting |
| 06 | [Video Player Pipeline](docs/06-video-player.md) | Shaka setup, format fallback, quality fallback |
| 07 | [DRM Handling](docs/07-drm.md) | Widevine & PlayReady license proxy |
| 08 | [Geo-block & Security](docs/08-geo-security.md) | Roaming detection, security findings |
| 09 | [Deployment](docs/09-deployment.md) | Vercel config, Mumbai region, troubleshooting |

---

## Deployment

The app is configured for Vercel with the Mumbai (`bom1`) region so SunNXT sees Indian IPs:

```json
// vercel.json
{ "regions": ["bom1"] }
```

See [docs/09-deployment.md](docs/09-deployment.md) for the full deployment walkthrough.

---

> **Disclaimer:** This project is built for educational and personal use only. It is not affiliated with or endorsed by SunNXT / Sun Network. Use responsibly and in accordance with the platform's Terms of Service.
