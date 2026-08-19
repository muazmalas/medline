# MedLine Mobile Release Handoff

The Flutter client is native and Docker-free. Android and web host folders are included under `mobile/`; iOS host generation must be performed on a macOS release machine if iOS distribution is required.

## Build-time configuration

Never hard-code production credentials in Dart source. Supply the API URL at build time:

```powershell
cd mobile
flutter build apk --release --dart-define=MEDLINE_API_URL=https://api.example.com/api/v1
flutter build web --release --dart-define=MEDLINE_API_URL=https://api.example.com/api/v1
```

## Android signing handoff

1. Create a dedicated MedLine upload key in the organization’s password manager.
2. Store the keystore outside the repository and create `android/key.properties` only on the release machine.
3. Configure the release signing block in `android/app/build.gradle.kts` from environment-managed values.
4. Verify the application ID is `com.medline.app` and increment `version` in `pubspec.yaml` for every release.
5. Publish the generated AAB/APK through the organization’s controlled distribution account.

Do not commit keystores, `key.properties`, signing passwords, API secrets, or real patient data.

## Release configuration owners must provide

- Production API URL and approved CORS/origin policy.
- Android signing key and store account access.
- iOS team, bundle identifier, certificates, and provisioning profiles, if applicable.
- Notification provider credentials and privacy-policy/support URLs.
- Driver location-permission wording, Android location disclosure, stale-location freshness policy, and background-tracking policy approval if background tracking is later enabled.
- Support escalation contacts and incident response ownership.

The API exposes authenticated `POST /api/v1/devices/tokens` and `DELETE /api/v1/devices/tokens` contracts. The production push adapter must register the provider token after permission approval and revoke it on logout or provider invalidation; the server stores encrypted token material and a lookup hash.

For the included Firebase adapter, provide the four `MEDLINE_FIREBASE_*` dart-defines during the release build and configure the corresponding Firebase project for each platform. The adapter is intentionally disabled when any value is missing.

## Operational handoff

- Confirm the API health endpoint and HTTPS certificate before distributing the client.
- Confirm the encrypted offline queue is limited to profile, notification-preference, consent, and driver-availability updates; critical order, payment, prescription, upload, and delivery mutations must remain online-only.
- Confirm role accounts are approved before using partner or driver workflows.
- Confirm private prescription/payment-proof storage remains inaccessible from public hosting.
- Record the released app version and API version in the deployment log.
