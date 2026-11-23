# Z-Assistant — Maya AI

مساعد صوتي ثنائي اللغة (عربي/إنجليزي) ومعه منصة متكاملة قيد البناء وفق [خطة التطوير](development-plan-ar.md):
نواة مشتركة قابلة للاختبار، مخطط Supabase مع عزل مستأجرين وRLS، ولوحة ويب جاهزة للنشر على Vercel.

## بنية المستودع

```text
main.py                  ← نموذج macOS الأولي (مساعد صوتي محلي)
packages/core/           ← النواة المشتركة (TypeScript)
  └─ commandRouter       ← توجيه الأوامر العربية/الإنجليزية إلى نوايا صريحة
  └─ permissionEngine    ← ثلاث درجات خطورة: تنفيذ مباشر / بصمة صوتية / بصمة+PIN
  └─ providerRouter      ← بوابة OmniRoute: محلي أولًا + حصص + fallback آمن
apps/dashboard/          ← لوحة Next.js (عربية RTL) للمستخدم والإدارة
supabase/migrations/     ← مرآة المهاجرات المطبقة على مشروع maya-assistant
maya_animation.gif       ← أصل شاشة البداية للنموذج المحلي
```

## منصة Maya (المرحلة 0 من الخطة)

### النواة واختباراتها

```bash
npm install
npm test -w @maya/core        # 27 اختبارًا آليًا
npm run typecheck             # فحص الأنواع في كل الحزم
```

قواعد النواة الثابتة:
- النص المنطوق يُحوَّل إلى **نية صريحة** ولا يُنفَّذ كـ shell مطلقًا.
- الأوامر غير المعروفة تصبح `ai_query` — إجابة نصية فقط.
- `shell_exec` مرفوض في الوضع الآمن، ولا يعمل إلا في وضع المطوّر المؤقت والموثق.
- OmniRoute يرسل الحساسيات إلى السحابة فقط بعد موافقة صريحة ويفشل مغلقًا عند غيابها.

### قاعدة البيانات (Supabase)

مشروع: **maya-assistant** (`ljfydqtrbhjlijwdajpl`, eu-central-1).

| الجدول | الغرض |
|---|---|
| `profiles`, `user_settings` | الملف الشخصي وإعدادات الخصوصية (كلمة التنبيه، مدة الاحتفاظ، موافقة السحابة) |
| `tenants`, `tenant_members` | المؤسسات والأدوار: owner / tenant_admin / support / auditor / member / guest |
| `devices` | أجهزة المستخدم الموثوقة |
| `voice_commands` | سجل الأوامر — النص يُحفظ فقط بعد موافقة صريحة |
| `audit_logs` | سجل تدقيق للقراءة فقط (لا تحديث ولا حذف عبر RLS) |
| `maya_voice_command_diagnostics` | عرض تشخيصي للإداري دون النصوص الخاصة |

- **24 سياسة RLS** مطبقة على كل الجداول، ولا يستطيع مستخدم رؤية بيانات مستخدم أو مستأجر آخر.
- لا صوت خام ولا قوالب بصمة في قاعدة البيانات إطلاقًا (الخطة §9 و§14).
- لإعادة الإنشاء على مشروع جديد: `supabase link --project-ref <REF>` ثم `supabase db push`.

### لوحة الويب

```bash
npm run dev -w @maya/dashboard   # http://localhost:3000
```

- `/console` — لوحة المستخدم: الأجهزة، آخر الأوامر، إعدادات الخصوصية (دخول برابط سحري).
- `/admin` — لوحة الإدارة: المؤسسات، الأعضاء والأدوار، سجل التدقيق، تشخيص بدون نصوص خاصة.
- `/api/health` — فحص الجاهزية.

المفاتيح العامة (Publishable) فقط تصل للمتصفح؛ كل الوصول محمي بـ RLS.

## النشر على Vercel

1. أنشئ مشروعًا مع Root Directory = `apps/dashboard` وإطار العمل Next.js.
2. متغيرات البيئة: `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY` (المفتاح القابل للنشر فقط).
3. المفتاح السري لا يدخل المستودع ولا متغيرات الواجهة إطلاقًا.

## نموذج macOS المحلي (main.py)

مساعد صوتي يعمل على macOS عبر Ollama، مع توجيه آمن للأوامر المعروفة (فتح تطبيقات، بحث، موسيقى، لقطات شاشة) دون تنفيذ نصوص shell.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

يلزم على macOS: تثبيت [Ollama](https://ollama.com/) ثم `ollama pull llama3`، ومنح Python صلاحيات الميكروفون وتسجيل الشاشة. لتغيير النموذج: `MAYA_OLLAMA_MODEL=llama3.2 python main.py`.

### الخصوصية

التعرف الصوتي يستخدم خدمة Google Speech Recognition السحابية، أي أن الصوت الملتقط يُرسل إلى خدمة جوجل للتحويل إلى نص ولا يبقى داخل الجهاز في هذه الخطوة. أما فهم الأوامر والردود عبر Ollama فتعمل محليًا. لتشغيل كامل دون إنترنت يلزم مستقبلًا محرك تعرف محلي (مثل Vosk أو Whisper) وفق خطة التطوير.

## خطوات قادمة (من الخطة)

1. تشغيل OpenAI Whisper/Vosk محليًا وربطه بالنواة عبر نموذج أدوات قابل للاختبار.
2. OmniRoute مع مزود Gemini فعلي ومفاتيح المستخدم الخاصة به.
3. ربط لوحة المستخدم بتطبيق الجهاز (Windows/Android أولًا).
