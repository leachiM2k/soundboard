# Requirements: iPhone Soundboard

**Defined:** 2026-02-22
**Core Value:** Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.

## v1 Requirements

Requirements für den ersten Release. Jedes mapped auf eine Roadmap-Phase.

### Grid

- [ ] **GRID-01**: App zeigt genau 9 Kacheln in einem 3×3-Raster auf einem einzelnen Screen
- [ ] **GRID-02**: Leere Kacheln sind visuell klar von Kacheln mit Aufnahmen unterscheidbar

### Playback

- [x] **PLAY-01**: User kann einen aufgenommenen Sound durch Antippen der Kachel abspielen
- [x] **PLAY-02**: Nochmaliges Antippen einer aktiv spielenden Kachel stoppt den Sound und startet ihn neu
- [ ] **PLAY-03**: Gerät gibt beim Antippen einer Kachel ein kurzes haptisches Feedback

### Recording

- [x] **REC-01**: Antippen einer leeren Kachel startet eine Aufnahme-Session
- [x] **REC-02**: Nochmaliges Antippen der aufnehmenden Kachel stoppt und speichert die Aufnahme
- [ ] **REC-03**: Aktiv aufnehmende Kacheln zeigen einen pulsierenden visuellen Indikator
- [x] **REC-04**: Mikrofon-Berechtigung wird beim ersten Aufnahmeversuch angefragt (nicht beim App-Start)

### Management

- [ ] **MGMT-01**: Langes Drücken auf eine Kachel mit Aufnahme öffnet ein Kontext-Menü
- [ ] **MGMT-02**: Kontext-Menü bietet "Löschen" und "Neu aufnehmen" an

### Storage

- [x] **STOR-01**: Aufnahmen werden lokal auf dem Gerät gespeichert (nicht an Server gesendet)
- [x] **STOR-02**: Aufnahmen überleben App-Neustarts und bleiben an ihrer Kacheln-Position
- [x] **STOR-03**: App ruft `navigator.storage.persist()` auf, um langfristige Speicherung zu sichern

### PWA

- [ ] **PWA-01**: App kann über Safari zum iPhone Home Screen hinzugefügt werden
- [ ] **PWA-02**: App funktioniert offline nach der ersten Installation
- [ ] **PWA-03**: App zeigt einmaligen Hinweis "Zum Home Screen hinzufügen" im Safari-Browser-Modus

## v2 Requirements

Zurückgestellt auf späteren Release.

### UX Polish

- **UX-01**: Echtzeit-Wellenform-Visualisierung während der Aufnahme (AnalyserNode + Canvas)
- **UX-02**: Bestätigungs-Dialog beim Löschen einer Aufnahme
- **UX-03**: Vorgeladener AudioBuffer-Cache beim App-Start (eliminiert Latenz beim ersten Play)

### Resilience

- **RES-01**: Elegante Behandlung des getUserMedia Re-Permission-Bugs (WebKit #215884) in Standalone-PWA-Modus
- **RES-02**: Speichernutzungs-Anzeige

## Out of Scope

| Feature | Reason |
|---------|--------|
| Text-Labels auf Kacheln | Erhöht Komplexität; Positionsgedächtnis reicht aus |
| Mehr als 9 Kacheln / Scrolling | Widerspricht dem Single-Screen-Constraint |
| Cloud-Sync / Backup | Erfordert Backend, Auth, DSGVO-Handling |
| Audio-Datei-Import | Scope-Explosion; nur Mikrofon-Aufnahme |
| Per-Kachel-Lautstärke | Kein Mixer; interrupt-on-tap statt Simultanwiedergabe |
| Simultane Wiedergabe mehrerer Sounds | Cacophon; interrupt-on-tap ist das richtige Modell |
| Hold-to-Record | Ermüdend bei langen Clips; tap-to-start/stop ist besser |
| App Store Veröffentlichung | PWA reicht für persönlichen Gebrauch |

## Traceability

Welche Phasen welche Requirements abdecken.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRID-01 | Phase 2 | Pending |
| GRID-02 | Phase 2 | Pending |
| PLAY-01 | Phase 1 | Complete (01-03) |
| PLAY-02 | Phase 1 | Complete (01-03) |
| PLAY-03 | Phase 2 | Pending |
| REC-01 | Phase 1 | Complete |
| REC-02 | Phase 1 | Complete |
| REC-03 | Phase 2 | Pending |
| REC-04 | Phase 1 | Complete |
| MGMT-01 | Phase 2 | Pending |
| MGMT-02 | Phase 2 | Pending |
| STOR-01 | Phase 1 | Complete (01-01) |
| STOR-02 | Phase 1 | Complete (01-01) |
| STOR-03 | Phase 1 | Complete (01-01) |
| PWA-01 | Phase 3 | Pending |
| PWA-02 | Phase 3 | Pending |
| PWA-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after roadmap creation*
