import '../models/command_intent.dart';

/// Confirmation flow for sensitive commands (plan §الأوامر): Maya announces
/// exactly what will happen and waits for a spoken or pressed confirmation.
class ConfirmationService {
  CommandIntent? _pending;

  bool get hasPending => _pending != null;

  String promptFor(CommandIntent intent) {
    switch (intent.name) {
      case 'send_message':
        return 'سأرسل الرسالة إلى ${intent.arguments['recipient'] ?? ''}: '
            '«${intent.arguments['message'] ?? ''}». هل تؤكد؟';
      case 'delete_file':
        return 'سأنقل الملف إلى سلة المهملات: ${intent.arguments['path'] ?? ''}. هل تؤكد؟';
      case 'close_application':
        return 'سأغلق التطبيق ${intent.arguments['application'] ?? ''}. هل تؤكد؟';
      default:
        return 'الأمر يحتاج تأكيدك: هل توافق على التنفيذ؟';
    }
  }

  void request(CommandIntent intent) => _pending = intent;

  /// Returns the pending intent when [utterance] is a clear confirmation,
  /// otherwise cancels and returns null.
  CommandIntent? consume(String utterance) {
    final pending = _pending;
    _pending = null;
    if (pending == null) return null;

    final normalized = utterance.trim().toLowerCase();
    const confirmWords = ['تاكيد', 'اكيد', 'اتاكد', 'نعم', 'ايوه', 'ايوة', 'موافق', 'confirm', 'yes'];
    const cancelWords = ['الغاء', 'إلغاء', 'لا', 'مانع', 'cancel', 'no'];
    if (cancelWords.any(normalized.contains)) return null;
    if (confirmWords.any(normalized.contains)) return pending;
    return null;
  }

  void cancel() => _pending = null;
}
