import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'api_client.dart';
import 'session.dart';

/// Optional Firebase Messaging integration. It stays disabled until the
/// release build supplies all MEDLINE_FIREBASE_* dart-defines.
class PushNotificationService {
  static String? _registeredToken;
  static Session? _session;
  static StreamSubscription<String>? _refreshSubscription;
  static Future<void>? _initializing;

  static Future<void> register(Session session) {
    _session = session;
    return _initializing ??=
        _register(session).whenComplete(() => _initializing = null);
  }

  static Future<void> revoke(Session session) async {
    final token = _registeredToken;
    _registeredToken = null;
    _session = null;
    await _refreshSubscription?.cancel();
    _refreshSubscription = null;
    if (token == null || !session.isAuthenticated) return;
    try {
      await session.api.revokeDeviceToken(token);
    } catch (_) {/* Logout still clears local auth. */}
  }

  static Future<void> _register(Session session) async {
    if (!session.isAuthenticated || !_hasConfiguration) return;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
            options: const FirebaseOptions(
          apiKey: String.fromEnvironment('MEDLINE_FIREBASE_API_KEY'),
          appId: String.fromEnvironment('MEDLINE_FIREBASE_APP_ID'),
          messagingSenderId:
              String.fromEnvironment('MEDLINE_FIREBASE_SENDER_ID'),
          projectId: String.fromEnvironment('MEDLINE_FIREBASE_PROJECT_ID'),
        ));
      }
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
          alert: true, badge: true, sound: true);
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      final token = await messaging.getToken();
      if (token != null) await _saveToken(session.api, token);
      await _refreshSubscription?.cancel();
      _refreshSubscription = messaging.onTokenRefresh.listen((nextToken) async {
        if (_session?.isAuthenticated == true) {
          await _saveToken(_session!.api, nextToken);
        }
      });
    } catch (_) {
      // Provider setup is optional until the release owner supplies Firebase
      // configuration; notification history and other channels remain usable.
    }
  }

  static Future<void> _saveToken(ApiClient api, String token) async {
    final platform = kIsWeb ? 'web' : defaultTargetPlatform.name;
    await api.registerDeviceToken(token: token, platform: platform);
    _registeredToken = token;
  }

  static bool get _hasConfiguration =>
      const String.fromEnvironment('MEDLINE_FIREBASE_API_KEY').isNotEmpty &&
      const String.fromEnvironment('MEDLINE_FIREBASE_APP_ID').isNotEmpty &&
      const String.fromEnvironment('MEDLINE_FIREBASE_SENDER_ID').isNotEmpty &&
      const String.fromEnvironment('MEDLINE_FIREBASE_PROJECT_ID').isNotEmpty;
}
