"use client";

import { useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase";

/**
 * Client-side auth gate. Sign-in uses a magic link; access to every row is
 * enforced again by Supabase RLS, so the UI layer is convenience only.
 */
export function useSession() {
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession((data.session as unknown as Record<string, unknown>) ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession((newSession as unknown as Record<string, unknown>) ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !email) return;
    setStatus("loading");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/console` },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("أرسلنا رابط دخول إلى بريدك. افتحه لتسجيل الدخول.");
  }

  async function signOut() {
    const supabase = getSupabase();
    await supabase?.auth.signOut();
    setSession(null);
  }

  return { session, email, setEmail, status, message, signIn, signOut };
}

export function SignInCard({
  email,
  setEmail,
  status,
  message,
  onSubmit,
}: {
  email: string;
  setEmail: (value: string) => void;
  status: "idle" | "loading" | "sent" | "error";
  message: string;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="card mx-auto max-w-md">
      <h2 className="text-lg font-bold">تسجيل الدخول</h2>
      <p className="mt-2 text-sm text-neutral-400">
        أدخل بريدك الإلكتروني وسنرسل لك رابط دخول سحري — لا كلمات مرور هنا.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <input
          type="email"
          required
          dir="ltr"
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={status === "loading"}>
          {status === "loading" ? "جارٍ الإرسال..." : "أرسل رابط الدخول"}
        </button>
      </form>
      {message && (
        <p className={`mt-3 text-sm ${status === "error" ? "text-red-400" : "text-emerald-400"}`}>{message}</p>
      )}
    </div>
  );
}
