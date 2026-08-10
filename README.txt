Projekt Bau v0.6.2 – Galerie-/Dateiauswahl für Microsoft Edge Tablet

Änderung:
- "Foto aufnehmen" bleibt separat für die Kamera.
- "Foto auswählen" verwendet nun bevorzugt den echten System-Dateidialog via showOpenFilePicker().
- Keine capture-Eigenschaft für die Galerie.
- Fallback-Dateidialog ohne accept=image/*, damit Microsoft Edge nicht automatisch die Kamera öffnet.
- Mehrfachauswahl bleibt möglich.
- Unterstützte Bilddateien: JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC, HEIF.
- Deutsch / de-CH und Schweizer Formate bleiben unverändert.

Nach Upload auf GitHub Pages bitte reset.html einmal öffnen.
