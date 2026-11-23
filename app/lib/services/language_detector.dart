/// Language detection for Arabic (MSA), Egyptian dialect, English, and mixed
/// speech. Reply language mirrors the user's variety (Egyptian in → Egyptian
/// out) with a manual override handled by settings.
enum MayaLocale {
  arabicMsa('ar'),
  egyptian('ar-EG'),
  english('en');

  const MayaLocale(this.code);
  final String code;
}

class LanguageDetection {
  const LanguageDetection(this.locale, this.replyLanguage);
  final MayaLocale locale;
  final String replyLanguage;
}

class LanguageDetector {
  const LanguageDetector();

  /// Dialect markers common in Egyptian speech (normalized forms).
  static const List<String> _egyptianMarkers = [
    'افتحلي', 'شغلي', 'هاتلي', 'اقفللي', 'ابعتلي', 'ابعت', 'عايز', 'عاوز',
    'عيز', 'ازيك', 'ايه', 'فين', 'كده', 'ده', 'دي', 'مش', 'خلاص', 'بص',
    'كمان', 'دلوقتي', 'ازاي',
  ];

  static bool _hasArabicLetters(String text) =>
      RegExp(r'[\u0600-\u06FF]').hasMatch(text);

  static bool _hasLatinLetters(String text) =>
      RegExp(r'[A-Za-z]').hasMatch(text);

  LanguageDetection detect(String text) {
    final hasArabic = _hasArabicLetters(text);
    final hasLatin = _hasLatinLetters(text);

    if (!hasArabic && !hasLatin) {
      // Empty or non-letter input: default to the Egyptian reply variety.
      return const LanguageDetection(MayaLocale.egyptian, 'ar-EG');
    }
    if (hasArabic) {
      final normalized = _normalize(text);
      final isEgyptian =
          _egyptianMarkers.any((marker) => normalized.contains(marker));
      return LanguageDetection(
        isEgyptian ? MayaLocale.egyptian : MayaLocale.arabicMsa,
        isEgyptian ? 'ar-EG' : 'ar',
      );
    }
    return const LanguageDetection(MayaLocale.english, 'en');
  }

  /// Light normalization shared with the offline parser.
  static String _normalize(String text) {
    return text
        .replaceAll(RegExp(r'[\u064B-\u0652\u0670]'), '')
        .replaceAll(RegExp('[\u0623\u0625\u0622]'), '\u0627')
        .toLowerCase();
  }
}
