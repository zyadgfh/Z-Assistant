import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../main.dart' show BackendUrlHolder;
import '../security/secret_storage.dart';

/// Settings: language, TTS, backend URL (public), autostart, history deletion.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.prefs});

  final SharedPreferencesAsync prefs;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final SecretStorage _storage;
  final TextEditingController _backendController = TextEditingController();

  String _language = 'auto';
  double _rate = 0.5;
  double _pitch = 1.0;
  bool _autostart = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _storage = SecretStorage(widget.prefs);
    _load();
  }

  Future<void> _load() async {
    final prefs = widget.prefs;
    _backendController.text =
        await prefs.getString(AppConfig.prefBackendUrl) ?? AppConfig.defaultBackendUrl;
    _language = await prefs.getString(AppConfig.prefLanguage) ?? 'auto';
    _rate = await prefs.getDouble(AppConfig.prefTtsRate) ?? 0.5;
    _pitch = await prefs.getDouble(AppConfig.prefTtsPitch) ?? 1.0;
    _autostart = await prefs.getBool(AppConfig.prefAutostart) ?? false;
    setState(() => _loaded = true);
  }

  Future<void> _save() async {
    // SecretStorage refuses credential-like keys by design.
    final url = _backendController.text.trim();
    final saved = await _storage.tryStorePublicValue(AppConfig.prefBackendUrl, url);
    if (saved) {
      // Apply immediately without an app restart.
      context.read<BackendUrlHolder>().url = url;
    }
    await widget.prefs.setString(AppConfig.prefLanguage, _language);
    await widget.prefs.setDouble(AppConfig.prefTtsRate, _rate);
    await widget.prefs.setDouble(AppConfig.prefTtsPitch, _pitch);
    await widget.prefs.setBool(AppConfig.prefAutostart, _autostart);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(saved ? 'حُفظت الإعدادات.' : 'رُفض حفظ قيمة تشبه بيانات سرية.')),
      );
    }
  }

  @override
  void dispose() {
    _backendController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('الإعدادات')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DropdownButtonFormField<String>(
            value: _language,
            decoration: const InputDecoration(labelText: 'لغة ولهجة الرد'),
            items: const [
              DropdownMenuItem(value: 'auto', child: Text('تلقائي (حسب كلامك)')),
              DropdownMenuItem(value: 'ar-EG', child: Text('مصري')),
              DropdownMenuItem(value: 'ar', child: Text('عربي فصيح')),
              DropdownMenuItem(value: 'en', child: Text('English')),
            ],
            onChanged: (value) => setState(() => _language = value ?? 'auto'),
          ),
          const SizedBox(height: 16),
          Text('سرعة النطق: ${_rate.toStringAsFixed(1)}'),
          Slider(value: _rate, min: 0.1, max: 1.0, onChanged: (v) => setState(() => _rate = v)),
          Text('درجة الصوت: ${_pitch.toStringAsFixed(1)}'),
          Slider(value: _pitch, min: 0.5, max: 2.0, onChanged: (v) => setState(() => _pitch = v)),
          const SizedBox(height: 8),
          TextField(
            controller: _backendController,
            decoration: const InputDecoration(
              labelText: 'رابط Cloudflare Worker (عام — ليس سرًا)',
              border: OutlineInputBorder(),
            ),
          ),
          SwitchListTile(
            title: const Text('تشغيل تلقائي مع Windows'),
            subtitle: const Text('يُطبق من إعدادات النظام بعد التثبيت (HKCU Run)'),
            value: _autostart,
            onChanged: (value) => setState(() => _autostart = value),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _save,
            icon: const Icon(Icons.save),
            label: const Text('حفظ'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/privacy'),
            icon: const Icon(Icons.privacy_tip_outlined),
            label: const Text('سياسة الخصوصية'),
          ),
        ],
      ),
    );
  }
}
