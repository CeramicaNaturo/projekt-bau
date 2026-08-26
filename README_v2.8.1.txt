Projekt Bau v2.8.1 PRO

DUVAR DÜZELTMESİ
- Eski projelerde wall x1/y1/x2/y2 eksikse startX/endX vb. alanlardan otomatik geri yüklenir.
- Eski center + length + angle wall formatı da desteklenir.
- Wall thickness eksikse güvenli varsayılan uygulanır.
- Duvarlar önce çizilir, objeler sonra çizilir.
- En son güvenli wall-edge pass ile duvar iç kenarları tekrar görünür yapılır.
- Bir sanitär obje duvara dayansa bile duvar çizgisi tamamen kaybolmaz.
- wallOutsideNormal hata verirse güvenli normal fallback kullanılır.

HOME + OTOMATİK KAYIT
- Grundriss üst barına Home butonu eklendi.
- Home'a basınca önce mevcut 2D Grundriss otomatik kaydedilir.
- objects, image, grid, fineStep, wallThickness, layers, 3D options ve floor area kaydedilir.
- Kaydetme tamamlandıktan sonra Dashboard'a dönülür.
- Üstteki Speichern butonu da artık açık Grundriss'in gerçek verisini kaydeder.

CACHE
- Version 2.8.1 PRO
- Service Worker cache v2810
