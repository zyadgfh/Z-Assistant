/// Request body for POST /v1/assistant (mirrors the worker contract).
class AssistantRequest {
  const AssistantRequest({
    required this.text,
    required this.locale,
    this.deviceId,
  });

  final String text;
  final String locale; // auto | ar | ar-EG | en
  final String? deviceId;

  Map<String, dynamic> toJson() => {
        'text': text,
        'locale': locale,
        if (deviceId != null) 'deviceId': deviceId,
      };
}
