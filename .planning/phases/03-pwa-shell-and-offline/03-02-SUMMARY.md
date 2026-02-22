---
phase: 03-pwa-shell-and-offline
plan: "02"
subsystem: pwa-ux
tags: [install-prompt, wake-lock, ios-safari, pwa]
dependency_graph:
  requires: [03-01]
  provides: [install-banner, wake-lock-integration]
  affects: [src/main.ts, src/style.css]
tech_stack:
  added: []
  patterns: [Screen Wake Lock API, localStorage cooldown guard, iOS standalone detection]
key_files:
  created:
    - src/ui/install-banner.ts
    - src/audio/wake-lock.ts
  modified:
    - src/main.ts
    - src/style.css
decisions:
  - "triggerInstallBannerOnce() placed after triggerHaptic() but before any await — preserves iOS user gesture context while also satisfying first-interaction requirement"
  - "releaseWakeLock() called in both onComplete and the manual-stop recording case — ensures wake lock is released regardless of how recording ends"
  - "void operator used for fire-and-forget async wake lock calls — satisfies TypeScript no-floating-promises convention without blocking recording flow"
metrics:
  duration_seconds: 108
  completed_date: "2026-02-22"
  tasks_completed: 2
  files_modified: 4
---

# Phase 3 Plan 02: Install Banner and Wake Lock Summary

**One-liner:** Custom iOS install banner (once-per-day after first tap, standalone-aware) and Screen Wake Lock integration for the 30s recording flow.

## What Was Built

### Task 1: install-banner.ts and wake-lock.ts

`src/ui/install-banner.ts` — iOS install prompt module:
- `isStandalone()`: detects both iOS proprietary `navigator.standalone` and standard `(display-mode: standalone)` media query
- `wasShownToday()`: checks localStorage for a timestamp within the last 24 hours
- `shouldShowInstallBanner()`: public predicate combining both guards
- `showInstallBanner()`: creates `#install-banner` div with German copy ("↑ Teilen → Zum Home-Bildschirm"), appends to body, wires dismiss X button

`src/audio/wake-lock.ts` — Screen Wake Lock module:
- `acquireWakeLock()`: feature-detects `'wakeLock' in navigator`, calls `navigator.wakeLock.request('screen')` with try/catch (non-fatal)
- `releaseWakeLock()`: releases the sentinel if held, ignores release errors (sentinel may already be released if tab went hidden)

### Task 2: main.ts wiring and style.css banner CSS

`src/main.ts` changes:
- Imports `showInstallBanner` and `acquireWakeLock`/`releaseWakeLock`
- `_bannerShown` boolean guard + `triggerInstallBannerOnce()` function with 800ms setTimeout delay
- `triggerInstallBannerOnce()` called immediately after `triggerHaptic()` in `handleTileTap` (before any `await`)
- `void acquireWakeLock()` called after `startRecording(...)` resolves in the `empty` case
- `void releaseWakeLock()` in the `onComplete` callback (auto-stop and save path)
- `void releaseWakeLock()` in the `recording` case before `stop()` (manual stop path)

`src/style.css` — `#install-banner` fixed-bottom styles:
- `z-index: 1000`, `position: fixed; bottom: 0`
- `padding-bottom: calc(0.875rem + env(safe-area-inset-bottom))` — clears iPhone Home indicator and Safari toolbar
- Dismiss button with `-webkit-tap-highlight-color: transparent` and `touch-action: manipulation`

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |
| `npm run build` | PASS — 18 modules, 13 precached entries |
| wake lock count in main.ts | 4 (import + acquire + 2x release) |
| triggerInstallBannerOnce in main.ts | Present, called after triggerHaptic() |
| env(safe-area-inset-bottom) in style.css | Present in banner padding-bottom |
| isStandalone/wasShownToday/markShown | All three guard functions present |

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 349be71 | feat(03-02): add install-banner and wake-lock modules |
| 2 | eec7b62 | feat(03-02): wire install banner and wake lock into main.ts; add banner CSS |

## Self-Check: PASSED

All files exist and both task commits are present in git history.
