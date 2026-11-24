# تقرير التدقيق الأمني — Maya / Z-Assistant

**النطاق:** هذا المستودع + أصول المالك المنشورة (Vercel `maya-dashboard`، Supabase `maya-assistant`).
**المنهجية:** PTES / OWASP Testing Guide / NIST SP800-115 — مراجعة كود، فحص أسرار (الشجرة + كامل تاريخ Git)، تدقيق تبعيات، مراجعة منطق المصادقة والصلاحيات، وإصلاح وتحقق فوري.
**القيود الصادقة:** لا توجد بيانات دخول Cloudflare في بيئة الفحص → فصل Cloudflare التشغيلي (WAF/DNS/Zero Trust) يُسلَّم كقائمة تحقق جاهزة وليس نتيجة قياس. لا فحص حي مدمّر ولا اختبار حمل — التزمت بالنطاق غير المدمّر.

---

## 1) ملخص التنفيذ

| # | الثغرة | الخطورة | الحالة |
|---|---|---|---|
| SEC-001 | postcss ≤8.5.22 عبر next (XSS + قراءة ملفات عبر sourceMappingURL) | **High** | ✅ مُصلَّحة ومُتحقَّق منها (audit صفر) |
| SEC-002 | مسارا AI غير مصادقان بلا تحديد معدل (استغلال تكلفة/حجب خدمة) | **Medium** | ✅ مُصلَّحة (حد 30/ساعة AI، 120/ساعة أوامر) |
| SEC-003 | الـ Worker يقبل أي قيمة `site` من النموذج (javascript:/file:/intent:) | **Medium** | ✅ مُصلَّحة (Worker + تطبيق، طبقتان) |
| SEC-004 | التطبيق يشغّل أي اسم تنفيذي يُرجعه النموذج | **Medium** | ✅ مُصلَّحة (قائمة سماح تشغيل) |
| SEC-005 | عدّاد المعدل لكل isolate/instance (ليس عالميًا) | Low | مقبول موثق + توصية |
| SEC-006 | XFF fallback في استخراج IP قابل للتزييف خارج Cloudflare | Low | مقبول موثق |
| SEC-007 | `replyLanguage` من النموذج غير مقيَّد بقائمة قيم | Low | توصية قصيرة |
| — | الأسرار، الأنشطة الشلّية، RLS، رؤوس أمان اللوحة | نقي/محصَّن | ✅ |

---

## 2) الثغرات بالتفصيل (كما طلبت: وصف، خطورة، دليل، توصية، مرجع)

### SEC-001 — postcss عبر next في لوحة التحكم
- **الوصف:** `next@15.5.x` يجمع postcss ≤8.5.22 المتأثر بأربع إشعارات: XSS عبر `<style>` غير مهرّب، وقراءة ملفات/كشف معلومات عبر `sourceMappingURL` يحتكرها المهاجم (3 إشعارات تراكمية).
- **الخطورة:** High (تُقدَّر ~7.5/10 حسب سياق الاستغلال — تتطلب CSS مصدره مهاجم).
- **الدليل:** `npm audit` قبل الإصلاح: `2 vulnerabilities (1 moderate, 1 high)` — `node_modules/next/node_modules/postcss@8.4.31`.
- **الإصلاح المنفذ:** `overrides` في `package.json` الجذر يفرض `postcss ^8.5.23` + إعادة توليد lockfile → **`npm audit --omit=dev` = صفر ثغرات** و`next build` ناجح.
- **المرجع:** GHSA-qx2v-qp2m-jg93، GHSA-6g55-p6wh-862q، GHSA-fxqj-rqcc-2cmp، GHSA-r28c-9q8g-f849 — CWE-79، CWE-22 — OWASP A06 (Vulnerable Components).

### SEC-002 — مسارا الذكاء الاصطناعي بلا تحديد معدل (Vercel)
- **الوصف:** `POST /api/ai` و`POST /api/command` عامّان بلا مصادقة ولا سقف → استنزاف حصة Gemini أو حجب الخدمة على رابط النشر العام.
- **الخطورة:** Medium (أثر مالي/توافر — CVSS تقريبي 5.3–6.5).
- **الدليل:** الكود القديم في `apps/dashboard/src/app/api/ai/route.ts` و`/command/route.ts` لا يحتوي أي limiter.
- **الإصلاح المنفذ:** `apps/dashboard/src/lib/rateLimit.ts` (نافذة ثابتة بالذاكرة، يحفظ مفتاح IP فقط ولا يخزن أي نص) + رؤوس `X-RateLimit-*` + رسالة 429 عربية. الحدود: 30/ساعة للـ AI، 120/ساعة للأوامر. البناء تحقق.
- **ملاحظة صادقة:** هذا حد لكل instance في Serverless — الحد العالمي الدقيق يحتاج مخزنًا مشتركًا أو Vercel Rate Limiting/WAF (انظر §5).
- **المرجع:** CWE-770، CWE-307 — OWASP A04, A05.

### SEC-003 — مخطط URL غير مُتحقق من النموذج (Worker → التطبيق)
- **الوصف:** `validateArgs` كان يقيد `path` فقط؛ قيمة `site` لـ `open_url` كانت أي سلسلة ≤200 حرف. لو انحاز النموذج (prompt injection عبر نص المستخدم) لإرجاع `javascript:` أو `file:` أو `intent:` لفتحه التطبيق عبر url_launcher.
- **الخطورة:** Medium (يتطلب نجاح حقن في النموذج + لمس صلاحيات النظام عبر مخططات URL).
- **الدليل:** `backend/cloudflare-worker/src/intents.ts` — لا شرط لمخطط `site` قبل الإصلاح.
- **الإصلاح المنفذ (طبقتان):** ① الـ Worker: `site` يجب أن يطابق `^https?://` وإلا fail-closed (اختبار جديد: javascript/file/intent → null، وخيارات 36/36 خضراء). ② التطبيق: `platform_service.dart` يفحص `uri.scheme` قبل أي تشغيل — الدفاع في العمق.
- **المرجع:** CWE-601/CWE-20 — OWASP A03 (Injection) عبر قناة النموذج.

### SEC-004 — تشغيل برامج تعسفية بالاسم (طبقة Windows)
- **الوصف:** `Start-Process '<اسم>'` كان يقبل أي اسم يرجعه النموذج/المحلل (التهريب مغطى لكن النطاق مفتوح): مثلًا `cmd` أو `powershell` أو مثبت — رفع صلاحيات سطح المكتب عبر قناة صوتية.
- **الخطورة:** Medium.
- **الدليل:** `app/lib/services/platform_service.dart` قبل الإصلاح: `exeByApp[app] ?? app`.
- **الإصلاح المنفذ:** قائمة سماح صريحة (chrome/code/whatsapp/telegram/notepad/calculator) — أي اسم آخر يُرفض برسالة عربية. المحلل الحتمي نفسه يُنتج أسماء كانونية فقط.
- **المرجع:** CWE-78 (تضييق نطاق الأوامر إلى قائمة سماح) — OWASP A01/A03.

### SEC-005 — عدّاد المعدل ليس عالميًا (مقبول)
- الـ Worker يحسب لكل isolate (يعاد عند النشر)، واللوحة لكل instance. موثق في الكود والتقارير السابقة. **التوصية:** Workers KV/Durable Object للـ Worker، وVercel Rate Limiting/WAF للوحة عند نمو الاستخدام. (CWE-770 — توافر).

### SEC-006 — مصدر IP (مقبول)
- `CF-Connecting-IP` موثوق على Cloudflare، و`X-Forwarded-For` fallback قابل للتزييف خارجها → تجاوز نظري لحد المعدل إذا نُشر الـ Worker خارج CF (غير هو الحال). لا تغيير؛ مراقبة فقط.

### SEC-007 — `replyLanguage` غير مقيَّد بقائمة قيم (توصية)
- يُقتطع إلى 10 أحرف ثم يمر للعميل الذي يتعامل معه بسماحية. أثر منخفض جدًا. **التوصية:** قبول `ar|ar-EG|en` فقط في `gemini_client.ts` عند الفرصة القادمة.

---

## 3) ما ثبتت سلامته (أدلة إيجابية)

- **الأسرار:** فحص بأنماط (AWS/GitHub/Google/OpenAI/Supabase secret/PEM) على الشجرة + **كل commit في التاريخ** → نظيف. ملفات `.env.example` و`wrangler.toml.example` فقط. مفتاح Gemini موجود فعليًا في Cloudflare Secrets/Vercel env فقط.
- **لا shell يمر فيه نص مستخدم:** Worker لا ينفذ أي أمر نظام إطلاقًا؛ Flutter وdevice-agent يستخدمان argv فقط (`execFile`/`Process.run`) مع تهريب PowerShell مُختبر؛ `open_folder` و`taskkill` من خرائط ثابتة.
- **حصن النموذج:** قائمة نيات بيضاء + validateArgs + fail-closed على أي نية مبتدعة؛ نص المستخدم يُرسل كرسالة مستخدم منفصلة عن تعليمات النظام (يقلل سطح الحقن).
- **اللوحة:** المصادقة برابط سحري، وRLS في Supabase هي طبقة الإنفاذ (دوال `security definer` تثبّت `search_path = public` بشكل سليم)، والمفتاح المستخدم عميلًا هو publishable/anon فقط، والتسجيل يمر بمصادقة المستخدم قبل insert.
- **رؤوس أمان اللوحة:** أضفتها الآن (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` مع ميكروفون `self` فقط).
- **الخصوصية:** لا صوت خام يُرفع/يُخزن؛ نص فقط؛ حذف سجل ومؤقتات متاح من شاشة الخصوصية.

---

## 4) تدقيق Cloudflare — التنفيذ الفعلي + قائمة تحقق تشغيلية

**ما نُفّذ فعليًا:**
- ✅ إعداد النشر آليًا: `.github/workflows/deploy-worker.yml` يولّد `wrangler.toml` على الـ runner فقط (لا يلمس المستودع — يفرضه اختبار الأمن) بنطاقات الإنتاج الحقيقية
  (`maya-dashboard-livid.vercel.app`, `maya-dashboard-zyadgams-projects.vercel.app` + localhost للتطوير)، ويشغّل typecheck + الاختبارات قبل النشر، ويثبّت `GEMINI_API_KEY` كـ Cloudflare Secret.
- ✅ تحقق تكوين النشر بـ `wrangler deploy --dry-run`: الحزمة 26.32 KiB والربطيات (ALLOWED_ORIGINS/DAILY_REQUEST_LIMIT/GEMINI_MODEL) صحيحة.
- ✅ لوحة التحكم (Vercel) أعيد نشرها للإنتاج بتشغيل إصلاحات الأمان (SEC-001…004 + رؤوس الأمان + تحديد المعدل): deployment `dpl_9J1kLSrQUFL9xTQ66Tt65pVUyxXw` من commit `2f47eb4`.

**الخطوة الوحيدة المتبقية عليك (من طرفك — لا تلصق أي سر في الشات):**
```bash
# 1) أنشئ توكن من لوحة Cloudflare: My Profile → API Tokens → قالب "Edit Cloudflare Workers"
#    (صلاحيات: Workers Scripts: Edit) ثم في طرفيتك المحلية:
gh secret set CLOUDFLARE_API_TOKEN --repo zyadgfh/Z-Assistant
gh secret set GEMINI_API_KEY    --repo zyadgfh/Z-Assistant
# 2) شغّل النشر:
gh workflow run deploy-worker.yml --repo zyadgfh/Z-Assistant
# 3) تحقق: GET https://maya-assistant-worker.<subdomain>.workers.dev/health → aiConfigured:true
```

**بقية عناصر القائمة التشغيلية (لوحة Cloudflare — لمرة واحدة بعد النشر):**
1. **SSL/TLS:** وضع Full (Strict)، Always Use HTTPS، TLS ≥1.2.
2. **WAF:** تفعيل Managed Ruleset + Rate Limiting على `/v1/assistant` (مثلًا 60/دقيقة/IP) فوق حد التطبيق.
3. **Bot Fight Mode** + Challenge عند هجمات ملاحظة (لا تفعل Under Attack دائمًا مع عملاء API).
4. **DNS:** إخفاء IP الأصلي إن وُجد خادم أصلي، وSPF/DKIM/DMARC لنطاق البريد.
5. **Zero Trust Access** على أي لوحة إدارة أو `/health` إن أردت إخفاء حاله.
6. **API Tokens:** مبدأ أقل صلاحية (توكن النشر للـ Worker فقط، دوري التدوير)، وSecrets عبر `wrangler secret put` فقط.
7. كود `wrangler.toml.example` يفرض `ALLOWED_ORIGINS` دون `*` — النطاقات الفعلية مضبوطة الآن في سير النشر.

## 5) مطابقة ECC (NCA ECC-1:2018) — تقريبية على مستوى الضوابط

| المجال | ما يغطيه المشروع |
|---|---|
| الحوكمة | توثيق سياسات (خصوصية/معمارية/أمان)، مراجعة تغييرات عبر PR + CI إلزامي |
| الدفاع السيبراني | تحقق مدخلات، قوائم سماح، تحديد معدل، رؤوس أمان، تدقيق تبعيات آلي (dependabot + audit في CI) |
| الصمود | fail-closed، fallback محلي بلا إنترنت، رسائل خطأ عربية واضحة بلا تفاصيل داخلية |
| أمن الأطراف الخارجية | عزل مفاتيح الخدمات (Gemini خادميًا فقط)، مراقبة مكتبات الطرف الثالث، RLS لمزود قاعدة البيانات |

## 6) ما لم يُفحص من هذه البيئة (بصراحة)

- Cloudflare التشغيلي (§4) — لا بيانات دخول.
- Flutter runtime على أجهزة حقيقية (CI يوثق الترجمة والاختبارات 33/33 فقط).
- اختبار اختراق حي مدمّر أو حمل — خارج النطاق المتفق عليه عمدًا.
- Vercel live headers — قناة الشبكة هنا لا تصل `*.vercel.app`؛ الإعدادات موثقة في `next.config.ts` وتتحقق في CI بالبناء.
