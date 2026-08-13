Projekt Bau v1.9.9 – Wandmasse endgültig bereinigt

Behoben:
- Die internen Wandlängen wie 85 cm, 95 cm, 153 cm, 53 cm,
  77 cm, 171 cm usw. wurden direkt aus der Wand-Zeichenroutine entfernt.
- Ursache war ein alter drawMeasureText(`${len} cm`, ...) Aufruf direkt
  innerhalb von drawFpObject().

Jetzt sichtbar:
- Nur professionelle Aussenmasse der Wände:
  z.B. 0,85 m / 1,53 m / 1,95 m / 1,74 m.
- Objektgrössen direkt am Objekt:
  z.B. Dusche 80 × 80 cm, WC 40 × 70 cm.
- Keine Objekt-zu-Wand-Hilfsmasse.
- Keine X/Y-Koordinaten.
- Keine doppelten Objektmass-Etiketten.

Die 2D-PDF-Ausgabe übernimmt dieselbe saubere Darstellung.

Deutsch / de-CH.
