import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../account/account_pages.dart';
import '../admin/admin_pages.dart';
import '../deliveries/delivery_pages.dart';
import '../inventory/inventory_pages.dart';
import '../medicine/medicine_pages.dart';
import '../orders/order_pages.dart';
import '../procurement/procurement_pages.dart';

Widget mobilePageScaffold({required String title, required Widget body}) =>
    Scaffold(appBar: AppBar(title: Text(title)), body: body);

class MobileWorkspaceShell extends StatefulWidget {
  const MobileWorkspaceShell({
    required this.session,
    required this.role,
    required this.onLogout,
    super.key,
  });

  final Session session;
  final String role;
  final Future<void> Function() onLogout;

  @override
  State<MobileWorkspaceShell> createState() => _MobileWorkspaceShellState();
}

class _Feature {
  const _Feature(this.label, this.icon, this.builder,
      {this.requiresPageShell = true});
  final String label;
  final IconData icon;
  final Widget Function() builder;
  final bool requiresPageShell;
}

class _MobileWorkspaceShellState extends State<MobileWorkspaceShell>
    with SingleTickerProviderStateMixin {
  int index = 0;
  int unread = 0;
  bool? accessActive;
  Timer? poll;
  late final AnimationController pulse;

  @override
  void initState() {
    super.initState();
    pulse = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 900),
        lowerBound: .94,
        upperBound: 1.08);
    unawaited(refreshAccess());
    unawaited(refreshUnread());
    poll = Timer.periodic(
        const Duration(seconds: 45), (_) => unawaited(refreshUnread()));
  }

  @override
  void dispose() {
    poll?.cancel();
    pulse.dispose();
    super.dispose();
  }

  Future<void> refreshAccess() async {
    if (!['pharmacy', 'warehouse'].contains(widget.role)) {
      if (mounted) setState(() => accessActive = true);
      return;
    }
    try {
      final response = await widget.session.api.get('/subscription');
      if (mounted) {
        setState(() => accessActive = response['access_active'] == true);
      }
    } catch (_) {
      if (mounted) setState(() => accessActive = false);
    }
  }

  Future<void> refreshUnread() async {
    if (!widget.session.isAuthenticated) return;
    try {
      final response = await widget.session.api
          .get('/notifications', query: {'status': 'unread', 'per_page': '1'});
      final next = int.tryParse('${response['unread_count'] ?? 0}') ?? 0;
      if (!mounted) return;
      setState(() => unread = next);
      if (next > 0 && !pulse.isAnimating) pulse.repeat(reverse: true);
      if (next == 0 && pulse.isAnimating) {
        pulse.stop();
        pulse.value = 1;
      }
    } catch (_) {
      // A stale badge is preferable to interrupting the workspace.
    }
  }

  List<_Feature> coreFeatures() {
    if (accessActive == false &&
        ['pharmacy', 'warehouse'].contains(widget.role)) {
      return [
        _Feature('Notifications', Icons.notifications_outlined,
            () => NotificationsPage(session: widget.session)),
        _Feature(
            'Account',
            Icons.person_outline_rounded,
            () => AccountPage(
                session: widget.session,
                role: widget.role,
                onLogout: widget.onLogout)),
      ];
    }
    switch (widget.role) {
      case 'patient':
        return [
          _Feature(
              'Medicines',
              Icons.medication_outlined,
              () => MedicineCatalogPage(
                  session: widget.session, role: widget.role)),
          _Feature('Orders', Icons.receipt_long_outlined,
              () => OrdersPage(session: widget.session, role: widget.role)),
          _Feature('Deliveries', Icons.local_shipping_outlined,
              () => DeliveriesPage(session: widget.session, role: widget.role)),
          _Feature('Notifications', Icons.notifications_outlined,
              () => NotificationsPage(session: widget.session)),
          _Feature(
              'Account',
              Icons.person_outline_rounded,
              () => AccountPage(
                  session: widget.session,
                  role: widget.role,
                  onLogout: widget.onLogout)),
        ];
      case 'pharmacy':
        return [
          _Feature('Orders', Icons.receipt_long_outlined,
              () => OrdersPage(session: widget.session, role: widget.role)),
          _Feature('Inventory', Icons.inventory_2_outlined,
              () => InventoryPage(session: widget.session, role: widget.role)),
          _Feature(
              'Procurement',
              Icons.shopping_cart_checkout_rounded,
              () =>
                  ProcurementPage(session: widget.session, role: widget.role)),
          _Feature('Deliveries', Icons.local_shipping_outlined,
              () => DeliveriesPage(session: widget.session, role: widget.role)),
          _Feature(
              'Account',
              Icons.person_outline_rounded,
              () => AccountPage(
                  session: widget.session,
                  role: widget.role,
                  onLogout: widget.onLogout)),
        ];
      case 'warehouse':
        return [
          _Feature('Inventory', Icons.inventory_2_outlined,
              () => InventoryPage(session: widget.session, role: widget.role)),
          _Feature(
              'Procurement',
              Icons.shopping_cart_checkout_rounded,
              () =>
                  ProcurementPage(session: widget.session, role: widget.role)),
          _Feature('Deliveries', Icons.local_shipping_outlined,
              () => DeliveriesPage(session: widget.session, role: widget.role)),
          _Feature(
              'Medicines',
              Icons.medication_outlined,
              () => MedicineCatalogPage(
                  session: widget.session, role: widget.role)),
          _Feature(
              'Account',
              Icons.person_outline_rounded,
              () => AccountPage(
                  session: widget.session,
                  role: widget.role,
                  onLogout: widget.onLogout)),
        ];
      case 'driver':
        return [
          _Feature(
              'Available jobs',
              Icons.work_outline_rounded,
              () => DeliveriesPage(
                  session: widget.session,
                  role: widget.role,
                  availableOnly: true)),
          _Feature('My deliveries', Icons.local_shipping_outlined,
              () => DeliveriesPage(session: widget.session, role: widget.role)),
          _Feature('Availability', Icons.toggle_on_outlined,
              () => DriverAvailabilityPage(session: widget.session)),
          _Feature('Notifications', Icons.notifications_outlined,
              () => NotificationsPage(session: widget.session)),
          _Feature(
              'Account',
              Icons.person_outline_rounded,
              () => AccountPage(
                  session: widget.session,
                  role: widget.role,
                  onLogout: widget.onLogout)),
        ];
      case 'admin':
        return [
          _Feature('Dashboard', Icons.dashboard_outlined,
              () => AdminDashboardPage(session: widget.session)),
          _Feature('Orders', Icons.receipt_long_outlined,
              () => OrdersPage(session: widget.session, role: widget.role)),
          _Feature('Deliveries', Icons.local_shipping_outlined,
              () => DeliveriesPage(session: widget.session, role: widget.role)),
          _Feature('Inventory', Icons.inventory_2_outlined,
              () => InventoryPage(session: widget.session, role: widget.role)),
          _Feature(
              'Account',
              Icons.person_outline_rounded,
              () => AccountPage(
                  session: widget.session,
                  role: widget.role,
                  onLogout: widget.onLogout)),
        ];
      default:
        return [
          _Feature(
              'Account',
              Icons.person_outline_rounded,
              () => AccountPage(
                  session: widget.session,
                  role: widget.role,
                  onLogout: widget.onLogout))
        ];
    }
  }

  List<_Feature> extraFeatures() {
    if (accessActive == false &&
        ['pharmacy', 'warehouse'].contains(widget.role)) {
      return [
        _Feature('Subscription review', Icons.workspace_premium_outlined,
            () => SubscriptionPage(session: widget.session, role: widget.role),
            requiresPageShell: false),
        _Feature('Verification documents', Icons.verified_user_outlined,
            () => VerificationDocumentsPage(session: widget.session),
            requiresPageShell: false),
      ];
    }
    switch (widget.role) {
      case 'patient':
        return [
          _Feature('Complaints and support', Icons.support_agent_outlined,
              () => ComplaintsPage(session: widget.session)),
        ];
      case 'pharmacy':
        return [
          _Feature(
              'Medicine catalog',
              Icons.medication_outlined,
              () => MedicineCatalogPage(
                  session: widget.session, role: widget.role)),
          _Feature('Working hours', Icons.schedule_outlined,
              () => WorkingHoursPage(session: widget.session),
              requiresPageShell: false),
          _Feature(
              'Subscription',
              Icons.workspace_premium_outlined,
              () =>
                  SubscriptionPage(session: widget.session, role: widget.role),
              requiresPageShell: false),
          _Feature('Verification documents', Icons.verified_user_outlined,
              () => VerificationDocumentsPage(session: widget.session),
              requiresPageShell: false),
          _Feature('Notifications', Icons.notifications_outlined,
              () => NotificationsPage(session: widget.session)),
          _Feature('Complaints and support', Icons.support_agent_outlined,
              () => ComplaintsPage(session: widget.session)),
        ];
      case 'warehouse':
        return [
          _Feature(
              'Subscription',
              Icons.workspace_premium_outlined,
              () =>
                  SubscriptionPage(session: widget.session, role: widget.role),
              requiresPageShell: false),
          _Feature('Verification documents', Icons.verified_user_outlined,
              () => VerificationDocumentsPage(session: widget.session),
              requiresPageShell: false),
          _Feature('Notifications', Icons.notifications_outlined,
              () => NotificationsPage(session: widget.session)),
          _Feature('Complaints and support', Icons.support_agent_outlined,
              () => ComplaintsPage(session: widget.session)),
        ];
      case 'driver':
        return [
          _Feature('Complaints and support', Icons.support_agent_outlined,
              () => ComplaintsPage(session: widget.session)),
        ];
      case 'admin':
        return [
          _Feature(
              'Medicine catalog',
              Icons.medication_outlined,
              () => MedicineCatalogPage(
                  session: widget.session, role: widget.role)),
          _Feature(
              'Procurement',
              Icons.shopping_cart_checkout_rounded,
              () =>
                  ProcurementPage(session: widget.session, role: widget.role)),
          _Feature('Subscription reviews', Icons.credit_card_outlined,
              () => AdminSubscriptionReviewHubPage(session: widget.session),
              requiresPageShell: false),
          _Feature(
              'Pharmacies',
              Icons.local_pharmacy_outlined,
              () => AdminRecordsPage(
                  session: widget.session, kind: AdminRecordKind.pharmacies)),
          _Feature(
              'Warehouses',
              Icons.warehouse_outlined,
              () => AdminRecordsPage(
                  session: widget.session, kind: AdminRecordKind.warehouses)),
          _Feature(
              'Users',
              Icons.people_outline_rounded,
              () => AdminRecordsPage(
                  session: widget.session, kind: AdminRecordKind.users)),
          _Feature(
              'Verification documents',
              Icons.verified_user_outlined,
              () => AdminRecordsPage(
                  session: widget.session, kind: AdminRecordKind.documents)),
          _Feature(
              'Complaints',
              Icons.support_agent_outlined,
              () => AdminRecordsPage(
                  session: widget.session, kind: AdminRecordKind.complaints)),
          _Feature(
              'Ratings',
              Icons.star_outline_rounded,
              () => AdminRecordsPage(
                  session: widget.session, kind: AdminRecordKind.ratings)),
          _Feature(
              'Audit log',
              Icons.history_rounded,
              () => AdminRecordsPage(
                  session: widget.session, kind: AdminRecordKind.audit)),
          _Feature('Delivery pricing', Icons.route_outlined,
              () => DeliveryPricingPage(session: widget.session),
              requiresPageShell: false),
          _Feature('Notification health', Icons.monitor_heart_outlined,
              () => NotificationHealthPage(session: widget.session),
              requiresPageShell: false),
          _Feature('Notifications', Icons.notifications_outlined,
              () => NotificationsPage(session: widget.session)),
        ];
      default:
        return const [];
    }
  }

  Future<void> openFeature(_Feature feature) async {
    Navigator.pop(context);
    final page = feature.builder();
    await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => feature.requiresPageShell
                ? mobilePageScaffold(title: feature.label, body: page)
                : page));
    unawaited(refreshUnread());
  }

  Future<void> logout() async {
    final confirmed = await confirmAction(context,
        title: 'Log out?',
        message: 'Your secure local session will be removed from this device.',
        confirmLabel: 'Log out');
    if (!confirmed) return;
    try {
      if (widget.session.isAuthenticated) {
        await widget.session.api
            .logout(refreshToken: widget.session.refreshToken);
      }
    } catch (_) {
      // Local sign-out must still succeed if the network is unavailable.
    }
    await widget.session.signOut();
    await widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    if (accessActive == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final features = coreFeatures();
    if (index >= features.length) index = 0;
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          const CircleAvatar(
              radius: 17,
              backgroundColor: MedLineColors.blue,
              foregroundColor: Colors.white,
              child: Text('M', style: TextStyle(fontWeight: FontWeight.w900))),
          const SizedBox(width: 10),
          Expanded(
              child: Text('${features[index].label} · ${humanize(widget.role)}',
                  overflow: TextOverflow.ellipsis)),
        ]),
        actions: [
          ScaleTransition(
            scale: pulse,
            child: Badge(
              isLabelVisible: unread > 0,
              label: Text(unread > 99 ? '99+' : '$unread'),
              child: IconButton(
                onPressed: () async {
                  await Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => mobilePageScaffold(
                              title: 'Notifications',
                              body:
                                  NotificationsPage(session: widget.session))));
                  await refreshUnread();
                },
                tooltip: unread > 0
                    ? '$unread unread notifications'
                    : 'Notifications',
                icon: Icon(
                    unread > 0
                        ? Icons.notifications_active_rounded
                        : Icons.notifications_none_rounded,
                    color: unread > 0 ? MedLineColors.danger : null),
              ),
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Account menu',
            onSelected: (value) async {
              if (value == 'profile') {
                setState(() => index = features.length - 1);
              }
              if (value == 'logout') await logout();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                  value: 'profile',
                  child: ListTile(
                      leading: Icon(Icons.person_outline_rounded),
                      title: Text('Profile'))),
              PopupMenuItem(
                  value: 'logout',
                  child: ListTile(
                      leading: Icon(Icons.logout_rounded),
                      title: Text('Log out'))),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: CircleAvatar(
                  radius: 18,
                  backgroundColor: MedLineColors.paleBlue,
                  foregroundColor: MedLineColors.blue,
                  child: Text(_initials(),
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w900))),
            ),
          ),
        ],
      ),
      drawer: NavigationDrawer(
        selectedIndex: index,
        onDestinationSelected: (selected) {
          Navigator.pop(context);
          setState(() => index = selected);
        },
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 14),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('MedLine',
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: MedLineColors.text)),
              Text(
                  '${widget.session.user?['name'] ?? ''}\n${humanize(widget.role)} workspace',
                  style: const TextStyle(color: MedLineColors.muted)),
            ]),
          ),
          if (accessActive == false)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Card(
                  color: Color(0xfffff4dd),
                  child: Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                          'Operational access is limited until registration and subscription review are active.'))),
            ),
          ...features.map((feature) => NavigationDrawerDestination(
              icon: Icon(feature.icon),
              selectedIcon: Icon(feature.icon, color: MedLineColors.blue),
              label: Text(feature.label))),
          if (extraFeatures().isNotEmpty)
            const Padding(
                padding: EdgeInsets.fromLTRB(24, 18, 24, 8),
                child: Text('MORE',
                    style: TextStyle(
                        fontSize: 11,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w800,
                        color: MedLineColors.muted))),
          ...extraFeatures().map((feature) => ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 24),
              leading: Icon(feature.icon),
              title: Text(feature.label),
              onTap: () => openFeature(feature))),
          const Divider(),
          ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 24),
              leading: const Icon(Icons.logout_rounded),
              title: const Text('Log out'),
              onTap: logout),
        ],
      ),
      body: Column(
        children: [
          if (accessActive == false)
            MaterialBanner(
              content: Text(
                  'Your ${widget.role} workspace is protected until organization and subscription reviews are active.'),
              leading: const Icon(Icons.lock_clock_outlined,
                  color: MedLineColors.warning),
              actions: [
                TextButton(
                    onPressed: refreshAccess, child: const Text('Check again'))
              ],
            ),
          Expanded(
              child: KeyedSubtree(
                  key: ValueKey('${widget.role}-$index'),
                  child: features[index].builder())),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (selected) => setState(() => index = selected),
        destinations: features
            .map((feature) => NavigationDestination(
                icon: Icon(feature.icon),
                selectedIcon: Icon(feature.icon),
                label: feature.label))
            .toList(),
      ),
    );
  }

  String _initials() {
    final name = '${widget.session.user?['name'] ?? widget.role}'.trim();
    final parts =
        name.split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
    return parts.take(2).map((part) => part[0].toUpperCase()).join();
  }
}
