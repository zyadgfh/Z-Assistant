/// Canonical intent names — identical to the Cloudflare worker and the shared
/// TypeScript core, so every tier routes the same utterances the same way.
class IntentNames {
  IntentNames._();

  static const openApplication = 'open_application';
  static const openUrl = 'open_url';
  static const searchGoogle = 'search_google';
  static const searchYoutube = 'search_youtube';
  static const takeScreenshot = 'take_screenshot';
  static const volumeUp = 'volume_up';
  static const volumeDown = 'volume_down';
  static const openFolder = 'open_folder';
  static const playLocalMusic = 'play_local_music';
  static const closeApplication = 'close_application';
  static const sendMessage = 'send_message';
  static const deleteFile = 'delete_file';
  static const changeSetting = 'change_setting';
  static const openPrivateFile = 'open_private_file';
}

enum CommandRisk { safe, sensitive, critical }

CommandRisk riskFromName(String name) {
  switch (name) {
    case 'safe':
      return CommandRisk.safe;
    case 'sensitive':
      return CommandRisk.sensitive;
    case 'critical':
      return CommandRisk.critical;
    default:
      return CommandRisk.safe;
  }
}

String riskToName(CommandRisk risk) {
  switch (risk) {
    case CommandRisk.safe:
      return 'safe';
    case CommandRisk.sensitive:
      return 'sensitive';
    case CommandRisk.critical:
      return 'critical';
  }
}

/// One parsed utterance. Spoken text is carried as `raw` for diagnostics only
/// and is never executed as a shell command.
class CommandIntent {
  const CommandIntent({
    required this.name,
    required this.arguments,
    required this.risk,
    required this.raw,
    required this.locale,
  });

  final String name;
  final Map<String, String> arguments;
  final CommandRisk risk;
  final String raw;
  final String locale;
}
