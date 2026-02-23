# Roadmap: iPhone Soundboard PWA

## Milestones

- ✅ **v1.0 iPhone Soundboard PWA** — Phases 1–3 (shipped 2026-02-22)
- 🚧 **v1.1 UX-Polish + Neue Fähigkeiten** — Phases 4–6 (in progress)

## Phases

<details>
<summary>✅ v1.0 iPhone Soundboard PWA (Phases 1–3) — SHIPPED 2026-02-22</summary>

- [x] Phase 1: Audio and Storage Pipeline (4/4 plans) — completed 2026-02-22
- [x] Phase 2: Tile UI and Interaction (4/4 plans) — completed 2026-02-22
- [x] Phase 3: PWA Shell and Offline (3/3 plans) — completed 2026-02-22

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

---

### 🚧 v1.1 UX-Polish + Neue Fähigkeiten (In Progress)

**Milestone Goal:** Improve the recording experience, make clips editable and shareable, and add visual identity through tile colors. Ships 7 new capabilities on top of the v1.0 foundation without breaking any existing behavior.

- [x] **Phase 4: Foundation** — Schema extension, delete confirmation dialog, clip duration badge, tile color persistence (completed 2026-02-23)
- [x] **Phase 5: Visual Feedback** — Live waveform visualizer during recording, playback progress indicator (completed 2026-02-23)
- [ ] **Phase 6: Audio Operations** — Auto-trim silence, clip export via Web Share API

## Phase Details

### Phase 4: Foundation
**Goal**: Users experience safer interactions and richer tile information through non-destructive delete flow, visible clip duration, and persisted tile colors
**Depends on**: Phase 3 (v1.0 complete)
**Requirements**: UX-01, UX-02, COLOR-01
**Success Criteria** (what must be TRUE):
  1. User tapping Delete in the long-press menu sees a confirmation dialog before the clip is removed
  2. Every occupied tile shows a clip-duration badge (e.g., "2.4s") in both has-sound and playing states
  3. User can pick one of 8 preset colors for a tile via the long-press menu; the color persists after app restart
  4. Existing v1.0 clips without a stored color load without errors (backward-compatible optional field)
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Schema extension (color field) + UX-02 duration badge fix in playing state
- [ ] 04-02-PLAN.md — UX-01 delete confirmation dialog (confirm-dialog.ts, action-sheet wire-up)
- [ ] 04-03-PLAN.md — COLOR-01 tile color picker (swatch row, CSS.supports validation, IndexedDB persistence)

### Phase 5: Visual Feedback
**Goal**: Users see live proof the microphone is active during recording and real-time progress while a clip plays
**Depends on**: Phase 4
**Requirements**: VIZ-01, UX-03
**Success Criteria** (what must be TRUE):
  1. During recording, frequency bars animate inside the tile canvas at up to 30fps, visibly reacting to sound
  2. The frequency bars stop and the canvas is removed cleanly when recording ends (no orange mic dot left on iOS)
  3. During playback, a progress ring or bar on the tile fills from 0% to 100% in real time and then disappears
  4. Progress animation is cancelled immediately when playback is stopped early (re-tap)
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md — VIZ-01 recording visualizer (viz-recording.ts, AnalyserNode + canvas bars, main.ts recording paths)
- [ ] 05-02-PLAN.md — UX-03 playback progress ring (viz-playback.ts, SVG stroke-dashoffset, player.ts onStarted, main.ts playback paths)

### Phase 6: Audio Operations
**Goal**: Users can tighten their clips by auto-trimming silence and share any clip via the iOS share sheet or file download
**Depends on**: Phase 5
**Requirements**: TRIM-01, SHARE-01
**Success Criteria** (what must be TRUE):
  1. After recording, silence at the start and end of a clip is trimmed automatically; user sees "Trim applied" feedback with an Undo option
  2. Tapping Trim on an already-saved clip via the long-press menu re-applies trim; the updated duration badge reflects the shorter clip
  3. User can tap Export in the long-press menu to share a clip via the iOS share sheet on iOS 15+
  4. On iOS 14.x or if share fails, a file download fallback is offered; in standalone PWA mode the download link is suppressed and only the share sheet is shown
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Shared foundation: SlotRecord trim fields, action sheet Trim + Export buttons
- [ ] 06-02-PLAN.md — TRIM-01: silence detection (trim.ts), toast with Undo (toast.ts), player trim offset support, auto-trim after recording
- [ ] 06-03-PLAN.md — SHARE-01: Web Share Level 2 (share.ts), download fallback, standalone mode detection, device verification checkpoint

## Progress

**Execution Order:** 4 → 5 → 6

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Audio and Storage Pipeline | v1.0 | 4/4 | Complete | 2026-02-22 |
| 2. Tile UI and Interaction | v1.0 | 4/4 | Complete | 2026-02-22 |
| 3. PWA Shell and Offline | v1.0 | 3/3 | Complete | 2026-02-22 |
| 4. Foundation | v1.1 | 3/3 | Complete | 2026-02-23 |
| 5. Visual Feedback | v1.1 | 2/2 | Complete | 2026-02-23 |
| 6. Audio Operations | v1.1 | 0/3 | Not started | - |
