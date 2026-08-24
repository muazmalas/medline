import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../core/file_actions.dart';
import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../maps/medline_map.dart';

class VerificationDocumentsPage extends StatefulWidget {
  const VerificationDocumentsPage({required this.session, super.key});
  final Session session;
  @override
  State<VerificationDocumentsPage> createState() =>
      _VerificationDocumentsPageState();
}

class _VerificationDocumentsPageState extends State<VerificationDocumentsPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final response = await widget.session.api.get('/verification-documents');
      if (mounted) setState(() => rows = listData(response));
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> upload() async {
    final type = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Document type'),
        children: [
          'license',
          'identity',
          'tax_certificate',
          'registration',
          'other'
        ]
            .map((type) => SimpleDialogOption(
                onPressed: () => Navigator.pop(context, type),
                child: Text(humanize(type))))
            .toList(),
      ),
    );
    if (type == null) return;
    final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf']);
    final path = picked?.files.single.path;
    if (path == null) return;
    setState(() => loading = true);
    try {
      await widget.session.api.uploadVerificationDocument(type, path,
          idempotencyKey:
              'mobile-document-${DateTime.now().microsecondsSinceEpoch}');
      await load();
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Verification documents'),
          actions: [
            IconButton(
                onPressed: upload,
                icon: const Icon(Icons.upload_file_rounded),
                tooltip: 'Upload document')
          ],
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : rows.isEmpty
                ? MedLineEmptyState(
                    title: 'No documents',
                    message:
                        'Upload organization evidence for administrator review.',
                    action: FilledButton.icon(
                        onPressed: upload,
                        icon: const Icon(Icons.upload_file_rounded),
                        label: const Text('Upload document')),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: rows.length,
                    itemBuilder: (_, index) {
                      final row = rows[index];
                      return Card(
                        child: ListTile(
                          onTap: () => downloadAndShare(
                            context,
                            widget.session.api,
                            path:
                                '/verification-documents/${row['id']}/download',
                            fileName:
                                '${row['document_type'] ?? 'document'}-${row['id']}',
                          ),
                          leading: const Icon(Icons.description_outlined),
                          title: Text(humanize('${row['document_type']}'),
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text(
                              '${humanize('${row['status'] ?? row['review_status'] ?? 'pending'}')} · ${dateTimeLabel(row['created_at'])}${row['review_note'] == null ? '' : '\n${row['review_note']}'}'),
                          isThreeLine: row['review_note'] != null,
                          trailing: const Icon(Icons.visibility_outlined),
                        ),
                      );
                    },
                  ),
      );
}

class SubscriptionPage extends StatefulWidget {
  const SubscriptionPage(
      {required this.session, required this.role, super.key});
  final Session session;
  final String role;
  @override
  State<SubscriptionPage> createState() => _SubscriptionPageState();
}

class _SubscriptionPageState extends State<SubscriptionPage> {
  Map<String, dynamic>? data;
  List<Map<String, dynamic>> plans = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final results = await Future.wait([
        widget.session.api.get('/subscription'),
        widget.session.api.get('/subscription/plans')
      ]);
      if (mounted) {
        setState(() {
          data = results[0];
          plans = listData(results[1]);
        });
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> proof(Map<String, dynamic> plan) async {
    final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf']);
    final path = picked?.files.single.path;
    if (path == null) return;
    setState(() => loading = true);
    try {
      await widget.session.api.uploadPaymentProof(
        num.tryParse('${plan['amount']}') ?? 0,
        path,
        planCode: '${plan['code']}',
        idempotencyKey:
            'mobile-subscription-${DateTime.now().microsecondsSinceEpoch}',
      );
      await load();
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading && data == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final partner = mapData(data?['partner']) ?? {};
    final active = mapData(data?['active_subscription']);
    final review = mapData(data?['review_subscription']);
    final subscription = review ?? active ?? mapData(data?['subscription']);
    final waiting = '${review?['status']}' == 'payment_under_review';
    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            PageIntro(
              title: '${humanize(widget.role)} subscription',
              subtitle:
                  'Organization approval: ${humanize('${partner['approval_status'] ?? 'pending'}')}',
              action: StatusPill(
                  '${data?['access_status'] ?? subscription?['status'] ?? 'inactive'}'),
            ),
            const SizedBox(height: 16),
            MedLineSection(
              title: 'Current status',
              child: Column(
                children: [
                  _Info('Plan',
                      '${subscription?['plan_code'] ?? 'Not selected'}'),
                  _Info('Status',
                      humanize('${subscription?['status'] ?? 'not active'}')),
                  _Info('Start date', dateTimeLabel(active?['starts_at'])),
                  _Info('End date', dateTimeLabel(active?['ends_at'])),
                  _Info('Amount', money(subscription?['amount'])),
                  if (subscription?['review_note'] != null)
                    _Info('Administrator note',
                        '${subscription!['review_note']}'),
                ],
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () async {
                final changed = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => OrganizationProfileCorrectionPage(
                      session: widget.session,
                      partner: partner,
                    ),
                  ),
                );
                if (changed == true) await load();
              },
              icon: const Icon(Icons.edit_location_alt_outlined),
              label: const Text('Correct organization application'),
            ),
            const SizedBox(height: 12),
            ...plans.map(
              (plan) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(humanize('${plan['code']}'),
                          style: const TextStyle(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Text(
                          '${plan['duration_months']} months · ${money(plan['amount'])}'),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: waiting ? null : () => proof(plan),
                        icon: const Icon(Icons.upload_file_rounded),
                        label: Text(
                            '${review?['status']}' == 'correction_required'
                                ? 'Upload corrected receipt'
                                : 'Submit exact payment receipt'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class OrganizationProfileCorrectionPage extends StatefulWidget {
  const OrganizationProfileCorrectionPage(
      {required this.session, required this.partner, super.key});
  final Session session;
  final Map<String, dynamic> partner;

  @override
  State<OrganizationProfileCorrectionPage> createState() =>
      _OrganizationProfileCorrectionPageState();
}

class _OrganizationProfileCorrectionPageState
    extends State<OrganizationProfileCorrectionPage> {
  late final businessName =
      TextEditingController(text: '${widget.partner['business_name'] ?? ''}');
  late final licenseNumber =
      TextEditingController(text: '${widget.partner['license_number'] ?? ''}');
  late final address =
      TextEditingController(text: '${widget.partner['address'] ?? ''}');
  late LatLng? location = _initialLocation();
  bool saving = false;

  LatLng? _initialLocation() {
    final latitude = num.tryParse('${widget.partner['latitude']}');
    final longitude = num.tryParse('${widget.partner['longitude']}');
    return latitude == null || longitude == null
        ? null
        : LatLng(latitude.toDouble(), longitude.toDouble());
  }

  @override
  void dispose() {
    businessName.dispose();
    licenseNumber.dispose();
    address.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (businessName.text.trim().isEmpty ||
        licenseNumber.text.trim().isEmpty ||
        address.text.trim().isEmpty ||
        location == null) {
      showMessage(context, 'Complete every field and pin the location.',
          error: true);
      return;
    }
    setState(() => saving = true);
    try {
      final response = await widget.session.api.requestPatch(
          '/subscription/profile',
          {
            'business_name': businessName.text.trim(),
            'license_number': licenseNumber.text.trim(),
            'address': address.text.trim(),
            'latitude': location!.latitude,
            'longitude': location!.longitude,
          },
          idempotencyKey:
              'mobile-organization-correction-${DateTime.now().microsecondsSinceEpoch}');
      if (!mounted) return;
      showMessage(context,
          '${response['message'] ?? 'Application resubmitted for review.'}');
      Navigator.pop(context, true);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Correct application')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const PageIntro(
                title: 'Organization application',
                subtitle:
                    'Correct the information requested by the administrator. Saving resubmits the application for review.'),
            const SizedBox(height: 16),
            TextField(
                controller: businessName,
                decoration: const InputDecoration(labelText: 'Business name')),
            const SizedBox(height: 10),
            TextField(
                controller: licenseNumber,
                decoration: const InputDecoration(labelText: 'License number')),
            const SizedBox(height: 10),
            TextField(
                controller: address,
                decoration:
                    const InputDecoration(labelText: 'Registered address')),
            const SizedBox(height: 12),
            MedLineMap(
              points: const [],
              selectedPoint: location == null
                  ? null
                  : MedLineMapPoint(
                      latitude: location!.latitude,
                      longitude: location!.longitude,
                      label: 'Registered location'),
              onTap: (point) => setState(() => location = point),
              drawRoute: false,
              height: 280,
            ),
            const SizedBox(height: 16),
            AsyncActionButton(
                label: 'Resubmit corrected application',
                onPressed: save,
                busy: saving,
                icon: Icons.task_alt_rounded),
            const SizedBox(height: 24),
          ],
        ),
      );
}

class _Info extends StatelessWidget {
  const _Info(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(label),
        trailing: SizedBox(
            width: 190,
            child: Text(value,
                textAlign: TextAlign.end,
                style: const TextStyle(fontWeight: FontWeight.w800))),
      );
}

class _Shift {
  _Shift({required this.day, required this.open, required this.close});
  int day;
  TimeOfDay open;
  TimeOfDay close;
}

class WorkingHoursPage extends StatefulWidget {
  const WorkingHoursPage({required this.session, super.key});
  final Session session;
  @override
  State<WorkingHoursPage> createState() => _WorkingHoursPageState();
}

class _WorkingHoursPageState extends State<WorkingHoursPage> {
  final shifts = <_Shift>[];
  bool loading = true;
  static const days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  TimeOfDay parse(dynamic value) {
    final parts = '$value'.split(':');
    return TimeOfDay(
        hour: int.tryParse(parts.first) ?? 9,
        minute: parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0);
  }

  String encode(TimeOfDay value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';

  Future<void> load() async {
    try {
      final response = await widget.session.api.get('/partner/working-hours');
      if (mounted) {
        setState(() {
          shifts
            ..clear()
            ..addAll(listData(response).map((row) => _Shift(
                day: int.parse('${row['day_of_week']}'),
                open: parse(row['opens_at']),
                close: parse(row['closes_at']))));
        });
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> edit([_Shift? shift]) async {
    var day = shift?.day ?? 0;
    var open = shift?.open ?? const TimeOfDay(hour: 9, minute: 0);
    var close = shift?.close ?? const TimeOfDay(hour: 17, minute: 0);
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title:
              Text(shift == null ? 'Add working shift' : 'Edit working shift'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                initialValue: day,
                items: List.generate(
                    7,
                    (index) => DropdownMenuItem(
                        value: index, child: Text(days[index]))),
                onChanged: (value) => setLocal(() => day = value ?? day),
              ),
              ListTile(
                onTap: () async {
                  final value =
                      await showTimePicker(context: context, initialTime: open);
                  if (value != null) setLocal(() => open = value);
                },
                title: const Text('Opens'),
                trailing: Text(open.format(context)),
              ),
              ListTile(
                onTap: () async {
                  final value = await showTimePicker(
                      context: context, initialTime: close);
                  if (value != null) setLocal(() => close = value);
                },
                title: const Text('Closes'),
                trailing: Text(close.format(context)),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel')),
            FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Save shift')),
          ],
        ),
      ),
    );
    if (saved != true) return;
    setState(() {
      if (shift == null) {
        shifts.add(_Shift(day: day, open: open, close: close));
      } else {
        shift
          ..day = day
          ..open = open
          ..close = close;
      }
      shifts.sort((a, b) => a.day == b.day
          ? (a.open.hour * 60 + a.open.minute)
              .compareTo(b.open.hour * 60 + b.open.minute)
          : a.day.compareTo(b.day));
    });
  }

  Future<void> save() async {
    setState(() => loading = true);
    try {
      await widget.session.api.requestPut(
        '/partner/working-hours',
        {
          'shifts': shifts
              .map((shift) => {
                    'day_of_week': shift.day,
                    'opens_at': encode(shift.open),
                    'closes_at': encode(shift.close)
                  })
              .toList()
        },
        idempotencyKey: 'mobile-hours-${DateTime.now().microsecondsSinceEpoch}',
      );
      if (mounted) showMessage(context, 'Working hours updated.');
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Working hours'),
          actions: [
            IconButton(
                onPressed: () => edit(),
                icon: const Icon(Icons.add_rounded),
                tooltip: 'Add shift')
          ],
        ),
        body: loading && shifts.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const PageIntro(
                      title: 'Pharmacy working hours',
                      subtitle:
                          'Add multiple shifts on the same day. Overlapping shifts are prevented.'),
                  const SizedBox(height: 16),
                  ...List.generate(
                    7,
                    (day) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: MedLineSection(
                        title: days[day],
                        child: Column(
                          children: [
                            ...shifts.where((shift) => shift.day == day).map(
                                  (shift) => ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    onTap: () => edit(shift),
                                    title: Text(
                                        '${shift.open.format(context)} – ${shift.close.format(context)}',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w800)),
                                    trailing: IconButton(
                                        onPressed: () => setState(
                                            () => shifts.remove(shift)),
                                        icon: const Icon(
                                            Icons.delete_outline_rounded,
                                            color: MedLineColors.danger)),
                                  ),
                                ),
                            if (!shifts.any((shift) => shift.day == day))
                              const Align(
                                  alignment: AlignmentDirectional.centerStart,
                                  child: Text('Closed',
                                      style: TextStyle(
                                          color: MedLineColors.muted))),
                          ],
                        ),
                      ),
                    ),
                  ),
                  AsyncActionButton(
                      label: 'Save working hours',
                      onPressed: save,
                      busy: loading,
                      icon: Icons.save_outlined),
                  const SizedBox(height: 24),
                ],
              ),
      );
}
