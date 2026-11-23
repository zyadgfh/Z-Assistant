import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/assistant_controller.dart';
import '../widgets/confirmation_dialog.dart';
import '../widgets/microphone_button.dart';
import '../widgets/status_indicator.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _manualController = TextEditingController();

  @override
  void dispose() {
    _manualController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AssistantController>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Maya — Z-Assistant'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => Navigator.pushNamed(context, '/settings'),
            tooltip: 'الإعدادات',
          ),
          IconButton(
            icon: const Icon(Icons.privacy_tip_outlined),
            onPressed: () => Navigator.pushNamed(context, '/privacy'),
            tooltip: 'الخصوصية',
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              controller.online ? 'مايا جاهزة' : 'وضع غير متصل: الأوامر الأساسية فقط',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            StatusIndicator(
              online: controller.online,
              listening: controller.phase == AssistantPhase.listening,
              speechSupported: controller.speechSupported,
            ),
            const SizedBox(height: 24),
            Center(child: MicrophoneButton(
              listening: controller.phase == AssistantPhase.listening,
              onPressed: () => controller.toggleMic(),
            )),
            const SizedBox(height: 16),
            Center(child: _phaseLabel(controller.phase)),
            if (controller.errorMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                controller.errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.orangeAccent),
              ),
            ],
            const Spacer(),
            if (controller.lastTranscript.isNotEmpty)
              _card(context, 'آخر طلب', controller.lastTranscript),
            if (controller.lastReply.isNotEmpty)
              _card(context, 'آخر رد', controller.lastReply),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _manualController,
                    decoration: const InputDecoration(
                      hintText: 'أو اكتب أمرًا للتجربة (اختياري)',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (value) => controller.handleUtterance(value),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: () => controller.handleUtterance(_manualController.text),
                  icon: const Icon(Icons.send),
                  tooltip: 'تنفيذ',
                ),
              ],
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => controller.stopSpeaking(),
              icon: const Icon(Icons.stop_circle_outlined),
              label: const Text('إيقاف الصوت'),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _phaseLabel(AssistantPhase phase) {
    switch (phase) {
      case AssistantPhase.listening:
        return const Text('أستمع…', style: TextStyle(color: Colors.redAccent, fontSize: 18));
      case AssistantPhase.thinking:
        return const Text('أفكر…', style: TextStyle(color: Colors.indigoAccent, fontSize: 18));
      case AssistantPhase.executing:
        return const Text('أنفذ…', style: TextStyle(color: Colors.amberAccent, fontSize: 18));
      case AssistantPhase.speaking:
        return const Text('أتحدث…', style: TextStyle(color: Colors.greenAccent, fontSize: 18));
      case AssistantPhase.idle:
        return const Text('اضغط زر الميكروفون وتحدث', style: TextStyle(fontSize: 16));
    }
  }

  Widget _card(BuildContext context, String title, String body) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 4),
            Text(body, style: Theme.of(context).textTheme.bodyLarge),
          ],
        ),
      ),
    );
  }
}
