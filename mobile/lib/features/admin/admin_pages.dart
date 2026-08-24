import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/file_actions.dart';
import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../maps/medline_map.dart';
import '../workspace/record_list.dart';

class AdminDashboardPage extends StatefulWidget {
  const AdminDashboardPage({required this.session, super.key});
  final Session session;
  @override
  State<AdminDashboardPage> createState() => _AdminDashboardPageState();
}

class _AdminDashboardPageState extends State<AdminDashboardPage> {
  Map<String, dynamic>? data;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await widget.session.api.get('/admin/dashboard');
      if (mounted) setState(() => data = response);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading && data == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null && data == null) {
      return MedLineErrorState(message: error!, onRetry: load);
    }
    final metrics = mapData(data?['metrics']) ?? {};
    final alerts = listData(data?['alerts']);
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const PageIntro(
              title: 'Admin dashboard',
              subtitle:
                  'A mobile control center for users, organizations, orders, stock, delivery, subscriptions, and trust and safety.'),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: MediaQuery.sizeOf(context).width >= 650 ? 4 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.35,
            children: metrics.entries
                .map((entry) => _Metric(
                    label: humanize(entry.key), value: '${entry.value}'))
                .toList(),
          ),
          const SizedBox(height: 16),
          MedLineSection(
            title: 'Operational alerts',
            child: Column(
              children: alerts
                  .where((row) => (num.tryParse('${row['count']}') ?? 0) > 0)
                  .map(
                    (row) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                          '${row['severity']}' == 'critical'
                              ? Icons.error_outline_rounded
                              : Icons.warning_amber_rounded,
                          color: '${row['severity']}' == 'critical'
                              ? MedLineColors.danger
                              : MedLineColors.warning),
                      title: Text(
                          '${row['count']} ${humanize('${row['key']}')}',
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('${row['message']}'),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(value,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: MedLineColors.blue,
                        fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(label,
                    style: const TextStyle(
                        color: MedLineColors.muted,
                        fontWeight: FontWeight.w700)),
              ]),
        ),
      );
}

enum AdminRecordKind {
  users,
  pharmacies,
  warehouses,
  subscriptions,
  documents,
  complaints,
  ratings,
  audit
}

class AdminSubscriptionReviewHubPage extends StatelessWidget {
  const AdminSubscriptionReviewHubPage({required this.session, super.key});
  final Session session;

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 3,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Subscription reviews'),
            bottom: const TabBar(
              isScrollable: true,
              tabs: [
                Tab(text: 'Payments'),
                Tab(text: 'Pharmacy applications'),
                Tab(text: 'Warehouse applications'),
              ],
            ),
          ),
          body: TabBarView(
            children: [
              AdminRecordsPage(
                  session: session, kind: AdminRecordKind.subscriptions),
              AdminRecordsPage(
                  session: session, kind: AdminRecordKind.pharmacies),
              AdminRecordsPage(
                  session: session, kind: AdminRecordKind.warehouses),
            ],
          ),
        ),
      );
}

class AdminRecordsPage extends StatefulWidget {
  const AdminRecordsPage(
      {required this.session, required this.kind, super.key});
  final Session session;
  final AdminRecordKind kind;
  @override
  State<AdminRecordsPage> createState() => _AdminRecordsPageState();
}

class _AdminRecordsPageState extends State<AdminRecordsPage> {
  int revision = 0;

  Future<void> open(BuildContext context, Map<String, dynamic> row) async {
    await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => AdminRecordDetailPage(
                session: widget.session, kind: widget.kind, record: row)));
    if (mounted) setState(() => revision++);
  }

  @override
  Widget build(BuildContext context) => MobileRecordListPage(
        key: ValueKey('${widget.kind}-$revision'),
        session: widget.session,
        config: config(),
      );

  RecordListConfig config() {
    switch (widget.kind) {
      case AdminRecordKind.users:
        return RecordListConfig(
          title: 'Users',
          subtitle:
              'Search every account, review its organization, change an eligible role, or suspend access.',
          endpoint: '/admin/users',
          primary: (row) => '${row['name']}',
          secondary: (row) =>
              '${row['email']} · ${row['company_name'] ?? 'No organization'}',
          tertiary: (row) => humanize('${row['role']}'),
          status: (row) => '${row['status']}',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {'active': 'Active', 'suspended': 'Suspended'},
          sortOptions: const {'Newest': 'created_at', 'A–Z': 'name'},
          icon: Icons.people_outline_rounded,
          onOpen: open,
        );
      case AdminRecordKind.pharmacies:
      case AdminRecordKind.warehouses:
        final type = widget.kind == AdminRecordKind.pharmacies
            ? 'pharmacy'
            : 'warehouse';
        return RecordListConfig(
          title: '${humanize(type)}s',
          subtitle:
              'Review registration, subscription, location, contact, and operational access.',
          endpoint: '/admin/partners',
          extraQuery: {'type': type},
          primary: (row) => '${row['business_name']}',
          secondary: (row) =>
              '${row['license_number']} · ${row['address'] ?? ''}',
          tertiary: (row) =>
              'Subscription: ${humanize('${row['subscription_status']}')}',
          status: (row) => '${row['approval_status']}',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {
            'pending': 'Pending',
            'approved': 'Approved',
            'correction_required': 'Correction required',
            'rejected': 'Rejected',
            'suspended': 'Suspended'
          },
          sortOptions: const {'Newest': 'created_at', 'A–Z': 'business_name'},
          icon: type == 'pharmacy'
              ? Icons.local_pharmacy_outlined
              : Icons.warehouse_outlined,
          onOpen: open,
        );
      case AdminRecordKind.subscriptions:
        return RecordListConfig(
          title: 'Subscription reviews',
          subtitle:
              'Review pharmacy and warehouse payment receipts, exact amounts, dates, and correction requests.',
          endpoint: '/admin/subscriptions',
          primary: (row) =>
              '${row['business_name']} · ${humanize('${row['type']}')}',
          secondary: (row) => '${row['plan_code']} · ${money(row['amount'])}',
          tertiary: (row) => '${row['contact_name']} · ${row['contact_email']}',
          status: (row) => '${row['status']}',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {
            'payment_under_review': 'Payment under review',
            'correction_required': 'Correction required',
            'active': 'Active',
            'rejected': 'Rejected'
          },
          icon: Icons.credit_card_outlined,
          onOpen: open,
        );
      case AdminRecordKind.documents:
        return RecordListConfig(
          title: 'Verification documents',
          subtitle:
              'Review each pharmacy, warehouse, or driver document separately.',
          endpoint: '/admin/verification-documents',
          primary: (row) => '${row['name']} · ${humanize('${row['role']}')}',
          secondary: (row) =>
              '${humanize('${row['document_type']}')} · ${row['email']}',
          status: (row) => '${row['status']}',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {
            'under_review': 'Under review',
            'approved': 'Approved',
            'correction_required': 'Correction required',
            'rejected': 'Rejected'
          },
          icon: Icons.verified_user_outlined,
          onOpen: open,
        );
      case AdminRecordKind.complaints:
        return RecordListConfig(
          title: 'Complaints',
          subtitle:
              'Search support cases, record a resolution, and move cases through the current workflow.',
          endpoint: '/admin/complaints',
          primary: (row) => '${row['subject']}',
          secondary: (row) => '${row['description']}',
          tertiary: (row) =>
              '${humanize('${row['category']}')} · ${humanize('${row['priority']}')}',
          status: (row) => '${row['status']}',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {
            'open': 'Open',
            'in_review': 'In review',
            'resolved': 'Resolved',
            'rejected': 'Rejected'
          },
          icon: Icons.support_agent_outlined,
          onOpen: open,
        );
      case AdminRecordKind.ratings:
        return RecordListConfig(
          title: 'Ratings moderation',
          subtitle:
              'Review feedback and hide or restore content while retaining its audit history.',
          endpoint: '/admin/ratings',
          primary: (row) => '${row['public_id']} · ${row['score']}/5',
          secondary: (row) =>
              '${row['creator_name']}: ${row['comment'] ?? 'No comment'}',
          status: (row) => row['hidden_at'] == null ? 'visible' : 'hidden',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {'visible': 'Visible', 'hidden': 'Hidden'},
          sortOptions: const {
            'Newest': 'created_at',
            'Highest score': 'score',
            'Lowest score': 'score'
          },
          icon: Icons.star_outline_rounded,
          onOpen: open,
        );
      case AdminRecordKind.audit:
        return RecordListConfig(
          title: 'Audit log',
          subtitle:
              'Inspect immutable administrative and workflow actions and export the complete report.',
          endpoint: '/admin/audit-logs',
          primary: (row) => humanize('${row['action']}'),
          secondary: (row) =>
              '${row['actor_name'] ?? 'System'} · ${row['auditable_type'] ?? ''} ${row['auditable_id'] ?? ''}',
          tertiary: (row) => '${row['ip_address'] ?? ''}',
          status: (_) => 'recorded',
          date: (row) => dateTimeLabel(row['created_at']),
          icon: Icons.history_rounded,
          onOpen: open,
          headerAction: (context, _) => IconButton.filledTonal(
              onPressed: () => downloadAndShare(context, widget.session.api,
                  path: '/admin/audit-logs/export',
                  fileName: 'medline-audit.csv',
                  subject: 'MedLine audit export'),
              icon: const Icon(Icons.download_rounded),
              tooltip: 'Export CSV'),
        );
    }
  }
}

class AdminRecordDetailPage extends StatefulWidget {
  const AdminRecordDetailPage(
      {required this.session,
      required this.kind,
      required this.record,
      super.key});
  final Session session;
  final AdminRecordKind kind;
  final Map<String, dynamic> record;
  @override
  State<AdminRecordDetailPage> createState() => _AdminRecordDetailPageState();
}

class _AdminRecordDetailPageState extends State<AdminRecordDetailPage> {
  late Map<String, dynamic> record = {...widget.record};
  bool working = false;

  @override
  void initState() {
    super.initState();
    if ([AdminRecordKind.pharmacies, AdminRecordKind.warehouses]
        .contains(widget.kind)) {
      unawaited(loadPartner());
    }
  }

  Future<void> loadPartner() async {
    try {
      final response = await widget.session.api
          .get('/admin/partners/${widget.record['id']}');
      final detail = mapData(response['partner']);
      if (mounted && detail != null) setState(() => record = detail);
    } catch (_) {
      // The queue record remains actionable if the expanded read is unavailable.
    }
  }

  Future<String?> note(String title, {bool required = false}) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
            controller: controller,
            minLines: 3,
            maxLines: 7,
            autofocus: true,
            decoration: InputDecoration(
                labelText:
                    required ? 'Comment (required)' : 'Comment (optional)')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () {
                if (!required || controller.text.trim().length >= 5) {
                  Navigator.pop(context, controller.text.trim());
                }
              },
              child: const Text('Continue')),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> run(Future<Map<String, dynamic>> Function() action) async {
    setState(() => working = true);
    try {
      final response = await action();
      if (mounted) {
        showMessage(context, '${response['message'] ?? 'Decision saved.'}');
      }
      if (mounted) Navigator.pop(context, true);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> userStatus() async {
    final next = '${record['status']}' == 'active' ? 'suspended' : 'active';
    final reason = await note('${humanize(next)} this account?',
        required: next == 'suspended');
    if (reason == null) return;
    await run(() => widget.session.api.requestPatch(
        '/admin/users/${record['id']}/status',
        {'status': next, 'reason': reason},
        idempotencyKey: 'mobile-user-${record['id']}-$next'));
  }

  Future<void> changeRole() async {
    String role = '${record['role']}';
    final chosen = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('Assign role'),
              content: DropdownButtonFormField<String>(
                  initialValue: role,
                  items: const [
                    'patient',
                    'pharmacy',
                    'warehouse',
                    'driver',
                    'admin'
                  ]
                      .map((value) => DropdownMenuItem(
                          value: value, child: Text(humanize(value))))
                      .toList(),
                  onChanged: (value) => role = value ?? role),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, role),
                    child: const Text('Save role'))
              ],
            ));
    if (chosen == null || chosen == '${record['role']}') return;
    await run(() => widget.session.api.requestPatch(
        '/admin/users/${record['id']}/role', {'role': chosen},
        idempotencyKey: 'mobile-user-role-${record['id']}-$chosen'));
  }

  Future<void> partnerDecision(String decision) async {
    final reviewNote = decision == 'correction'
        ? await note('Request a correction', required: true)
        : decision == 'reject'
            ? await note('Reason for rejection')
            : null;
    if (decision == 'correction' && reviewNote == null) return;
    await run(() => widget.session.api.post(
        '/admin/partners/${record['id']}/decision',
        {'decision': decision, if (reviewNote != null) 'note': reviewNote},
        idempotencyKey: 'mobile-partner-${record['id']}-$decision'));
  }

  Future<void> partnerAccess() async {
    final suspended = '${record['approval_status']}' == 'suspended';
    final next = suspended ? 'active' : 'suspended';
    final reason = await note(
        suspended
            ? 'Reactivate this organization?'
            : 'Suspend this organization?',
        required: !suspended);
    if (reason == null) return;
    await run(() => widget.session.api.requestPatch(
        '/admin/users/${record['user_id']}/status',
        {'status': next, 'reason': reason},
        idempotencyKey: 'mobile-organization-access-${record['id']}-$next'));
  }

  Future<void> subscriptionDecision(String decision) async {
    final reviewNote = decision == 'correction'
        ? await note('Request a payment correction', required: true)
        : decision == 'reject'
            ? await note('Reason for rejection')
            : null;
    if (decision == 'correction' && reviewNote == null) return;
    await run(() => widget.session.api.post(
        '/admin/subscriptions/${record['id']}/decision',
        {'decision': decision, if (reviewNote != null) 'note': reviewNote},
        idempotencyKey:
            'mobile-subscription-review-${record['id']}-$decision'));
  }

  Future<void> documentDecision(String decision) async {
    final reviewNote = decision == 'approve'
        ? null
        : await note(
            decision == 'correction'
                ? 'Correction required'
                : 'Reason for rejection',
            required: decision == 'correction');
    if (decision == 'correction' && reviewNote == null) return;
    await run(() => widget.session.api.post(
        '/admin/verification-documents/${record['id']}/decision',
        {'decision': decision, if (reviewNote != null) 'note': reviewNote},
        idempotencyKey: 'mobile-document-review-${record['id']}-$decision'));
  }

  Future<void> complaintDecision(String status) async {
    final resolution = ['resolved', 'rejected'].contains(status)
        ? await note('Record the resolution', required: true)
        : null;
    if (['resolved', 'rejected'].contains(status) && resolution == null) return;
    await run(() => widget.session.api.requestPatch(
        '/complaints/${record['id']}',
        {'status': status, if (resolution != null) 'resolution': resolution},
        idempotencyKey: 'mobile-complaint-${record['id']}-$status'));
  }

  Future<void> ratingDecision(String decision) async {
    final reason = decision == 'hide'
        ? await note('Why should this rating be hidden?', required: true)
        : null;
    if (decision == 'hide' && reason == null) return;
    await run(() => widget.session.api.post(
        '/admin/ratings/${record['id']}/moderate',
        {'decision': decision, if (reason != null) 'reason': reason},
        idempotencyKey: 'mobile-rating-${record['id']}-$decision'));
  }

  @override
  Widget build(BuildContext context) {
    final entries = record.entries
        .where(
            (entry) => entry.value != null && !['metadata'].contains(entry.key))
        .toList();
    final latitude = toCoordinate(record['latitude']);
    final longitude = toCoordinate(record['longitude']);
    return Scaffold(
      appBar: AppBar(title: Text(humanize(widget.kind.name))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          PageIntro(
              title: _title(),
              subtitle: _subtitle(),
              action: StatusPill(_status())),
          const SizedBox(height: 16),
          if (latitude != null && longitude != null) ...[
            MedLineMap(points: [
              MedLineMapPoint(
                  latitude: latitude,
                  longitude: longitude,
                  label: _title(),
                  kind: '${record['type']}' == 'warehouse'
                      ? MedLineMapPointKind.warehouse
                      : MedLineMapPointKind.pharmacy)
            ], drawRoute: false, height: 260),
            const SizedBox(height: 12),
          ],
          MedLineSection(
            title: 'Record details',
            child: Column(
              children: entries
                  .map((entry) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(humanize(entry.key)),
                      subtitle: Text('${entry.value}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: MedLineColors.text))))
                  .toList(),
            ),
          ),
          const SizedBox(height: 16),
          ...actions(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  String _title() =>
      '${record['business_name'] ?? record['name'] ?? record['subject'] ?? record['public_id'] ?? humanize('${record['action']}')}';
  String _subtitle() =>
      '${record['email'] ?? record['contact_email'] ?? record['creator_name'] ?? record['auditable_type'] ?? ''}';
  String _status() =>
      '${record['status'] ?? record['approval_status'] ?? (record['hidden_at'] == null ? 'visible' : 'hidden')}';

  List<Widget> actions() {
    switch (widget.kind) {
      case AdminRecordKind.users:
        return [
          AsyncActionButton(
              label: '${record['status']}' == 'active'
                  ? 'Suspend account'
                  : 'Reactivate account',
              onPressed: userStatus,
              busy: working,
              icon: Icons.power_settings_new_rounded,
              destructive: '${record['status']}' == 'active'),
          const SizedBox(height: 8),
          OutlinedButton.icon(
              onPressed: working ? null : changeRole,
              icon: const Icon(Icons.manage_accounts_outlined),
              label: const Text('Change role')),
        ];
      case AdminRecordKind.pharmacies:
      case AdminRecordKind.warehouses:
        return [
          if ('${record['approval_status']}' == 'pending')
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton(
                  onPressed: working ? null : () => partnerDecision('approve'),
                  child: const Text('Approve')),
              FilledButton.tonal(
                  onPressed:
                      working ? null : () => partnerDecision('correction'),
                  child: const Text('Request correction')),
              OutlinedButton(
                  onPressed: working ? null : () => partnerDecision('reject'),
                  child: const Text('Reject'))
            ]),
          if (['approved', 'suspended']
                  .contains('${record['approval_status']}') &&
              record['user_id'] != null) ...[
            AsyncActionButton(
              label: '${record['approval_status']}' == 'suspended'
                  ? 'Reactivate organization access'
                  : 'Suspend organization access',
              onPressed: partnerAccess,
              busy: working,
              icon: Icons.power_settings_new_rounded,
              destructive: '${record['approval_status']}' != 'suspended',
            )
          ],
        ];
      case AdminRecordKind.subscriptions:
        return [
          if (record['payment_proof_id'] != null)
            OutlinedButton.icon(
                onPressed: () => downloadAndShare(context, widget.session.api,
                    path:
                        '/admin/payment-proofs/${record['payment_proof_id']}/download',
                    fileName: 'payment-proof-${record['payment_proof_id']}'),
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('View payment receipt')),
          const SizedBox(height: 8),
          if ('${record['status']}' == 'payment_under_review')
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton(
                  onPressed:
                      working ? null : () => subscriptionDecision('approve'),
                  child: const Text('Approve payment')),
              FilledButton.tonal(
                  onPressed:
                      working ? null : () => subscriptionDecision('correction'),
                  child: const Text('Request correction')),
              OutlinedButton(
                  onPressed:
                      working ? null : () => subscriptionDecision('reject'),
                  child: const Text('Reject'))
            ]),
        ];
      case AdminRecordKind.documents:
        return [
          OutlinedButton.icon(
              onPressed: () => downloadAndShare(context, widget.session.api,
                  path: '/verification-documents/${record['id']}/download',
                  fileName: 'verification-document-${record['id']}'),
              icon: const Icon(Icons.visibility_outlined),
              label: const Text('View document')),
          const SizedBox(height: 8),
          if ('${record['status']}' == 'under_review')
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton(
                  onPressed: working ? null : () => documentDecision('approve'),
                  child: const Text('Approve')),
              FilledButton.tonal(
                  onPressed:
                      working ? null : () => documentDecision('correction'),
                  child: const Text('Request correction')),
              OutlinedButton(
                  onPressed: working ? null : () => documentDecision('reject'),
                  child: const Text('Reject'))
            ]),
        ];
      case AdminRecordKind.complaints:
        return [
          if ('${record['status']}' == 'open')
            FilledButton(
                onPressed:
                    working ? null : () => complaintDecision('in_review'),
                child: const Text('Start review')),
          if (['open', 'in_review'].contains('${record['status']}')) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              FilledButton.tonal(
                  onPressed:
                      working ? null : () => complaintDecision('resolved'),
                  child: const Text('Resolve')),
              OutlinedButton(
                  onPressed:
                      working ? null : () => complaintDecision('rejected'),
                  child: const Text('Reject case'))
            ])
          ],
        ];
      case AdminRecordKind.ratings:
        return [
          AsyncActionButton(
              label: record['hidden_at'] == null
                  ? 'Hide rating'
                  : 'Restore rating',
              onPressed: () => ratingDecision(
                  record['hidden_at'] == null ? 'hide' : 'restore'),
              busy: working,
              icon: record['hidden_at'] == null
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
              destructive: record['hidden_at'] == null)
        ];
      case AdminRecordKind.audit:
        return [
          if (record['metadata'] != null)
            MedLineSection(
                title: 'Metadata',
                child: SelectableText('${record['metadata']}'))
        ];
    }
  }
}

class NotificationHealthPage extends StatefulWidget {
  const NotificationHealthPage({required this.session, super.key});
  final Session session;

  @override
  State<NotificationHealthPage> createState() => _NotificationHealthPageState();
}

class _NotificationHealthPageState extends State<NotificationHealthPage> {
  Map<String, dynamic>? data;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response =
          await widget.session.api.get('/admin/notification-delivery-health');
      if (mounted) setState(() => data = response);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading && data == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (error != null && data == null) {
      return Scaffold(
          appBar: AppBar(title: const Text('Notification health')),
          body: MedLineErrorState(message: error!, onRetry: load));
    }
    final totals = mapData(data?['totals']) ?? {};
    final byStatus = mapData(totals['by_status']) ?? {};
    final byChannel = mapData(totals['by_channel']) ?? {};
    final failures = listData(data?['recent_failures']);
    return Scaffold(
      appBar: AppBar(title: const Text('Notification health'), actions: [
        IconButton(
            onPressed: load,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh')
      ]),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            PageIntro(
                title: 'Delivery health · last 24 hours',
                subtitle:
                    'Monitor in-app, push, email, and SMS delivery attempts and investigate recent failures.',
                action: StatusPill(failures.isEmpty ? 'healthy' : 'attention')),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _HealthMetric('Attempts', '${totals['attempts'] ?? 0}'),
                ...byStatus.entries.map((entry) =>
                    _HealthMetric(humanize(entry.key), '${entry.value}')),
                ...byChannel.entries.map((entry) => _HealthMetric(
                    '${humanize(entry.key)} channel', '${entry.value}')),
              ],
            ),
            const SizedBox(height: 16),
            MedLineSection(
              title: 'Recent failures',
              child: failures.isEmpty
                  ? const Text(
                      'No delivery failures were recorded in this window.',
                      style: TextStyle(color: MedLineColors.muted))
                  : Column(
                      children: failures
                          .map((row) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(Icons.error_outline_rounded,
                                    color: MedLineColors.danger),
                                title: Text(
                                    humanize('${row['notification_type']}'),
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800)),
                                subtitle: Text(
                                    '${humanize('${row['channel']}')} · ${row['provider'] ?? 'provider not recorded'} · ${dateTimeLabel(row['attempted_at'])}'),
                                trailing: row['http_status'] == null
                                    ? null
                                    : Text('${row['http_status']}'),
                              ))
                          .toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HealthMetric extends StatelessWidget {
  const _HealthMetric(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 150,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: MedLineColors.blue,
                        fontWeight: FontWeight.w900)),
                Text(label, style: const TextStyle(color: MedLineColors.muted)),
              ],
            ),
          ),
        ),
      );
}

class DeliveryPricingPage extends StatefulWidget {
  const DeliveryPricingPage({required this.session, super.key});
  final Session session;
  @override
  State<DeliveryPricingPage> createState() => _DeliveryPricingPageState();
}

class _DeliveryPricingPageState extends State<DeliveryPricingPage> {
  Map<String, dynamic>? data;
  bool loading = true;
  String vehicle = 'motorcycle';
  final rate = TextEditingController();
  final reason = TextEditingController();

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    rate.dispose();
    reason.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final response = await widget.session.api.get('/admin/delivery-pricing');
      if (mounted) setState(() => data = response);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> save() async {
    final value = num.tryParse(rate.text);
    if (value == null || reason.text.trim().length < 5) {
      showMessage(
          context, 'Enter a valid rate and a reason of at least 5 characters.',
          error: true);
      return;
    }
    setState(() => loading = true);
    try {
      await widget.session.api.post(
          '/admin/delivery-pricing',
          {
            'vehicle_type': vehicle,
            'rate_per_km': value,
            'reason': reason.text.trim()
          },
          idempotencyKey:
              'mobile-delivery-pricing-$vehicle-${DateTime.now().microsecondsSinceEpoch}');
      rate.clear();
      reason.clear();
      await load();
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rates = listData(data?['rates']);
    final history = listData(data?['all_history']);
    return Scaffold(
      appBar: AppBar(title: const Text('Delivery pricing')),
      body: loading && data == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              const PageIntro(
                  title: 'Per-kilometre delivery rates',
                  subtitle:
                      'Set a rate for each vehicle type. Existing orders keep their original rate, distance, and fee snapshot.'),
              const SizedBox(height: 16),
              Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: rates
                      .map((row) => StatusPill(
                          '${humanize('${row['vehicle_type']}')}: ${money(row['rate_per_km'])} / km'))
                      .toList()),
              const SizedBox(height: 16),
              MedLineSection(
                  title: 'Record a new rate version',
                  child: Column(children: [
                    DropdownButtonFormField<String>(
                        initialValue: vehicle,
                        decoration:
                            const InputDecoration(labelText: 'Vehicle type'),
                        items: const ['bicycle', 'motorcycle', 'car', 'van']
                            .map((value) => DropdownMenuItem(
                                value: value, child: Text(humanize(value))))
                            .toList(),
                        onChanged: (value) =>
                            setState(() => vehicle = value ?? vehicle)),
                    const SizedBox(height: 12),
                    TextField(
                        controller: rate,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                            labelText: 'New rate per kilometre (SYP)')),
                    const SizedBox(height: 12),
                    TextField(
                        controller: reason,
                        minLines: 3,
                        maxLines: 5,
                        decoration: const InputDecoration(
                            labelText: 'Reason for change (required)')),
                    const SizedBox(height: 14),
                    AsyncActionButton(
                        label: 'Update delivery rate',
                        onPressed: save,
                        busy: loading,
                        icon: Icons.save_outlined),
                  ])),
              const SizedBox(height: 16),
              MedLineSection(
                  title: 'Rate audit trail',
                  child: Column(
                      children: history
                          .map((row) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                  '${humanize('${row['vehicle_type']}')} · ${money(row['rate_per_km'])} / km',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800)),
                              subtitle: Text(
                                  '${row['reason']}\n${row['changed_by_name'] ?? 'System'} · ${dateTimeLabel(row['effective_at'])}'),
                              isThreeLine: true))
                          .toList())),
              const SizedBox(height: 24),
            ]),
    );
  }
}
