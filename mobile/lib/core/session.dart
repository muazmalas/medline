import 'api_client.dart';
import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class Session {
  Session(this.api) { api.onUnauthorized = _handleUnauthorized; }
  final ApiClient api;
  static const _tokenKey = 'medline_access_token';
  static const _refreshTokenKey = 'medline_refresh_token';
  static const _userKey = 'medline_user';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  Map<String, dynamic>? user;
  Future<bool>? _rotationInFlight;

  bool get isAuthenticated => api.token != null && user != null;
  String? refreshToken;

  Future<void> adopt(Map<String, dynamic> response) async {
    api.token = response['token']?.toString();
    refreshToken = response['refresh_token']?.toString();
    user = (response['user'] as Map?)?.cast<String, dynamic>();
    api.setCacheNamespace('${user?['id'] ?? user?['email'] ?? 'anonymous'}');
    if (api.token != null) await _storage.write(key: _tokenKey, value: api.token);
    if (refreshToken != null) await _storage.write(key: _refreshTokenKey, value: refreshToken);
    if (user != null) await _storage.write(key: _userKey, value: jsonEncode(user));
  }

  Future<bool> restore() async {
    final token = await _storage.read(key: _tokenKey);
    refreshToken = await _storage.read(key: _refreshTokenKey);
    final storedUser = await _storage.read(key: _userKey);
    if (token == null || storedUser == null) return false;
    try { api.token = token; user = (jsonDecode(storedUser) as Map).cast<String, dynamic>(); api.setCacheNamespace('${user?['id'] ?? user?['email'] ?? 'anonymous'}'); unawaited(api.flushPendingMutations()); return true; } catch (_) { await signOut(); return false; }
  }

  Future<bool> rotateAccessToken() {
    final existing = _rotationInFlight;
    if (existing != null) return existing;
    final operation = _rotateAccessToken();
    _rotationInFlight = operation.whenComplete(() { _rotationInFlight = null; });
    return _rotationInFlight!;
  }

  Future<bool> _rotateAccessToken() async {
    final current = refreshToken;
    if (current == null || current.isEmpty) return false;
    try {
      await adopt(await api.refreshToken(current));
      return true;
    } catch (_) {
      await signOut();
      return false;
    }
  }

  Future<bool> _handleUnauthorized() async {
    if (await rotateAccessToken()) return true;
    await signOut();
    return false;
  }

  Future<void> signIn(String email, String password, {String? twoFactorCode}) async {
    final response = await api.login(email, password, twoFactorCode: twoFactorCode);
    await adopt(response);
  }

  Future<void> signOut() async {
    api.token = null;
    api.onMutationQueueChanged?.call(0);
    api.setCacheNamespace('anonymous');
    refreshToken = null;
    user = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshTokenKey);
    await _storage.delete(key: _userKey);
  }
}
