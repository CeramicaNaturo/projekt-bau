Projekt Bau v2.8.7 PRO – OneDrive Multi-Device Sync

NEU
- OneDrive yedekleme artık cihazlar arası otomatik senkronizasyon olarak çalışır.
- Yerel kayıttan 5 sn sonra: önce Cloud okunur/birleştirilir, sonra güncel birleşik veri Cloud'a yazılır.
- Uygulama açılışında, pencere tekrar aktif olduğunda ve her 60 saniyede Cloud kontrol edilir.
- Projeler ID bazında eşleştirilir.
- Proje değişikliklerinde _syncUpdatedAt damgası kullanılır; yeni olan sürüm kazanır.
- Proje silmeleri tombstone olarak tutulur ve diğer cihazlara aktarılır; silinen proje eski cihazdan geri gelmez.
- Manuel "Jetzt in OneDrive sichern" ve "Aus OneDrive wiederherstellen" düğmeleri korunmuştur.
- Mevcut ProjektBau_Backup.json biçimi geriye dönük okunabilir.

KURULUM
1. ZIP içindeki TÜM dosyaları GitHub repo köküne yükleyin ve mevcut dosyaların üzerine yazın.
2. GitHub Pages deployment tamamlanınca sayfayı yenileyin.
3. Sol altta Version 2.8.7 PRO görünmelidir.
4. OneDrive bölümünde "Automatische OneDrive-Sicherung nach Änderungen" seçeneğini etkinleştirin.
5. Aynı Microsoft hesabıyla diğer cihazda da bağlanın ve aynı seçeneği etkinleştirin.

NOT
Aynı projenin iki cihazda çevrimdışı olarak aynı anda değiştirilmesi halinde proje seviyesinde en son kaydedilen sürüm önceliklidir.
