/// Application configuration — public values only.
///
/// There are NO API keys here or anywhere in the Flutter app: the Gemini key
/// lives in Cloudflare Secrets on the worker. The backend URL is a public
/// endpoint address the user configures, not a secret.
class AppConfig {
  AppConfig._();

  /// Placeholder worker URL — set your deployed worker URL in the settings
  /// screen or build with --dart-define=MAYA_BACKEND_URL=...
  static const String defaultBackendUrl =
      String.fromEnvironment(
        'MAYA_BACKEND_URL',
        defaultValue: 'https://maya-assistant-worker.<your-subdomain>.workers.dev',
      );

  static const Duration aiTimeout = Duration(seconds: 45);

  /// Push-to-talk recording ceiling (plan: 10–15 seconds max).
  static const int maxCaptureSeconds = 12;

  static const String prefBackendUrl = 'backend_url';
  static const String prefLanguage = 'reply_language';
  static const String prefTtsRate = 'tts_rate';
  static const String prefTtsPitch = 'tts_pitch';
  static const String prefAutostart = 'windows_autostart';
}
