import 'package:flutter/material.dart';

/// Visible confirmation for sensitive commands (plan §الأوامر تحتاج تأكيدًا).
class ConfirmationDialog extends StatelessWidget {
  const ConfirmationDialog({
    super.key,
    required this.prompt,
    required this.onConfirm,
    required this.onCancel,
  });

  final String prompt;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('تأكيد الأمر'),
      content: Text(prompt),
      actions: [
        TextButton(
          key: const Key('confirmation_cancel'),
          onPressed: onCancel,
          child: const Text('إلغاء'),
        ),
        FilledButton(
          key: const Key('confirmation_confirm'),
          onPressed: onConfirm,
          child: const Text('تأكيد'),
        ),
      ],
    );
  }
}
