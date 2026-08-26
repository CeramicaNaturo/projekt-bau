Projekt Bau v2.8.2 PRO – WALL RENDER HARD FIX

DUVARLAR
- Wall polygon hesabı artık duvar görünürlüğü için zorunlu değil.
- Her duvar gerçek kalınlığında thick stroke ile çizilir.
- Stored wall line Innenkante olarak korunur; stroke mümkünse dışa yarım kalınlık kaydırılır.
- wallOutsideNormal hata verse bile geometrik fallback normal kullanılır.
- Duvarlar objelerden önce ve en son tekrar çizilir.
- Eski projede walls layer false kaydedilmiş olsa bile duvar katmanı açılır.
- Legacy x1/y1/x2/y2 onarımı korunur.

KAYIT / HOME
- Home butonu önce Grundriss'i kaydeder, sonra Dashboard'a döner.
- objects + preview PNG + ölçüler + layers + 3D settings + floor area kaydedilir.
- Tablet uygulaması arka plana geçtiğinde/pagehide olduğunda güvenlik autosave yapılır.
- Eski thumbnail Home/Speichern sonrası yeni duvar renderer ile yenilenir.

CACHE
- Version 2.8.2 PRO
- projekt-bau-v2820
