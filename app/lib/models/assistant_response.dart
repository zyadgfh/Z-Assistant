import 'command_intent.dart';

/// Structured response from the worker. Only whitelisted intents with validated
/// arguments ever arrive here — the app never receives shell strings or paths
/// from the model.
class AssistantResponse {
  const AssistantResponse({
    required this.replyText,
    required this.replyLanguage,
    required this.intent,
    required this.arguments,
    required this.risk,
    required this.requiresConfirmation,
    required this.requestId,
  });

  final String replyText;
  final String replyLanguage;
  /// Null when the worker answered a question without a device action.
  final String? intent;
  final Map<String, String> arguments;
  final CommandRisk risk;
  final bool requiresConfirmation;
  final String requestId;

  factory AssistantResponse.fromJson(Map<String, dynamic> json) {
    final argsRaw = (json['arguments'] as Map<String, dynamic>?) ?? const {};
    return AssistantResponse(
      replyText: (json['replyText'] as String?) ?? '',
      replyLanguage: (json['replyLanguage'] as String?) ?? 'ar-EG',
      intent: json['intent'] as String?,
      arguments: argsRaw.map((key, value) => MapEntry(key, value.toString())),
      risk: riskFromName((json['risk'] as String?) ?? 'safe'),
      requiresConfirmation: (json['requiresConfirmation'] as bool?) ?? false,
      requestId: (json['requestId'] as String?) ?? '',
    );
  }
}
