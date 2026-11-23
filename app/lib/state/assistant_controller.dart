import 'package:flutter/foundation.dart';

import '../models/assistant_request.dart';
import '../models/assistant_response.dart';
import '../models/command_intent.dart';
import '../security/permission_policy.dart';
import '../services/ai_service.dart';
import '../services/confirmation_service.dart';
import '../services/connectivity_service.dart';
import '../services/language_detector.dart';
import '../services/offline_command_service.dart';
import '../services/platform_service.dart';
import '../services/speech_service.dart';
import '../services/tts_service.dart';

enum AssistantPhase { idle, listening, thinking, executing, speaking }

/// Wires speech → language → intents → permissions → execution → TTS.
/// Every decision is explicit and auditable; nothing reaches a shell.
class AssistantController extends ChangeNotifier {
  AssistantController({
    required this.speech,
    required this.tts,
    required this.offline,
    required this.ai,
    required this.platform,
    required this.connectivity,
    required this.confirmation,
    required String Function() deviceId,
  })  : _deviceId = deviceId {
    confirmationService = confirmation;
  }

  final SpeechService speech;
  final TtsService tts;
  final OfflineCommandService offline;
  final AiClient ai;
  final PlatformExecutor platform;
  final ConnectivityService connectivity;
  late final ConfirmationService confirmationService;
  final String Function() _deviceId;
  final PermissionPolicy _policy = const PermissionPolicy();
  final LanguageDetector _detector = const LanguageDetector();

  AssistantPhase phase = AssistantPhase.idle;
  bool online = true;
  bool speechSupported = false;
  String lastTranscript = '';
  String lastReply = '';
  String? errorMessage;

  void setOnline(bool value) {
    online = value;
    notifyListeners();
  }

  void markSpeechSupport(bool supported) {
    speechSupported = supported;
    notifyListeners();
  }

  void _setPhase(AssistantPhase value) {
    phase = value;
    notifyListeners();
  }

  Future<void> startListening() async {
    errorMessage = null;
    try {
      await speech.start(
        // Pick the STT locale from the last known utterance; default Egyptian Arabic.
        localeId: _detector.detect(lastTranscript).replyLanguage == 'en' ? 'en-US' : 'ar-EG',
        onFinal: handleUtterance,
        onError: (message) {
          errorMessage = message;
          _setPhase(AssistantPhase.idle);
        },
      );
      _setPhase(AssistantPhase.listening);
    } on SpeechUnavailableException catch (error) {
      errorMessage = error.message;
      markSpeechSupport(false);
      _setPhase(AssistantPhase.idle);
    }
  }

  Future<void> stopListening() async {
    await speech.stop();
    if (phase == AssistantPhase.listening) _setPhase(AssistantPhase.idle);
  }

  Future<void> stopSpeaking() async {
    await tts.stop();
    if (phase == AssistantPhase.speaking) _setPhase(AssistantPhase.idle);
  }

  /// Push-to-talk toggle used by the microphone button.
  Future<void> toggleMic() async {
    if (phase == AssistantPhase.listening) {
      await stopListening();
    } else {
      await startListening();
    }
  }

  /// Handles one utterance end-to-end. Also used by the manual command field.
  Future<void> handleUtterance(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    lastTranscript = trimmed;
    errorMessage = null;
    _setPhase(AssistantPhase.thinking);

    // 1) A pending confirmation swallows the next utterance.
    if (confirmationService.hasPending) {
      final confirmed = confirmationService.consume(trimmed);
      if (confirmed == null) {
        await _say('تم إلغاء الأمر.');
        return;
      }
      _setPhase(AssistantPhase.executing);
      final result = await platform.execute(confirmed);
      await _say(result.userMessage);
      return;
    }

    // 2) Deterministic local intent first (works fully offline).
    final detection = _detector.detect(trimmed);
    final intent = offline.parse(trimmed, locale: detection.replyLanguage);
    if (intent != null) {
      await _routeIntent(intent);
      return;
    }

    // 3) Unknown request → AI (requires internet; never attempted offline).
    online = await connectivity.isOnline();
    notifyListeners();
    if (!online) {
      await _say('المحادثة الذكية محتاجة إنترنت، بس الأوامر الأساسية شغالة عادي.');
      return;
    }
    _setPhase(AssistantPhase.thinking);
    try {
      final response = await ai.ask(AssistantRequest(
        text: trimmed,
        locale: detection.replyLanguage,
        deviceId: _deviceId(),
      ));
      if (response.intent != null) {
        final intent = CommandIntent(
          name: response.intent!,
          arguments: response.arguments,
          risk: response.risk,
          raw: trimmed,
          locale: response.replyLanguage,
        );
        await _routeIntent(intent, aiReply: response.replyText);
        return;
      }
      await _say(response.replyText, language: response.replyLanguage);
    } on AiServiceException catch (error) {
      await _say(error.message);
    }
  }

  Future<void> _routeIntent(CommandIntent intent, {String? aiReply}) async {
    final decision = _policy.evaluate(intent);
    if (!decision.execute) {
      await _say(decision.rejectionReason ?? 'الأمر مرفوض.');
      return;
    }
    if (decision.requiresConfirmation) {
      confirmationService.request(intent);
      await _say(aiReply ?? confirmationService.promptFor(intent));
      return;
    }
    _setPhase(AssistantPhase.executing);
    final result = await platform.execute(intent);
    await _say(result.userMessage);
  }

  /// Confirms a pending sensitive command from the dialog button.
  Future<void> confirmPending() async {
    final pending = confirmationService.consume('تاكيد');
    if (pending == null) return;
    _setPhase(AssistantPhase.executing);
    final result = await platform.execute(pending);
    await _say(result.userMessage);
  }

  Future<void> cancelPending() async {
    confirmationService.cancel();
    await _say('تم إلغاء الأمر.');
  }

  Future<void> _say(String message, {String? language}) async {
    lastReply = message;
    _setPhase(AssistantPhase.speaking);
    try {
      await tts.speak(message, language ?? _detector.detect(message).replyLanguage);
    } catch (_) {
      // TTS failure must not crash the loop; the message stays on screen.
    }
    _setPhase(AssistantPhase.idle);
  }

  Future<void> deleteLocalHistory() async {
    lastTranscript = '';
    lastReply = '';
    errorMessage = null;
    await platform.clearSessionTempFiles();
    notifyListeners();
  }

  @override
  void dispose() {
    speech.stop();
    tts.stop();
    super.dispose();
  }
}
