Projekt Bau v2.7.4 PRO – 2D INTERACTION + PDF FIX

DÜZELTİLDİ
- 2D canvas dokunma/fare/kalem olayları tek PointerEvent sistemi üzerinden çalışır.
- Canvas açık şekilde pointer-events:auto / touch-action:none kullanır.
- Ruler ve bilgi katmanları dokunmayı engellemez.
- Obje hit-test gerçek width/depth/rotation değerlerine göre çalışır.
- Duvar hit-test gerçek segmente mesafe üzerinden yapılır.
- Grundriss açılırken eski seçim temizlenir.
- Nesne ölçü etiketleri zoom büyüdükçe devleşmez; ekranda sabit okunabilir boyda kalır.
- Kararsız ikinci wall-joint/miter çizim geçişi kaldırıldı.
- Duvar gövdesi güvenli polygon renderer ile çizilir; kayıtlı çizgi Innenkante olarak korunur.
- 2D als PDF artık popup açmaz; doğrudan Grundriss_<Planname>.pdf indirir.
- PDF export sonunda editor zoom/grid/seçim durumu geri yüklenir.
- Mevcut projeler ve localStorage recovery sistemi korunur.

CACHE
- Version 2.7.4 PRO
- projekt-bau-v2740
