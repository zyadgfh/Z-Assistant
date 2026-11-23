"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabase } from "@/lib/supabase";

/**
 * Maya voice loop for the browser (Web Speech API).
 *
 * The browser only transcribes speech; every decision comes from the shared
 * core via /api/command (wake word -> intent -> permissions). Web-safe actions
 * run here (open links, speak answers); OS actions are returned for the
 * device client. Raw audio stays in the browser — nothing is uploaded.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface CommandResponse {
  stage: "ignored" | "no_command" | "executed" | "answered" | "rejected" | "needs_confirmation" | "needs_auth" | "failed";
  intent?: string | null;
  reply?: string;
  reason?: string;
  actions?: Array<{ kind: string; url?: string; label?: string; text?: string }>;
  deviceActions?: Array<{ kind: string; app?: string; folder?: string; song?: string }>;
}

const STAGE_LABEL: Record<CommandResponse["stage"], string> = {
  ignored: "تم تجاهل الكلام المحيط (بدون كلمة التنبيه).",
  no_command: "قلتِ «مايا» فقط — ما الأمر؟",
  executed: "نُفّذ الأمر.",
  answered: "أجابت مايا.",
  rejected: "الأمر مرفوض في الوضع الآمن.",
  needs_confirmation: "الأمر يحتاج تأكيدًا ظاهرًا.",
  needs_auth: "الأمر يتطلب مصادقة أعلى على جهازك.",
  failed: "تعذر تنفيذ الأمر.",
};

function speakText(text: string, lang: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang.startsWith("ar") ? "ar-SA" : "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function VoiceLoop() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<"ar-SA" | "en-US">("ar-SA");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState<CommandResponse | null>(null);
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  const handleCommand = useCallback(async (text: string) => {
    setTranscript(text);
    setResponse(null);
    setDeviceNote(null);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const supabase = getSupabase();
    const { data: sessionData } = (await supabase?.auth.getSession()) ?? { data: null };
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch("/api/command", {
      method: "POST",
      headers,
      body: JSON.stringify({ text, mode: "voice", requireWakeWord: true, storeTranscript: false }),
    });
    const data = (await res.json()) as CommandResponse;
    setResponse(data);

    if (data.stage === "executed") {
      for (const action of data.actions ?? []) {
        if (action.kind === "open_url" && action.url) window.open(action.url, "_blank", "noopener");
        if (action.kind === "speak" && action.text) speakText(action.text, lang);
      }
      const deviceKinds = (data.deviceActions ?? []).map((a) => a.kind);
      if (deviceKinds.length > 0) {
        setDeviceNote(`النية موجهة لجهازك (${deviceKinds.join("، ")}) — سينفذها عميل الجهاز.`);
      }
      return;
    }
    if (data.stage === "answered" && data.reply) speakText(data.reply, lang);
    if (data.stage === "rejected" && data.reason) speakText(data.reason, lang);
  }, [lang]);

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const result = event.results[0];
      const text = result?.[0]?.transcript ?? "";
      if (text) void handleCommand(text);
    };
    recognition.onerror = (event) => {
      setResponse({ stage: "failed", reason: event.error === "not-allowed" ? "صلاحية الميكروفون مرفوضة." : `خطأ التعرف: ${event.error}` });
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setResponse(null);
    setListening(true);
    recognition.start();
  }, [handleCommand, lang]);

  return (
    <section className="card mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">مايا الصوتية (متصفحك)</h2>
        <button
          onClick={() => setLang((current) => (current === "ar-SA" ? "en-US" : "ar-SA"))}
          className="btn btn-ghost text-xs"
        >
          {lang === "ar-SA" ? "العربية" : "English"}
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        ابدأ الجملة بكلمة التنبيه «مايا» — القرارات تُتخذ في النواة على الخادم، والصوت لا يغادر متصفحك.
      </p>

      {!supported ? (
        <p className="mt-3 text-sm text-amber-400">
          متصفحك لا يدعم التعرف الصوتي المدمج — استخدم Chrome أو Edge، أو اكتب الأمر في صندوق النص أعلاه.
        </p>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={listening ? () => recognitionRef.current?.stop() : startListening} className={`btn ${listening ? "btn-ghost" : "btn-primary"}`}>
            {listening ? "أستمع… (إيقاف)" : "🎤 تحدث إلى مايا"}
          </button>
          {listening && <span className="text-sm text-indigo-400">قل: «مايا، افتح كروم»</span>}
        </div>
      )}

      {transcript && (
        <p className="mt-3 text-sm text-neutral-300">
          سمعتُ: <span className="font-semibold">{transcript}</span>
        </p>
      )}
      {response && (
        <div className="mt-3 rounded-lg bg-neutral-900 px-3 py-2 text-sm leading-6">
          <p className="text-neutral-400">{STAGE_LABEL[response.stage]}</p>
          {response.reply && <p className="mt-1 text-neutral-100">{response.reply}</p>}
          {response.reason && <p className="mt-1 text-red-400">{response.reason}</p>}
          {response.intent && <p className="mt-1 text-xs text-neutral-500">النية: {response.intent}</p>}
          {deviceNote && <p className="mt-1 text-amber-400">{deviceNote}</p>}
        </div>
      )}
    </section>
  );
}
