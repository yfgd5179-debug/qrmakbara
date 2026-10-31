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
RESEND_API_KEY=...        # şifre sıfırlama e-postaları için (ücretsiz resend.com)

# Supabase (zorunlu) — https://supabase.com (free plan)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Cloudflare R2 (isteğe bağlı, videolar için) — free plan: 10 GB, 0 egress
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=uploads
R2_PUBLIC_BASE=https://pub-xxxx.r2.dev   # ya da özel alan adı
```

### Medya depolama nasıl çalışır?

- **Fotoğraflar**: tarayıcıda WebP'ye sıkıştırılır (≤2048px) → Supabase
  Storage'a doğrudan yüklenir. Sıkıştırma sayesinde 8 MB'lık telefon
  fotoğrafı ~200 KB olur; free planın 50 MB/dosya limitine takılmaz.
- **Videolar**: R2 yapılandırıldıysa doğrudan Cloudflare R2'ye yüklenir
  (free plan: 10 GB depolama, sıfır egress ücreti, dosya başına 5 GB'a kadar).
  R2 anahtarları yoksa Supabase'e yüklenirler (free plan için 50 MB limitine
  takılabilir).

### Cloudflare R2 kurumu (ücretsiz)

1. https://dash.cloudflare.com → R2 → "Create bucket" (ad: `uploads`)
2. Bucket → Settings → **Public access**'i aç (URL: `https://pub-xxxx.r2.dev`)
3. R2 → "Manage R2 API Tokens" → "Create API token" (Object Read & Write, bucket: `uploads`)
4. Token'ı `R2_*` env değişkenleri olarak Vercel'e ekleyin
5. Bucket → Settings → CORS policy olarak şunu yapıştırın (tarayıcı yüklemesi için):

```json
[
  {
    "AllowedOrigins": ["https://qrmakbara2.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

## Yayına alma

```powershell
npm run build
npm start
```

Veritabanı Supabase (Postgres, `supabase/schema.sql`), fotoğraflar Supabase
Storage'da, videolar (R2 yapılandırıldıysa) Cloudflare R2'de saklanır. Gerçek
ödeme kapısı (Stripe / ZainCash vb.) sonradan `src/lib/actions.ts` içindeki
`placeOrderAction` fonksiyonuna bağlanır.

## Ana dosyalar

| Dosya | Görev |
|---|---|
| `src/proxy.ts` | `/` dil yönlendirmesi, QR adresi `/m/<slug>` |
| `src/lib/actions.ts` | Tüm server action'lar (kayıt, anı, yükleme, AI, sipariş) |
| `src/lib/ai.ts` | Ücretsiz AI hikaye üretimi |
| `src/lib/r2.ts` | Cloudflare R2 için S3 imzalı URL'ler (videolar) |
| `src/lib/compress.ts` | Tarayıcıda foto sıkıştırma (WebP, ≤2048px) |
| `src/lib/dicts/` | ar / ku / en / tr sözlükler |
| `src/components/Wizard.tsx` | 5 adımlı sipariş sihirbazı |
| `src/components/QrBox.tsx` | QR önizleme + PNG/SVG indirme |
| `src/app/[lang]/m/[slug]/page.tsx` | Halka açık anı sayfası |
