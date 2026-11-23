"use client";

import { useCallback, useEffect, useState } from "react";

import { SignInCard, useSession } from "@/components/auth";
import { VoiceLoop } from "@/components/voiceLoop";
import { getSupabase } from "@/lib/supabase";

interface VoiceCommand {
  id: string;
  intent: string | null;
  status: string;
  risk: string;
  channel: string;
  latency_ms: number | null;
  created_at: string;
  transcript: string | null;
}

interface Device {
  id: string;
  name: string;
  platform: string;
  is_trusted: boolean;
  last_seen_at: string | null;
}

interface Settings {
  wake_word: string;
  voice_commands_enabled: boolean;
  cloud_fallback_enabled: boolean;
  data_retention_days: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المعالجة",
  executed: "نُفّذ",
  rejected: "مرفوض",
  failed: "فشل",
  awaiting_confirmation: "بانتظار التأكيد",
};

export default function ConsolePage() {
  const { session, email, setEmail, status, message, signIn, signOut } = useSession();
  const [commands, setCommands] = useState<VoiceCommand[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; error?: boolean } | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [commandsResult, devicesResult, settingsResult] = await Promise.all([
      supabase
        .from("voice_commands")
        .select("id, intent, status, risk, channel, latency_ms, created_at, transcript")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("devices").select("id, name, platform, is_trusted, last_seen_at").order("created_at", { ascending: false }),
      supabase.from("user_settings").select("wake_word, voice_commands_enabled, cloud_fallback_enabled, data_retention_days").single(),
    ]);

    setCommands((commandsResult.data as VoiceCommand[]) ?? []);
    setDevices((devicesResult.data as Device[]) ?? []);
    setSettings((settingsResult.data as Settings) ?? null);
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function saveSettings() {
    const supabase = getSupabase();
    if (!supabase || !settings) return;
    setSavingSettings(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("user_settings").upsert({
      user_id: user?.id,
      wake_word: settings.wake_word,
      voice_commands_enabled: settings.voice_commands_enabled,
      cloud_fallback_enabled: settings.cloud_fallback_enabled,
      data_retention_days: settings.data_retention_days,
    });
    setSavingSettings(false);
    if (!error) setSavedAt(new Date().toLocaleTimeString("ar-EG"));
  }

  async function askMaya(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: question }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      setAnswer(
        data.reply
          ? { text: data.reply }
          : { text: data.error ?? "حدث خطأ غير متوقع.", error: true },
      );
    } catch {
      setAnswer({ text: "تعذر الاتصال بالخادم.", error: true });
    } finally {
      setAsking(false);
    }
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="mb-8 text-center text-2xl font-bold">لوحة المستخدم — مايا</h1>
        <SignInCard email={email} setEmail={setEmail} status={status} message={message} onSubmit={signIn} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة المستخدم — مايا</h1>
        <button onClick={signOut} className="btn btn-ghost text-sm">
          خروج
        </button>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-bold">الأجهزة ({devices.length})</h2>
          {devices.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">لا توجد أجهزة مسجلة بعد — سجّل جهازك أول مرة تشغّل مايا عليه.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2">
                  <span>{d.name}</span>
                  <span className="text-neutral-400">
                    {d.platform} · {d.is_trusted ? "موثوق" : "غير موثوق"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="font-bold">الإعدادات والخصوصية</h2>
          {settings ? (
            <div className="mt-3 space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>كلمة التنبيه</span>
                <input
                  className="input max-w-[9rem]"
                  value={settings.wake_word}
                  onChange={(e) => setSettings({ ...settings, wake_word: e.target.value })}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>السماح بالتراجع السحابي (موافقة صريحة)</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.cloud_fallback_enabled}
                  onChange={(e) => setSettings({ ...settings, cloud_fallback_enabled: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>مدة الاحتفاظ بالنصوص (أيام)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="input max-w-[6rem]"
                  value={settings.data_retention_days}
                  onChange={(e) => setSettings({ ...settings, data_retention_days: Number(e.target.value) })}
                />
              </label>
              <div className="flex items-center gap-3">
                <button onClick={saveSettings} className="btn btn-primary text-sm" disabled={savingSettings}>
                  {savingSettings ? "جارٍ الحفظ..." : "حفظ"}
                </button>
                {savedAt && <span className="text-xs text-emerald-400">حُفظ {savedAt}</span>}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">جارٍ تحميل الإعدادات...</p>
          )}
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="font-bold">اسأل مايا سؤالًا</h2>
        <p className="mt-1 text-xs text-neutral-500">
          يمر السؤال عبر بوابة OmniRoute إلى Gemini على الخادم — المفتاح لا يصل للمتصفح، ومايا تجيب فقط ولا تدّعي تنفيذ أفعال على الجهاز.
        </p>
        <form onSubmit={askMaya} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            placeholder="مثال: ما عاصمة اليابان؟"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={asking}>
            {asking ? "مايا تفكر..." : "اسأل"}
          </button>
        </form>
        {answer && (
          <p className={`mt-3 rounded-lg bg-neutral-900 px-3 py-2 text-sm leading-6 ${answer.error ? "text-red-400" : "text-neutral-200"}`}>
            {answer.text}
          </p>
        )}
      </section>

      <VoiceLoop />

      <section className="card mt-6">
        <h2 className="font-bold">آخر الأوامر الصوتية</h2>
        {commands.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            لا أوامر بعد. النص المكتوب هنا يُحفظ فقط بعد موافقتك الصريحة — لا صوت خام يُرفع أبدًا.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="px-3 py-2">النية</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">الخطورة</th>
                  <th className="px-3 py-2">الزمن (ms)</th>
                  <th className="px-3 py-2">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2 font-medium">{c.intent ?? "—"}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[c.status] ?? c.status}</td>
                    <td className="px-3 py-2">{c.risk}</td>
                    <td className="px-3 py-2">{c.latency_ms ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-400">{new Date(c.created_at).toLocaleString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
