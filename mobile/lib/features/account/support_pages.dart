import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../core/file_actions.dart';
import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../workspace/record_list.dart';

class NotificationPreferencesPage extends StatefulWidget {
  const NotificationPreferencesPage({required this.session, super.key});
  final Session session;
  @override
  State<NotificationPreferencesPage> createState() =>
      _NotificationPreferencesPageState();
}

class _NotificationPreferencesPageState
    extends State<NotificationPreferencesPage> {
  Map<String, bool> values = {
    'in_app_enabled': true,
    'push_enabled': true,
    'email_enabled': true,
    'sms_enabled': false,
  };
  bool loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final response =
          await widget.session.api.get('/notification-preferences');
      final source = mapData(response['preferences']) ?? response;
      if (mounted) {
        setState(() => values = values.map((key, value) =>
            MapEntry(key, source[key] is bool ? source[key] as bool : value)));
      }
    } catch (_) {
      // Defaults remain useful if preference loading is temporarily unavailable.
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> save() async {
    setState(() => loading = true);
    try {
      await widget.session.api.requestPatch('/notification-preferences', values,
          idempotencyKey: 'mobile-notification-preferences');
      if (mounted) showMessage(context, 'Notification preferences saved.');
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notification preferences')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ...values.entries.map(
              (entry) => SwitchListTile(
                value: entry.value,
                onChanged: loading
                    ? null
                    : (value) => setState(() => values[entry.key] = value),
                title: Text(humanize(entry.key.replaceAll('_enabled', '')),
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
            const SizedBox(height: 12),
            AsyncActionButton(
                label: 'Save preferences',
                onPressed: save,
                busy: loading,
                icon: Icons.save_outlined),
          ],
        ),
      );
}

class PrivacyPage extends StatefulWidget {
  const PrivacyPage({required this.session, super.key});
  final Session session;
  @override
  State<PrivacyPage> createState() => _PrivacyPageState();
}

class _PrivacyPageState extends State<PrivacyPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  String policyVersion = '1.0';

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final response = await widget.session.api.get('/privacy/consents');
      if (mounted) {
        setState(() {
          rows = listData(response);
          policyVersion = '${response['current_policy_version'] ?? '1.0'}';
        });
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> toggle(String type, bool value) async {
    setState(() => loading = true);
    try {
      if (value) {
        await widget.session.api.post(
          '/privacy/consents',
          {
            'consent_type': type,
            'policy_version': policyVersion,
            'consented': true
          },
          idempotencyKey: 'mobile-consent-$type-on',
        );
      } else {
        await widget.session.api.requestDelete('/privacy/consents/$type', {},
            idempotencyKey: 'mobile-consent-$type-off');
      }
      await load();
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    const types = ['terms_of_service', 'privacy_policy', 'marketing'];
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy and consent')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          PageIntro(
              title: 'Privacy choices',
              subtitle:
                  'Current policy version $policyVersion. Essential order and safety processing remains enabled.'),
          const SizedBox(height: 16),
          ...types.map((type) {
            final enabled = rows.any((row) => '${row['consent_type']}' == type);
            return SwitchListTile(
              value: enabled,
              onChanged: loading ? null : (value) => toggle(type, value),
              title: Text(humanize(type),
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            );
          }),
        ],
      ),
    );
  }
}

class ComplaintsPage extends StatefulWidget {
  const ComplaintsPage({required this.session, super.key});
  final Session session;
  @override
  State<ComplaintsPage> createState() => _ComplaintsPageState();
}

class _ComplaintsPageState extends State<ComplaintsPage> {
  int revision = 0;

  Future<void> create() async {
    await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => ComplaintCreatePage(session: widget.session)));
    if (mounted) setState(() => revision++);
  }

  Future<void> open(BuildContext context, Map<String, dynamic> row) async {
    final response = await widget.session.api.get('/complaints/${row['id']}');
    if (!context.mounted) return;
    final complaint = mapData(response['complaint']) ?? row;
    final attachments = listData(response['attachments']);
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
              Text('${complaint['subject']}',
                  style: Theme.of(sheetContext).textTheme.titleLarge),
              const SizedBox(height: 8),
              StatusPill('${complaint['status']}'),
              const SizedBox(height: 12),
              Text('${complaint['description'] ?? ''}',
                  style: const TextStyle(height: 1.5)),
              if (complaint['resolution'] != null) ...[
                const SizedBox(height: 12),
                Text('Resolution: ${complaint['resolution']}',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
              ...attachments.map(
                (file) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  onTap: () => downloadAndShare(
                    sheetContext,
                    widget.session.api,
                    path:
                        '/complaints/${complaint['id']}/attachments/${file['id']}/download',
                    fileName:
                        '${file['original_name'] ?? 'complaint-${file['id']}'}',
                  ),
                  leading: const Icon(Icons.attachment_rounded),
                  title: Text('${file['original_name'] ?? 'Attachment'}'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => MobileRecordListPage(
        key: ValueKey('complaints-$revision'),
        session: widget.session,
        config: RecordListConfig(
          title: 'Complaints and support',
          subtitle:
              'Create a support case, attach evidence, and track its resolution.',
          endpoint: '/complaints',
          primary: (row) => '${row['subject'] ?? 'Support case'}',
          secondary: (row) => '${row['description'] ?? ''}',
          status: (row) => '${row['status'] ?? 'open'}',
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: const {
            'open': 'Open',
            'in_review': 'In review',
            'resolved': 'Resolved',
            'rejected': 'Rejected'
          },
          icon: Icons.support_agent_outlined,
          onOpen: open,
          headerAction: (_, __) => FilledButton.icon(
              onPressed: create,
              icon: const Icon(Icons.add_rounded),
              label: const Text('New case')),
        ),
      );
}

class ComplaintCreatePage extends StatefulWidget {
  const ComplaintCreatePage({required this.session, super.key});
  final Session session;
  @override
  State<ComplaintCreatePage> createState() => _ComplaintCreatePageState();
}

class _ComplaintCreatePageState extends State<ComplaintCreatePage> {
  final subject = TextEditingController();
  final description = TextEditingController();
  String category = 'service';
  String priority = 'normal';
  String? file;
  bool busy = false;

  @override
  void dispose() {
    subject.dispose();
    description.dispose();
    super.dispose();
  }

  Future<void> pick() async {
    final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf']);
    if (result?.files.single.path != null) {
      setState(() => file = result!.files.single.path);
    }
  }

  Future<void> save() async {
    if (subject.text.trim().isEmpty || description.text.trim().length < 10) {
      showMessage(context,
          'Enter a subject and a description of at least 10 characters.',
          error: true);
      return;
    }
    setState(() => busy = true);
    try {
      await widget.session.api.createComplaint(
        {
          'category': category,
          'subject': subject.text.trim(),
          'description': description.text.trim(),
          'priority': priority
        },
        filePath: file,
        idempotencyKey:
            'mobile-complaint-${DateTime.now().microsecondsSinceEpoch}',
      );
      if (mounted) Navigator.pop(context);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('New support case')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            DropdownButtonFormField<String>(
              initialValue: category,
              decoration: const InputDecoration(labelText: 'Category'),
              items: const [
                'service',
                'order',
                'delivery',
                'payment',
                'account',
                'other'
              ]
                  .map((value) => DropdownMenuItem(
                      value: value, child: Text(humanize(value))))
                  .toList(),
              onChanged: (value) =>
                  setState(() => category = value ?? category),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: priority,
              decoration: const InputDecoration(labelText: 'Priority'),
              items: const ['low', 'normal', 'high', 'urgent']
                  .map((value) => DropdownMenuItem(
                      value: value, child: Text(humanize(value))))
                  .toList(),
              onChanged: (value) =>
                  setState(() => priority = value ?? priority),
            ),
            const SizedBox(height: 12),
            TextField(
                controller: subject,
                decoration: const InputDecoration(labelText: 'Subject')),
            const SizedBox(height: 12),
            TextField(
                controller: description,
                minLines: 5,
                maxLines: 9,
                decoration:
                    const InputDecoration(labelText: 'Describe the issue')),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: pick,
              icon: Icon(file == null
                  ? Icons.attach_file_rounded
                  : Icons.check_circle_outline_rounded),
              label: Text(file == null
                  ? 'Attach evidence (optional)'
                  : 'Evidence attached'),
            ),
            const SizedBox(height: 18),
            AsyncActionButton(
                label: 'Submit support case',
                onPressed: save,
                busy: busy,
                icon: Icons.send_outlined),
          ],
        ),
      );
}
