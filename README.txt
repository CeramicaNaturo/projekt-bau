Projekt Bau v1.6.1 – 2D/3D Sichtbarkeit & Zentrierung

Behoben:
- 2D-Grundriss konnte nach dem Wechsel aus 3D unsichtbar sein.
- 2D-Zeichnung konnte ausserhalb des sichtbaren Arbeitsbereichs liegen.
- 3D-Raum wirkte durch die Kamera und das Welt-Raster optisch versetzt.

2D:
- Automatische «Ansicht einpassen».
- Grundriss wird beim Öffnen vollständig in den sichtbaren Bereich skaliert.
- Grundriss wird horizontal und vertikal zentriert.
- Beim Wechsel 3D → 2D wird der Plan neu gezeichnet und eingepasst.
- Zoom benutzt echte Canvas-Breite/Höhe statt CSS transform.
- Zoom +/- hält die Zeichnung zentriert.
- Neuer ⌗-Button = Ansicht einpassen.

3D:
- Kamera wird erst nach korrekter Viewport-Grösse berechnet.
- Zentrierung basiert auf der echten 3D-Bounding-Sphere.
- Horizontaler und vertikaler Sichtwinkel werden berücksichtigt.
- Das 3D-Raster wird unter dem Raum zentriert.
- Neuer Fit-View-Aufruf bei jedem Wechsel in 3D.

Fliesenstartpunkt und alle Funktionen aus v1.6 bleiben erhalten.
Deutsch / de-CH.
