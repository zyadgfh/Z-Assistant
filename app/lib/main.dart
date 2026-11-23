import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'state/assistant_controller.dart';
import 'services/ai_service.dart';
import 'services/connectivity_service.dart';
import 'services/confirmation_service.dart';
import 'services/offline_command_service.dart';
import 'services/platform_service.dart';
import 'services/speech_service.dart';
import 'services/tts_service.dart';

/// Mutable holder so a backend-URL change in settings applies immediately
/// (the URL is a public endpoint, not a secret).
class BackendUrlHolder {
  BackendUrlHolder(this.url);
  String url;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = SharedPreferencesAsync();
  await runAppMaya(prefs);
}

Future<void> runAppMaya(SharedPreferencesAsync prefs) async {
  final storedUrl = await prefs.getString(AppConfig.prefBackendUrl);
  final backend = BackendUrlHolder(storedUrl ?? AppConfig.defaultBackendUrl);

  final controller = AssistantController(
    speech: speechServiceForPlatform(),
    tts: ttsServiceForPlatform(),
    offline: const OfflineCommandService(),
    ai: AiService(backendUrl: () => backend.url),
    platform: PlatformService(),
    connectivity: PluginConnectivityService(),
    confirmation: ConfirmationService(),
    deviceId: () => 'flutter-${DateTime.now().millisecondsSinceEpoch}',
  );

  // Android availability is confirmed lazily on first listen; desktop bridges
  // are future work and are reported honestly in the UI.
  controller.markSpeechSupport(controller.speech is! UnsupportedSpeechService);
  controller.setOnline(await PluginConnectivityService().isOnline());

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AssistantController>.value(value: controller),
        Provider<SharedPreferencesAsync>.value(value: prefs),
        Provider<BackendUrlHolder>.value(value: backend),
      ],
      child: MayaApp(prefs: prefs),
    ),
  );
}
