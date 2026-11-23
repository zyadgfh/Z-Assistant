import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/assistant_controller.dart';

/// Clear Arabic privacy policy (plan §البيانات والخصوصية).
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AssistantController>();
    return Scaffold(
      appBar: AppBar(title: const Text('سياسة الخصوصية')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          Text(
            'كيف تتعامل مايا مع بياناتك؟',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 12),
          Text(
            '• التعرف على كلامك يتم داخل جهازك، ولا يُرفع أي صوت خام إلى أي خادم.\n'
            '• عند الحاجة للذكاء الاصطناعي، يُرسل النص فقط (بعد تحويل الكلام لكلام مكتوب داخل جهازك) '
            'إلى خادم Cloudflare الوسيط، ثم إلى خدمة Gemini — وهي خدمة خارجية تحتاج إنترنت.\n'
            '• مفتاح Gemini محفوظ على الخادم فقط ولا يوجد داخل التطبيق.\n'
            '• الأوامر غير المعروفة تُجاب نصيًا فقط ولا تُنفَّذ كأوامر نظام.\n'
            '• لا نستخدم صوتك كهوية أو بصمة في هذا الإصدار.\n'
            '• لقطات الشاشة تُحفظ مؤقتًا في ملفات مؤقتة تُحذف عند حذف السجل.\n'
            '• الخدمة الذكية لها حد استخدام يومي، ويظهر عند بلوغه.\n'
            '• يمكنك حذف السجل المحلي وكل الملفات المؤقتة في أي لحظة بالزر أدناه.',
          ),
        ],
      ),
      persistentFooterButtons: [
        FilledButton.tonalIcon(
          onPressed: () async {
            await controller.deleteLocalHistory();
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('حُذف السجل المحلي والملفات المؤقتة.')),
              );
            }
          },
          icon: const Icon(Icons.delete_outline),
          label: const Text('حذف السجل المحلي'),
        ),
      ],
    );
  }
}
