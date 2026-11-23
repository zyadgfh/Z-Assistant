import 'package:flutter/material.dart';

/// Compact status row: connectivity + microphone state (plan §الشاشة الرئيسية).
class StatusIndicator extends StatelessWidget {
  const StatusIndicator({
    super.key,
    required this.online,
    required this.listening,
    required this.speechSupported,
  });

  final bool online;
  final bool listening;
  final bool speechSupported;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          online ? Icons.wifi : Icons.wifi_off,
          size: 18,
          color: online ? Colors.greenAccent : Colors.orangeAccent,
        ),
        const SizedBox(width: 6),
        Text(online ? 'متصل' : 'غير متصل', style: theme.textTheme.bodyMedium),
        const SizedBox(width: 16),
        Icon(
          listening ? Icons.mic : Icons.mic_off,
          size: 18,
          color: speechSupported
              ? (listening ? Colors.redAccent : Colors.white70)
              : Colors.grey,
        ),
        const SizedBox(width: 6),
        Text(
          !speechSupported
              ? 'الصوت غير مدعوم هنا'
              : listening
                  ? 'يستمع'
                  : 'الميكروفون جاهز',
          style: theme.textTheme.bodyMedium,
        ),
      ],
    );
  }
}
