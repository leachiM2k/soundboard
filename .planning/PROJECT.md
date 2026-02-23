# iPhone Soundboard

## What This Is

Eine Progressive Web App (PWA) für das iPhone, die als Soundboard mit 9 fixen Kacheln fungiert. Jede Kachel speichert einen selbst aufgenommenen Sound und spielt ihn per Tipp ab. Die App läuft direkt im Safari-Browser, kann zum Home Screen hinzugefügt werden, und funktioniert vollständig offline — kein App Store, kein Backend, keine Cloud.

**Current state (v1.1 shipped):** v1.0 + v1.1 vollständig ausgeliefert. v1.1 lieferte Wellenform-Visualizer, Playback-Fortschrittsring, Audio-Trim mit Undo, Clip-Export via iOS Share Sheet, Tile-Farben, Clip-Länge-Badge und Bestätigungs-Dialog beim Löschen.

## Core Value

Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.

## Requirements

### Validated (v1.0 + v1.1)

- ✓ 9 fixe Kacheln auf einem Screen, kein Scrolling — v1.0 (GRID-01)
- ✓ Leere vs. belegte Kacheln visuell unterscheidbar — v1.0 (GRID-02)
- ✓ Sound abspielen per Tipp; Re-Tap stoppt und startet neu — v1.0 (PLAY-01, PLAY-02)
- ✓ Haptisches Feedback beim Antippen — v1.0 (PLAY-03)
- ✓ Leere Kachel antippen startet Aufnahme; nochmal stoppen und speichern — v1.0 (REC-01, REC-02)
- ✓ Pulsierender Indikator während Aufnahme — v1.0 (REC-03)
- ✓ Mikrofon-Berechtigung beim ersten Aufnahmeversuch, nicht beim App-Start — v1.0 (REC-04)
- ✓ Langer Druck öffnet Kontext-Menü (Delete / Re-record / Rename) — v1.0 (MGMT-01, MGMT-02)
- ✓ Sounds lokal in IndexedDB gespeichert, kein Server — v1.0 (STOR-01)
- ✓ Sounds überleben App-Neustart an ihrer Kacheln-Position — v1.0 (STOR-02)
- ✓ navigator.storage.persist() aufgerufen — v1.0 (STOR-03)
- ✓ App zum iPhone Home Screen hinzufügbar (standalone mode) — v1.0 (PWA-01)
- ✓ App funktioniert offline nach erster Installation — v1.0 (PWA-02)
- ✓ Einmaliger "Zum Home Screen" Hinweis im Safari-Browser-Modus — v1.0 (PWA-03)
- ✓ Bestätigungs-Dialog beim Löschen (zwei Taps) — v1.1 (UX-01)
- ✓ Clip-Länge als Badge auf belegten Tiles (has-sound + playing) — v1.1 (UX-02)
- ✓ Playback-Fortschrittsring (SVG, AudioContext.currentTime) — v1.1 (UX-03)
- ✓ Echtzeit-Frequenz-Balken während Aufnahme (AnalyserNode, iOS-safe) — v1.1 (VIZ-01)
- ✓ Per-Tile Farbe aus 9 Voreinstellungen, IndexedDB-persistent — v1.1 (COLOR-01)
- ✓ Lossless Silence-Trim mit Offset-Speicherung und 5s-Undo-Toast — v1.1 (TRIM-01)
- ✓ Clip-Export via iOS Share Sheet (Web Share Level 2) + Download-Fallback — v1.1 (SHARE-01)

### Active (v1.2)

*(leer — noch kein nächstes Milestone definiert)*

### Out of Scope

- Labels/Text auf Kacheln — Reihenfolge reicht zum Merken
- Mehr als 9 Kacheln / Scrolling — bewusst einfach gehalten
- Cloud-Sync oder Sharing — lokal only
- Import von Audio-Dateien — nur Aufnahme via Mikrofon
- App Store Veröffentlichung — PWA reicht für persönlichen Gebrauch
- Per-Kachel-Lautstärke — kein Mixer-UI geplant

## Context

- **Tech stack:** Vanilla TypeScript 5.8.3, Vite 7.3.1, idb-keyval 6.2.2, vite-plugin-pwa 1.2.0 (Workbox)
- **Audio:** MediaRecorder API (AAC auf iOS, Opus/WebM auf anderen) → IndexedDB Blob → Web Audio API (AudioContext + AudioBufferSourceNode)
- **PWA:** Workbox service worker mit 13 precached Assets; autoUpdate; navigateFallback offline.html
- **iPhone testing:** ngrok HTTPS-Tunnel (empfohlen) — vermeidet Safari-Zertifikatswarnungen
- **Codebase:** ~1,807 LOC TypeScript, 49 Dateien geändert in v1.1, keine externen Framework-Abhängigkeiten

## Constraints

- **Plattform:** PWA / Web — kein nativer Swift-Code, kein App Store
- **iOS-Kompatibilität:** Safari auf iOS 14.3+ (MediaRecorder-Unterstützung)
- **Speicher:** Lokal via IndexedDB, keine Backend-Infrastruktur
- **Screen:** Alles auf einem einzigen Screen, keine Navigation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web Audio API über HTMLAudioElement | 300-500ms iOS-Latenz mit HTMLAudioElement nicht akzeptabel | ✓ Gut — keine Latenzprobleme |
| Audio-Pipeline vor UI bauen | iOS Safari AudioContext/MediaRecorder-Pitfalls haben hohe Recovery-Cost | ✓ Gut — kein Rework nötig |
| MIME-Probe: webm/opus > webm > mp4 > ogg/opus | Deckt alle Browser ab; iOS Safari mp4-Fallback korrekt | ✓ Gut — auf allen Geräten funktionsfähig |
| AudioBuffer gecacht pro Kachel | Balance zwischen Startup-Geschwindigkeit und Wiederhol-Latenz | ✓ Gut — keine wahrnehmbare Latenz |
| touchend nicht passive | Braucht preventDefault() um iOS synthetischen Click nach Long-Press zu unterdrücken | ✓ Gut — kein Double-Trigger |
| Clone-before-wire für Dialog-Buttons | Eliminiert stale-Listener-Akkumulation bei wiederholtem showModal() | ✓ Gut — keine Event-Leaks |
| ngrok statt Self-Signed-Cert | Vermeidet Zertifikatswarnungen in Safari; einfacheres iPhone-Testing | ✓ Gut — als Projekt-Standard bestätigt |
| registerType autoUpdate | Stille Background-Updates; kein User-Prompt | ✓ Gut — nahtlos für PWA |
| navigateFallback zu offline.html | Gebrandete Offline-Seite für nicht-gecachte URLs | ✓ Gut — auf Gerät verifiziert |
| PWA statt Native App | Kein App Store nötig, sofort testbar | ✓ Gut — alle Anforderungen erfüllt |
| Langer Druck für Delete/Re-Record | iOS-natives Pattern, Hauptflow bleibt sauber | ✓ Gut — 9 iPhone-Tests bestanden |
| Tap-to-start/stop Aufnahme | Einfacher als Halten | ✓ Gut — UX auf Gerät bestätigt |
| AnalyserNode NICHT mit ctx.destination verbunden | Verhindert Mikrofon→Lautsprecher-Feedback auf iOS | ✓ Gut — kein Feedback auf Gerät |
| getByteFrequencyData statt getFloatTimeDomainData | Safari-kompatibel (Float-Variante fehlt auf WebKit) | ✓ Gut — funktioniert auf iOS 14+ |
| fillRect statt roundRect für Visualizer-Balken | roundRect auf iOS 14.3 nicht verfügbar | ✓ Gut — keine Laufzeitfehler |
| AudioContext.currentTime für Playback-Ring | Hardware-synchronisiert, kein Drift gegenüber Date.now | ✓ Gut — Ring läuft synchron |
| Offset-basierter Trim (kein Re-Encode) | Lossless, kein WASM nötig, kein 4-8MB Download | ✓ Gut — augenblicklich, keine Qualitätsverlust |
| Undo nur Session-intern (Closure, 5s) | Einfacher als persistente Undo-History | ✓ Gut — entspricht iOS Voice Memo-Verhalten |
| exportClip synchron (kein async) | iOS navigator.share() erfordert Transient Activation; kein await vor dem Aufruf | ✓ Gut — Share Sheet öffnet auf Gerät |
| audio/mp4 vor audio/webm priorisiert | iOS 16+ Safari unterstützt webm in MediaRecorder; mp4/AAC universell kompatibel (WhatsApp, native Player) | ✓ Gut — Clips öffnen überall |

---
*Last updated: 2026-02-23 after v1.1 milestone*
