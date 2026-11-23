import 'dart:io';

/// Session-scoped temporary files (screenshots, future audio buffers) that are
/// deleted right after use (plan §5.4: no temp media retention).
class SessionTempFiles {
  SessionTempFiles._(this.directory);

  final Directory directory;
  static SessionTempFiles? _instance;

  static Future<SessionTempFiles> instance() async {
    if (_instance != null) return _instance!;
    final base = await Directory.systemTemp.createTemp('maya_session_');
    _instance = SessionTempFiles._(base);
    return _instance!;
  }

  Future<File> createFile(String name, List<int> bytes) async {
    final file = File('${directory.path}$separator$name');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  /// Deletes every temporary file of this session; never throws.
  Future<void> clear() async {
    try {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    } catch (_) {
      // A leftover temp dir is preferable to crashing the command path.
    }
    _instance = null;
  }

  String get separator => Platform.pathSeparator;
}
