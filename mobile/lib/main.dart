import 'dart:async';
import 'dart:ui';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:latlong2/latlong.dart';

import 'core/api_client.dart';
import 'core/mobile_ui.dart';
import 'core/push_notifications.dart';
import 'core/session.dart';
import 'core/telemetry.dart';
import 'features/maps/medline_map.dart';
import 'features/workspace/workspace_shell.dart';

void main() {
  FlutterError.onError = (details) {
    unawaited(
        Telemetry.captureError(details.exception, context: 'flutter_error'));
    FlutterError.presentError(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    unawaited(Telemetry.captureError(error, context: 'platform_error'));
    return true;
  };
  runApp(const MedLineApp());
}

final medlineLocale = ValueNotifier(const Locale('en'));

class MedLineApp extends StatelessWidget {
  const MedLineApp({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<Locale>(
        valueListenable: medlineLocale,
        builder: (context, locale, _) => MaterialApp(
          title: 'MedLine',
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('ar')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          debugShowCheckedModeBanner: false,
          theme: medLineTheme(),
          home: const RoleGate(),
        ),
      );
}

class RoleGate extends StatefulWidget {
  const RoleGate({super.key});
  @override
  State<RoleGate> createState() => _RoleGateState();
}

class _RoleGateState extends State<RoleGate> {
  final session = Session(ApiClient());
  bool restoring = true;
  String role = 'patient';
  static const roles = {
    'patient': ('Patient', Icons.person_outline_rounded),
    'pharmacy': ('Pharmacy', Icons.local_pharmacy_outlined),
    'warehouse': ('Warehouse', Icons.warehouse_outlined),
    'driver': ('Driver', Icons.local_shipping_outlined),
    'admin': ('Admin', Icons.admin_panel_settings_outlined),
  };

  @override
  void initState() {
    super.initState();
    unawaited(restore());
  }

  Future<void> restore() async {
    final restored = await session.restore();
    if (restored && mounted) {
      final restoredRole = '${session.user?['role'] ?? ''}';
      if (roles.containsKey(restoredRole)) {
        final locale = '${session.user?['locale'] ?? 'en'}';
        if (['en', 'ar'].contains(locale)) medlineLocale.value = Locale(locale);
        unawaited(PushNotificationService.register(session));
        openWorkspace(restoredRole, replace: true);
        return;
      }
    }
    if (mounted) setState(() => restoring = false);
  }

  void openWorkspace(String selectedRole, {bool replace = false}) {
    final route = MaterialPageRoute(
        builder: (_) => RoleHome(role: selectedRole, session: session));
    if (replace) {
      Navigator.of(context).pushReplacement(route);
    } else {
      Navigator.of(context).push(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (restoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      backgroundColor: MedLineColors.navy,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const CircleAvatar(
                      radius: 28,
                      backgroundColor: MedLineColors.blue,
                      foregroundColor: Colors.white,
                      child: Text('M',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 24))),
                  const SizedBox(height: 20),
                  const Text('Welcome to MedLine',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 32,
                          fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  const Text(
                      'Choose the secure workspace that matches your account.',
                      style: TextStyle(color: Color(0xffb7d2de), fontSize: 16)),
                  const SizedBox(height: 28),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: roles.entries
                        .map((entry) => ChoiceChip(
                              avatar: Icon(entry.value.$2, size: 18),
                              label: Text(entry.value.$1),
                              selected: role == entry.key,
                              onSelected: (_) =>
                                  setState(() => role = entry.key),
                            ))
                        .toList(),
                  ),
                  const SizedBox(height: 28),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) =>
                                  LoginPage(role: role, session: session))),
                      icon: const Icon(Icons.login_rounded),
                      label: const Padding(
                          padding: EdgeInsets.all(14),
                          child: Text('Continue to sign in')),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({required this.role, required this.session, super.key});
  final String role;
  final Session session;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final twoFactorCode = TextEditingController();
  bool loading = false;
  bool hidden = true;
  String? error;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    twoFactorCode.dispose();
    super.dispose();
  }

  Future<void> signIn() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await widget.session.signIn(email.text.trim(), password.text,
          twoFactorCode: twoFactorCode.text.trim());
      if ('${widget.session.user?['role']}' != widget.role) {
        await widget.session.signOut();
        throw const ApiException(
            403, 'This account is not authorized for the selected workspace.');
      }
      final locale = '${widget.session.user?['locale'] ?? 'en'}';
      if (['en', 'ar'].contains(locale)) medlineLocale.value = Locale(locale);
      unawaited(PushNotificationService.register(widget.session));
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(
              builder: (_) =>
                  RoleHome(role: widget.role, session: widget.session)),
          (_) => false,
        );
      }
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('${humanize(widget.role)} sign in')),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  PageIntro(
                      title: '${humanize(widget.role)} workspace',
                      subtitle:
                          'Sign in with an approved account assigned to this role.'),
                  const SizedBox(height: 20),
                  TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                          labelText: 'Email address',
                          prefixIcon: Icon(Icons.email_outlined))),
                  const SizedBox(height: 12),
                  TextField(
                    controller: password,
                    obscureText: hidden,
                    onSubmitted: (_) => signIn(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.lock_outline_rounded),
                      suffixIcon: IconButton(
                          onPressed: () => setState(() => hidden = !hidden),
                          icon: Icon(hidden
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined)),
                    ),
                  ),
                  if (widget.role == 'admin') ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: twoFactorCode,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      decoration: const InputDecoration(
                        labelText: 'Authenticator code',
                        helperText:
                            'Required when two-factor authentication is enabled.',
                        prefixIcon: Icon(Icons.security_rounded),
                      ),
                    ),
                  ],
                  if (error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(error!,
                            style:
                                const TextStyle(color: MedLineColors.danger))),
                  const SizedBox(height: 18),
                  AsyncActionButton(
                      label: 'Sign in',
                      onPressed: signIn,
                      busy: loading,
                      icon: Icons.login_rounded),
                  TextButton(
                      onPressed: loading
                          ? null
                          : () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) =>
                                      const PasswordRecoveryPage())),
                      child: const Text('Forgot password?')),
                  if (widget.role != 'admin')
                    TextButton(
                        onPressed: loading
                            ? null
                            : () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) =>
                                        RegistrationPage(role: widget.role))),
                        child: const Text('Create an account')),
                ],
              ),
            ),
          ),
        ),
      );
}

class PasswordRecoveryPage extends StatefulWidget {
  const PasswordRecoveryPage({super.key});
  @override
  State<PasswordRecoveryPage> createState() => _PasswordRecoveryPageState();
}

class _PasswordRecoveryPageState extends State<PasswordRecoveryPage> {
  final api = ApiClient();
  final email = TextEditingController();
  final token = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();
  bool loading = false;
  String? message;

  @override
  void dispose() {
    email.dispose();
    token.dispose();
    password.dispose();
    confirmation.dispose();
    super.dispose();
  }

  Future<void> requestToken() async {
    setState(() => loading = true);
    try {
      final response = await api.forgotPassword(email.text.trim());
      if (mounted) setState(() => message = '${response['message']}');
    } catch (exception) {
      if (mounted) setState(() => message = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> reset() async {
    setState(() => loading = true);
    try {
      final response = await api.resetPassword(
          email: email.text.trim(),
          token: token.text.trim(),
          password: password.text,
          confirmation: confirmation.text);
      if (mounted) {
        showMessage(context, '${response['message']}');
        Navigator.pop(context);
      }
    } catch (exception) {
      if (mounted) setState(() => message = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Password recovery')),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email address')),
            const SizedBox(height: 10),
            OutlinedButton(
                onPressed: loading ? null : requestToken,
                child: const Text('Send recovery instructions')),
            const Divider(height: 36),
            TextField(
                controller: token,
                maxLength: 64,
                decoration: const InputDecoration(
                    labelText: '64-character recovery token')),
            TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password')),
            const SizedBox(height: 10),
            TextField(
                controller: confirmation,
                obscureText: true,
                decoration:
                    const InputDecoration(labelText: 'Confirm password')),
            if (message != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(message!)),
            const SizedBox(height: 16),
            AsyncActionButton(
                label: 'Reset password',
                onPressed: reset,
                busy: loading,
                icon: Icons.lock_reset_rounded),
          ],
        ),
      );
}

class RegistrationPage extends StatefulWidget {
  const RegistrationPage({required this.role, super.key});
  final String role;
  @override
  State<RegistrationPage> createState() => _RegistrationPageState();
}

class _RegistrationPageState extends State<RegistrationPage> {
  final api = ApiClient();
  final name = TextEditingController();
  final email = TextEditingController();
  final phone = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();
  final businessName = TextEditingController();
  final license = TextEditingController();
  final address = TextEditingController();
  final nationalId = TextEditingController();
  final vehiclePlate = TextEditingController();
  LatLng? location;
  String vehicleType = 'motorcycle';
  String? paymentProof;
  num? exactAmount;
  bool loading = false;
  String? error;

  bool get partner => ['pharmacy', 'warehouse'].contains(widget.role);

  @override
  void initState() {
    super.initState();
    if (partner) unawaited(loadPlan());
  }

  @override
  void dispose() {
    for (final controller in [
      name,
      email,
      phone,
      password,
      confirmation,
      businessName,
      license,
      address,
      nationalId,
      vehiclePlate
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> loadPlan() async {
    try {
      final response = await api.get('/subscription-plans');
      final matches = listData(response)
          .where((row) => '${row['partner_type']}' == widget.role);
      if (matches.isNotEmpty && mounted) {
        setState(
            () => exactAmount = num.tryParse('${matches.first['amount']}'));
      }
    } catch (exception) {
      if (mounted) {
        setState(() => error =
            'Unable to load the required subscription amount: $exception');
      }
    }
  }

  Future<void> pickProof() async {
    final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf']);
    if (result?.files.single.path != null) {
      setState(() => paymentProof = result!.files.single.path);
    }
  }

  Future<void> register() async {
    if (partner &&
        (businessName.text.trim().isEmpty ||
            license.text.trim().isEmpty ||
            address.text.trim().isEmpty ||
            location == null ||
            paymentProof == null ||
            exactAmount == null)) {
      setState(() => error =
          'Complete the organization, location, exact payment, and receipt fields.');
      return;
    }
    if (widget.role == 'driver' &&
        (nationalId.text.trim().isEmpty || vehiclePlate.text.trim().isEmpty)) {
      setState(
          () => error = 'Enter the driver identity, vehicle type, and plate.');
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final fields = <String, String>{
        'name': name.text.trim(),
        'email': email.text.trim(),
        'phone': phone.text.trim(),
        'password': password.text,
        'password_confirmation': confirmation.text,
        'role': widget.role,
        if (partner) 'business_name': businessName.text.trim(),
        if (partner) 'license_number': license.text.trim(),
        if (partner) 'address': address.text.trim(),
        if (partner) 'latitude': '${location!.latitude}',
        if (partner) 'longitude': '${location!.longitude}',
        if (partner) 'payment_amount': '$exactAmount',
        if (widget.role == 'driver') 'national_id': nationalId.text.trim(),
        if (widget.role == 'driver') 'vehicle_type': vehicleType,
        if (widget.role == 'driver') 'vehicle_plate': vehiclePlate.text.trim(),
      };
      final response = await api.registerWithFiles(
          fields, {if (paymentProof != null) 'payment_proof': paymentProof!},
          idempotencyKey: 'mobile-registration-${email.text.trim()}');
      if (!mounted) return;
      await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
                  title: const Text('Registration submitted'),
                  content: Text(
                      '${response['message'] ?? 'Your registration is awaiting review.'}'),
                  actions: [
                    FilledButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Done'))
                  ]));
      if (mounted) Navigator.pop(context);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Register as ${humanize(widget.role)}')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const PageIntro(
                title: 'Create your account',
                subtitle:
                    'Patient and driver accounts have no subscription. Pharmacy and warehouse registrations include exact payment evidence for administrator review.'),
            const SizedBox(height: 18),
            TextField(
                controller: name,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Full name')),
            const SizedBox(height: 10),
            TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Email address')),
            const SizedBox(height: 10),
            TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone number')),
            if (partner) ...[
              const SizedBox(height: 18),
              Text('Organization',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),
              TextField(
                  controller: businessName,
                  decoration:
                      const InputDecoration(labelText: 'Business name')),
              const SizedBox(height: 10),
              TextField(
                  controller: license,
                  decoration:
                      const InputDecoration(labelText: 'License number')),
              const SizedBox(height: 10),
              TextField(
                  controller: address,
                  decoration:
                      const InputDecoration(labelText: 'Registered address')),
              const SizedBox(height: 10),
              MedLineMap(
                points: const [],
                selectedPoint: location == null
                    ? null
                    : MedLineMapPoint(
                        latitude: location!.latitude,
                        longitude: location!.longitude,
                        label: 'Registered location'),
                onTap: (value) => setState(() => location = value),
                drawRoute: false,
                height: 260,
              ),
              const SizedBox(height: 10),
              Card(
                color: MedLineColors.paleBlue,
                child: ListTile(
                  leading: const Icon(Icons.payments_outlined,
                      color: MedLineColors.blue),
                  title: const Text('Exact subscription amount',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(exactAmount == null
                      ? 'Loading amount…'
                      : money(exactAmount)),
                ),
              ),
              OutlinedButton.icon(
                onPressed: pickProof,
                icon: Icon(paymentProof == null
                    ? Icons.upload_file_rounded
                    : Icons.check_circle_outline_rounded),
                label: Text(paymentProof == null
                    ? 'Upload payment receipt (required)'
                    : 'Payment receipt attached'),
              ),
            ],
            if (widget.role == 'driver') ...[
              const SizedBox(height: 18),
              Text('Driver profile',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),
              TextField(
                  controller: nationalId,
                  decoration: const InputDecoration(labelText: 'National ID')),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: vehicleType,
                decoration: const InputDecoration(labelText: 'Vehicle type'),
                items: const ['bicycle', 'motorcycle', 'car', 'van']
                    .map((value) => DropdownMenuItem(
                        value: value, child: Text(humanize(value))))
                    .toList(),
                onChanged: (value) =>
                    setState(() => vehicleType = value ?? vehicleType),
              ),
              const SizedBox(height: 10),
              TextField(
                  controller: vehiclePlate,
                  decoration:
                      const InputDecoration(labelText: 'Vehicle plate')),
            ],
            const SizedBox(height: 18),
            TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password')),
            const SizedBox(height: 10),
            TextField(
                controller: confirmation,
                obscureText: true,
                decoration:
                    const InputDecoration(labelText: 'Confirm password')),
            if (error != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(error!,
                      style: const TextStyle(color: MedLineColors.danger))),
            const SizedBox(height: 18),
            AsyncActionButton(
                label: 'Submit registration',
                onPressed: register,
                busy: loading,
                icon: Icons.send_outlined),
            const SizedBox(height: 24),
          ],
        ),
      );
}

class RoleHome extends StatelessWidget {
  const RoleHome({required this.role, required this.session, super.key});
  final String role;
  final Session session;

  @override
  Widget build(BuildContext context) => MobileWorkspaceShell(
        session: session,
        role: role,
        onLogout: () async {
          if (!context.mounted) return;
          Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const RoleGate()),
              (_) => false);
        },
      );
}
