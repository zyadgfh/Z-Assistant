import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/assistant_request.dart';
import '../models/assistant_response.dart';

class AiServiceException implements Exception {
  AiServiceException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Port used by the controller so tests can inject a hermetic fake.
abstract class AiClient {
  Future<AssistantResponse> ask(AssistantRequest request);
}

/// Talks to the Cloudflare worker over HTTPS. No API key ever exists in the
/// app — the worker holds it in Cloudflare Secrets and returns structured
/// intents only.
class AiService implements AiClient {
  AiService({
    http.Client? client,
    required String Function() backendUrl,
    this.timeout = AppConfig.aiTimeout,
  })  : _client = client ?? http.Client(),
        _backendUrl = backendUrl;

  final http.Client _client;
  final String Function() _backendUrl;
  final Duration timeout;

  @override
  Future<AssistantResponse> ask(AssistantRequest request) async {
    final base = _backendUrl().trim();
    if (base.isEmpty || base.contains('<your-subdomain>')) {
      throw AiServiceException(
        'لم يتم ضبط رابط الخادم بعد؛ أدخل رابط Cloudflare Worker في الإعدادات.',
      );
    }

    final Uri endpoint;
    try {
      endpoint = Uri.parse('$base/v1/assistant');
    } on FormatException {
      throw AiServiceException('رابط الخادم غير صالح؛ صحّحه في الإعدادات.');
    }

    late http.Response response;
    try {
      response = await _client
          .post(
            endpoint,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(request.toJson()),
          )
          .timeout(timeout);
    } catch (_) {
      throw AiServiceException('تعذر الوصول إلى الخادم؛ تحقق من الاتصال بالإنترنت.');
    }

    if (response.statusCode == 429) {
      throw AiServiceException('تجاوزت الحد اليومي للطلبات؛ جرب غدًا أو استخدم الأوامر المحلية.');
    }
    if (response.statusCode >= 400) {
      throw AiServiceException('تعذر إكمال الطلب (رمز ${response.statusCode}).');
    }

    Map<String, dynamic> decoded;
    try {
      decoded = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw AiServiceException('رد غير مفهوم من الخادم.');
    }
    return AssistantResponse.fromJson(decoded);
  }
}
