Projekt Bau v2.8.3 PRO – Runtime Version Fix

KESİN HATA BULUNDU:
app.js içinde eski bir 'authoritative runtime version stamp' bloğu vardı.
Bu blok sayfa açıldıktan sonra HTML'deki yeni sürüm yazılarını tekrar
'2.8.0 PRO' olarak değiştiriyordu.

DÜZELTİLDİ:
- Runtime VERSION = 2.8.3 PRO
- index.html = v2.8.3 PRO
- app.js cache query = 2830
- sw.js cache = projekt-bau-v2830
- reset.html = 2830
- Önceki v2.8.2 duvar + Home + AutoSave düzeltmeleri korunmuştur.

GitHub repo köküne ZIP içindeki TÜM dosyaları yükleyin.
