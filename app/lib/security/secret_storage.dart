import 'package:shared_preferences/shared_preferences.dart';

/// Device-side storage for NON-sensitive settings only.
///
/// There are no API keys, tokens, or secrets in the Flutter app — the worker
/// holds the Gemini key in Cloudflare Secrets. As a guard, this class refuses
/// to persist anything that looks like a credential.
class SecretStorage {
  SecretStorage(this._prefs);

  final SharedPreferencesAsync _prefs;

  static final RegExp _credentialKeyPattern =
      RegExp(r'(api[_-]?key|secret|token|password|credential)', caseSensitive: false);

  /// Refuses credential-like keys; returns false instead of storing anything.
  Future<bool> tryStorePublicValue(String key, String value) async {
    if (_credentialKeyPattern.hasMatch(key)) return false;
    // SharedPreferencesAsync.setString completes with void; success means the
    // write finished without throwing.
    await _prefs.setString(key, value);
    return true;
  }

  Future<String?> readPublicValue(String key) => _prefs.getString(key);

  Future<void> removePublicValue(String key) => _prefs.remove(key);
}
