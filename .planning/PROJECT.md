# iPhone Soundboard

## What This Is

Eine Progressive Web App (PWA) für das iPhone, die als Soundboard mit 9 fixen Kacheln fungiert. Jede Kachel kann einen selbst aufgenommenen Sound speichern und per Tipp abspielen. Die App läuft direkt im Browser und kann zum Home Screen hinzugefügt werden — kein App Store nötig.

## Core Value

Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 9 fixe runde Kacheln auf einem Screen, kein Scrolling
- [ ] Kachel mit Sound: Antippen spielt den Sound ab
- [ ] Kachel ohne Sound: Antippen startet Aufnahme → nochmal antippen stoppt und speichert
- [ ] Visuell unterscheidbar: leere vs. belegte Kacheln
- [ ] Langer Druck auf belegte Kachel → Optionen (Löschen / Neu aufnehmen)
- [ ] Sounds werden lokal gespeichert (IndexedDB), platzsparend (komprimiertes Audio)
- [ ] Sounds bleiben nach App-Neustart erhalten
- [ ] PWA: kann zum iPhone Home Screen hinzugefügt werden
- [ ] Mikrofon-Zugriff wird beim ersten Mal angefragt

### Out of Scope

- Labels/Text auf Kacheln — Reihenfolge reicht zum Merken
- Mehr als 9 Kacheln / Scrolling — bewusst einfach gehalten
- Cloud-Sync oder Sharing — lokal only
- Import von Audio-Dateien — nur Aufnahme via Mikrofon
- App Store Veröffentlichung

## Context

- Plattform: PWA (Safari auf iOS 14.3+, wo MediaRecorder API verfügbar ist)
- Audio-Aufnahme: MediaRecorder API mit komprimiertem Format (AAC/Opus)
- Speicher: IndexedDB für Blob-Speicherung der Audio-Daten
- UX-Entscheidungen: Langer Druck für Kontext-Menü (iOS-natives Pattern), Tap-to-start/stop Aufnahme
- Zielgerät: iPhone (primär), funktioniert aber auf allen modernen Mobilgeräten

## Constraints

- **Plattform**: PWA / Web-Technologien — kein nativer Swift-Code, kein App Store
- **iOS-Kompatibilität**: Safari auf iOS 14.3+ (MediaRecorder-Unterstützung)
- **Speicher**: Lokal via IndexedDB, keine Backend-Infrastruktur nötig
- **Screen**: Alles auf einem einzigen Screen, keine Navigation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------||
| PWA statt Native App | Kein App Store nötig, einfacherer Build, sofort testbar | — Pending |
| Langer Druck für Delete/Re-Record | iOS-natives Pattern, hält den Hauptflow sauber | — Pending |
| Tap-to-start/stop Aufnahme | Einfacher als Halten (kein versehentliches Abbrechen bei langen Sounds) | — Pending |
| Keine Labels | Reduziert Komplexität, User findet sich per Position zurecht | — Pending |

---
*Last updated: 2026-02-22 after initialization*
