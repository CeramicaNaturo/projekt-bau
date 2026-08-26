Projekt Bau v2.7.7 PRO – Tablet Projekt öffnen

DÜZELTİLDİ
- Tablet/Samsung Chrome proje kartı açma davranışı.
- Proje kartında pointerdown / pointermove / pointerup kullanılır.
- Kaydırma ile dokunma birbirinden ayrılır.
- 12 px üzerindeki hareket scroll olarak kabul edilir ve proje açılmaz.
- 900 ms üzerindeki uzun basma proje açmaz.
- Dokunmadan sonra oluşan sentetik click engellenir; proje iki kez açılmaz.
- Kart içindeki butonların kendi davranışı korunur.
- Proje kartları DOM yeniden render edilse bile event delegation ile çalışır.
- Klavyede Enter/Space ile proje açma desteği.
- touch-action: pan-y ile dikey kaydırma korunur.
- Mevcut proje verileri, CAD, PDF, Abdichtung ve Fotodokumentation kodlarına dokunulmadı.

CACHE
- Version 2.7.7 PRO
- Service Worker cache v2770
