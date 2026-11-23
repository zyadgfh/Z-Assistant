import '../models/command_intent.dart';

/// Permission tiers (plan §3.1): safe executes, sensitive confirms, critical is
/// defined but intentionally disabled in v1 until hardware-backed auth ships.
class PolicyDecision {
  const PolicyDecision.execute()
      : execute = true,
        requiresConfirmation = false,
        rejectionReason = null;

  const PolicyDecision.confirm()
      : execute = true,
        requiresConfirmation = true,
        rejectionReason = null;

  const PolicyDecision.reject(this.rejectionReason)
      : execute = false,
        requiresConfirmation = false;

  final bool execute;
  final bool requiresConfirmation;
  final String? rejectionReason;
}

/// Intents reserved for the critical tier — never enabled in this version.
const Set<String> criticalIntents = {
  'install_application',
  'payment',
  'shell_exec',
};

class PermissionPolicy {
  const PermissionPolicy();

  PolicyDecision evaluate(CommandIntent intent) {
    if (criticalIntents.contains(intent.name) || intent.risk == CommandRisk.critical) {
      return const PolicyDecision.reject(
        'الأوامر عالية الخطورة معطّلة في هذا الإصدار حتى تكتمل المصادقة الإضافية.',
      );
    }
    if (intent.risk == CommandRisk.sensitive) {
      return const PolicyDecision.confirm();
    }
    return const PolicyDecision.execute();
  }
}
