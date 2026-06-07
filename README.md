# F1 Race Recap

Eine moderne, semantische Webanwendung zur Visualisierung und Nachbereitung von Formel-1-Rennen. Die Anwendung ermöglicht es Benutzern, Saisons, Rennen und spezifische Sessions auszuwählen, um Rennergebnisse, Wetterbedingungen, Streckenkarten sowie detaillierte Fahrerstatistiken in Echtzeit einzusehen.

🌐 **Live-Demo:** [f1.izisopos.myhostpoint.ch](https://f1.izisopos.myhostpoint.ch/)

## Features

- **Dynamische Saisonauswahl:** Filterung nach Jahren (2023–2026) mit intelligenten, kaskadierenden Dropdowns (Rennen und Sessions aktivieren sich dynamisch).
- **Interaktives Dashboard:** Visuelle Aufbereitung der Podiumsplatzierungen und ein responsives Fahrer-Grid für alle weiteren Positionen.
- **Wetter-Live-Daten:** Kompakte Übersicht der Luft- und Streckentemperatur, Luftfeuchtigkeit und Regenwahrscheinlichkeit für die gewählte Session.
- **Canvas-Rennsimulation:** Eine interaktive Streckenansicht im Grossformat. Über Medien-Controls (Play, Pause, Vorlauf, Rücklauf) und einen interaktiven Zeit-Scrubber kann der Rennverlauf visuell nachvollzogen werden.
- **Echtzeit-Standings:** Ein dynamisches Klassement-Panel direkt neben der Streckenanimation, das sich synchron zur Rennsimulation aktualisiert.
- **Fahrer-Details:** Detail-Popups (Modals) mit tiefergehenden Statistiken und Informationen zu den einzelnen Fahrern.
- **Wikipedia-Anbindung:** Direkte Verlinkung zur offiziellen Wikipedia-Rennzusammenfassung für geschichtlichen Kontext.

## Projekt-Challenges & Learnings

Wir hatten für dieses Projekt extrem ambitionierte Pläne und eine riesige Feature-Liste. Die grösste Herausforderung war es, uns nicht im "Overengineering" zu verlieren, sondern ein Produkt zu bauen, das am Ende wirklich stabil funktioniert, performant lädt und einen echten Mehrwert bietet.

Dabei sind wir auf folgende Hürden gestossen und haben sie gelöst:

- **Herausforderung Real-Time-Daten vs. Performance:** Ursprünglich wollten wir jede Millisekunde der Telemetriedaten live streamen. Das führte im Browser jedoch schnell zu Performance-Problemen und langen Ladezeiten.
  - _Die Lösung:_ Wir haben uns auf ein smartes Caching und eine aggregierte Wiedergabe konzentriert. So bleibt die App schnell, liefert aber trotzdem alle spannenden Rennmomente.

- **Zu viele Ideen:** Von 3D-Ansichten bis hin zu KI-Kommentaren stand alles auf dem Wunschzettel. Uns wurde klar: Lieber weniger Features, die dafür aber reibungslos und fehlerfrei laufen. Das Ergebnis ist dieses voll funktionsfähige, runde Dashboard.

## Projektstruktur

```text
├── assets/
│   ├── icons/          # Bilddaten der F1-Boliden
│   └── lottie/         # JSON-basierte Lottie-Animationen für UI-Effekte
├── index.html          # Hauptdokument (Semantisches HTML5)
├── styles/
│   ├── base.css        # Grundlegende Formatierungen und CSS-Reset
│   └── design.css      # Layout, Dark-Theme, Komponenten-Styling
└── scripts/
    └── design.js       # Anwendungslogik, Canvas-Animation & API-Verarbeitung
```
