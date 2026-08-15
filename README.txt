Projekt Bau v1.9.18 – ALLE Wandmasse auf oberster Ebene

Asıl Fehler behoben:
In früheren Versionen wurde das Maß einer Wand direkt beim Zeichnen
dieser Wand gerendert. Danach gezeichnete Wände / Ecken / Rauminfo
konnten diese Maßlinie oder den Text wieder überdecken.

v1.9.18:
1. Zuerst werden ALLE Wände gezeichnet.
2. Dann alle Wandverbindungen / Ecken.
3. Dann Rauminfo und andere CAD-Inhalte.
4. GANZ ZUM SCHLUSS werden sämtliche Wandmasse gezeichnet.

Dadurch:
- keine Wand kann mehr ein Maß überdecken.
- 0,60 m erscheint vollständig statt nur „6 m“.
- kurze Zwischenwände behalten ihr Maß.
- jede sichtbare Wand muss genau einen Maßeintrag erhalten.
- falls ein Layout-Eintrag fehlt, erzeugt ein Fallback trotzdem ein Maß.
- Konsole meldet einen Fehler, falls Wandanzahl und Maßanzahl nicht übereinstimmen.

Maßwerte bleiben:
- lichte Innenmaße
- Innenkante -> Innenkante
- Meterdarstellung

2D als PDF nutzt denselben finalen Renderdurchlauf,
deshalb werden auch dort alle Maße als oberste Ebene exportiert.

500-ms-Hold zum Verschieben von Wänden bleibt erhalten.
Deutsch / de-CH.
