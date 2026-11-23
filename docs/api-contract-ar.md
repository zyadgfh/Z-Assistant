# عقد واجهة البرمجة — Maya Worker

## GET /health

```json
{ "ok": true, "service": "maya-worker", "aiConfigured": true, "time": "2026-11-23T12:00:00Z" }
```

## POST /v1/assistant

الطلب:

```json
{ "text": "افتحلي كروم", "locale": "auto", "deviceId": "device-1" }
```

- Content-Type إلزامي: application/json.
- الحد الأقصى: 16KB للجسم، 500 حرف للنص.
- الترويسات: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

النجاح (نية محلية أو من Gemini بعد التحقق):

```json
{
  "requestId": "uuid",
  "replyText": "حاضر، هفتح Google Chrome",
  "replyLanguage": "ar-EG",
  "intent": "open_application",
  "arguments": { "application": "Google Chrome" },
  "risk": "safe",
  "requiresConfirmation": false
}
```

رد سؤال (بدون تنفيذ):

```json
{ "intent": null, "replyText": "...", "risk": "safe", "requiresConfirmation": false, "..." : "..." }
```

أخطاء منظمة:

| الرمز | الحالة | السبب |
|---|---|---|
| unsupported_media_type | 415 | Content-Type غير JSON |
| payload_too_large | 413 | الجسم أكبر من 16KB |
| missing_text / empty_text / text_too_long | 400 | نص مفقود/فارغ/طويل |
| invalid_json | 400 | JSON غير صالح |
| rate_limited | 429 | تجاوز السقف اليومي |
| ai_unavailable | 502 | فشل Gemini أو نفاد الحصة |
| not_implemented | 501 | /v1/transcribe محجوز |

## قائمة النيات المسموحة (قائمة بيضاء)

safe: open_application, open_url, search_google, search_youtube, take_screenshot,
volume_up, volume_down, open_folder, play_local_music

sensitive (تتطلب تأكيدًا): close_application, send_message, delete_file, change_setting, open_private_file

critical (معطلة في v1): install_application, payment, shell_exec — يرفضها العميل والخادم.

أي نية خارج القائمة ينتجها النموذج تتحول إلى رد نصي بلا تنفيذ.
