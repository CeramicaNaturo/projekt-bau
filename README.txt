Projekt Bau v1.9.21 – Stable 3D Reference Style

WICHTIGE KORREKTUR:
v1.9.20 verwendete komplexe Quad-Prismen. In konkaven Ecken konnten
Vertex-Reihenfolgen kippen und dadurch dreieckige / schiefe Wände entstehen.

v1.9.21:
- Wände wieder mit stabiler THREE.BoxGeometry-Technik.
- Jede Wand wird als echte Segment-Box mit realer Wandstärke gebaut.
- Die gespeicherte Wandlinie bleibt die Innenkante.
- Die Box-Mittellinie wird um halbe Wandstärke nach aussen verschoben.
- An Wandenden wird um halbe Wandstärke verlängert.
- Dadurch treffen sich 90°-Ecken sauber und geschlossen.
- Keine dreieckigen oder verdrehten Wandflächen mehr.

Türen:
- Türöffnung wird wirklich aus der Wand ausgespart.
- Wand wird links und rechts der Tür getrennt.
- Oberhalb bleibt nur der Sturz.
- Durch die offene Tür ist der Aussenbereich sichtbar.
- Türblatt standardmässig 58° geöffnet.
- Tür sitzt exakt auf der Innenkante der zugehörigen Wand.

Fenster:
- gleiche stabile Wandzuordnung.
- echte Öffnung mit Brüstung und Sturz.

3D Darstellung:
- dunkle saubere Wandoberkanten wie im Referenzbild.
- heller Aussenboden.
- neutrale Innenflächen.
- automatische isometrische Kamera auf den Raum.
- bestehende realistischere Badobjekte bleiben erhalten.

Deutsch / de-CH.
