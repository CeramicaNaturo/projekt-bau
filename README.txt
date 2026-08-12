Projekt Bau v1.8.2 – Saubere Wandecken

Behoben:
- An Wandverbindungen ragten Wandenden sichtbar über die Ecke hinaus.
- Ursache war Canvas lineCap='square'.
- Square verlängert eine Linie optisch über ihren echten Endpunkt hinaus.

Neu:
- Wände werden mit lineCap='butt' gezeichnet.
- Die Wand endet exakt am geometrischen Endpunkt.
- Rechtwinklige Ecken erscheinen bündig und ohne Nase/Überstand.
- lineJoin='miter' bleibt für saubere CAD-Kanten aktiv.
- Wandkoordinaten, Wandlängen, A/B/C/D-Bezeichnungen und Endpunktgriffe bleiben unverändert.
- Keine Änderung an gespeicherten Grundrissdaten.

Deutsch / de-CH.
