-- maya_diagnostics_view: safe diagnostics without transcripts or results.
-- Tenant admins see status/latency only; raw audio and voiceprint templates
-- never reach the database (plan sections 9 and 14).

create view public.maya_voice_command_diagnostics
with (security_barrier = true)
as
select vc.id, vc.user_id, vc.tenant_id, vc.device_id, vc.channel, vc.intent,
       vc.risk, vc.status, vc.latency_ms, vc.error, vc.created_at,
       (vc.transcript is not null) as has_transcript
from public.voice_commands vc
where vc.user_id = auth.uid()
   or (vc.tenant_id is not null and public.maya_is_tenant_admin(vc.tenant_id));

grant select on public.maya_voice_command_diagnostics to authenticated;
revoke all on public.maya_voice_command_diagnostics from anon;
