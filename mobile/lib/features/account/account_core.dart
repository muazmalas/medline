import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../maps/medline_map.dart';
import '../workspace/record_list.dart';
import 'organization_pages.dart';
import 'support_pages.dart';

class AccountPage extends StatelessWidget {
  const AccountPage({
    required this.session,
    required this.role,
    required this.onLogout,
    super.key,
  });

  final Session session;
  final String role;
  final Future<void> Function() onLogout;

  void open(BuildContext context, Widget page) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    final user = session.user ?? {};
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        PageIntro(
          title: '${user['name'] ?? 'My account'}',
          subtitle: '${user['email'] ?? ''} · ${humanize(role)}',
          action: StatusPill('${user['status'] ?? 'active'}'),
        ),
        const SizedBox(height: 16),
        MedLineSection(
          title: 'Profile and security',
          child: Column(
            children: [
              _Nav(
                icon: Icons.person_outline_rounded,
                title: 'Edit profile',
                subtitle: 'Name, phone number, and preferred language',
                onTap: () => open(context, ProfileEditPage(session: session)),
              ),
              _Nav(
                icon: Icons.lock_outline_rounded,
                title: 'Change password',
                subtitle:
                    'Confirm your current password before setting a new one',
                onTap: () =>
                    open(context, PasswordChangePage(session: session)),
              ),
              if (role == 'admin')
                _Nav(
                  icon: Icons.security_outlined,
                  title: 'Two-factor authentication',
                  subtitle:
                      'Protect administrator sign-in with an authenticator app',
                  onTap: () => open(context, TwoFactorPage(session: session)),
                ),
              if (role == 'patient')
                _Nav(
                  icon: Icons.location_on_outlined,
                  title: 'Saved addresses',
                  subtitle: 'Manage labels and map pins used during checkout',
                  onTap: () => open(context, AddressesPage(session: session)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        MedLineSection(
          title: 'Preferences and support',
          child: Column(
            children: [
              _Nav(
                icon: Icons.notifications_outlined,
                title: 'Notification preferences',
                subtitle: 'Choose email, push, and in-app delivery',
                onTap: () => open(
                    context, NotificationPreferencesPage(session: session)),
              ),
              _Nav(
                icon: Icons.privacy_tip_outlined,
                title: 'Privacy and consent',
                subtitle: 'Review and revoke optional data consents',
                onTap: () => open(context, PrivacyPage(session: session)),
              ),
              _Nav(
                icon: Icons.support_agent_outlined,
                title: 'Complaints and support',
                subtitle: 'Open a case, attach evidence, and track replies',
                onTap: () => open(context, ComplaintsPage(session: session)),
              ),
            ],
          ),
        ),
        if (role == 'pharmacy' || role == 'warehouse' || role == 'driver') ...[
          const SizedBox(height: 12),
          MedLineSection(
            title: 'Organization access',
            child: Column(
              children: [
                if (role == 'pharmacy' || role == 'warehouse')
                  _Nav(
                    icon: Icons.workspace_premium_outlined,
                    title: 'Subscription',
                    subtitle:
                        'Status, start and end dates, payment proof, and correction notes',
                    onTap: () => open(context,
                        SubscriptionPage(session: session, role: role)),
                  ),
                _Nav(
                  icon: Icons.verified_user_outlined,
                  title: 'Verification documents',
                  subtitle: role == 'driver'
                      ? 'Upload and review private driver verification documents'
                      : 'Upload and review private organization documents',
                  onTap: () => open(
                      context, VerificationDocumentsPage(session: session)),
                ),
                if (role == 'pharmacy')
                  _Nav(
                    icon: Icons.schedule_outlined,
                    title: 'Working hours',
                    subtitle:
                        'Add multiple non-overlapping shifts for each day',
                    onTap: () =>
                        open(context, WorkingHoursPage(session: session)),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        OutlinedButton.icon(
          onPressed: onLogout,
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Log out'),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _Nav extends StatelessWidget {
  const _Nav(
      {required this.icon,
      required this.title,
      required this.subtitle,
      required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: const EdgeInsets.symmetric(vertical: 3),
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: MedLineColors.paleBlue,
          foregroundColor: MedLineColors.blue,
          child: Icon(icon),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
      );
}

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({required this.session, super.key});
  final Session session;
  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  int revision = 0;

  String title(Map<String, dynamic> row) {
    final data = mapData(row['data']);
    return humanize(
        '${data?['title'] ?? row['type'] ?? 'Notification'}'.split('.').last);
  }

  String message(Map<String, dynamic> row) {
    final data = mapData(row['data']);
    return '${data?['message'] ?? row['message'] ?? ''}'.replaceAll('_', ' ');
  }

  Future<void> open(BuildContext context, Map<String, dynamic> row) async {
    if (row['read_at'] == null) {
      await widget.session.api.post(
        '/notifications/${row['id']}/read',
        {},
        idempotencyKey: 'mobile-notification-${row['id']}-read',
      );
    }
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title(row),
                  style: Theme.of(sheetContext).textTheme.titleLarge),
              const SizedBox(height: 10),
              Text(message(row), style: const TextStyle(height: 1.5)),
              const SizedBox(height: 8),
              Text(dateTimeLabel(row['created_at']),
                  style: const TextStyle(color: MedLineColors.muted)),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: () async {
                  final confirmed = await confirmAction(
                    sheetContext,
                    title: 'Delete notification?',
                    message: 'This removes the notification from your history.',
                    confirmLabel: 'Delete',
                    destructive: true,
                  );
                  if (!confirmed) return;
                  await widget.session.api.requestDelete(
                    '/notifications/${row['id']}',
                    {},
                    idempotencyKey: 'mobile-notification-${row['id']}-delete',
                  );
                  if (sheetContext.mounted) Navigator.pop(sheetContext);
                },
                icon: const Icon(Icons.delete_outline_rounded),
                label: const Text('Delete notification'),
              ),
            ],
          ),
        ),
      ),
    );
    if (mounted) setState(() => revision++);
  }

  @override
  Widget build(BuildContext context) => MobileRecordListPage(
        key: ValueKey('notifications-$revision'),
        session: widget.session,
        config: RecordListConfig(
          title: 'Notifications',
          subtitle:
              'Search, filter, sort, read, and remove your notification history.',
          endpoint: '/notifications',
          primary: title,
          secondary: message,
          status: (row) => row['read_at'] == null ? 'unread' : 'read',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {'unread': 'Unread', 'read': 'Read'},
          sortOptions: const {'Newest': 'created_at', 'Oldest': 'created_at'},
          icon: Icons.notifications_outlined,
          onOpen: open,
        ),
      );
}

class ProfileEditPage extends StatefulWidget {
  const ProfileEditPage({required this.session, super.key});
  final Session session;
  @override
  State<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends State<ProfileEditPage> {
  late final TextEditingController name;
  late final TextEditingController phone;
  late String locale;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: '${widget.session.user?['name'] ?? ''}');
    phone =
        TextEditingController(text: '${widget.session.user?['phone'] ?? ''}');
    locale = '${widget.session.user?['locale'] ?? 'en'}';
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    super.dispose();
  }

  Future<void> save() async {
    setState(() => busy = true);
    try {
      final response = await widget.session.api.requestPatch(
        '/profile',
        {
          'name': name.text.trim(),
          'phone': phone.text.trim(),
          'locale': locale
        },
        idempotencyKey:
            'mobile-profile-${DateTime.now().microsecondsSinceEpoch}',
      );
      final updated = mapData(response['user']);
      if (updated != null) {
        widget.session.user = {...?widget.session.user, ...updated};
      }
      if (mounted) {
        showMessage(context, 'Profile updated.');
        Navigator.pop(context);
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Edit profile')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
                controller: name,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Full name')),
            const SizedBox(height: 12),
            TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone number')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: locale,
              decoration: const InputDecoration(labelText: 'Language'),
              items: const [
                DropdownMenuItem(value: 'en', child: Text('English')),
                DropdownMenuItem(value: 'ar', child: Text('Arabic')),
              ],
              onChanged: (value) => setState(() => locale = value ?? 'en'),
            ),
            const SizedBox(height: 18),
            AsyncActionButton(
                label: 'Save profile',
                onPressed: save,
                busy: busy,
                icon: Icons.save_outlined),
          ],
        ),
      );
}

class TwoFactorPage extends StatefulWidget {
  const TwoFactorPage({required this.session, super.key});
  final Session session;

  @override
  State<TwoFactorPage> createState() => _TwoFactorPageState();
}

class _TwoFactorPageState extends State<TwoFactorPage> {
  final code = TextEditingController();
  bool enabled = false;
  bool loading = true;
  String? secret;
  String? setupUri;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final response = await widget.session.api.twoFactorStatus();
      if (mounted) setState(() => enabled = response['enabled'] == true);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> setup() async {
    setState(() => loading = true);
    try {
      final response = await widget.session.api.twoFactorSetup(
          idempotencyKey:
              'mobile-2fa-setup-${DateTime.now().microsecondsSinceEpoch}');
      if (mounted) {
        setState(() {
          secret = '${response['secret'] ?? ''}';
          setupUri = '${response['otpauth_uri'] ?? ''}';
        });
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> confirm() async {
    if (code.text.trim().length != 6) {
      showMessage(context, 'Enter the current six-digit authenticator code.',
          error: true);
      return;
    }
    setState(() => loading = true);
    try {
      final response = await widget.session.api.confirmTwoFactor(
          code.text.trim(),
          idempotencyKey: 'mobile-2fa-confirm');
      if (mounted) {
        showMessage(context, '${response['message']}');
        setState(() {
          enabled = true;
          secret = null;
          setupUri = null;
          code.clear();
        });
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> disable() async {
    if (code.text.trim().length != 6) {
      showMessage(context, 'Enter the current six-digit authenticator code.',
          error: true);
      return;
    }
    final confirmed = await confirmAction(context,
        title: 'Disable two-factor authentication?',
        message:
            'Administrator sign-in will no longer require an authenticator code.',
        confirmLabel: 'Disable',
        destructive: true);
    if (!confirmed) return;
    setState(() => loading = true);
    try {
      final response = await widget.session.api.disableTwoFactor(
          code.text.trim(),
          idempotencyKey: 'mobile-2fa-disable');
      if (mounted) {
        showMessage(context, '${response['message']}');
        setState(() {
          enabled = false;
          code.clear();
        });
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Two-factor authentication')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            PageIntro(
                title: 'Authenticator protection',
                subtitle: enabled
                    ? 'Two-factor authentication is active for this administrator account.'
                    : 'Generate a secret, save it in an authenticator app, then confirm a current code.',
                action: StatusPill(enabled ? 'enabled' : 'disabled')),
            const SizedBox(height: 18),
            if (!enabled && secret == null)
              AsyncActionButton(
                  label: 'Generate setup secret',
                  onPressed: setup,
                  busy: loading,
                  icon: Icons.qr_code_2_rounded),
            if (secret != null) ...[
              MedLineSection(
                  title: 'Setup secret',
                  subtitle:
                      'Store this secret securely. It is shown only during setup.',
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SelectableText(secret!,
                            style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.2)),
                        if (setupUri?.isNotEmpty == true) ...[
                          const SizedBox(height: 10),
                          SelectableText(setupUri!,
                              style: const TextStyle(
                                  color: MedLineColors.muted, fontSize: 12)),
                        ]
                      ])),
              const SizedBox(height: 12),
            ],
            if (enabled || secret != null) ...[
              TextField(
                controller: code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(
                    labelText: 'Six-digit authenticator code',
                    prefixIcon: Icon(Icons.password_rounded)),
              ),
              const SizedBox(height: 12),
              AsyncActionButton(
                label: enabled
                    ? 'Disable two-factor authentication'
                    : 'Confirm and enable',
                onPressed: enabled ? disable : confirm,
                busy: loading,
                icon: enabled
                    ? Icons.security_update_warning_outlined
                    : Icons.verified_user_outlined,
                destructive: enabled,
              )
            ],
          ],
        ),
      );
}

class PasswordChangePage extends StatefulWidget {
  const PasswordChangePage({required this.session, super.key});
  final Session session;
  @override
  State<PasswordChangePage> createState() => _PasswordChangePageState();
}

class _PasswordChangePageState extends State<PasswordChangePage> {
  final current = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();
  bool busy = false;
  bool hidden = true;

  @override
  void dispose() {
    current.dispose();
    password.dispose();
    confirmation.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (password.text.length < 8 || password.text != confirmation.text) {
      showMessage(context,
          'Use at least 8 characters and make sure both new passwords match.',
          error: true);
      return;
    }
    setState(() => busy = true);
    try {
      await widget.session.api.changePassword(
        currentPassword: current.text,
        password: password.text,
        confirmation: confirmation.text,
        idempotencyKey:
            'mobile-password-${DateTime.now().microsecondsSinceEpoch}',
      );
      if (mounted) {
        showMessage(context, 'Password changed.');
        Navigator.pop(context);
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Change password')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
                controller: current,
                obscureText: hidden,
                decoration:
                    const InputDecoration(labelText: 'Current password')),
            const SizedBox(height: 12),
            TextField(
                controller: password,
                obscureText: hidden,
                decoration: const InputDecoration(labelText: 'New password')),
            const SizedBox(height: 12),
            TextField(
              controller: confirmation,
              obscureText: hidden,
              decoration: InputDecoration(
                labelText: 'Confirm new password',
                suffixIcon: IconButton(
                  onPressed: () => setState(() => hidden = !hidden),
                  icon: Icon(hidden
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined),
                ),
              ),
            ),
            const SizedBox(height: 18),
            AsyncActionButton(
                label: 'Change password',
                onPressed: save,
                busy: busy,
                icon: Icons.lock_reset_rounded),
          ],
        ),
      );
}

class AddressesPage extends StatefulWidget {
  const AddressesPage({required this.session, super.key});
  final Session session;
  @override
  State<AddressesPage> createState() => _AddressesPageState();
}

class _AddressesPageState extends State<AddressesPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final response = await widget.session.api.get('/addresses');
      if (mounted) setState(() => rows = listData(response));
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> edit([Map<String, dynamic>? value]) async {
    await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) =>
                AddressEditPage(session: widget.session, address: value)));
    await load();
  }

  Future<void> remove(Map<String, dynamic> row) async {
    final confirmed = await confirmAction(
      context,
      title: 'Delete ${row['label'] ?? 'address'}?',
      message: 'Existing order snapshots will be preserved.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    await widget.session.api.requestDelete('/addresses/${row['id']}', {},
        idempotencyKey: 'mobile-address-delete-${row['id']}');
    await load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Saved addresses'),
          actions: [
            IconButton(
                onPressed: () => edit(),
                icon: const Icon(Icons.add_rounded),
                tooltip: 'Add address')
          ],
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : rows.isEmpty
                ? MedLineEmptyState(
                    title: 'No saved addresses',
                    message:
                        'Add a home, work, or other reusable delivery pin.',
                    action: FilledButton.icon(
                        onPressed: () => edit(),
                        icon: const Icon(Icons.add_location_alt_outlined),
                        label: const Text('Add address')),
                  )
                : RefreshIndicator(
                    onRefresh: load,
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: rows.length,
                      itemBuilder: (_, index) {
                        final row = rows[index];
                        return Card(
                          child: ListTile(
                            onTap: () => edit(row),
                            leading: const Icon(Icons.location_on_outlined),
                            title: Text('${row['label'] ?? 'Address'}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                            subtitle: Text([
                              row['address_line'],
                              row['district'],
                              row['city']
                            ]
                                .where((value) =>
                                    value != null && '$value'.isNotEmpty)
                                .join(', ')),
                            trailing: IconButton(
                                onPressed: () => remove(row),
                                icon: const Icon(Icons.delete_outline_rounded,
                                    color: MedLineColors.danger)),
                          ),
                        );
                      },
                    ),
                  ),
      );
}

class AddressEditPage extends StatefulWidget {
  const AddressEditPage({required this.session, this.address, super.key});
  final Session session;
  final Map<String, dynamic>? address;
  @override
  State<AddressEditPage> createState() => _AddressEditPageState();
}

class _AddressEditPageState extends State<AddressEditPage> {
  late final TextEditingController label;
  late final TextEditingController line;
  late final TextEditingController city;
  late final TextEditingController district;
  LatLng? pin;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    label = TextEditingController(text: '${widget.address?['label'] ?? ''}');
    line =
        TextEditingController(text: '${widget.address?['address_line'] ?? ''}');
    city = TextEditingController(text: '${widget.address?['city'] ?? ''}');
    district =
        TextEditingController(text: '${widget.address?['district'] ?? ''}');
    final latitude = toCoordinate(widget.address?['latitude']);
    final longitude = toCoordinate(widget.address?['longitude']);
    if (latitude != null && longitude != null) {
      pin = LatLng(latitude, longitude);
    }
  }

  @override
  void dispose() {
    label.dispose();
    line.dispose();
    city.dispose();
    district.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (label.text.trim().isEmpty ||
        line.text.trim().isEmpty ||
        city.text.trim().isEmpty ||
        pin == null) {
      showMessage(context, 'Add a label, address, city, and map pin.',
          error: true);
      return;
    }
    setState(() => busy = true);
    try {
      final payload = {
        'label': label.text.trim(),
        'address_line': line.text.trim(),
        'city': city.text.trim(),
        'district': district.text.trim(),
        'latitude': pin!.latitude,
        'longitude': pin!.longitude,
      };
      if (widget.address == null) {
        await widget.session.api.post('/addresses', payload,
            idempotencyKey:
                'mobile-address-${DateTime.now().microsecondsSinceEpoch}');
      } else {
        await widget.session.api.requestPatch(
            '/addresses/${widget.address!['id']}', payload,
            idempotencyKey: 'mobile-address-${widget.address!['id']}');
      }
      if (mounted) Navigator.pop(context);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            title:
                Text(widget.address == null ? 'Add address' : 'Edit address')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
                controller: label,
                decoration:
                    const InputDecoration(labelText: 'Label (Home, Work…)')),
            const SizedBox(height: 12),
            TextField(
                controller: line,
                decoration: const InputDecoration(labelText: 'Address line')),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                    child: TextField(
                        controller: city,
                        decoration: const InputDecoration(labelText: 'City'))),
                const SizedBox(width: 10),
                Expanded(
                    child: TextField(
                        controller: district,
                        decoration:
                            const InputDecoration(labelText: 'District'))),
              ],
            ),
            const SizedBox(height: 12),
            MedLineMap(
              points: const [],
              selectedPoint: pin == null
                  ? null
                  : MedLineMapPoint(
                      latitude: pin!.latitude,
                      longitude: pin!.longitude,
                      label: 'Delivery pin'),
              onTap: (value) => setState(() => pin = value),
              drawRoute: false,
            ),
            const SizedBox(height: 16),
            AsyncActionButton(
                label: 'Save address',
                onPressed: save,
                busy: busy,
                icon: Icons.save_outlined),
          ],
        ),
      );
}
