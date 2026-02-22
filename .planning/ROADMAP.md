# Roadmap: iPhone Soundboard PWA

## Overview

Three phases deliver the complete soundboard. Phase 1 builds the audio and storage pipeline — the iOS Safari constraints (AudioContext unlock, MIME type detection, IndexedDB persistence) must be correct before any UI is layered on top. Phase 2 builds all visible tile behavior on the verified audio foundation. Phase 3 makes the app installable and offline-capable via service worker.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Audio and Storage Pipeline** - Record, store, and play audio with correct iOS Safari behavior
- [ ] **Phase 2: Tile UI and Interaction** - 3x3 grid with tap, long-press, visual states, and haptic feedback
- [ ] **Phase 3: PWA Shell and Offline** - Service worker, manifest, home screen install, offline capability

## Phase Details

### Phase 1: Audio and Storage Pipeline
**Goal**: Users can record a sound into a tile and play it back, with audio and data surviving app restarts
**Depends on**: Nothing (first phase)
**Requirements**: REC-01, REC-02, REC-04, STOR-01, STOR-02, STOR-03, PLAY-01, PLAY-02
**Success Criteria** (what must be TRUE):
  1. Tapping an empty tile starts a microphone recording; tapping it again stops and saves the audio
  2. Tapping a filled tile plays back the recorded sound; tapping it again during playback stops and restarts from the beginning
  3. Microphone permission is requested only on the first record attempt, not on app load
  4. Recordings survive a full app restart and remain mapped to their original tile position
  5. Audio blobs are stored locally in IndexedDB with no data sent to any server
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Scaffold Vite 7 + TypeScript project, idb-keyval storage layer, MIME type detection
- [ ] 01-02-PLAN.md — Recorder module: getMicrophoneStream (lazy, cached) + startRecording (30s auto-stop, iOS guards)
- [ ] 01-03-PLAN.md — Player module: AudioContext singleton, playBlob with AudioBuffer cache, stopTile
- [ ] 01-04-PLAN.md — State machine + app bootstrap harness + iPhone Safari verification checkpoint

### Phase 2: Tile UI and Interaction
**Goal**: Users see a clear 3x3 grid, understand tile state at a glance, and can manage recordings via long-press
**Depends on**: Phase 1
**Requirements**: GRID-01, GRID-02, REC-03, MGMT-01, MGMT-02, PLAY-03
**Success Criteria** (what must be TRUE):
  1. App shows exactly 9 tiles in a 3x3 grid on a single screen with no scrolling
  2. Empty and filled tiles are visually distinct at a glance
  3. An actively recording tile shows a pulsing visual indicator while the mic is live
  4. Long-pressing a filled tile opens a context menu offering Delete and Re-record
  5. Tapping any tile produces a brief haptic vibration on supported devices
**Plans**: TBD

### Phase 3: PWA Shell and Offline
**Goal**: Users can install the app to their iPhone Home Screen and use it offline
**Depends on**: Phase 2
**Requirements**: PWA-01, PWA-02, PWA-03
**Success Criteria** (what must be TRUE):
  1. The app can be added to the iPhone Home Screen via Safari and launches in standalone mode
  2. The app works fully offline after the initial load — all tiles, playback, and recording function without a network connection
  3. A one-time "Add to Home Screen" prompt appears when the user opens the app in Safari browser mode
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Audio and Storage Pipeline | 1/4 | In progress | - |
| 2. Tile UI and Interaction | 0/TBD | Not started | - |
| 3. PWA Shell and Offline | 0/TBD | Not started | - |
