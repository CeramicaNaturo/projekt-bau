Projekt Bau PRO v2.6.1 – Cache / Version Fix

DÜZELTİLDİ
- Dashboard sol alt sürüm: Version 2.6.1 PRO
- Dashboard üst bilgi: v2.6.1 PRO
- Eski projekt-bau-v2400 Service Worker cache kaldırıldı
- Yeni cache: projekt-bau-v2610
- index.html artık v=2610 ile çağrılır
- styles/app/3D/pro/abdichtung/photo editor dosyaları v=2610 cache-busting kullanır
- Program açılırken eski Service Worker kaydı otomatik kaldırılır ve sw.js?v=2610 yeniden kaydedilir
- reset.html tam cache temizliği sonrası index.html?v=2610&nocache=... açar

Projekt Bau PRO v2.5.0

- Profesyonel referans layout: üst ürün navigasyonu, mod sekmeleri, sol CAD toolbar, sağ Eigenschaften/Abdichtung özeti.
- Alt bölümde canlı Abdichtung Materialliste tablosu.
- Sağ altta Nische / bodengleiche Dusche detay kartı.
- Materialliste PDF butonu sağ panelde.
- Nische: Dichtband iç ve dış çevresi ayrı hesaplanır.
- Nische: 4 DEC innen + 4 DEC aussen.
- Bodengleiche Dusche: Weber DEG Gefällsdichtecke L/R otomatik.
- DEG 20/28/36 mm, Gefälle uzunluğu ve yüzdesine göre seçilir.
- DEG ile değiştirilen özel köşeler DEC innen hesabında çift sayılmaz.
- Mevcut Weber + Geberit malzeme motoru korunur.
