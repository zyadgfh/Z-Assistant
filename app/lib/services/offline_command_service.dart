import '../models/command_intent.dart';

/// Deterministic offline command parser — the local mirror of the worker's
/// intents.ts and packages/core. Unknown utterances return null (the caller
/// decides between the AI service when online, or an offline notice).
class OfflineCommandService {
  const OfflineCommandService();

  static const Map<String, String> _appAliases = {
    'كروم': 'Google Chrome',
    'جوجل كروم': 'Google Chrome',
    'chrome': 'Google Chrome',
    'واتساب': 'WhatsApp',
    'الواتساب': 'WhatsApp',
    'whatsapp': 'WhatsApp',
    'فيجوال ستوديو كود': 'VS Code',
    'في اس كود': 'VS Code',
    'vs code': 'VS Code',
    'vscode': 'VS Code',
    'تليجرام': 'Telegram',
    'telegram': 'Telegram',
  };

  static const Map<String, String> _siteAliases = {
    'يوتيوب': 'https://www.youtube.com',
    'youtube': 'https://www.youtube.com',
    'جوجل': 'https://www.google.com',
    'google': 'https://www.google.com',
    'جيميل': 'https://mail.google.com',
    'gmail': 'https://mail.google.com',
    'واتساب ويب': 'https://web.whatsapp.com',
    'whatsapp web': 'https://web.whatsapp.com',
  };

  static const Map<String, String> _folderAliases = {
    'التنزيلات': 'downloads',
    'التحميلات': 'downloads',
    'downloads': 'downloads',
    'سطح المكتب': 'desktop',
    'desktop': 'desktop',
    'المستندات': 'documents',
    'documents': 'documents',
  };

  static String _normalize(String text) {
    return text
        .replaceAll(RegExp(r'[\u064B-\u0652\u0670]'), '')
        .replaceAll(RegExp('[\u0623\u0625\u0622]'), '\u0627')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .toLowerCase();
  }

  static String? _resolveAlias(String text, Map<String, String> aliases) {
    final cleaned = text.replaceFirst(RegExp(r'^(?:تطبيق|برنامج|الموقع|موقع|مجلد)\s+'), '').trim();
    if (aliases[cleaned] != null) return aliases[cleaned];
    for (final entry in aliases.entries) {
      if (cleaned.contains(entry.key)) return entry.value;
    }
    return null;
  }

  static String _cleanSongName(String raw) {
    var song = raw
        .replaceFirst(
            RegExp(r'^(?:الاغنيه|الاغنية|اغنيه|اغنية|ملف الموسيقى|ملف الموسيقي|الموسيقى|الموسيقي)\s+'), '')
        .trim();
    song = song.replaceFirst(RegExp(r'\s+(?:دي|ده|المحلية|المحلي)$'), '').trim();
    const fillers = {'دي', 'ده', 'المحلي', 'المحلية'};
    if (fillers.contains(song)) return '';
    return song;
  }

  /// Parses a raw utterance; returns null for anything not on the safe/sensitive
  /// local list.
  CommandIntent? parse(String rawText, {String locale = 'ar-EG'}) {
    final text = _normalize(rawText);

    final screenshot =
        text.contains(RegExp(r'لقطة شاشة|صورة للشاشة|التقط|خذ screenshot|screenshot'));
    if (screenshot) return _intent('take_screenshot', {}, rawText, locale);

    if (text.contains(RegExp(r'ارفع\s*(?:الصوت)?|زود الصوت|volume up'))) {
      return _intent('volume_up', {}, rawText, locale);
    }
    if (text.contains(RegExp(r'(?:اخفض|قلل|نزل)\s*(?:الصوت)?|volume down'))) {
      return _intent('volume_down', {}, rawText, locale);
    }

    final google = text.firstMatchOrNull(
        RegExp(r'(?:هاتلي البحث عن|هاتلي بحث عن|ابحث في جوجل عن|ابحث عن|دور عن|search google for)\s+(.+)'));
    if (google != null) {
      return _intent('search_google', {'query': google.trim()}, rawText, locale);
    }

    final youtube =
        text.firstMatchOrNull(RegExp(r'(?:ابحث في يوتيوب عن|search youtube for)\s+(.+)'));
    if (youtube != null) {
      return _intent('search_youtube', {'query': youtube.trim()}, rawText, locale);
    }

    final localMusic = text
        .contains(RegExp(r'(?:شغللي|شغلي|شغل)\s*(?:ملف)?\s*(?:الموسيقى|الموسيقي)\s*(?:المحلية|المحلي)?|play local music'));
    if (localMusic) return _intent('play_local_music', {}, rawText, locale);

    final play = text.firstMatchOrNull(RegExp(r'^(?:شغللي|شغلي|شغل)\s+(.+)'));
    if (play != null) {
      final song = _cleanSongName(play.trim());
      if (song.isNotEmpty) {
        return _intent('search_youtube', {'query': song}, rawText, locale);
      }
    }

    final folder = text.firstMatchOrNull(RegExp(r'افتح(?:لي)?\s*(?:مجلد)?\s*(.+)'));
    if (folder != null) {
      final resolved = _resolveAlias(folder.trim(), _folderAliases);
      if (resolved != null) {
        return _intent('open_folder', {'folder': resolved}, rawText, locale);
      }
    }

    final close = text.firstMatchOrNull(RegExp(r'^(?:اقفللي|اقفل|سكر|اغلق)\s+(?:تطبيق\s+)?(.+)$'));
    if (close != null) {
      final application = _resolveAlias(close.trim(), _appAliases) ?? close.trim();
      return _intent('close_application', {'application': application}, rawText, locale);
    }

    final deleteFile = text.firstMatchOrNull(RegExp(r'(?:احذف|امسح)\s+(?:الملف|ملف)\s+(.+)'));
    if (deleteFile != null) {
      return _intent('delete_file', {'path': deleteFile.trim()}, rawText, locale);
    }

    final sendMatch =
        RegExp(r'^(?:ابعتلي|ابعت|ارسل)\s+(?:رسالة|رساله)?\s*(?:لـ|لى|ل|الى)?\s*(.+?)\s*(?:قول|بان)\s+(.+)$')
            .firstMatch(text);
    if (sendMatch != null) {
      return _intent('send_message', {
        'recipient': sendMatch.group(1)?.trim() ?? '',
        'message': sendMatch.group(2)?.trim() ?? '',
      }, rawText, locale);
    }

    final open = text.firstMatchOrNull(RegExp(r'^(?:افتحلي|افتح|فتح|open)\s+(.+)$'));
    if (open != null) {
      final target = open.trim();
      final site = _resolveAlias(target, _siteAliases);
      if (site != null) return _intent('open_url', {'site': site}, rawText, locale);
      final application = _resolveAlias(target, _appAliases);
      if (application != null) {
        return _intent('open_application', {'application': application}, rawText, locale);
      }
    }

    return null;
  }

  static CommandIntent _intent(String name, Map<String, String> args, String raw, String locale) {
    final risk = (name == 'close_application' || name == 'delete_file' ||
            name == 'send_message' || name == 'change_setting' ||
            name == 'open_private_file')
        ? CommandRisk.sensitive
        : CommandRisk.safe;
    return CommandIntent(name: name, arguments: args, risk: risk, raw: raw, locale: locale);
  }
}

extension _FirstMatchOrNull on String {
  String? firstMatchOrNull(RegExp pattern) {
    final match = pattern.firstMatch(this);
    if (match == null) return null;
    return match.group(match.groupCount >= 1 ? match.groupCount : 0);
  }
}
