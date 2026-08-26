Projekt Bau v2.7.3 PRO – Projekt Recovery + 2D PDF + CAD Fix

PROJEKTE
- Program sadece tek localStorage anahtarını seçmez.
- localStorage ve sessionStorage içindeki bütün JSON kayıtları tarar.
- İçinde projects[] bulunan bütün geçerli veritabanlarını bulur.
- Projeler ID veya proje adı/adres/müşteri kombinasyonuna göre birleştirilir.
- Aynı projenin daha zengin kopyasındaki Areas, Floorplans, Photos ve TileMaterials korunur.
- Eski browser kayıtları silinmez.
- Dashboard sol menüde "Projekte wiederherstellen" butonu vardır.
- Boş state mevcut projelerin üzerine yazamaz.

2D PDF
- Grundriss ekranında görünür "2D als PDF" butonu.
- A4 Landscape PDF.
- Sadece gerçek Grundriss + dış ölçü zincirleri PDF'e alınır.
- Grid, seçim noktaları ve X/Y koordinatları PDF'de gösterilmez.
- PDF adı: Grundriss_<Planname>.pdf
- Export bittikten sonra ekrandaki zoom/grid/seçim durumu eski haline gelir.

2D CAD
- v2.6.2 çalışan CAD çekirdeği korunur.
- Canvas'ın ince yatay şeride çökmesini engelleyen min-height/flex güvenliği eklendi.
- Sağ Eigenschaften ve sol Werkzeug alanları korunur.

CACHE
- Version 2.7.3 PRO
- Service Worker cache: projekt-bau-v2720
- reset.html localStorage içindeki projelere dokunmaz.
