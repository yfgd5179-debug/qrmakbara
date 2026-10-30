# QR Makbara — مقبرة (Mezarlık QR Plaka Sitesi)

Müşteri hesap açar → soruları yanıtlar → yapay zeka hayatını hikayeye çevirir →
fotoğraf/video eklenir → ödeme (Irak'ta nakit veya kart, dışarıda sadece online) →
QR kod üretilir ve plaka üzerine basılmak üzere indirilir.

## Özellikler

- **4 dilli arayüz**: Arapça (RTL), Kürtçe (RTL), İngilizce, Türkçe
- **Hesap sistemi**: kayıt / giriş (çerez tabanlı oturum, scrypt ile şifre hashleme)
- **Sihirbaz (5 adım)**:
  1. Kişi bilgileri (ad, doğum/ölüm yılı, yaş, şehir, ülke)
  2. Hayat bilgileri (okul, üniversite, meslek, hobi, anılar, alıntı)
  3. Fotoğraf ve video yükleme (100 MB'a kadar)
  4. Yapay zeka ile hayat hikayesi (düzenlenebilir)
  5. Teslimat adresi + ödeme
- **Ücretsiz yapay zeka**: Anahtarsız `pollinations.ai` → varsa `GROQ_API_KEY` /
  `GEMINI_API_KEY` → olmazsa yerel şablon. Hiçbir ücret gerekmez.
- **Ödeme kuralları**: Irak (`IQ`) → nakit **veya** kart; diğer ülkeler → sadece
  online (demo ödeme, gerçek ücret çekilmez)
- **QR kod**: Yüksek kaliteli PNG (2048px) ve SVG indirme — plaka kazıma için
- **Halka açık anı sayfası**: `/m/<slug>` (QR bu adresi gösterir), hikaye + galeri + videolar
- **Yönetim paneli**: `/ar/admin?key=admin123` — siparişler, durum güncelleme,
  anı sayfaları ve kullanıcılar

## Kurulum

```powershell
npm install
npm run dev
```

http://localhost:3000 adresini açın (otomatik olarak dilinize yönlendirilir).

## Yapılandırma (`.env.local`)

```bash
ADMIN_KEY=admin123        # yönetim paneli anahtarı
GROQ_API_KEY=...          # isteğe bağlı, ücretsiz Groq anahtarı
GEMINI_API_KEY=...        # isteğe bağlı, ücretsiz Gemini anahtarı
```

## Yayına alma

```powershell
npm run build
npm start
```

Veritabanı `data/app.db` (SQLite, Node.js yerleşik `node:sqlite`), yüklemeler
`public/uploads/` altında saklanır. Gerçek ödeme kapısı (Stripe / ZainCash vb.)
sonradan `src/lib/actions.ts` içindeki `placeOrderAction` fonksiyonuna bağlanır.

## Ana dosyalar

| Dosya | Görev |
|---|---|
| `src/proxy.ts` | `/` dil yönlendirmesi, QR adresi `/m/<slug>` |
| `src/lib/actions.ts` | Tüm server action'lar (kayıt, anı, yükleme, AI, sipariş) |
| `src/lib/ai.ts` | Ücretsiz AI hikaye üretimi |
| `src/lib/dicts/` | ar / ku / en / tr sözlükler |
| `src/components/Wizard.tsx` | 5 adımlı sipariş sihirbazı |
| `src/components/QrBox.tsx` | QR önizleme + PNG/SVG indirme |
| `src/app/[lang]/m/[slug]/page.tsx` | Halka açık anı sayfası |
