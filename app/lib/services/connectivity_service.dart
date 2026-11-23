import 'package:connectivity_plus/connectivity_plus.dart';

/// Online/offline gate. The AI conversation needs internet; basic safe commands
/// work without it (the UI states this clearly).
abstract class ConnectivityService {
  Future<bool> isOnline();
}

class PluginConnectivityService implements ConnectivityService {
  PluginConnectivityService();

  final Connectivity _connectivity = Connectivity();

  @override
  Future<bool> isOnline() async {
    try {
      final results = await _connectivity.checkConnectivity();
      return !results.contains(ConnectivityResult.none);
    } catch (_) {
      // When the plugin is unavailable assume offline: fail closed, never
      // silently send data.
      return false;
    }
  }
}

class FakeConnectivityService implements ConnectivityService {
  FakeConnectivityService(this.online);
  bool online;

  @override
  Future<bool> isOnline() async => online;
}
