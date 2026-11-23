import 'package:flutter_test/flutter_test.dart';
import 'package:maya_assistant/models/command_intent.dart';
import 'package:maya_assistant/security/permission_policy.dart';

CommandIntent intent(String name, CommandRisk risk) => CommandIntent(
      name: name,
      arguments: {},
      risk: risk,
      raw: '',
      locale: 'ar-EG',
    );

void main() {
  const policy = PermissionPolicy();

  test('safe intents execute directly', () {
    final decision = policy.evaluate(intent('open_application', CommandRisk.safe));
    expect(decision.execute, isTrue);
    expect(decision.requiresConfirmation, isFalse);
  });

  test('sensitive intents require confirmation', () {
    final decision = policy.evaluate(intent('send_message', CommandRisk.sensitive));
    expect(decision.execute, isTrue);
    expect(decision.requiresConfirmation, isTrue);
  });

  test('critical intents are rejected in v1', () {
    final decision = policy.evaluate(intent('install_application', CommandRisk.critical));
    expect(decision.execute, isFalse);
    expect(decision.rejectionReason, isNotNull);
  });

  test('critical by name is rejected even when the risk field is wrong', () {
    final decision = policy.evaluate(intent('shell_exec', CommandRisk.safe));
    expect(decision.execute, isFalse);
  });
}
