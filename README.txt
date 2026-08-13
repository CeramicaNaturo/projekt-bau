Projekt Bau v1.9.14 – Saubere Ecken + echte Innenkante

Korrektur der v1.9.13-Ecken:

- Die gespeicherte Wandlinie bleibt die raumseitige Innenkante.
- 174 cm Eingabe bleibt exakt 1,74 m Innenmaß.
- Wandstärke wächst weiterhin ausschliesslich nach aussen.
- Wände werden in 2D nicht mehr als verschobene dicke Linie gezeichnet.
- Jede Wand wird als echtes 4-Punkt-Polygon gezeichnet:
  Innenkante + äussere Wandkante.
- An verbundenen Wänden werden die beiden äusseren Wandkanten
  mathematisch geschnitten.
- Der gemeinsame Innenpunkt bleibt unverändert.
- Dadurch entstehen saubere Miter-Ecken ohne:
  - Vorsprünge
  - Stufen
  - quadratische Klötze
  - Lücken
- Auch die Live-Vorschau verwendet dieselbe Wandgeometrie.

Masssystem:
- weiterhin ausschliesslich lichte Innenmasse.
- Wandstärke beeinflusst die Innenlänge nicht.

Deutsch / de-CH.
