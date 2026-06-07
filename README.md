# F1 Race Recap

Interaktive Medien II // Enzo Kummer, Jan Beatrix

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

## Vorgehensweise & Entwicklungsprozess

Unser Entwicklungsprozess folgte einer klaren, strukturierten Pipeline von der ersten Idee bis zum fertigen Produkt:

- **Feature-Scoping & Brainstorming:** Zuerst haben wir uns intensiv Gedanken darüber gemacht, welche Funktionen die App bieten muss, um einen echten Mehrwert zu bieten.
- **UX/UI-Design in Figma:** Bevor die erste Zeile Code geschrieben wurde, haben wir das gesamte Benutzererlebnis und das visuelle Design in Figma konzipiert und als interaktiven Prototypen ausgearbeitet.
- **KI-unterstützte Code-Generierung:** Bei der Implementierung des Codes haben wir KI-Tools als Entwicklungspartner genutzt. Dabei haben wir den generierten Code niemals blind übernommen, sondern jeden Abschnitt mehrmals gründlich überprüft, getestet und korrigiert.
- **Personalisierung & Design-Feinschliff:** Nach der Kern-Implementierung haben wir den Code stark personalisiert, eigene Logiken eingebaut und das Design im CSS exakt an unsere Vorstellungen und das Figma-Layout angepasst.
- **Refactoring & Code-Quality:** Als letztes haben wir den gesamten Code aufgeräumt, semantische HTML-Strukturen optimiert, ungenutzte Fragmente entfernt und alles für das finale Deployment sauber strukturiert.

## Projekt-Challenges & Learnings

Wir hatten für dieses Projekt extrem ambitionierte Pläne und eine riesige Feature-Liste. Die grösste Herausforderung war es, uns nicht im "Overengineering" zu verlieren, sondern ein Produkt zu bauen, das am Ende wirklich stabil funktioniert, performant lädt und einen echten Mehrwert bietet.

Dabei sind wir auf folgende Hürden gestossen und haben sie gelöst:

- **Herausforderung Real-Time-Daten vs. Performance:** Ursprünglich wollten wir jede Millisekunde der Telemetriedaten live streamen. Das führte im Browser jedoch schnell zu Performance-Problemen und langen Ladezeiten.
  - _Die Lösung:_ Wir haben uns auf ein smartes Caching und eine aggregierte Wiedergabe konzentriert. So bleibt die App schnell, liefert aber trotzdem alle spannenden Rennmomente.
- **Zu viele Ideen:** Von 3D-Ansichten bis hin zu KI-Kommentaren stand alles auf dem Wunschzettel. Uns wurde klar: Lieber weniger Features, die dafür aber reibungslos und fehlerfrei laufen. Das Ergebnis ist dieses voll funktionsfähige, runde Dashboard.
- **Auto Live Tracking:** Das Tracken von den Autos auf der jeweiligen Rennstrecke ist immer noch fehlerhaft. Hier haben wir es nicht geaschaft das die Strecke immer richtig angezeit wird.
  - _Die Lösung:_ Würden wir mit der Webseite tatsächlich live gehen, würden wir dieses Feature etnweder entfernen oder ein anderes einbauen.

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
