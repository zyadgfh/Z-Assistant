import 'package:flutter_test/flutter_test.dart';
import 'package:maya_assistant/models/command_intent.dart';
import 'package:maya_assistant/services/offline_command_service.dart';

void main() {
  const parser = OfflineCommandService();

  group('Egyptian phrases from the spec', () {
    test('«افتحلي كروم» opens the canonical app', () {
      final intent = parser.parse('افتحلي كروم')!;
      expect(intent.name, 'open_application');
      expect(intent.arguments['application'], 'Google Chrome');
      expect(intent.risk, CommandRisk.safe);
    });

    test('«افتح يوتيوب» opens the site, not an app process', () {
      final intent = parser.parse('افتح يوتيوب')!;
      expect(intent.name, 'open_url');
      expect(intent.arguments['site'], 'https://www.youtube.com');
    });

    test('«هاتلي بحث عن python» is a Google search', () {
      final intent = parser.parse('هاتلي بحث عن python')!;
      expect(intent.name, 'search_google');
      expect(intent.arguments['query'], 'python');
    });

    test('«شغلّي أغنية Believer» searches YouTube without leaking «أغنية»', () {
      final intent = parser.parse('شغلّي أغنية Believer')!;
      expect(intent.name, 'search_youtube');
      expect(intent.arguments['query'], 'believer');
    });

    test('«شغل ملف الموسيقى المحلي» targets the local music intent', () {
      expect(parser.parse('شغل ملف الموسيقى المحلي')!.name, 'play_local_music');
    });

    test('«اقفل التطبيق كروم» is sensitive', () {
      final intent = parser.parse('اقفل التطبيق كروم')!;
      expect(intent.name, 'close_application');
      expect(intent.risk, CommandRisk.sensitive);
    });

    test('screenshot and volume commands parse', () {
      expect(parser.parse('التقط صورة للشاشة')!.name, 'take_screenshot');
      expect(parser.parse('ارفع الصوت')!.name, 'volume_up');
      expect(parser.parse('اخفض الصوت')!.name, 'volume_down');
    });

    test('«افتح مجلد التنزيلات» resolves the known folder', () {
      final intent = parser.parse('افتح مجلد التنزيلات')!;
      expect(intent.name, 'open_folder');
      expect(intent.arguments['folder'], 'downloads');
    });
  });

  group('unknown utterances', () {
    test('return null so the caller can use the AI service or offline notice', () {
      expect(parser.parse('ما عاصمة اليابان؟'), isNull);
      expect(parser.parse('اكتب لي قصيدة'), isNull);
      expect(parser.parse(''), isNull);
    });
  });

  group('English commands', () {
    test('parse the same canonical intents', () {
      expect(parser.parse('open chrome')!.arguments['application'], 'Google Chrome');
      expect(parser.parse('search google for C++ & Python')!.name, 'search_google');
    });
  });
}
