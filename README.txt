TADİLAT PROJE MINI v0.1

İÇERİK
- Proje oluşturma
- Adres / müşteri / sorumlu bilgisi
- Projeye bölüm ekleme
- İş açıklaması, malzeme/ölçü, işçi/ekip ve durum
- Tablet/telefondan fotoğraf çekme veya fotoğraf seçme
- Her fotoğrafa ayrı iş notu
- Rapor/PDF için yazdırma görünümü
- JSON yedek alma ve geri yükleme
- PWA altyapısı (uygun sunucuda kurulum yapılabilir)

ÖNEMLİ
Bu v0.1 sürümü verileri tarayıcının LocalStorage alanında tutar.
Fotoğraflar da tarayıcıda saklandığı için çok büyük projelerde sınır oluşabilir.
Yedek Al düğmesi ile tüm proje verisini JSON dosyasına aktarabilirsiniz ve bu dosyayı OneDrive'a koyabilirsiniz.

ÇALIŞTIRMA
En kolay test:
1. Klasörü bilgisayara çıkarın.
2. index.html dosyasını Chrome veya Edge ile açın.
3. Proje oluşturun ve fotoğraf ekleyin.

PWA/Tablet kurulumu için dosyaları HTTPS üzerinden yayınlamak gerekir.
Bir sonraki sürüm hedefi:
- Microsoft hesabı ile giriş
- Microsoft Graph üzerinden OneDrive klasörüne proje JSON + fotoğraf senkronizasyonu
- İşçilere paylaşılabilir proje raporu
