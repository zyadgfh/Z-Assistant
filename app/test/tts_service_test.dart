import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:maya_assistant/services/tts_service.dart';

void main() {
  test('PowerShell escaping doubles single quotes (no shell string breaks)', () {
    expect(escapePowerShellSingleQuoted("مايا's reply"), "مايا''s reply");
    expect(escapePowerShellSingleQuoted('نص عربي "عادي"'), 'نص عربي "عادي"');
    expect(escapePowerShellSingleQuoted("it's a 'test'"), "it''s a ''test''");
  });

  test('DesktopTtsService invokes the runner with an argv list (no shell)', () async {
    final calls = <List<String>>[];
    final tts = DesktopTtsService(
      runner: (file, args) async {
        calls.add([file, ...args]);
        return ProcessResult(0, 0, '', '');
      },
    );
    await tts.speak('مرحباً', 'ar-EG');

    expect(calls, hasLength(1));
    expect(calls.first.first, 'powershell');
    expect(calls.first[1], '-NoProfile');
    expect(calls.first[2], '-Command');
    // The spoken text is one argv element — never interpolated into a shell.
    expect(calls.first[3], contains("Speak('مرحباً')"));
    // User text with quotes is escaped, keeping the script literal.
    await tts.speak("مايا's", 'ar-EG');
    expect(calls.last[3], contains("Speak('مايا''s')"));
  });
}
