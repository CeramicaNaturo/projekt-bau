Projekt Bau v2.7.6 PRO – Startup / Buttons / Project List Fix

ASIL HATA DÜZELTİLDİ
- HTML'de artık bulunmayan closeFloorplan butonuna doğrudan .onclick atanıyordu.
- Bu JavaScript exception nedeniyle initFloorplanControls yarıda kesiliyordu.
- Ardından initFloorplanCanvas ve başlangıç render() çağrısı hiç çalışmıyordu.
- Sonuç: butonlar çalışmıyor, eski projeler ilk açılışta görünmüyor; yeni proje ekleyince render() tetiklenerek görünüyordu.

v2.7.6
- closeFloorplan referansı artık optional/guarded.
- eski fpSave referansı artık optional/guarded.
- Her init modülü pbSafeInit ile bağımsız başlatılır; biri hata verse bile diğerleri çalışır.
- Proje listesi açılışta zorunlu render edilir.
- 60 ms gecikmeli ikinci render vardır.
- pageshow/bfcache dönüşünde proje listesi tekrar render edilir.
- 2D als PDF event delegation ile her zaman çalışır.
- Obje butonları event delegation ile çalışır.
- CAD araç butonları event delegation ile çalışır.
- 2D / 3D / Abdichtung ana mod butonları event delegation ile çalışır.
- Mevcut proje migration/recovery sistemi korunur.
- Mevcut 2D çizim ve PDF motoru korunur.

Version 2.7.6 PRO
