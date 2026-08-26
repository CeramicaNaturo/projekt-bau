Projekt Bau v2.7.9 PRO – Version Hard Fix

DÜZELTİLDİ
- Paket içindeki tüm eski 2.7.4 / 2.7.5 / 2.7.6 / 2.7.7 / 2.7.8 görünür sürüm yazıları temizlendi.
- Tek sürüm: Version 2.7.9 PRO.
- Runtime, Dashboard ve CAD sürüm etiketini tekrar v2.7.9 olarak damgalar.
- Service Worker cache adı: projekt-bau-v2790.
- reset.html tüm Service Worker kayıtlarını kaldırır.
- reset.html yalnız Cache Storage temizler; localStorage/sessionStorage proje verilerine dokunmaz.
- reset.html timestamp ile index.html?v=2790&nocache=... adresine yönlendirir.
- Eski projekt-bau-v* cache'leri activate sırasında silinir.

KULLANIM
1. ZIP içindeki TÜM dosyaları GitHub repo köküne yükle.
2. Özellikle index.html, app.js, styles.css, sw.js, reset.html birlikte değişmeli.
3. GitHub Pages deploy tamamlandıktan sonra reset.html adresini bir kez aç.
4. Ardından sol altta ve üstte v2.7.9 PRO görünmelidir.
