import Link from "next/link";

const features = [
  {
    title: "موجّه الأوامر الآمن",
    body: "كل أمر صوتي يُحوَّل إلى نية صريحة قابلة للتدقيق — ولا يُنفَّذ أي نص كـ shell مطلقًا.",
    href: "/console",
    cta: "جرّب التوجيه",
  },
  {
    title: "محرك الصلاحيات",
    body: "ثلاث درجات خطورة: تنفيذ مباشر، بصمة صوتية وحيوية، أو PIN/Windows Hello مع تأكيد ظاهر.",
    href: "/console",
    cta: "عرض السياسات",
  },
  {
    title: "بوابة OmniRoute",
    body: "النموذج المحلي أولًا، والمزودون السحابيون عند الحاجة، مع حصص محلية وتراجع آمن دون إعادة لانهائية.",
    href: "/admin",
    cta: "لوحة الإدارة",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="text-center">
        <p className="text-sm tracking-widest text-indigo-400">Z-ASSISTANT · MAYA AI</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
          مايا — مساعدتك الصوتية ثنائية اللغة
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-neutral-300">
          منصة مساعد صوتي تعمل محليًا أولًا، تفهم العربية واللهجة المصرية والإنجليزية، وتحفظ
          الخصوصية: لا صوت خام ولا بصمة صوتية تُرفع للسحابة افتراضيًا.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/console" className="btn btn-primary">
            لوحة المستخدم
          </Link>
          <Link href="/admin" className="btn btn-ghost">
            لوحة الإدارة
          </Link>
        </div>
      </header>

      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <article key={f.title} className="card flex flex-col gap-3">
            <h2 className="text-lg font-bold">{f.title}</h2>
            <p className="flex-1 text-sm leading-6 text-neutral-300">{f.body}</p>
            <Link href={f.href} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">
              {f.cta} ←
            </Link>
          </article>
        ))}
      </section>

      <section className="card mt-12">
        <h2 className="text-lg font-bold">حالة البنية</h2>
        <ul className="mt-3 grid gap-2 text-sm text-neutral-300 sm:grid-cols-2">
          <li>✅ نواة TypeScript مع اختبارات آلية (Command Router + Permission Engine + OmniRoute)</li>
          <li>✅ مخطط Supabase مطبق: مستأجرون، أدوار، RLS، سجل تدقيق</li>
          <li>✅ هذه اللوحة جاهزة للنشر على Vercel</li>
          <li>⏳ طبقة الصوت والنماذج المحلية — المرحلة التالية وفق خطة التطوير</li>
        </ul>
        <p className="mt-4 text-xs text-neutral-500">
          فحص سريع للخدمة: <code className="text-neutral-400">/api/health</code>
        </p>
      </section>
    </main>
  );
}
