Projekt Bau v2.9.1 PRO – HARD FIX

DÜZELTİLDİ
- 2.9.0 paketinin index.html dosyası hâlâ app_v289.js / styles_v287.css / v2890 Service Worker çağırıyordu.
- Tüm aktif asset dosyaları benzersiz v2.9.1 adlarına geçirildi:
  app_v291.js, styles_v291.css, storage_bridge_v291.js,
  onedrive_sync_v291.js, sw_v291.js.
- Runtime sürüm damgası 2.9.1 PRO.
- fpDrawAllObjectDimensions tanımsız hatası giderildi.
- fpEnsureWallObjectDefaults tanımsız hatası giderildi.
- HTML network-first; yeni sürüm eski Service Worker tarafından kilitlenemez.
- update-291.html yalnız Projekt Bau cache/Service Worker kayıtlarını temizler.
- IndexedDB, localStorage proje metadatası ve OneDrive ayarları silinmez.

KURULUM
1. ZIP içindeki TÜM dosyaları GitHub repo root'una yükleyin.
2. GitHub Pages build yeşil olduktan sonra:
   https://ceramicanaturo.github.io/projekt-bau/update-291.html
3. Uygulama v2.9.1 PRO olarak açılmalıdır.
