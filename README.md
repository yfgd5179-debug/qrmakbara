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
- **Yönetim paneli**: `/ar/admin` — güvenli giriş (anahtar URL'de değil, imzalı
  httpOnly çerez), sipariş arama + durum filtresi, tek tıkla durum güncelleme
  (bekliyor/ödendi/kargolandı/teslim/iptal), ciro özeti, CSV dışa aktarma,
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

# Backblaze B2 (isteğe bağlı, videolar için) — 10 GB ücretsiz, KART İSTEMEZ
# Özel (private) bucket + S3 API anahtarı kullanın. R2 de aynı S3_* değişkenleriyle çalışır.
S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
S3_REGION=us-west-004
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=uploads
# S3_PUBLIC_BASE=...   # yalnızca PUBLIC bucket/is your CDN varsa; private bucket'ta boş bırakın
```

### Medya depolama nasıl çalışır?

- **Fotoğraflar**: tarayıcıda WebP'ye sıkıştırılır (≤2048px) → Supabase
  Storage'a doğrudan yüklenir. Sıkıştırma sayesinde 8 MB'lık telefon
  fotoğrafı ~200 KB olur; free planın 50 MB/dosya limitine takılmaz.
- **Videolar**: `S3_*` yapılandırıldıysa doğrudan Backblaze B2'ye yüklenir
  (10 GB ücretsiz, kartsız kayıt, dosya başına 5 GB'a kadar; indirme
  kotası depolamanın 3 katı/ay). Bucket **özel** olduğu için anı sayfası
  her görüntülemede 24 saat geçerli imzalı bir oynatma URL'i üretir —
  dosyalar asla herkese açık indirilemez. `S3_*` anahtarları yoksa
  videolar Supabase'e yüklenir (free plan için 50 MB limitine takılabilir).

### Backblaze B2 kurumu (ücretsiz, kartsız)

1. https://www.backblaze.com → "Get Started Free" (kredi kartı istemez)
2. B2 Cloud Storage'ı etkinleştirin → **New Bucket** (ad: `uploads`,
   privacy: **Private** — public bucket kart/kimlik doğrulaması ister)
3. **App Keys** → "Add a New Application Key" (sadece bu bucket'a erişim,
   "S3 API Access" uyumlu anahtar) → `keyID` ve `applicationKey` alın
4. Vercel'e env değişkenlerini ekleyin:
   - `S3_ENDPOINT`: bucket sayfasındaki **S3 API Endpoint** (örn.
     `https://s3.us-west-004.backblazeb2.com` — bölgeye göre değişir)
   - `S3_REGION`: endpoint'teki bölge adı (örn. `us-west-004`)
   - `S3_ACCESS_KEY_ID` = keyID, `S3_SECRET_ACCESS_KEY` = applicationKey
   - `S3_BUCKET` = bucket adı
5. Bucket → **CORS** ayarına şunu ekleyin (tarayıcının B2'ye PUT atabilmesi için):

```json
[
  {
    "AllowedOrigin": ["https://qrmakbara2.vercel.app", "http://localhost:3000"],
    "AllowedOperation": ["PUT", "GET", "HEAD"],
    "AllowedHeader": ["content-type"],
    "MaxAgeSeconds": "3600"
  }
]
```

> Bucket özel olduğu için oynatma için CORS gerekmez; sadece yükleme
> (PUT) için şarttır. Cloudflare R2 kullanmak isterseniz aynı `S3_*`
> değişkenleriyle R2 endpoint'ini (`https://<accountid>.r2.cloudflarestorage.com`,
> bölge `auto`) vermeniz yeterli — ayrıca kart gerektirir.

## Yayına alma

```powershell
npm run build
npm start
```

Veritabanı Supabase (Postgres, `supabase/schema.sql`), fotoğraflar Supabase
Storage'da, videolar (`S3_*` yapılandırıldıysa) Backblaze B2'de saklanır. Gerçek
ödeme kapısı (Stripe / ZainCash vb.) sonradan `src/lib/actions.ts` içindeki
`placeOrderAction` fonksiyonuna bağlanır.

## Ana dosyalar

| Dosya | Görev |
|---|---|
| `src/proxy.ts` | `/` dil yönlendirmesi, QR adresi `/m/<slug>` |
| `src/lib/actions.ts` | Tüm server action'lar (kayıt, anı, yükleme, AI, sipariş) |
| `src/lib/ai.ts` | Ücretsiz AI hikaye üretimi |
| `src/lib/s3.ts` | S3 uyumlu depolama (Backblaze B2 / R2) imzalı URL'ler |
| `src/lib/compress.ts` | Tarayıcıda foto sıkıştırma (WebP, ≤2048px) |
| `src/lib/dicts/` | ar / ku / en / tr sözlükler |
| `src/components/Wizard.tsx` | 5 adımlı sipariş sihirbazı |
| `src/components/QrBox.tsx` | QR önizleme + PNG/SVG indirme |
| `src/app/[lang]/m/[slug]/page.tsx` | Halka açık anı sayfası |
