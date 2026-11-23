import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maya_assistant/widgets/microphone_button.dart';

void main() {
  testWidgets('mic button toggles and reports taps', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: MicrophoneButton(
              listening: false,
              onPressed: () => taps++,
            ),
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('microphone_button')), findsOneWidget);
    expect(find.byIcon(Icons.mic), findsOneWidget);

    await tester.tap(find.byKey(const Key('microphone_button')));
    await tester.pump();
    expect(taps, 1);
  });

  testWidgets('shows the stop icon while listening', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: MicrophoneButton(
              listening: true,
              onPressed: () {},
            ),
          ),
        ),
      ),
    );
    expect(find.byIcon(Icons.stop), findsOneWidget);
  });
}
