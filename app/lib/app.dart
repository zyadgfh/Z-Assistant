import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'screens/home_screen.dart';
import 'screens/privacy_screen.dart';
import 'screens/settings_screen.dart';

class MayaApp extends StatelessWidget {
  const MayaApp({super.key, required this.prefs});

  final SharedPreferencesAsync prefs;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Maya — Z-Assistant',
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo, brightness: Brightness.dark),
        fontFamily: 'Segoe UI',
      ),
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child!,
      ),
      initialRoute: '/',
      routes: {
        '/': (context) => const HomeScreen(),
        '/settings': (context) => SettingsScreen(prefs: prefs),
        '/privacy': (context) => const PrivacyScreen(),
      },
    );
  }
}
