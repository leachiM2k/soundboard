# Milestones

## v1.0 iPhone Soundboard PWA (Shipped: 2026-02-22)

**Phases completed:** 3 phases, 11 plans

**Stats:**
- 65 files changed, ~1,250 LOC TypeScript
- Timeline: 1 day (2026-02-22)
- Git range: `cd2c70b` → `bc6a7fe`

**Key accomplishments:**
1. Scaffolded Vanilla TypeScript + Vite 7 project with idb-keyval IndexedDB storage layer and MIME type detection constant
2. iOS-safe MediaRecorder with 25s warning + 30s auto-stop; Web Audio API player with per-tile parallel playback and AudioBuffer cache
3. 9-slot state machine wiring all 6 tile states, verified on real iPhone Safari
4. 3×3 CSS grid UI with pulsing recording animation, long-press action sheet (Delete/Rename/Re-record), haptic feedback — 9 iPhone tests passed
5. VitePWA service worker precaching 13 assets; app installs to iPhone Home Screen in standalone mode; fully offline after first load
6. Custom iOS install banner (once-per-day, standalone-aware) + Screen Wake Lock — all 4 PWA tests verified on real iPhone

**Archive:** `.planning/milestones/v1.0-ROADMAP.md`
**Audit:** `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
**Requirements:** `.planning/milestones/v1.0-REQUIREMENTS.md`

---

## v1.1 UX-Polish + Neue Fähigkeiten (Shipped: 2026-02-23)

**Phases completed:** 3 phases (4–6), 8 plans, 21 tasks

**Stats:**
- 49 files changed, ~1,807 LOC TypeScript
- Timeline: 1 day (2026-02-23)

**Key accomplishments:**
1. Delete confirmation dialog — two-tap guard before irreversible clip removal; async Promise<boolean> pattern (UX-01)
2. Clip duration badge on all occupied tiles including playing state; per-tile color picker with 9 presets, CSS custom property, IndexedDB persistence (UX-02, COLOR-01)
3. Real-time 12-bar frequency visualizer during recording — AnalyserNode + canvas rAF loop, iOS 14-safe (VIZ-01)
4. SVG progress ring synchronized to AudioContext.currentTime during playback, 30fps cap (UX-03)
5. Lossless offset-based silence auto-trim with 5-second Undo toast; non-blocking, session-only undo (TRIM-01)
6. Clip export via iOS Share Sheet (Web Share Level 2) with browser-mode download fallback; format fix ensures recordings are always AAC/M4A for WhatsApp compatibility (SHARE-01)

**Archive:** `.planning/milestones/v1.1-ROADMAP.md`
**Requirements:** `.planning/milestones/v1.1-REQUIREMENTS.md`

---

