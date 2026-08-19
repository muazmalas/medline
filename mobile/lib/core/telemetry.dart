import 'dart:convert';
import 'package:http/http.dart' as http;

class Telemetry {
  static const endpoint = String.fromEnvironment('MEDLINE_TELEMETRY_URL');

  static Future<void> captureError(Object error, {String? context, String? requestId}) async {
    if (endpoint.isEmpty) return;
    final raw = error.toString().replaceAll(RegExp(r'Bearer\s+\S+', caseSensitive: false), 'Bearer [redacted]').replaceAll(RegExp(r'\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b'), '[redacted-email]').replaceAll(RegExp(r'(pin|token|password|prescription|document|phone)\s*[:=]?\s*[^\s,;]+', caseSensitive: false), r'$1=[redacted]');
    final message = raw.length > 500 ? raw.substring(0, 500) : raw;
    try {
      await http.post(Uri.parse(endpoint), headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: jsonEncode({'event': 'mobile_error', 'error_type': error.runtimeType.toString(), 'message': message, 'context': context ?? 'unknown', if (requestId != null && requestId.isNotEmpty) 'request_id': requestId, 'app': 'medline_mobile'})).timeout(const Duration(seconds: 3));
    } catch (_) {
      // Telemetry must never affect the user workflow.
    }
  }

  static Future<void> record(String event, {Map<String, String> properties = const {}}) async {
    if (endpoint.isEmpty) return;
    final safeProperties = Map<String, String>.fromEntries(properties.entries.where((entry) => !RegExp(r'token|password|pin|prescription|document|email|phone', caseSensitive: false).hasMatch(entry.key)));
    try {
      await http.post(Uri.parse(endpoint), headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: jsonEncode({'event': event, 'properties': safeProperties, 'app': 'medline_mobile'})).timeout(const Duration(seconds: 3));
    } catch (_) {
      // Telemetry must never affect the user workflow.
    }
  }
}
