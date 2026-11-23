# Maya Cloudflare Worker — الخادم الوسيط

الطبقة الوحيدة التي تلمس مفتاح Gemini. التطبيق (Flutter) يتحدث مع هذا الـ Worker عبر HTTPS فقط.

## الواجهات

| المسار | الوصف |
|---|---|
| `GET /health` | حالة الخدمة وهل الذكاء مهيأ (بدون أي أسرار) |
| `POST /v1/assistant` | نص ← نية منظمة + رد عربي/مصري |
| `POST /v1/transcribe` | محجوز للإصدارات القادمة — يرجع 501 بوضوح |

## النشر

```bash
npm install
cp wrangler.toml.example wrangler.toml   # عدّل ALLOWED_ORIGINS
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # اللصق من stdin، لا يُكتب في أي ملف
npm run deploy
```

## الحدود والسلامة

- تحقق من Content-Type وحجم الجسم (16KB) وطول النص (500 حرف).
- سقف يومي لكل IP (200 افتراضيًا) عبر `DAILY_REQUEST_LIMIT` + ترويسات `X-RateLimit-*`.
- CORS مقصور على `ALLOWED_ORIGINS` — لا `*` في الإنتاج.
- النيات مقفلة بقائمة بيضاء: النموذج لا يستطيع إنتاج أمر shell أو مسار حر.
- ملاحظة صادقة: عداد الطلبات داخل الذاكرة يعد لكل isolate ويعيد الضبط عند النشر؛
  للعدد الدقيق عالميًا اربط Workers KV أو Durable Object (خطوة الإنتاج الأولى).

## الاختبارات

```bash
npm test    # 25+ اختبارًا: صحة الطلبات، الحدود، فشل Gemini، تسريب الأسرار، فحص المستودع
```
