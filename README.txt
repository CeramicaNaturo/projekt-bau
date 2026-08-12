Projekt Bau v1.6.3 – 2D CAD Render-Sicherheitsfix

Der 2D-Renderer wurde vom restlichen Interface entkoppelt.

Wichtig:
- Fehler im Eigenschaften-Panel, Lineal oder 3D-Modul können den 2D-Grundriss nicht mehr unsichtbar machen.
- Jedes Objekt wird einzeln gezeichnet. Ein beschädigtes Objekt stoppt nicht mehr den ganzen Plan.
- Beim Öffnen wird Fit-to-View mehrfach nach dem tatsächlichen Layout ausgeführt.
- Canvas erhält garantiert eine Mindestgrösse.
- Zeichnung wird über Objektkoordinaten gemessen und in der sichtbaren Fläche zentriert.
- Zusätzlicher Button «2D↺» baut die komplette 2D-Anzeige neu auf.

Fallback:
- Falls der normale CAD-Renderer trotzdem einen Fehler hat, werden mindestens alle Wände über einen unabhängigen Notfall-Renderer sichtbar dargestellt.

Bestehende Daten werden nicht verändert.
3D, Fliesenstart und Projektfunktionen bleiben erhalten.
