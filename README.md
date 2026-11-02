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

`npm test` — presigned URL imzalamasını (`src/lib/s3.ts`) AWS'in resmi SigV4
implementasyonuna karşı birebir doğrular; `s3.ts` değişikliklerinde çalıştırın.

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
S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
S3_REGION=us-east-005
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=qrmakbarauploads
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
2. B2 Cloud Storage'ı etkinleştirin → **New Bucket** (ad: `qrmakbarauploads`,
   privacy: **Private** — public bucket kart/kimlik doğrulaması ister)
3. **App Keys** → "Add a New Application Key" (sadece bu bucket'a erişim,
   "S3 API Access" uyumlu anahtar) → `keyID` ve `applicationKey` alın
4. Vercel'e env değişkenlerini ekleyin:
   - `S3_ENDPOINT`: bucket sayfasındaki **S3 API Endpoint** (örn.
     `https://s3.us-east-005.backblazeb2.com` — bölgeye göre değişir)
   - `S3_REGION`: endpoint'teki bölge adı (örn. `us-east-005`)
   - `S3_ACCESS_KEY_ID` = keyID, `S3_SECRET_ACCESS_KEY` = applicationKey
   - `S3_BUCKET` = bucket adı
5. Bucket → **CORS** ayarı — tarayıcının B2'ye doğrudan PUT atabilmesi için
   şarttır. Uygulama `s3.<bölge>.backblazeb2.com` (S3-uyumlu API) üzerinden
   yüklüyor, bu yüzden kuralda **`s3_*` operasyonları** bulunmalı.

   ⚠️ **Konsolun hazır seçenekleri ("Share everything in this bucket…")
   yanıltıcıdır:** bunlar yalnızca **indirme** izni yazar (`s3_get`),
   `s3_put` yazılmaz → yükleme preflight'i *"This CORS request is not
   allowed"* ile 403 alır. Custom kural ayrıca konsoldan düzenlenemez;
   **B2 Native API** ile yazılır.

   **Doğrulanmış yol — Native API (`b2` CLI):**

   ```json
   [
     {
       "corsRuleName": "app-uploads",
       "allowedOrigins": [
         "http://localhost:3000",
         "https://qrmakbara2.vercel.app",
         "https://*.vercel.app"
       ],
       "allowedOperations": ["s3_get", "s3_head", "s3_put", "s3_delete"],
       "allowedHeaders": ["content-type"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

   ```powershell
   b2 bucket update --cors-rules "$(<cors-rules.json)" qrmakbarauploads allPrivate
   ```

   > `bucketType` argümanını mutlaka `allPrivate` verin — public bucket
   > kart/kimlik doğrulaması ister.

   > **S3 API'siyle (`aws s3api put-bucket-cors` / XML) bu bucketta kural
   > yazılamaz:** konsol kuralı Native API ile yazıldığı için B2
   > *"The bucket contains B2 Native CORS rules. Please use B2 Native API
   > instead"* hatasını döndürür. Buna karşılık Native kuraldaki `s3_*`
   > operasyonları S3-uyumlu API preflight'larında birebir çalışır
   > (kurulum sonrası doğrulandı: PUT/GET/HEAD/DELETE → 200, bilinmeyen
   > origin → 403).

   **Doğrulama (tarayıcı preflight'ını simüle eder):**

   ```powershell
   curl.exe -i -X OPTIONS "https://s3.us-east-005.backblazeb2.com/qrmakbarauploads/v-test.mp4" `
     -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: PUT" `
     -H "Access-Control-Request-Headers: content-type"
   ```

   Beklenen: `200` + `access-control-allow-origin: http://localhost:3000` +
   `access-control-allow-methods: PUT`. Bilinmeyen bir origin ile tekrar
   denendiğinde **403** dönmeli (bu, kuralın doğru çalıştığının göstergesidir).

   Son uçtan uca kontrol: presigned `PUT` ile küçük bir dosya yükleyip
   presigned `GET` ile okunmalı, presigned `DELETE` ile silinince `404`
   vermeli.

> Bucket özel olduğu için oynatma (video `GET`) için ayrıca CORS gerekmez;
> yine de kuralda `s3_get` bulundurmak anı sayfasındaki olası tarayıcı
> istekleri için gereklidir. Cloudflare R2 kullanmak isterseniz aynı `S3_*`
> değişkenleriyle R2 endpoint'ini (`https://<accountid>.r2.cloudflarestorage.com`,
> bölge `auto`) vermeniz yeterli — ayrıca kart gerektirir.

## Güvenlik

- **Yönetici girişi**: `?key=` URL parametresi yerine imzalı, `httpOnly`
  çerez (HMAC-SHA256, 12 saat) — anahtar URL'de/loglarda görünmez.
- **Giriş sorgusu**: PostgREST filtre enjeksiyonuna karşı kullanıcı girdisi
  asla `.or()` filtre dizesine eklenmez; iki ayrı, parametreli `.eq()` ile
  aranır.
- **Rate-limiting** (`src/lib/ratelimit.ts`): login, kayıt, admin girişi,
  şifre sıfırlama ve AI hikâye üretimi IP/nöz/user başına sınırlanır
  (bellek-içi, instance başına).
- **Security headers**: nonce'lu strict CSP (`src/proxy.ts` üzerinden her
  istekte üretilir), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` (`next.config.ts`) ve üretimde HSTS.
- **Çerezler**: oturum + admin çerezleri `httpOnly`, `SameSite=Lax`,
  üretimde `secure`.

## Yayına alma

```powershell
npm run build
npm start
```

Veritabanı Supabase (Postgres, `supabase/schema.sql`), fotoğraflar Supabase
Storage'da, videolar (`S3_*` yapılandırıldıysa) Backblaze B2'de saklanır. Gerçek
ödeme kapısı (Stripe / ZainCash vb.) sonradan `src/lib/actions.ts` içindeki
`placeOrderAction` fonksiyonuna bağlanır.

### Vercel'e deploy (ücretsiz, kartsız)

1. https://vercel.com/new → GitHub repo'nuzu seçin; framework **Next.js**
   otomatik algılanır, ek yapılandırma gerekmez.
2. **Settings → Environment Variables** → `.env.local` bölümündeki tüm
   değişkenleri ekleyin:
   - zorunlu: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_KEY`
     (üretimde `admin123` devre dışıdır — mutlaka güçlü bir değer verin)
   - videolar için: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
     `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`
   - isteğe bağlı: `GROQ_API_KEY` / `GEMINI_API_KEY`, `RESEND_API_KEY`
3. **Deploy** → build `npm run build` ile tamamlanır. Uzun süren server
   action'lar (AI hikâye üretimi) için `maxDuration = 120`
   (`src/app/[lang]/layout.tsx`) tanımlıdır.
4. Üretim alan adınızı (ör. `https://qrmakbara2.vercel.app`) B2 **CORS**
   origin listesine ekleyin (yukarıdaki B2 bölümü); PR/preview alt alan
   adları için `https://*.vercel.app` yeterlidir.

Notlar:

- **Büyük dosyalar Vercel'den geçmez**: fotoğraflar tarayıcıda sıkıştırılıp
  Supabase Storage'a, videolar tarayıcıdan doğrudan B2'ye yüklenir — bu yüzden
  Vercel'in ~4.5 MB istek gövdesi limiti sorun olmaz.
- Middleware (`src/proxy.ts`: dil yönlendirme, `/m/<slug>` rewrite, nonce'lu
  CSP) Vercel'de otomatik olarak Edge'de çalışır.
- `next.config.ts` başlıkları ve `serverActions.bodySizeLimit` aynen uygulanır.

## Ana dosyalar

| Dosya | Görev |
|---|---|
| `src/proxy.ts` | `/` dil yönlendirmesi, QR adresi `/m/<slug>`, nonce'lu CSP |
| `src/lib/actions.ts` | Tüm server action'lar (kayıt, anı, yükleme, AI, sipariş) |
| `src/lib/ai.ts` | Ücretsiz AI hikaye üretimi |
| `src/lib/s3.ts` | S3 uyumlu depolama (Backblaze B2 / R2) imzalı URL'ler |
| `src/lib/compress.ts` | Tarayıcıda foto sıkıştırma (WebP, ≤2048px) |
| `src/lib/dicts/` | ar / ku / en / tr sözlükler |
| `src/components/Wizard.tsx` | 5 adımlı sipariş sihirbazı |
| `src/components/QrBox.tsx` | QR önizleme + PNG/SVG indirme |
| `src/app/[lang]/m/[slug]/page.tsx` | Halka açık anı sayfası |
