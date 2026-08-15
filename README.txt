Projekt Bau v1.9.19 – 3D Ecken + Türen + realistischere Objekte

3D Wände:
- Jede Wand wird als extrudiertes Wand-Polygon erzeugt.
- Gespeicherte Wandlinie bleibt die Innenkante.
- Wandstärke wächst nach aussen.
- An verbundenen Wänden werden die äusseren Wandkanten mathematisch geschnitten.
- Dadurch entstehen saubere Miter-Ecken statt überlappender Boxen / Vorsprünge.

Tür:
- 2D-Türen werden im 3D-Modell immer als Türgruppe erzeugt.
- Türrahmen, Türblatt und Griff sind sichtbar.
- Türblatt wird standardmässig 35° geöffnet dargestellt, damit es nicht in der Wand verschwindet.
- Öffnungsrichtung links/rechts und innen/aussen werden berücksichtigt.
- Türhöhe und Türbreite werden verwendet.

Fenster:
- Rahmen, Glas, Mittelsteg und Brüstungshöhe werden realistischer dargestellt.

Realistischere Badobjekte:
- Waschbecken
- WC
- Dusche
- Badewanne
wurden geometrisch überarbeitet und verwenden ihre echten Breite/Tiefe-Masse.

Bestehende Funktionen:
- Innenmasse
- 500-ms-Wand-Hold
- Fliesen
- 2D/PDF
bleiben erhalten.

Deutsch / de-CH.
