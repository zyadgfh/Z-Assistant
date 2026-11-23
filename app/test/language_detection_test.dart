import 'package:flutter_test/flutter_test.dart';
import 'package:maya_assistant/services/language_detector.dart';

void main() {
  const detector = LanguageDetector();

  test('detects Egyptian dialect markers', () {
    final result = detector.detect('افتحلي كروم دلوقتي');
    expect(result.locale, MayaLocale.egyptian);
    expect(result.replyLanguage, 'ar-EG');
  });

  test('detects Modern Standard Arabic', () {
    final result = detector.detect('افتح تطبيق المتصفح من فضلك');
    expect(result.locale, MayaLocale.arabicMsa);
    expect(result.replyLanguage, 'ar');
  });

  test('detects English', () {
    final result = detector.detect('open Chrome please');
    expect(result.locale, MayaLocale.english);
    expect(result.replyLanguage, 'en');
  });

  test('mixed Arabic/English resolves to Arabic (Arabic letters dominate)', () {
    final result = detector.detect('ابحث في جوجل عن flutter tutorial');
    expect(result.locale, MayaLocale.egyptian, reason: '«ابحث» ليس مصريًا لكن العربية هي الأساس');
    expect(result.replyLanguage, startsWith('ar'));
  });

  test('empty text falls back to Arabic defaults', () {
    final result = detector.detect('');
    expect(result.replyLanguage, 'ar-EG');
  });
}
