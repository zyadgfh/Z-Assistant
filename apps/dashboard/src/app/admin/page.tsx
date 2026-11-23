"use client";

import { useCallback, useEffect, useState } from "react";

import { SignInCard, useSession } from "@/components/auth";
import { getSupabase } from "@/lib/supabase";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface Member {
  id: string;
  tenant_id: string;
  role: string;
}

interface AuditRow {
  id: number;
  action: string;
  actor_id: string | null;
  created_at: string;
}

interface Diagnostic {
  id: string;
  intent: string | null;
  status: string;
  risk: string;
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "مالك",
  tenant_admin: "مسؤول",
  support: "دعم",
  auditor: "مدقق",
  member: "عضو",
  guest: "زائر محدود",
};

export default function AdminPage() {
  const { session, email, setEmail, status, message, signIn, signOut } = useSession();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [activeTenant, setActiveTenant] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const [tenantsResult, diagnosticsResult] = await Promise.all([
      supabase.from("tenants").select("id, name, slug, created_at").order("created_at", { ascending: false }),
      supabase
        .from("maya_voice_command_diagnostics")
        .select("id, intent, status, risk, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);
    const tenantRows = (tenantsResult.data as Tenant[]) ?? [];
    setTenants(tenantRows);
    setDiagnostics((diagnosticsResult.data as Diagnostic[]) ?? []);
    setActiveTenant((current) => current ?? tenantRows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !activeTenant) {
      setMembers([]);
      setAudit([]);
      return;
    }
    void (async () => {
      const [membersResult, auditResult] = await Promise.all([
        supabase.from("tenant_members").select("id, tenant_id, role").eq("tenant_id", activeTenant),
        supabase
          .from("audit_logs")
          .select("id, action, actor_id, created_at")
          .eq("tenant_id", activeTenant)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setMembers((membersResult.data as Member[]) ?? []);
      setAudit((auditResult.data as AuditRow[]) ?? []);
    })();
  }, [activeTenant]);

  if (!session) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="mb-8 text-center text-2xl font-bold">لوحة الإدارة — المؤسسات</h1>
        <SignInCard email={email} setEmail={setEmail} status={status} message={message} onSubmit={signIn} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة الإدارة</h1>
        <button onClick={signOut} className="btn btn-ghost text-sm">
          خروج
        </button>
      </header>

      <section className="card mt-8">
        <h2 className="font-bold">المؤسسات التي تنتمي إليها ({tenants.length})</h2>
        {tenants.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            لا توجد مؤسسات. يمكن إنشاء مؤسسة عبر عمليات الخادم — وسيصبح منشئها «مالكًا» تلقائيًا.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {tenants.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setActiveTenant(t.id)}
                  className={`btn text-sm ${activeTenant === t.id ? "btn-primary" : "btn-ghost"}`}
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeTenant && (
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="font-bold">الأعضاء والأدوار ({members.length})</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2">
                  <span dir="ltr" className="text-xs text-neutral-300">
                    {m.id.slice(0, 8)}…
                  </span>
                  <span>{ROLE_LABEL[m.role] ?? m.role}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2 className="font-bold">سجل التدقيق (آخر 10)</h2>
            <ul className="mt-3 space-y-2 text-xs">
              {audit.length === 0 ? (
                <li className="text-neutral-400">لا سجلات بعد.</li>
              ) : (
                audit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2">
                    <span dir="ltr">{a.action}</span>
                    <span className="text-neutral-400">{new Date(a.created_at).toLocaleString("ar-EG")}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      )}

      <section className="card mt-6">
        <h2 className="font-bold">تشخيص الأوامر (دون النصوص الخاصة)</h2>
        <p className="mt-1 text-xs text-neutral-500">
          العرض يستثني نص الأمر ونتيجته — الإداري يرى الحالة والزمن فقط، ولا يرى الصوت الخام أو قوالب البصمة أبدًا.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="px-3 py-2">النية</th>
                <th className="px-3 py-2">الحالة</th>
                <th className="px-3 py-2">الخطورة</th>
                <th className="px-3 py-2">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-neutral-400">
                    لا بيانات تشخيصية بعد.
                  </td>
                </tr>
              ) : (
                diagnostics.map((d) => (
                  <tr key={d.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2 font-medium">{d.intent ?? "—"}</td>
                    <td className="px-3 py-2">{d.status}</td>
                    <td className="px-3 py-2">{d.risk}</td>
                    <td className="px-3 py-2 text-neutral-400">{new Date(d.created_at).toLocaleString("ar-EG")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
