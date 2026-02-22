---
phase: 03-pwa-shell-and-offline
verified: 2026-02-22T22:30:00Z
status: human_needed
score: 10/10 automated must-haves verified
human_verification:
  - test: "PWA-01 — Add to Home Screen and standalone launch"
    expected: "App adds to iPhone Home Screen, launches in standalone mode (no Safari chrome), icon shows soundboard grid design"
    why_human: "iOS Safari install flow and standalone detection cannot be verified programmatically — requires physical device"
  - test: "PWA-02 — Offline capability in airplane mode"
    expected: "App loads from service worker cache when Safari is offline after one online load; previously recorded sounds play back offline"
    why_human: "Service worker caching and offline load cannot be simulated without a real device and network toggle"
  - test: "PWA-03 — Install banner behavior in Safari browser mode"
    expected: "Banner appears after first tile tap (~800ms delay), dismissed by X button, suppressed within 24h, absent in standalone mode"
    why_human: "Banner timing, standalone suppression, and localStorage cooldown require real Safari on iPhone to confirm"
  - test: "Wake Lock — Screen stays on during 30s recording"
    expected: "Screen does not dim or sleep while recording is active; releasing on stop works"
    why_human: "Screen Wake Lock API behavior is device + iOS version dependent and cannot be simulated"
---

# Phase 3: PWA Shell and Offline Verification Report

**Phase Goal:** Ship a fully installable and offline-capable PWA that works on real iPhones.
**Verified:** 2026-02-22T22:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

The 03-03-SUMMARY.md documents that all four iPhone tests passed ("approved" by user). This automated
verification independently confirms all programmatically checkable must-haves across plans 03-01 and
03-02. The four iPhone-specific behaviors are flagged for human verification as they cannot be confirmed
from the codebase alone.

---

## Goal Achievement

### Observable Truths (Plan 03-01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | App produces a web app manifest at /manifest.webmanifest after build | VERIFIED | `dist/manifest.webmanifest` exists, 439B, valid JSON with name, display:standalone, icons, theme_color |
| 2 | index.html contains apple-mobile-web-app-capable, apple-touch-icon link, and theme-color meta tags | VERIFIED | Lines 7, 8, 9, 10, 11 of index.html — all 5 iOS tags present |
| 3 | Service worker is registered and precaches all JS, CSS, HTML, and PNG assets after build | VERIFIED | `dist/sw.js` (1.6K) and `dist/workbox-8c29f6e4.js` present; vite.config.ts uses `globPatterns: ['**/*.{js,css,html,ico,png,svg}']` with `registerType: 'autoUpdate'` |
| 4 | Navigating to the app root while offline serves the app shell (not browser error page) | HUMAN | SW precache configured — actual offline behavior requires real device test |
| 5 | Navigating to an uncached URL offline serves public/offline.html | HUMAN | `navigateFallback: 'offline.html'` in vite.config.ts workbox config; offline.html in dist/ confirmed — but serving behavior requires real device |
| 6 | All three PNG icon files exist in public/ at the required sizes | VERIFIED | apple-touch-icon.png (180x180, 10K), pwa-192x192.png (192x192, 8K), pwa-512x512.png (512x512, 19K) — all valid PNG image data confirmed by `file` command |

### Observable Truths (Plan 03-02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | Install banner does not appear when app is launched in standalone mode | VERIFIED (logic) | `isStandalone()` checks both `navigator.standalone === true` AND `(display-mode: standalone)` media query; `shouldShowInstallBanner()` returns false if either is true |
| 8 | Install banner appears after the user's first tile tap (not on page load) | VERIFIED (logic) | `triggerInstallBannerOnce()` called at line 59 in `handleTileTap()`, after `triggerHaptic()`, before any await; `setTimeout(() => showInstallBanner(), 800)` provides 800ms delay |
| 9 | Install banner does not appear if it was already shown within the last 24 hours | VERIFIED (logic) | `wasShownToday()` reads `installBannerShownAt` from localStorage; `markShown()` writes timestamp; `shouldShowInstallBanner()` gates on both |
| 10 | Install banner has an X dismiss button that removes it and sets the shown timestamp | VERIFIED | `showInstallBanner()` creates `.install-banner-close` button with `banner.remove()` click handler; `markShown()` called before DOM creation in `showInstallBanner()` |
| 11 | Screen wake lock is requested when recording starts and released when recording stops | VERIFIED | `void acquireWakeLock()` at line 135 (after `startRecording`); `void releaseWakeLock()` at line 94 (onComplete) and line 143 (manual stop case) — 4 total references (import + 3 call sites) |
| 12 | Wake lock failure is non-fatal — recording continues if lock cannot be acquired | VERIFIED | `acquireWakeLock()` has feature detection (`if (!('wakeLock' in navigator)) return`) and try/catch that swallows errors silently |

**Score:** 10/10 automated must-haves verified (4 remaining require human/device verification)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.ts` | VitePWA plugin config with manifest, icons, workbox precache, navigateFallback | VERIFIED | Imports VitePWA, registerType:autoUpdate, globPatterns, navigateFallback:'offline.html', includeAssets, full manifest object |
| `public/apple-touch-icon.png` | iOS Home Screen icon (180x180 PNG) | VERIFIED | PNG image data, 180x180, 16-bit/color RGBA, 10K |
| `public/pwa-192x192.png` | PWA manifest icon 192x192 PNG | VERIFIED | PNG image data, 192x192, 16-bit/color RGBA, 8K |
| `public/pwa-512x512.png` | PWA manifest icon 512x512 PNG | VERIFIED | PNG image data, 512x512, 16-bit/color RGBA, 19K |
| `public/offline.html` | Branded offline fallback page served by service worker navigateFallback | VERIFIED | Exists (863B), dark navy #1a1a2e background, German text "Öffne die App einmal online..." |
| `index.html` | iOS-required meta tags in head | VERIFIED | apple-mobile-web-app-capable, apple-mobile-web-app-title, apple-mobile-web-app-status-bar-style, theme-color, link rel=apple-touch-icon — all 5 present |
| `src/ui/install-banner.ts` | shouldShowInstallBanner(), showInstallBanner() exports | VERIFIED | Both functions exported; isStandalone(), wasShownToday(), markShown() guard functions all present |
| `src/audio/wake-lock.ts` | acquireWakeLock(), releaseWakeLock() exports | VERIFIED | Both async functions exported with feature detection and try/catch |
| `src/main.ts` | Banner trigger after first tile tap; wake lock in recording start/stop paths | VERIFIED | triggerInstallBannerOnce() at line 59; acquireWakeLock() line 135; releaseWakeLock() lines 94 and 143 |
| `src/style.css` | #install-banner CSS with safe-area-inset-bottom | VERIFIED | `#install-banner` block with `position: fixed; bottom: 0`, `padding-bottom: calc(0.875rem + env(safe-area-inset-bottom))` |
| `dist/sw.js` | Service worker built by VitePWA | VERIFIED | 1.6K, present in dist/ |
| `dist/manifest.webmanifest` | Web app manifest | VERIFIED | 439B, valid JSON with name:Soundboard, display:standalone, start_url:/, theme_color, 3 icons |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `vite.config.ts` | `public/apple-touch-icon.png` | `includeAssets` in VitePWA config | VERIFIED | `includeAssets: ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png']` present; file confirmed in dist/ |
| `vite.config.ts` | `public/offline.html` | `workbox.navigateFallback` | VERIFIED | `navigateFallback: 'offline.html'` in workbox config; offline.html confirmed in dist/ |
| `index.html` | `public/apple-touch-icon.png` | `link rel=apple-touch-icon` | VERIFIED | Line 11: `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` |
| `src/main.ts` | `src/ui/install-banner.ts` | `showInstallBanner()` called after first `handleTileTap` resolves | VERIFIED | Import line 9; `triggerInstallBannerOnce()` calls `showInstallBanner()` at line 20; triggered at line 59 |
| `src/main.ts` | `src/audio/wake-lock.ts` | `acquireWakeLock()` in recording start, `releaseWakeLock()` in onComplete and manual stop | VERIFIED | Import line 10; `acquireWakeLock()` line 135; `releaseWakeLock()` lines 94 and 143 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PWA-01 | 03-01, 03-03 | App kann über Safari zum iPhone Home Screen hinzugefügt werden | NEEDS HUMAN | Manifest, icons, and iOS meta tags verified in code; actual Add to Home Screen flow requires iPhone confirmation (user approved in 03-03-SUMMARY) |
| PWA-02 | 03-01, 03-03 | App funktioniert offline nach der ersten Installation | NEEDS HUMAN | Service worker + navigateFallback configured and built; offline loading requires device verification (user approved in 03-03-SUMMARY) |
| PWA-03 | 03-02, 03-03 | App zeigt einmaligen Hinweis "Zum Home Screen hinzufügen" im Safari-Browser-Modus | NEEDS HUMAN | Banner logic fully implemented and wired; standalone suppression logic verified; behavioral confirmation requires device (user approved in 03-03-SUMMARY) |

No orphaned requirements — all three PWA requirements from REQUIREMENTS.md appear in plan frontmatter and are accounted for.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| — | None | — | Zero anti-patterns found across all modified files |

Grep for TODO/FIXME/XXX/HACK/PLACEHOLDER returned 0 matches in install-banner.ts, wake-lock.ts, vite.config.ts, and offline.html. No empty implementations or console-log-only stubs detected.

---

## Human Verification Required

Note: The 03-03-SUMMARY.md documents that the user ran all four tests and confirmed "approved" (all pass). These items are flagged because they cannot be independently confirmed from the codebase alone.

### 1. PWA-01 — Add to Home Screen and Standalone Launch

**Test:** Open the ngrok HTTPS URL in Safari on iPhone. Tap Share, then "Zum Home-Bildschirm hinzufügen". Confirm icon preview shows soundboard grid (not screenshot). Add it. Launch from Home Screen icon.
**Expected:** App opens in fullscreen standalone mode — no Safari address bar or navigation chrome. Title bar shows "Soundboard".
**Why human:** iOS Safari Add to Home Screen flow and standalone mode cannot be verified programmatically.

### 2. PWA-02 — Offline Capability in Airplane Mode

**Test:** Load app via ngrok (must be production build: `npm run build && npx serve dist`). Wait for full load. Enable Airplane Mode. Close and reopen Safari, navigate to ngrok URL.
**Expected:** App loads completely from service worker cache — not a browser "offline" error page. Previously recorded sounds play back offline.
**Why human:** Service worker registration and cache serving require a real device and network control.

### 3. PWA-03 — Install Banner Behavior

**Test:** Open app in Safari browser mode (via ngrok URL, not from Home Screen). Clear `installBannerShownAt` from localStorage if needed. Tap any tile.
**Expected:** After ~800ms, banner appears at bottom with "Teilen → Zum Home-Bildschirm" text and X button. X dismisses it. Reload and tap again — banner does NOT reappear. Launch from Home Screen (standalone) and tap — banner does NOT appear.
**Why human:** Banner timing, localStorage cooldown state, and standalone suppression require Safari on iPhone to confirm.

### 4. Wake Lock — Screen Stays On During Recording

**Test:** In Safari browser mode, tap an empty tile to start recording. Leave iPhone idle for 30+ seconds without touching.
**Expected:** Screen does not dim or sleep during recording. Screen dims/sleeps normally after recording stops.
**Why human:** Wake Lock API behavior is iOS version and device dependent (broken before iOS 18.4 in standalone mode).

---

## Summary

All 10 programmatically verifiable must-haves pass at all three verification levels (exists, substantive, wired):

- **Plan 03-01** (PWA foundation): vite.config.ts has complete VitePWA configuration. Build output contains sw.js, manifest.webmanifest, all three icon PNGs, and offline.html. index.html has all 5 iOS meta tags. Key links between config, assets, and HTML all verified.

- **Plan 03-02** (Banner and Wake Lock): install-banner.ts implements all guard logic (standalone detection, localStorage cooldown). wake-lock.ts implements feature detection with non-fatal try/catch. main.ts imports both modules and calls them in the correct places (banner on first tile tap, wake lock around recording start/stop). Banner CSS in style.css includes safe-area-inset-bottom padding.

- **Plan 03-03** (iPhone verification): This was a human verification checkpoint. 03-03-SUMMARY.md records user confirmation that all four tests passed on real iPhone Safari. This automated verifier cannot replicate that confirmation but has found no code-level gaps that would contradict it.

The three PWA requirements (PWA-01, PWA-02, PWA-03) from REQUIREMENTS.md are each covered by at least one plan and all are marked Complete in the traceability table. No orphaned requirements found.

---

_Verified: 2026-02-22T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
