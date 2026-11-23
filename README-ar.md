# Maya — Z-Assistant (النسخة العربية)

مساعد صوتي عربي أولًا لأجهزة **Windows** و**Android**، مبني بـ Flutter، ويتكلم مع
خادم Cloudflare Worker الذي يحتفظ بمفتاح Gemini داخل السيرفر فقط. الأوامر المحلية
المعروفة تعمل بلا إنترنت، وما لا يفهمه يذهب إلى Gemini عبر الوسيط.

## هيكل المستودع

| المسار | الوظيفة |
|---|---|
| `app/` | تطبيق Flutter (Windows + Android): واجهة صوتية، أوامر محلية، صلاحيات، اختبارات |
| `backend/cloudflare-worker/` | عامل TypeScript: `/v1/assistant` و`/v1/transcribe` (محجوز) و`/health` |
| `packages/core/` | خط المعالجة TypeScript من المرحلة السابقة — يعمل كما هو |
| `apps/dashboard/` | لوحة التحكم Next.js من المرحلة الأولى — تعمل كما هي |
| `apps/device-agent/` | وكيل Node مع Whisper — يعمل كما هو |
| `legacy/` | النموذج الأولي بايثون (main.py وعارض GIF وصفحة الحركة) — محفوظ كما هو |
| `assets/` | أصول مشتركة (متحرك Maya) |
| `docs/` | مستندات عربية: المعمارية، الخصوصية، إعداد Windows/أندرويد، عقد الواجهة |

## البدء السريع

```bash
# الخادم الوسيط (يحتفظ بـ GEMINI_API_KEY كسر في Cloudflare)
cd backend/cloudflare-worker && npm install && npx vitest run
cp wrangler.toml.example wrangler.toml   # عدّل ALLOWED_ORIGINS
npx wrangler secret put GEMINI_API_KEY && npm run deploy

# تطبيق Flutter (ولّد مجلدات المنصة مرة واحدة — لا تُرفع في Git)
cd app
flutter create . --platforms=windows,android --project-name maya_assistant
flutter run -d windows          # أو -d android
flutter test                    # اختبارات Dart (الأوامر المحلية، الصلاحيات، المتحكم…)
```

رابط الخادم **عام وليس سرًا**: أدخله من شاشة الإعدادات أو عبر `--dart-define=MAYA_BACKEND_URL=...`.

## نموذج الأمان

- **آمن**: فتح تطبيق/موقع/مجلد، بحث، لقطة شاشة، صوت، موسيقى محلية — تنفيذ مباشر.
- **حساس**: إغلاق تطبيق، حذف ملف، إرسال رسالة، تغيير إعداد — تأكيد منطوق/مكتوب أولًا.
- **خطير**: تثبيت، دفع، أوامر نظام — مرفوض في الإصدار الأول (واجهات وTODO فقط).
- نص الكلام لا يصل shell أبدًا؛ كل استدعاء عملية بقائمة وسائط فقط.
- لا يوجد أي مفتاح API داخل التطبيق أو المستودع؛ الخادم يتحقق من مخرجات النموذج
  ضد قائمة نيات بيضاء.
- التعرف على الكلام داخل الجهاز، لا رفع صوت خام، سقف تسجيل 12 ثانية، ملفات مؤقتة
  قابلة للحذف.

## الحالة (بصراحة)

- الخادم الوسيط: مكتمل ومُختبَر هنا (35 اختبار vitest ناجحة).
- تطبيق Flutter: الكود والاختبارات مكتملة لكن **لم تُنفَّذ** في هذه البيئة
  (لا يوجد Flutter/Dart SDK في بيئة العمل) — شغّل `flutter test` محليًا.
- التعرف الصوتي على Windows يحتاج جسرًا أصليًا (لاحقًا)؛ أندرويد يعمل عبر محركات النظام.
- Windows Hello وكلمة التنبيه: واجهات معدّة وغير مفعلة.

الترخيص: MIT — انظر [LICENSE](LICENSE).
