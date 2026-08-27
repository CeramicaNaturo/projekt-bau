Projekt Bau v2.8.9 PRO — IndexedDB Hard Fix

KERNÄNDERUNG
- Projekt-/Foto-Daten werden nicht mehr als grosses JSON in localStorage gespeichert.
- IndexedDB ist jetzt der Primärspeicher.
- localStorage enthält nur kleine Metadaten/Kompatibilitätswerte.
- Bestehende Projekt-Bau-Daten werden beim ersten Start nach IndexedDB migriert.
- Legacy-Daten werden bei der Migration NICHT gelöscht.

ONEDRIVE
- Restore schreibt direkt nach IndexedDB.
- Safety Snapshot vor Restore liegt in IndexedDB.
- 8 MB+ OneDrive Backup verursacht dadurch keinen localStorage quota error mehr.
- Auto-Sync bleibt erhalten.

DUPLIKATE
- Migration dedupliziert Projekte nach stabiler Projekt-ID.
- Falls keine ID vorhanden ist: Name + Adresse + Kunde.
- Child-Arrays (Fotos, Grundrisse, Bereiche) werden nach ID/Name dedupliziert.
- Normaler App-Start scannt nicht mehr 25+ lokale Backup-Quellen.

UPDATE
- Alle Dateien in GitHub-Root hochladen.
- Nach erfolgreichem Pages-Build einmal update-289.html öffnen.
- update-289.html löscht KEINE Projekt-/OneDrive-Daten; nur Cache/Service Worker.
