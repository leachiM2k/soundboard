# Requirements: iPhone Soundboard v1.1

**Defined:** 2026-02-23
**Core Value:** Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.

## v1.1 Requirements

### UX — Grundlegende Verbesserungen

- [x] **UX-01**: Nutzer sieht einen Bestätigungs-Dialog bevor ein Sound gelöscht wird
- [x] **UX-02**: Nutzer sieht Clip-Dauer (z.B. "2.4s") als Badge auf belegten Tiles in allen relevanten States (has-sound, playing)
- [ ] **UX-03**: Nutzer sieht einen Fortschritts-Ring oder -Balken auf der Tile während der Wiedergabe; zeigt den Abspielfortschritt in Echtzeit

### VIZ — Visualisierung

- [ ] **VIZ-01**: Nutzer sieht Echtzeit-Frequenz-Balken (Bar-Stil, kein Oszilloskop) während der Aufnahme; Animation beweist dass das Mikrofon tatsächlich aufnimmt

### COLOR — Tile-Farben

- [ ] **COLOR-01**: Nutzer kann pro Tile eine Farbe aus 8 Voreinstellungen wählen (zugänglich über Long-Press-Menü); gewählte Farbe bleibt nach App-Neustart erhalten

### TRIM — Audio-Bearbeitung

- [ ] **TRIM-01**: App schneidet Stille vom Anfang und Ende eines Clips automatisch nach der Aufnahme ab; Nutzer erhält "Trim applied"-Feedback mit Undo-Option

### SHARE — Export

- [ ] **SHARE-01**: Nutzer kann einen Clip via iOS Share Sheet teilen oder als Datei herunterladen; Export über Long-Press-Menü erreichbar; Fallback für ältere iOS-Versionen

## v2 Requirements

### Trim-Erweiterungen

- **TRIM-02**: Interaktiver Wellenform-Scrubber für manuelle Trim-Punkte (HIGH Komplexität — warten auf User-Feedback)
- **TRIM-03**: Re-Encode zu AAC/MP4 nach Trim (erfordert WASM-Codec — offset-basierter Ansatz ist besser)

### Weitere UX

- **UX-04**: Wellenform-Visualisierung während Wiedergabe (Fortschrittsanzeige reicht für v1.1)
- **RES-01**: Graceful getUserMedia Re-Permission-Handling (WebKit Bug #215884)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Labels/Text auf Kacheln | Räumliches Gedächtnis reicht; Label-Eingabe bricht Zero-Friction-Flow |
| Mehr als 9 Kacheln / Scrolling | Zerstört Single-Screen-Constraint |
| Cloud-Sync | Benötigt Backend, Auth, GDPR — lokal only |
| Import von Audio-Dateien | Nur Aufnahme via Mikrofon — "your voice" value prop |
| Per-Kachel-Lautstärke | Kein Mixer-UI geplant |
| 60fps Wellenform-Animation | iOS throttled rAF auf 30fps in Low Power Mode; imperceptibler Unterschied |
| Oszilloskop-Wellenform | Sieht bei leiser Sprache inaktiv aus; Bar-Stil immer aktiv |
| WASM-AAC-Encoder für Trim | 4-8 MB Download für marginalen Vorteil; offset-basierter Ansatz besser |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UX-01 | Phase 4 | Complete |
| UX-02 | Phase 4 | Complete |
| COLOR-01 | Phase 4 | Pending |
| VIZ-01 | Phase 5 | Pending |
| UX-03 | Phase 5 | Pending |
| TRIM-01 | Phase 6 | Pending |
| SHARE-01 | Phase 6 | Pending |

**Coverage:**
- v1.1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after initial v1.1 definition*
