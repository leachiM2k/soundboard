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
