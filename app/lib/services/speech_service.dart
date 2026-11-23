import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// On-device speech recognition. Raw audio never leaves the device: the OS
/// engine converts speech to text locally (Android), and no recording files
/// are produced or stored by this layer.
abstract class SpeechService {
  bool get isAvailable;
  Future<void> start({
    required void Function(String text) onFinal,
    required void Function(String message) onError,
    String? localeId,
  });
  Future<void> stop();
}

class SpeechUnavailableException implements Exception {
  SpeechUnavailableException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Android implementation over the official speech_to_text plugin.
class AndroidSpeechService implements SpeechService {
  AndroidSpeechService();

  final SpeechToText _stt = SpeechToText();
  bool _initialized = false;
  Timer? _timeoutTimer;

  @override
  bool get isAvailable => _initialized && _stt.isAvailable;

  Future<bool> _ensureInitialized() async {
    if (_initialized) return _stt.isAvailable;
    _initialized = await _stt.initialize();
    return _initialized;
  }

  @override
  Future<void> start({
    required void Function(String text) onFinal,
    required void Function(String message) onError,
    String? localeId,
  }) async {
    final available = await _ensureInitialized();
    if (!available) {
      throw SpeechUnavailableException(
        'التعرف الصوتي غير متاح على هذا الجهاز؛ تحقق من صلاحية الميكروفون.',
      );
    }
    _timeoutTimer?.cancel();
    // Hard ceiling on capture so data/battery are never drained (plan §الصوت).
    _timeoutTimer = Timer(const Duration(seconds: 12), () => stop());

    await _stt.listen(
      localeId: localeId,
      listenOptions: SpeechListenOptions(partialResults: false),
      onResult: (result) {
        if (result.finalResult && result.recognizedWords.trim().isNotEmpty) {
          onFinal(result.recognizedWords.trim());
        }
      },
    );
  }

  @override
  Future<void> stop() async {
    _timeoutTimer?.cancel();
    if (_initialized) await _stt.stop();
  }
}

/// Desktop fallback until a native Windows/Linux bridge ships: states the gap
/// honestly instead of pretending recognition exists.
class UnsupportedSpeechService implements SpeechService {
  @override
  bool get isAvailable => false;

  @override
  Future<void> start({
    required void Function(String text) onFinal,
    required void Function(String message) onError,
    String? localeId,
  }) async {
    throw SpeechUnavailableException(
      'التعرف الصوتي المحلي غير مفعّل على هذا النظام بعد؛ استخدم زر الأوامر النصية أو أندرويد.',
    );
  }

  @override
  Future<void> stop() async {}
}

SpeechService speechServiceForPlatform() {
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      return AndroidSpeechService();
    default:
      // Windows/iOS/macOS/linux native bridges are future work (documented).
      return UnsupportedSpeechService();
  }
}
