Projekt Bau v1.8.1 – Workspace Root Fix

Kök hata bulundu ve düzeltildi:

- cad-floorplan-workspace eski koddan kalma şekilde 3 satırlı grid idi.
- fp2DWorkspace bu gridin yalnızca ilk yaklaşık 26 px satırına yerleşiyordu.
- Bu nedenle cetvel görünürken gerçek Canvas yüksekliği neredeyse sıfır kalıyordu.
- Sonuç: kayıtlı Grundriss görünmüyordu.

v1.8.1:
- cad-floorplan-workspace artık tek, tam yükseklik hücresidir.
- fp2DWorkspace ve fp3DWorkspace aynı tam hücreyi kullanır.
- 2D kendi içinde Cetvel + Canvas + Bilgi satırlarını yönetir.
- 3D aynı yüksekliğin tamamını kullanır.
- Canvas için eski zorunlu min-height:300px çakışması kaldırıldı.
- HTML yapısı ve kayıtlı Grundriss verileri değiştirilmedi.
- Açılışta ve 2D/3D geçişinde yeniden ölçüm + Fit-to-View yapılır.

Deutsch / de-CH.
