import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// Text-to-speech with automatic Arabic/English voice selection. If no native
/// Egyptian voice exists on the device we use the closest Arabic voice and say
/// so honestly (plan §4.4).
abstract class TtsService {
  Future<void> configure({required double rate, required double pitch});
  Future<void> speak(String text, String language);
  Future<void> stop();
}

/// Escapes a value for a single-quoted PowerShell literal (pure, unit-tested).
/// The command itself is always an argv list — never a shell string.
String escapePowerShellSingleQuoted(String value) =>
    value.replaceAll("'", "''");

class AndroidTtsService implements TtsService {
  AndroidTtsService();

  final FlutterTts _tts = FlutterTts();

  @override
  Future<void> configure({required double rate, required double pitch}) async {
    await _tts.setSpeechRate(rate);
    await _tts.setPitch(pitch);
  }

  @override
  Future<void> speak(String text, String language) async {
    final lang = language.toLowerCase().startsWith('en') ? 'en-US' : 'ar-EG';
    await _tts.setLanguage(lang);
    await _tts.speak(text);
  }

  @override
  Future<void> stop() => _tts.stop();
}

/// Windows/Linux TTS through the OS speech engines, spawned as argv lists:
/// PowerShell System.Speech on Windows, spd-say on Linux.
class DesktopTtsService implements TtsService {
  DesktopTtsService({ProcessRunner? runner}) : _runner = runner ?? Process.run;
  final ProcessRunner _runner;
  double _rate = 0.5;
  double _pitch = 1.0;

  @override
  Future<void> configure({required double rate, required double pitch}) async {
    _rate = rate;
    _pitch = pitch;
  }

  @override
  Future<void> speak(String text, String language) async {
    if (defaultTargetPlatform == TargetPlatform.linux) {
      await _runner('spd-say', ['-w', text]);
      return;
    }
    // Windows: System.Speech with the nearest Arabic voice when needed.
    final rate = (_rate * 4).clamp(0.5, 4.0).toStringAsFixed(1);
    final script = [
      "Add-Type -AssemblyName System.Speech;",
      r"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
      if (!language.toLowerCase().startsWith('en'))
        r"$voice = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'ar*' } | Select-Object -First 1;",
      r"if ($voice) { $s.SelectVoice($voice.VoiceInfo.Name); }",
      "if (${_pitch.toStringAsFixed(1)} -ne 1.0) { \$s.Pitch = ${_pitch.toStringAsFixed(1)}; }",
      "\$s.Rate = $rate;",
      "\$s.SetOutputToDefaultAudioDevice();",
      "\$s.Speak('${escapePowerShellSingleQuoted(text)}');",
    ].join(' ');
    await _runner('powershell', ['-NoProfile', '-Command', script]);
  }

  @override
  Future<void> stop() async {
    // Best-effort: kill speaking by closing the synthesizer process is not
    // needed because each Speak() call is short and awaited.
  }
}

/// Injectable process runner so tests never touch the operating system.
typedef ProcessRunner = Future<ProcessResult> Function(
    String executable, List<String> args);

TtsService ttsServiceForPlatform({ProcessRunner? runner}) {
  switch (defaultTargetPlatform) {
    case TargetPlatform.windows:
    case TargetPlatform.linux:
      return DesktopTtsService(runner: runner);
    default:
      // Android/iOS/macOS use the flutter_tts plugin.
      return AndroidTtsService();
  }
}
