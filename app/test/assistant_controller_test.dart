import 'package:flutter_test/flutter_test.dart';
import 'package:maya_assistant/models/assistant_request.dart';
import 'package:maya_assistant/models/assistant_response.dart';
import 'package:maya_assistant/models/command_intent.dart';
import 'package:maya_assistant/services/ai_service.dart';
import 'package:maya_assistant/services/confirmation_service.dart';
import 'package:maya_assistant/services/connectivity_service.dart';
import 'package:maya_assistant/services/offline_command_service.dart';
import 'package:maya_assistant/services/platform_service.dart';
import 'package:maya_assistant/services/speech_service.dart';
import 'package:maya_assistant/services/tts_service.dart';
import 'package:maya_assistant/state/assistant_controller.dart';

class RecordingTts implements TtsService {
  final List<String> spoken = [];

  @override
  Future<void> configure({required double rate, required double pitch}) async {}

  @override
  Future<void> speak(String text, String language) async => spoken.add(text);

  @override
  Future<void> stop() async {}
}

class RecordingPlatform implements PlatformExecutor {
  final List<String> executed = [];

  @override
  Future<ExecutionResult> execute(CommandIntent intent) async {
    executed.add(intent.name);
    return ExecutionResult(true, 'نُفّذ ${intent.name}.');
  }

  @override
  Future<void> clearSessionTempFiles() async {}
}

class StubAi implements AiClient {
  final List<String> asked = [];
  AssistantResponse? next;

  @override
  Future<AssistantResponse> ask(AssistantRequest request) async {
    asked.add(request.text);
    return next!;
  }
}

void main() {
  late RecordingTts tts;
  late RecordingPlatform platform;
  late StubAi ai;
  late FakeConnectivityService connectivity;
  late AssistantController controller;

  setUp(() {
    tts = RecordingTts();
    platform = RecordingPlatform();
    ai = StubAi();
    connectivity = FakeConnectivityService(true);
    controller = AssistantController(
      speech: UnsupportedSpeechService(),
      tts: tts,
      offline: const OfflineCommandService(),
      ai: ai,
      platform: platform,
      connectivity: connectivity,
      confirmationService: ConfirmationService(),
      deviceId: () => 'test-device',
    );
  });

  test('executes safe offline intents without calling the AI', () async {
    await controller.handleUtterance('افتحلي كروم');
    expect(platform.executed, ['open_application']);
    expect(ai.asked, isEmpty);
    expect(tts.spoken.join(' '), contains('نُفّذ'));
    expect(controller.lastTranscript, 'افتحلي كروم');
  });

  test('does NOT send unknown requests when offline', () async {
    connectivity.online = false;
    await controller.handleUtterance('ما عاصمة اليابان؟');
    expect(ai.asked, isEmpty, reason: 'لا يُرسل أي طلب بدون إنترنت');
    expect(tts.spoken.join(' '), contains('إنترنت'));
  });

  test('sends unknown requests to the AI when online and speaks the reply', () async {
    ai.next = const AssistantResponse(
      replyText: 'عاصمة اليابان طوكيو.',
      replyLanguage: 'ar-EG',
      intent: null,
      arguments: {},
      risk: CommandRisk.safe,
      requiresConfirmation: false,
      requestId: 'r1',
    );
    await controller.handleUtterance('ما عاصمة اليابان؟');
    expect(ai.asked, ['ما عاصمة اليابان؟']);
    expect(tts.spoken.join(' '), contains('طوكيو'));
  });

  test('AI can return a device intent which the controller routes', () async {
    ai.next = const AssistantResponse(
      replyText: 'حاضر، هفتح Google Chrome',
      replyLanguage: 'ar-EG',
      intent: 'open_application',
      arguments: {'application': 'Google Chrome'},
      risk: CommandRisk.safe,
      requiresConfirmation: false,
      requestId: 'r2',
    );
    await controller.handleUtterance('شغّل المتصفح الأفضل');
    expect(platform.executed, ['open_application']);
    expect(ai.asked, hasLength(1));
  });

  test('sensitive commands wait for confirmation before executing', () async {
    await controller.handleUtterance('اقفل التطبيق كروم');
    expect(platform.executed, isEmpty, reason: 'لا تنفيذ قبل التأكيد');
    expect(tts.spoken.join(' '), contains('تؤكد'));

    await controller.handleUtterance('تاكيد');
    expect(platform.executed, ['close_application']);
  });

  test('cancel word aborts the pending confirmation', () async {
    await controller.handleUtterance('اقفل التطبيق كروم');
    await controller.handleUtterance('لا');
    expect(platform.executed, isEmpty);
    expect(tts.spoken.join(' '), contains('إلغاء'));
  });

  test('deleteLocalHistory clears transcript, reply, and temp files', () async {
    await controller.handleUtterance('افتحلي كروم');
    await controller.deleteLocalHistory();
    expect(controller.lastTranscript, isEmpty);
    expect(controller.lastReply, isEmpty);
  });
}
