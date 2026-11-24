import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/command_intent.dart';
import 'temp_files.dart';
import 'tts_service.dart';

class ExecutionResult {
  const ExecutionResult(this.success, this.userMessage);
  final bool success;
  final String userMessage;
}

/// Port used by the controller so tests can inject a hermetic fake.
abstract class PlatformExecutor {
  Future<ExecutionResult> execute(CommandIntent intent);
  Future<void> clearSessionTempFiles();
}

/// Executes whitelisted intents on the device with argv-list process calls
/// only — spoken text never reaches a shell, and unsupported platform actions
/// report honestly instead of failing silently.
class PlatformService implements PlatformExecutor {
  PlatformService({ProcessRunner? runner, this.launcher = launchUrl})
      : _runner = runner ?? Process.run;

  final ProcessRunner _runner;
  final Future<bool> Function(Uri, {LaunchMode mode}) launcher;

  bool get _isWindows => defaultTargetPlatform == TargetPlatform.windows;

  @override
  Future<ExecutionResult> execute(CommandIntent intent) async {
    switch (intent.name) {
      case 'open_url':
      case 'search_google':
      case 'search_youtube':
        return _openUrl(intent);
      case 'open_application':
        return _openApplication(intent);
      case 'open_folder':
        return _openFolder(intent);
      case 'take_screenshot':
        return _takeScreenshot();
      case 'volume_up':
      case 'volume_down':
        return _changeVolume(intent.name == 'volume_up');
      case 'play_local_music':
        return _playLocalMusic();
      case 'close_application':
        return _closeApplication(intent);
      default:
        return const ExecutionResult(
          false,
          'هذا الأمر مؤكد لكن تنفيذه على الجهاز غير مفعّل في هذا الإصدار.',
        );
    }
  }

  Future<ExecutionResult> _openUrl(CommandIntent intent) async {
    final url = intent.arguments['site'] ??
        (intent.name == 'search_google'
            ? 'https://www.google.com/search?q=${Uri.encodeQueryComponent(intent.arguments['query'] ?? '')}'
            : 'https://www.youtube.com/results?search_query=${Uri.encodeQueryComponent(intent.arguments['query'] ?? '')}');
    final uri = Uri.tryParse(url);
    // Defense in depth with the worker: only http(s) ever reaches the launcher.
    if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http')) {
      return const ExecutionResult(false, 'الرابط غير مسموح؛ يُفتح فقط http وhttps.');
    }
    final ok = await launcher(uri, mode: LaunchMode.externalApplication);
    return ok
        ? const ExecutionResult(true, 'تم فتح الرابط.')
        : const ExecutionResult(false, 'تعذر فتح الرابط على هذا الجهاز.');
  }

  Future<ExecutionResult> _openApplication(CommandIntent intent) async {
    final app = intent.arguments['application'] ?? '';
    if (_isWindows) {
      // Launch allowlist: canonical display names map to executables registered
      // in Windows "App Paths". Anything outside the allowlist is refused so the
      // model can never start arbitrary programs (cmd, powershell, installers…).
      const exeByApp = {
        'Google Chrome': 'chrome.exe',
        'VS Code': 'code.exe',
        'WhatsApp': 'whatsapp.exe',
        'Telegram': 'telegram.exe',
        'Notepad': 'notepad.exe',
        'Calculator': 'calculator.exe',
      };
      final exe = exeByApp[app];
      if (exe == null) {
        return ExecutionResult(false, 'التطبيق "$app" ليس في قائمة التشغيل المسموحة.');
      }
      await _runner('powershell', [
        '-NoProfile',
        '-Command',
        "Start-Process '${escapePowerShellSingleQuoted(exe)}'",
      ]);
      return ExecutionResult(true, 'حاولت فتح $app.');
    }
    return const ExecutionResult(
      false,
      'تشغيل التطبيقات بالاسم على هذا النظام يحتاج معرّف الحزمة؛ قيد الإنشاء.',
    );
  }

  Future<ExecutionResult> _openFolder(CommandIntent intent) async {
    if (!_isWindows) {
      return const ExecutionResult(false, 'فتح المجلدات مدعوم حاليًا على Windows فقط.');
    }
    final known = {
      'downloads': '${Platform.environment['USERPROFILE'] ?? ''}\\Downloads',
      'desktop': '${Platform.environment['USERPROFILE'] ?? ''}\\Desktop',
      'documents': '${Platform.environment['USERPROFILE'] ?? ''}\\Documents',
    };
    final path = known[intent.arguments['folder']];
    if (path == null) return const ExecutionResult(false, 'المجلد غير معروف.');
    await _runner('explorer.exe', [path]);
    return const ExecutionResult(true, 'تم فتح المجلد.');
  }

  Future<ExecutionResult> _takeScreenshot() async {
    if (!_isWindows) {
      return const ExecutionResult(false, 'لقطة الشاشة مدعومة حاليًا على Windows فقط.');
    }
    final temp = await SessionTempFiles.instance();
    final path = '${temp.directory.path}${temp.separator}maya_screenshot_${DateTime.now().millisecondsSinceEpoch}.png';
    final script = [
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
      r'$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;',
      r'$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;',
      r'$g = [System.Drawing.Graphics]::FromImage($bmp);',
      r'$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size);',
      "\$bmp.Save('${escapePowerShellSingleQuoted(path)}');",
      r'$g.Dispose(); $bmp.Dispose();',
    ].join(' ');
    await _runner('powershell', ['-NoProfile', '-Command', script]);
    return ExecutionResult(true, 'التقطت لقطة الشاشة في: $path');
  }

  Future<ExecutionResult> _changeVolume(bool up) async {
    if (!_isWindows) {
      return const ExecutionResult(false, 'التحكم بالصوت مدعوم حاليًا على Windows فقط.');
    }
    // Fixed script (no user text): sends the multimedia volume key.
    final key = up ? '175' : '174';
    const script = r"(New-Object -ComObject WScript.Shell).SendKeys([char]$KEY);";
    await _runner('powershell', [
      '-NoProfile',
      '-Command',
      script.replaceAll(r'$KEY', key),
    ]);
    return ExecutionResult(true, up ? 'رفعت الصوت.' : 'خففت الصوت.');
  }

  Future<ExecutionResult> _playLocalMusic() async {
    if (!_isWindows) {
      return const ExecutionResult(false, 'تشغيل الموسيقى المحلية مدعوم حاليًا على Windows فقط.');
    }
    final music = '${Platform.environment['USERPROFILE'] ?? ''}\\Music';
    await _runner('explorer.exe', [music]);
    return const ExecutionResult(true, 'فتحت مجلد الموسيقى؛ شغّل الملف الذي تريد.');
  }

  Future<ExecutionResult> _closeApplication(CommandIntent intent) async {
    if (!_isWindows) {
      return const ExecutionResult(false, 'إغلاق التطبيقات مدعوم حاليًا على Windows فقط.');
    }
    final map = {
      'Google Chrome': 'chrome.exe',
      'WhatsApp': 'WhatsApp.exe',
      'VS Code': 'Code.exe',
      'Telegram': 'Telegram.exe',
    };
    final process = map[intent.arguments['application']];
    if (process == null) {
      return const ExecutionResult(false, 'لا أعرف اسم عملية هذا التطبيق بعد.');
    }
    await _runner('taskkill', ['/IM', process, '/F']);
    return ExecutionResult(true, 'أغلقت ${intent.arguments['application']}.');
  }

  @override
  Future<void> clearSessionTempFiles() => SessionTempFiles.instance().then((t) => t.clear());
}
