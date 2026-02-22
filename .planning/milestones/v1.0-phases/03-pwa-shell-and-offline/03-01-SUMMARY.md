---
phase: 03-pwa-shell-and-offline
plan: 01
subsystem: pwa
tags: [vite-plugin-pwa, workbox, service-worker, manifest, ios-pwa, offline]

# Dependency graph
requires:
  - phase: 02-tile-ui-and-interaction
    provides: index.html and app shell structure that receives iOS meta tags
provides:
  - Web app manifest at /manifest.webmanifest (display standalone, theme_color, icons)
  - Service worker (sw.js) precaching all JS/CSS/HTML/PNG assets via Workbox
  - Offline fallback page (public/offline.html) served when uncached URL is navigated
  - Three PNG icons in public/: apple-touch-icon.png, pwa-192x192.png, pwa-512x512.png
  - iOS Home Screen meta tags in index.html
affects: [future PWA plans, install-prompt plan (03-02)]

# Tech tracking
tech-stack:
  added: [vite-plugin-pwa@1.2.0, workbox (bundled with vite-plugin-pwa)]
  patterns: [VitePWA autoUpdate mode, Workbox generateSW with globPatterns, navigateFallback for offline]

key-files:
  created:
    - public/icon.svg
    - public/apple-touch-icon.png
    - public/pwa-192x192.png
    - public/pwa-512x512.png
    - public/offline.html
  modified:
    - vite.config.ts
    - index.html

key-decisions:
  - "registerType autoUpdate chosen over prompt — silent background updates via Workbox skipWaiting/clientsClaim, no user prompt"
  - "navigateFallback set to offline.html not /index.html — uncached navigations get a branded offline page, not a broken app shell"
  - "ImageMagick used for SVG-to-PNG conversion — @vite-pwa/assets-generator CLI failed silently; ImageMagick was available via Homebrew"
  - "apple-touch-icon.png generated at 180x180 independently (not a copy of 192x192) — correct size for iOS Home Screen"
  - "theme_color #1a1a2e (dark navy) — matches offline.html background, status bar blends with app UI"
  - "background_color #ff6b35 (orange) — matches icon background, used as splash screen color on install"

patterns-established:
  - "VitePWA config lives in vite.config.ts — single source of truth for manifest, icons, and workbox config"
  - "All PWA assets in public/ — served as-is by Vite in dev and copied to dist/ on build"

requirements-completed: [PWA-01, PWA-02]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 3 Plan 01: PWA Manifest, Service Worker, and Offline Fallback Summary

**VitePWA plugin with Workbox precache, web app manifest (display:standalone), iOS Home Screen meta tags, and a branded German offline fallback page**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-22T22:02:23Z
- **Completed:** 2026-02-22T22:06:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- vite-plugin-pwa@1.2.0 installed and configured with autoUpdate, globPatterns, and navigateFallback
- Build produces sw.js and manifest.webmanifest; Workbox precaches 13 entries (55.68 KiB)
- Three PNG icons generated from SVG source (512, 192, 180px) using ImageMagick
- iOS-specific meta tags added to index.html: apple-mobile-web-app-capable, title, status-bar-style, theme-color, apple-touch-icon link
- Branded German offline fallback page (dark navy, German text) registered as navigateFallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vite-plugin-pwa and generate PNG icons** - `7bfb433` (chore)
2. **Task 2: Configure VitePWA plugin and add iOS meta tags** - `3bef57d` (feat)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified

- `public/icon.svg` - SVG source: orange #ff6b35 background with 3x3 white dot grid (512x512 viewBox)
- `public/apple-touch-icon.png` - 180x180 PNG for iOS Home Screen
- `public/pwa-192x192.png` - 192x192 PNG for web app manifest
- `public/pwa-512x512.png` - 512x512 PNG for web app manifest (also used as maskable)
- `public/offline.html` - Branded offline fallback in German, dark navy #1a1a2e background
- `vite.config.ts` - VitePWA plugin: autoUpdate, workbox globPatterns, navigateFallback, manifest with name/icons/display/theme
- `index.html` - Added 5 iOS PWA meta tags (apple-mobile-web-app-capable, title, status-bar-style, theme-color, apple-touch-icon link)

## Decisions Made

- Used `registerType: 'autoUpdate'` — no update prompt; new SW activates silently on next page reload per plan spec
- `navigateFallbackDenylist: []` kept explicit (empty) — matches plan exactly; all navigations go through the fallback if uncached
- Did NOT add `skipWaiting` or `clientsClaim` manually — `autoUpdate` in vite-plugin-pwa already injects these correctly; adding them again would be the documented anti-pattern
- `theme_color: '#1a1a2e'` (dark navy) — matches offline page background, blends with app's dark tile grid UI
- `background_color: '#ff6b35'` (orange) — matches icon background, appears on install splash screen

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @vite-pwa/assets-generator CLI failed silently; used ImageMagick fallback**

- **Found during:** Task 1 (install and generate icons)
- **Issue:** `npx @vite-pwa/assets-generator --preset minimal --source public/icon.svg` exited with code 1 and no output, even with `@latest` version
- **Fix:** Used ImageMagick (`convert`) which was available via Homebrew at `/opt/homebrew/bin/convert`. Generated all three PNG sizes directly from the SVG.
- **Files modified:** public/apple-touch-icon.png, public/pwa-192x192.png, public/pwa-512x512.png (all created)
- **Verification:** `file public/apple-touch-icon.png` confirmed "PNG image data"; all three files non-zero (10K, 8K, 19K)
- **Committed in:** `7bfb433` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — CLI tool failure, used built-in system tool as fallback)
**Impact on plan:** No scope change. Output is identical: three valid PNG files at required dimensions.

## Issues Encountered

None beyond the assets-generator CLI failure (handled automatically via Rule 3 fallback).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PWA foundation complete: manifest, service worker, icons, iOS meta tags all in place
- `npm run build` passes clean with 13 precached entries
- Phase 3 Plan 02 (install prompt banner) can proceed immediately — standalone mode detection and localStorage suppression logic builds directly on this foundation

---
*Phase: 03-pwa-shell-and-offline*
*Completed: 2026-02-22*
