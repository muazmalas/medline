import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'telemetry.dart';

class ApiClient {
  ApiClient({String? baseUrl})
      : baseUrl = (baseUrl ??
                const String.fromEnvironment('MEDLINE_API_URL',
                    defaultValue: 'http://10.0.2.2:8000/api/v1'))
            .replaceFirst(RegExp(r'\/$'), '');

  final String baseUrl;
  String? token;
  Future<bool> Function()? onUnauthorized;
  void Function(bool online)? onConnectivityChanged;
  void Function(int pendingCount)? onMutationQueueChanged;
  String cacheNamespace = 'anonymous';
  final FlutterSecureStorage _readCache = const FlutterSecureStorage();
  bool _flushingMutations = false;

  void setCacheNamespace(String namespace) => cacheNamespace =
      namespace.trim().isEmpty ? 'anonymous' : namespace.trim();

  String _cacheKey(String path, {Map<String, String>? query}) {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    return 'medline_read_cache_${Uri.encodeComponent('$cacheNamespace:${uri.toString()}')}';
  }

  String _cacheTimestampKey(String path, {Map<String, String>? query}) =>
      '${_cacheKey(path, query: query)}_timestamp';

  String get _mutationQueueKey =>
      'medline_mutation_queue_${Uri.encodeComponent(cacheNamespace)}';

  Future<List<Map<String, dynamic>>> _readPendingMutations() async {
    final raw = await _readCache.read(key: _mutationQueueKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw) as List;
      return decoded
          .whereType<Map>()
          .map((item) => item.cast<String, dynamic>())
          .toList();
    } catch (_) {
      await _readCache.delete(key: _mutationQueueKey);
      return [];
    }
  }

  Future<void> _writePendingMutations(List<Map<String, dynamic>> queue) async {
    if (queue.isEmpty) {
      await _readCache.delete(key: _mutationQueueKey);
    } else {
      await _readCache.write(key: _mutationQueueKey, value: jsonEncode(queue));
    }
    onMutationQueueChanged?.call(queue.length);
  }

  Future<Map<String, dynamic>> _queueMutation(String method, String path,
      Map<String, dynamic> body, String idempotencyKey) async {
    final queue = await _readPendingMutations();
    queue.removeWhere((item) => item['idempotency_key'] == idempotencyKey);
    queue.add({
      'method': method,
      'path': path,
      'body': body,
      'idempotency_key': idempotencyKey,
      'queued_at': DateTime.now().toIso8601String()
    });
    await _writePendingMutations(queue);
    return {
      'queued': true,
      'message':
          'This update is queued and will sync when the connection is restored.'
    };
  }

  Future<int> pendingMutationCount() async =>
      (await _readPendingMutations()).length;

  Future<void> flushPendingMutations() async {
    if (_flushingMutations || token == null) return;
    _flushingMutations = true;
    try {
      final queue = await _readPendingMutations();
      onMutationQueueChanged?.call(queue.length);
      while (queue.isNotEmpty) {
        final item = queue.first;
        try {
          final method = item['method']?.toString() ?? 'PATCH';
          final path = item['path'].toString();
          final body = (item['body'] as Map).cast<String, dynamic>();
          final key = item['idempotency_key']?.toString();
          if (method == 'POST') {
            await post(path, body, idempotencyKey: key, allowQueue: false);
          } else if (method == 'DELETE') {
            await requestDelete(path, body,
                idempotencyKey: key, allowQueue: false);
          } else {
            await requestPatch(path, body,
                idempotencyKey: key, queueIfOffline: false);
          }
          queue.removeAt(0);
          await _writePendingMutations(queue);
        } on ApiException catch (exception) {
          if (exception.statusCode == 0) break;
          queue.removeAt(0);
          await _writePendingMutations(queue);
        }
      }
    } finally {
      _flushingMutations = false;
    }
  }

  Future<void> _invalidateCache(String path,
      {Map<String, String>? query}) async {
    await _readCache.delete(key: _cacheKey(path, query: query));
    await _readCache.delete(key: _cacheTimestampKey(path, query: query));
  }

  Future<Map<String, dynamic>> login(String email, String password,
          {String? twoFactorCode}) =>
      post('/auth/login', {
        'email': email,
        'password': password,
        if (twoFactorCode != null && twoFactorCode.isNotEmpty)
          'two_factor_code': twoFactorCode
      });

  Future<Map<String, dynamic>> twoFactorStatus() => get('/auth/2fa/status');

  Future<Map<String, dynamic>> twoFactorSetup({String? idempotencyKey}) =>
      post('/auth/2fa/setup', {}, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> confirmTwoFactor(String code,
          {String? idempotencyKey}) =>
      post('/auth/2fa/confirm', {'code': code}, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> disableTwoFactor(String code,
          {String? idempotencyKey}) =>
      post('/auth/2fa/disable', {'code': code}, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> refreshToken(String refreshToken) =>
      post('/auth/refresh', {'refresh_token': refreshToken},
          notifyUnauthorized: false);

  Future<Map<String, dynamic>> logout({String? refreshToken}) =>
      post('/auth/logout', {
        if (refreshToken != null && refreshToken.isNotEmpty)
          'refresh_token': refreshToken
      });

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> payload,
          {String? idempotencyKey}) =>
      requestPatch('/profile', payload,
          idempotencyKey: idempotencyKey, queueIfOffline: true);

  Future<Map<String, dynamic>> changePassword(
          {required String currentPassword,
          required String password,
          required String confirmation,
          String? idempotencyKey}) =>
      post(
          '/profile/password',
          {
            'current_password': currentPassword,
            'password': password,
            'password_confirmation': confirmation,
          },
          idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) =>
      post('/auth/register', payload);

  Future<Map<String, dynamic>> registerWithFiles(
          Map<String, String> fields, Map<String, String> files,
          {String? idempotencyKey}) =>
      multipart('/auth/register',
          fields: fields,
          files: files,
          idempotencyKey: idempotencyKey,
          allowAuthRecovery: false);

  Future<Map<String, dynamic>> forgotPassword(String email) =>
      post('/auth/forgot-password', {'email': email});

  Future<Map<String, dynamic>> resetPassword(
          {required String email,
          required String token,
          required String password,
          required String confirmation}) =>
      post('/auth/reset-password', {
        'email': email,
        'token': token,
        'password': password,
        'password_confirmation': confirmation
      });

  Future<Map<String, dynamic>> resendVerification() =>
      post('/auth/resend-verification', {});

  Future<Map<String, dynamic>> medicines(String search) =>
      get('/medicines', query: {'search': search, 'per_page': '20'});

  Future<Map<String, dynamic>> dashboard() => get('/dashboard');

  Future<Map<String, dynamic>> adminDashboard() => get('/admin/dashboard');

  Future<Map<String, dynamic>> medicineSuggestions(String search) =>
      get('/medicines/suggestions', query: {'search': search});

  Future<Map<String, dynamic>> partners({String? type}) => get('/partners',
      query: {if (type != null) 'type': type, 'per_page': '20'});

  Future<Map<String, dynamic>> orders() => get('/orders');

  Future<Map<String, dynamic>> orderDetails(int orderId) =>
      get('/orders/$orderId');

  Future<Map<String, dynamic>> cart() => get('/cart');

  Future<Map<String, dynamic>> updateCartItem(
      int medicineId, int quantity) async {
    final response = await requestPut(
        '/cart/items', {'medicine_id': medicineId, 'quantity': quantity});
    await _invalidateCache('/cart');
    return response;
  }

  Future<Map<String, dynamic>> clearCart() async {
    final response = await requestDelete('/cart', {});
    await _invalidateCache('/cart');
    return response;
  }

  Future<Map<String, dynamic>> addresses() => get('/addresses');

  Future<Map<String, dynamic>> createAddress(Map<String, dynamic> payload,
      {String? idempotencyKey}) async {
    final response =
        await post('/addresses', payload, idempotencyKey: idempotencyKey);
    await _invalidateCache('/addresses');
    return response;
  }

  Future<Map<String, dynamic>> updateAddress(
      int id, Map<String, dynamic> payload,
      {String? idempotencyKey}) async {
    final response = await requestPatch('/addresses/$id', payload,
        idempotencyKey: idempotencyKey);
    await _invalidateCache('/addresses');
    return response;
  }

  Future<Map<String, dynamic>> deleteAddress(int id,
      {String? idempotencyKey}) async {
    final response = await requestDelete('/addresses/$id', {},
        idempotencyKey: idempotencyKey);
    await _invalidateCache('/addresses');
    return response;
  }

  Future<Map<String, dynamic>> verificationDocuments() =>
      get('/verification-documents');

  Future<Map<String, dynamic>> uploadVerificationDocument(
      String type, String filePath,
      {String? idempotencyKey}) async {
    Future<http.Response> send() async {
      final request = http.MultipartRequest(
          'POST', Uri.parse('$baseUrl/verification-documents'));
      request.headers.addAll({
        'Accept': 'application/json',
        'X-Request-ID': _requestId(),
        if (token != null) 'Authorization': 'Bearer $token',
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
      });
      request.fields['document_type'] = type;
      request.files
          .add(await http.MultipartFile.fromPath('document', filePath));
      return _sendStream(request.send());
    }

    return _decode(await _sendMultipartWithRetry(send, idempotencyKey),
        notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> partnerOrders() => get('/partner/orders');

  Future<Map<String, dynamic>> partnerInventory({String? search}) =>
      get('/partner/inventory',
          query: {if (search != null && search.isNotEmpty) 'search': search});

  Future<Map<String, dynamic>> upsertInventory(
          {required int medicineId,
          required int quantity,
          required num unitPrice,
          int lowStockThreshold = 5,
          String? idempotencyKey}) =>
      requestPut(
          '/partner/inventory',
          {
            'medicine_id': medicineId,
            'quantity': quantity,
            'unit_price': unitPrice,
            'low_stock_threshold': lowStockThreshold
          },
          idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> payload,
      {String? idempotencyKey}) async {
    final response =
        await post('/orders', payload, idempotencyKey: idempotencyKey);
    await _invalidateCache('/orders');
    await _invalidateCache('/cart');
    return response;
  }

  Future<Map<String, dynamic>> cancelOrder(int orderId,
      {String? reason, String? idempotencyKey}) async {
    final response = await post(
        '/orders/$orderId/cancel', {if (reason != null) 'reason': reason},
        idempotencyKey: idempotencyKey);
    await _invalidateCache('/orders');
    await _invalidateCache('/orders/$orderId');
    return response;
  }

  Future<Map<String, dynamic>> procurement() => get('/procurement');

  Future<Map<String, dynamic>> subscription() => get('/subscription');

  Future<Map<String, dynamic>> subscriptionPlans() =>
      get('/subscription/plans');

  Future<Map<String, dynamic>> createProcurement(Map<String, dynamic> payload,
          {String? idempotencyKey}) =>
      post('/procurement', payload, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> decideOrder(int id, String decision,
          {List<Map<String, dynamic>> items = const [],
          String? idempotencyKey}) =>
      post('/partner/orders/$id/decision',
          {'decision': decision, if (items.isNotEmpty) 'items': items},
          idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> decideProcurement(int id, String decision,
          {List<Map<String, dynamic>> items = const [],
          String? idempotencyKey}) =>
      post('/procurement/$id/decision',
          {'decision': decision, if (items.isNotEmpty) 'items': items},
          idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> availableDeliveries() =>
      get('/deliveries/available');

  Future<Map<String, dynamic>> mineDeliveries() => get('/deliveries/mine');

  Future<Map<String, dynamic>> acceptOrderForDelivery(int id,
          {String? idempotencyKey}) =>
      post('/deliveries/$id/accept-order', {}, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> updateDelivery(int id, String status,
          {String? failureReason, String? idempotencyKey}) =>
      post(
          '/deliveries/$id/status',
          {
            'status': status,
            if (failureReason != null && failureReason.isNotEmpty)
              'failure_reason': failureReason
          },
          idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> updateDeliveryLocation(int id,
          {required double latitude,
          required double longitude,
          double? accuracyMeters}) =>
      post('/deliveries/$id/location', {
        'latitude': latitude,
        'longitude': longitude,
        if (accuracyMeters != null) 'accuracy_meters': accuracyMeters
      });

  Future<Map<String, dynamic>> completeDelivery(int id, String pin,
          {String? idempotencyKey}) =>
      post('/deliveries/$id/complete', {'pin': pin},
          idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> notifications() => get('/notifications');

  Future<Map<String, dynamic>> notificationPreferences() =>
      get('/notification-preferences');

  Future<Map<String, dynamic>> consents() => get('/privacy/consents');

  Future<Map<String, dynamic>> grantConsent(String type, String version,
          {String? idempotencyKey}) =>
      post('/privacy/consents',
          {'consent_type': type, 'policy_version': version, 'consented': true},
          idempotencyKey: idempotencyKey, allowQueue: true);

  Future<Map<String, dynamic>> revokeConsent(String type,
          {String? idempotencyKey}) =>
      requestDelete('/privacy/consents/$type', {},
          idempotencyKey: idempotencyKey, allowQueue: true);

  Future<Map<String, dynamic>> driverAvailability() =>
      get('/driver/availability');

  Future<Map<String, dynamic>> updateDriverAvailability(bool available,
          {String? idempotencyKey}) =>
      requestPatch('/driver/availability', {'is_available': available},
          idempotencyKey: idempotencyKey, queueIfOffline: true);

  Future<Map<String, dynamic>> updateNotificationPreferences(
          Map<String, dynamic> preferences,
          {String? idempotencyKey}) =>
      requestPatch('/notification-preferences', preferences,
          idempotencyKey: idempotencyKey, queueIfOffline: true);

  Future<Map<String, dynamic>> readNotification(String id,
          {String? idempotencyKey}) =>
      post('/notifications/$id/read', {}, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> deleteNotification(String id,
          {String? idempotencyKey}) =>
      requestDelete('/notifications/$id', {}, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> createComplaint(Map<String, dynamic> payload,
      {String? filePath, String? idempotencyKey}) async {
    if (filePath == null || filePath.isEmpty) {
      return post('/complaints', payload, idempotencyKey: idempotencyKey);
    }
    Future<http.Response> send() async {
      final request =
          http.MultipartRequest('POST', Uri.parse('$baseUrl/complaints'));
      request.headers.addAll({
        'Accept': 'application/json',
        'X-Request-ID': _requestId(),
        if (token != null) 'Authorization': 'Bearer $token',
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
      });
      payload.forEach((key, value) {
        if (value != null) request.fields[key] = value.toString();
      });
      request.files
          .add(await http.MultipartFile.fromPath('attachment', filePath));
      return _sendStream(request.send());
    }

    return _decode(await _sendMultipartWithRetry(send, idempotencyKey),
        notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> complaintDetails(int id) =>
      get('/complaints/$id');

  Future<Map<String, dynamic>> rateOrder(int orderId, int score,
          {String? comment, String? idempotencyKey}) =>
      post(
          '/orders/$orderId/rating',
          {
            'score': score,
            if (comment != null && comment.isNotEmpty) 'comment': comment
          },
          idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> complaints() => get('/complaints');

  Future<Map<String, dynamic>> registerDeviceToken(
          {required String token,
          required String platform,
          String? deviceId}) =>
      post('/devices/tokens', {
        'token': token,
        'platform': platform,
        if (deviceId != null) 'device_id': deviceId
      });

  Future<Map<String, dynamic>> revokeDeviceToken(String token) =>
      requestDelete('/devices/tokens', {'token': token});

  Future<Map<String, dynamic>> uploadPrescription(int orderId, String filePath,
      {String? idempotencyKey}) async {
    Future<http.Response> send() async {
      final request = http.MultipartRequest(
          'POST', Uri.parse('$baseUrl/orders/$orderId/prescription'));
      request.headers.addAll({
        'Accept': 'application/json',
        'X-Request-ID': _requestId(),
        if (token != null) 'Authorization': 'Bearer $token',
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
      });
      request.files
          .add(await http.MultipartFile.fromPath('prescription', filePath));
      return _sendStream(request.send());
    }

    return _decode(await _sendMultipartWithRetry(send, idempotencyKey),
        notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> uploadItemPrescription(
          int orderId, int itemId, String filePath,
          {String? idempotencyKey}) =>
      multipart(
        '/orders/$orderId/items/$itemId/prescription',
        files: {'prescription': filePath},
        idempotencyKey: idempotencyKey,
      );

  Future<Map<String, dynamic>> multipart(
    String path, {
    String method = 'POST',
    Map<String, String> fields = const {},
    Map<String, String> files = const {},
    String? idempotencyKey,
    bool allowAuthRecovery = true,
  }) async {
    Future<http.Response> send() async {
      final request = http.MultipartRequest(method, Uri.parse('$baseUrl$path'));
      request.headers.addAll({
        'Accept': 'application/json',
        'X-Request-ID': _requestId(),
        if (token != null) 'Authorization': 'Bearer $token',
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
      });
      request.fields.addAll(fields);
      for (final entry in files.entries) {
        if (entry.value.trim().isEmpty) continue;
        request.files
            .add(await http.MultipartFile.fromPath(entry.key, entry.value));
      }
      return _sendStream(request.send());
    }

    if (!allowAuthRecovery) {
      return _decode(await _sendMultipartWithRetry(send, idempotencyKey),
          notifyUnauthorized: false);
    }
    return _decode(
        await _sendMultipartWithRetry(
            () => _withAuthRecovery(send), idempotencyKey),
        notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> uploadPaymentProof(num amount, String filePath,
      {String? planCode, String? idempotencyKey}) async {
    Future<http.Response> send() async {
      final request = http.MultipartRequest(
          'POST', Uri.parse('$baseUrl/subscription/payment-proof'));
      request.headers.addAll({
        'Accept': 'application/json',
        'X-Request-ID': _requestId(),
        if (token != null) 'Authorization': 'Bearer $token',
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
      });
      request.fields['amount'] = amount.toString();
      if (planCode != null && planCode.isNotEmpty) {
        request.fields['plan_code'] = planCode;
      }
      request.files.add(await http.MultipartFile.fromPath('proof', filePath));
      return _sendStream(request.send());
    }

    late final http.Response response;
    try {
      response = await _withAuthRecovery(send);
    } on ApiException catch (exception) {
      if (idempotencyKey == null || exception.statusCode != 0) rethrow;
      await Future<void>.delayed(const Duration(milliseconds: 250));
      response = await _withAuthRecovery(send);
    }
    return _decode(response, notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> get(String path,
      {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final cacheable = [
      '/medicines',
      '/partners',
      '/addresses',
      '/orders',
      '/cart'
    ].any((prefix) => path == prefix || path.startsWith('$prefix/'));
    final cacheKey = _cacheKey(path, query: query);
    Object? lastError;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final response = await _withAuthRecovery(() => _send(http
            .get(uri, headers: _headers)
            .timeout(const Duration(seconds: 12))));
        final payload = _decode(response, notifyUnauthorized: false);
        if (cacheable) {
          await _readCache.write(key: cacheKey, value: jsonEncode(payload));
          await _readCache.write(
              key: _cacheTimestampKey(path, query: query),
              value: DateTime.now().millisecondsSinceEpoch.toString());
        }
        return payload;
      } catch (exception) {
        if (exception is ApiException) rethrow;
        lastError = exception;
        if (attempt < 2) {
          await Future<void>.delayed(
              Duration(milliseconds: 300 * (attempt + 1)));
        }
      }
    }
    if (cacheable) {
      final cached = await _readCache.read(key: cacheKey);
      final timestamp = int.tryParse(
          await _readCache.read(key: _cacheTimestampKey(path, query: query)) ??
              '');
      final fresh = timestamp != null &&
          DateTime.now().millisecondsSinceEpoch - timestamp <=
              const Duration(hours: 24).inMilliseconds;
      if (cached != null && fresh) {
        try {
          return (jsonDecode(cached) as Map).cast<String, dynamic>();
        } catch (_) {
          await _invalidateCache(path, query: query);
        }
      } else if (cached != null) {
        await _invalidateCache(path, query: query);
      }
    }
    throw ApiException(0,
        'The network is unavailable. Please retry when a connection is restored. ($lastError)');
  }

  Future<http.Response> download(String path,
      {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final response =
        await _withAuthRecovery(() => _send(http.get(uri, headers: _headers)));
    if (response.statusCode >= 400) {
      _decode(response, notifyUnauthorized: false);
    }
    return response;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body,
      {String? idempotencyKey,
      bool notifyUnauthorized = true,
      bool allowQueue = false}) async {
    Future<http.Response> send() => _send(http.post(Uri.parse('$baseUrl$path'),
        headers: {
          ..._headers,
          if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
        },
        body: jsonEncode(body)));
    late final http.Response response;
    try {
      response =
          await _withAuthRecovery(send, allowRecovery: notifyUnauthorized);
    } on ApiException catch (exception) {
      if (idempotencyKey == null || exception.statusCode != 0) rethrow;
      try {
        await Future<void>.delayed(const Duration(milliseconds: 250));
        response =
            await _withAuthRecovery(send, allowRecovery: notifyUnauthorized);
      } on ApiException catch (retryException) {
        if (allowQueue && retryException.statusCode == 0) {
          return _queueMutation('POST', path, body, idempotencyKey);
        }
        rethrow;
      }
    }
    return _decode(response, notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> requestDelete(
      String path, Map<String, dynamic> body,
      {String? idempotencyKey, bool allowQueue = false}) async {
    Future<http.Response> send() =>
        _send(http.delete(Uri.parse('$baseUrl$path'),
            headers: {
              ..._headers,
              if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
            },
            body: jsonEncode(body)));
    late final http.Response response;
    try {
      response = await _withAuthRecovery(send);
    } on ApiException catch (exception) {
      if (idempotencyKey == null || exception.statusCode != 0) rethrow;
      try {
        await Future<void>.delayed(const Duration(milliseconds: 250));
        response = await _withAuthRecovery(send);
      } on ApiException catch (retryException) {
        if (allowQueue && retryException.statusCode == 0) {
          return _queueMutation('DELETE', path, body, idempotencyKey);
        }
        rethrow;
      }
    }
    return _decode(response, notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> requestPut(
      String path, Map<String, dynamic> body,
      {String? idempotencyKey}) async {
    Future<http.Response> send() => _send(http.put(Uri.parse('$baseUrl$path'),
        headers: {
          ..._headers,
          if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
        },
        body: jsonEncode(body)));
    late final http.Response response;
    try {
      response = await _withAuthRecovery(send);
    } on ApiException catch (exception) {
      if (idempotencyKey == null || exception.statusCode != 0) rethrow;
      await Future<void>.delayed(const Duration(milliseconds: 250));
      response = await _withAuthRecovery(send);
    }
    return _decode(response, notifyUnauthorized: false);
  }

  Future<Map<String, dynamic>> requestPatch(
      String path, Map<String, dynamic> body,
      {String? idempotencyKey, bool queueIfOffline = false}) async {
    Future<http.Response> send() => _send(http.patch(Uri.parse('$baseUrl$path'),
        headers: {
          ..._headers,
          if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey
        },
        body: jsonEncode(body)));
    late final http.Response response;
    try {
      response = await _withAuthRecovery(send);
    } on ApiException catch (exception) {
      if (idempotencyKey == null || exception.statusCode != 0) rethrow;
      try {
        await Future<void>.delayed(const Duration(milliseconds: 250));
        response = await _withAuthRecovery(send);
      } on ApiException catch (retryException) {
        if (queueIfOffline && retryException.statusCode == 0) {
          return _queueMutation('PATCH', path, body, idempotencyKey);
        }
        rethrow;
      }
    }
    return _decode(response, notifyUnauthorized: false);
  }

  Future<http.Response> _send(Future<http.Response> operation) async {
    try {
      final response = await operation.timeout(const Duration(seconds: 20));
      onConnectivityChanged?.call(true);
      return response;
    } on TimeoutException {
      onConnectivityChanged?.call(false);
      throw const ApiException(0,
          'The request timed out. Please retry when your connection is stable.');
    } on http.ClientException {
      onConnectivityChanged?.call(false);
      throw const ApiException(0,
          'The network is unavailable. Please check your connection and retry.');
    }
  }

  Future<http.Response> _sendStream(
      Future<http.StreamedResponse> operation) async {
    try {
      final response = await operation.timeout(const Duration(seconds: 20));
      onConnectivityChanged?.call(true);
      return await http.Response.fromStream(response);
    } on TimeoutException {
      onConnectivityChanged?.call(false);
      throw const ApiException(0,
          'The request timed out. Please retry when your connection is stable.');
    } on http.ClientException {
      onConnectivityChanged?.call(false);
      throw const ApiException(0,
          'The network is unavailable. Please check your connection and retry.');
    }
  }

  Future<http.Response> _withAuthRecovery(
      Future<http.Response> Function() operation,
      {bool allowRecovery = true}) async {
    var recoveryAttempted = false;
    while (true) {
      final response = await operation();
      if (!allowRecovery ||
          response.statusCode != 401 ||
          recoveryAttempted ||
          onUnauthorized == null) {
        return response;
      }
      recoveryAttempted = true;
      if (!await onUnauthorized!()) return response;
    }
  }

  Future<http.Response> _sendMultipartWithRetry(
      Future<http.Response> Function() send, String? idempotencyKey) async {
    try {
      return await _withAuthRecovery(send);
    } on ApiException catch (exception) {
      if (idempotencyKey == null || exception.statusCode != 0) rethrow;
      await Future<void>.delayed(const Duration(milliseconds: 250));
      return _withAuthRecovery(send);
    }
  }

  String _requestId() => 'mobile-${DateTime.now().microsecondsSinceEpoch}';

  Map<String, String> get _headers => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Request-ID': _requestId(),
        if (token != null) 'Authorization': 'Bearer $token'
      };

  Map<String, dynamic> _decode(http.Response response,
      {bool notifyUnauthorized = true}) {
    Map<String, dynamic> data;
    try {
      final decoded = jsonDecode(response.body);
      data = decoded is Map
          ? decoded.cast<String, dynamic>()
          : <String, dynamic>{};
    } catch (_) {
      data = <String, dynamic>{};
    }
    if (response.statusCode >= 400) {
      if (notifyUnauthorized &&
          response.statusCode == 401 &&
          onUnauthorized != null) {
        unawaited(onUnauthorized!());
      }
      final exception = ApiException(
          response.statusCode,
          data['message']?.toString() ??
              'The server returned an unreadable error response.',
          requestId: data['request_id']?.toString() ??
              response.headers['x-request-id']);
      unawaited(Telemetry.captureError(exception,
          context: 'api_error', requestId: exception.requestId));
      throw exception;
    }
    if (data.isEmpty && response.statusCode != 204) {
      throw const ApiException(
          502, 'The server returned an unreadable response.');
    }
    return data;
  }
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message, {this.requestId});
  final int statusCode;
  final String message;
  final String? requestId;

  @override
  String toString() => requestId == null || requestId!.isEmpty
      ? message
      : '$message (Reference: $requestId)';
}
