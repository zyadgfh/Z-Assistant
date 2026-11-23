# تشغيل Maya على Android

## المتطلبات

- Flutter SDK 3.24+ مع Android SDK (واجهة `flutter doctor` سليمة)
- جهاز أو محاكي بنظام Android 8+ مع محرك تعرف صوتي نظامي (Google)

## الخطوات

```bash
cd app
flutter create . --platforms=windows,android --project-name maya_assistant
flutter run -d android
```

## صلاحية الميكروفون

أضف في `android/app/src/main/AndroidManifest.xml` (داخل `<manifest>`):

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<queries>
  <intent>
    <action android:name="android.speech.RecognitionService" />
  </intent>
</queries>
```

يطلب التطبيق الصلاحية عند أول ضغطة على زر الميكروفون عبر حزمة `speech_to_text`،
ويعرض رسالة واضحة عند الرفض.

## ما يعمل على Android في هذا الإصدار

- التعرف الصوتي محليًا (محرك النظام) بالعربية والإنجليزية — لا يُرفع الصوت.
- الأوامر الآمنة: فتح روابط/مواقع، بحث جوجل/يوتيوب عبر المتصفح.
- الردود الصوتية عبر محرك TTS النظامي (`flutter_tts`) مع اختيار أقرب صوت عربي.
- المحادثة الذكية عبر الـ Worker عند توفر الإنترنت.

## ما يحتاج خطوات إضافية (موثقة بصدق)

- **Foreground Service للاستماع الدائم بكلمة التنبيه**: يُبنى لاحقًا مع إشعار دائم
  وخيار إيقاف يدوي — لا يوجد جمع صوت في الخلفية في هذا الإصدار.
- فتح تطبيقات أندرويد بالاسم يحتاج معرف الحزمة (package id) — قيد الإنشاء.
- لقطة الشاشة والصوت والتحكم بالمجلدات: غير مدعومة على أندرويد بدون صلاحيات نظام.
- تحسين البطارية: عند بناء الخدمة الدائمة أضف الاستثناء من Battery Optimization يدويًا من الإعدادات.
