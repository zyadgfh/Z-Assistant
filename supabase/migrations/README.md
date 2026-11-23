# supabase/migrations — مرآة المهاجرات المطبقة فعليًا على مشروع maya-assistant
#
# المطبق عبر لوحة/موصل Supabase على المشروع ljfydqtrbhjlijwdajpl بتاريخ 2026-11-23:
#   1. maya_core_schema      — الجداول والفهارس ومشغلات updated_at
#   2. maya_rls_policies     — دوال العزل، مشغلات التسجيل، و24 سياسة RLS
#   3. maya_diagnostics_view — عرض تشخيصي آمن دون النصوص الخاصة
#
# لإعادة الإنشاء على مشروع جديد:
#   supabase link --project-ref <REF>
#   supabase db push
#
# القواعد الثابتة (خطة التطوير §9):
#   - RLS مفعّل على كل جدول.
#   - لا مفاتيح سرية ولا قوالب بصمة ولا صوت خام في قاعدة البيانات.
