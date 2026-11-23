import 'package:flutter/material.dart';

/// Large push-to-talk button — the primary interaction (plan §واجهة Flutter).
class MicrophoneButton extends StatelessWidget {
  const MicrophoneButton({
    super.key,
    required this.listening,
    required this.onPressed,
  });

  final bool listening;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 132,
      height: 132,
      child: FilledButton(
        key: const Key('microphone_button'),
        style: FilledButton.styleFrom(
          shape: const CircleBorder(),
          backgroundColor: listening ? Colors.redAccent : Colors.indigo,
        ),
        onPressed: onPressed,
        child: Icon(
          listening ? Icons.stop : Icons.mic,
          size: 56,
          color: Colors.white,
        ),
      ),
    );
  }
}
