# تشغيل Maya على Windows

## المتطلبات

- Flutter SDK 3.24+ (مع دعم Windows Desktop: `flutter doctor` يجب أن يظهر ✓ على Visual Studio)
- Node.js 20+ (لنشر الـ Worker)

## الخطوات

```bash
# 1) توليد مجلدات المنصة (مرة واحدة — لا تُرفع في Git)
cd app
flutter create . --platforms=windows,android --project-name maya_assistant

# 2) تشغيل التطبيق على Windows
flutter run -d windows

# 3) بناء إصدار نهائي
flutter build windows
```

## خادم Gemini (الوسيط)

```bash
cd backend/cloudflare-worker
npm install
cp wrangler.toml.example wrangler.toml   # عدّل ALLOWED_ORIGINS
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # لا يُكتب في أي ملف
npm run deploy
```

ثم أدخل رابط الـ Worker في شاشة الإعدادات داخل التطبيق (أو `--dart-define=MAYA_BACKEND_URL=...`).

## معلومات صادقة

- **التعرف الصوتي على Windows**: يحتاج جسرًا أصليًا (WinRT SpeechRecognition) لم يُنفذ بعد؛
  الواجهة تعرض رسالة واضحة، وزر الأوامر النصية يعمل بالكامل للاختبار.
- **TTS على Windows**: يعمل فعليًا عبر PowerShell `System.Speech` (صوت عربي إن كان مثبتًا).
- **التشغيل التلقائي**: فعّل «تشغيل تلقائي مع Windows» من الإعدادات ثم أضف اختصار التطبيق إلى
  `shell:startup` أو سجل `HKCU\...\Run` (خطوة يدوية موثقة، لا يعدّل التطبيق السجل بنفسه بعد).
- **Windows Hello للأوامر الحساسة**: واجهة معدة وغير مفعلة — لا ادعاء اكتمال.
- لا يوجد تجاوز لشاشة تسجيل الدخول ولا قراءة/تخزين كلمات مرور.
