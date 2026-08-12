Projekt Bau v1.6.4 – Gerade Wände

Behoben:
- Wand-Vorschau war gerade, aber beim Loslassen wurde ein anderer, roher Endpunkt gespeichert.
- Dadurch konnten horizontale oder vertikale Wände nach dem Loslassen schräg werden.

Neu:
- Vorschau und gespeicherte Wand verwenden exakt dieselbe Fangberechnung.
- Intelligenter Gerade-/45°-Fang:
  - nahezu horizontal → exakt 0°
  - nahezu vertikal → exakt 90°
  - deutlich diagonal → exakt 45°
- Finger- oder Mausabweichungen von einigen Pixeln erzeugen keine schrägen Wände mehr.
- Beim nachträglichen Verschieben eines Wand-Endpunkts gilt derselbe Fang.

Alle 2D-, 3D-, Fliesenstart- und Projektfunktionen bleiben erhalten.
Deutsch / de-CH.
