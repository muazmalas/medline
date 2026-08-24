import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../core/file_actions.dart';
import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../workspace/record_list.dart';

class MedicineCatalogPage extends StatefulWidget {
  const MedicineCatalogPage(
      {required this.session, required this.role, super.key});
  final Session session;
  final String role;

  @override
  State<MedicineCatalogPage> createState() => _MedicineCatalogPageState();
}

class _MedicineCatalogPageState extends State<MedicineCatalogPage> {
  int revision = 0;

  Future<void> openMedicine(
      BuildContext context, Map<String, dynamic> row) async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MedicineDetailMobilePage(
            session: widget.session,
            medicineId: int.parse('${row['id']}'),
            role: widget.role)));
    if (mounted) setState(() => revision++);
  }

  Future<void> addMedicine() async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MedicineFormPage(session: widget.session)));
    if (mounted) setState(() => revision++);
  }

  Future<void> importMedicines() async {
    final result = await FilePicker.platform.pickFiles(
        type: FileType.custom, allowedExtensions: const ['csv', 'xlsx']);
    final path = result?.files.single.path;
    if (path == null) return;
    try {
      final response = await widget.session.api.multipart('/medicines/import',
          files: {'file': path},
          idempotencyKey: 'mobile-medicine-import-${path.hashCode}');
      if (mounted) {
        showMessage(
            context, '${response['message'] ?? 'Medicine catalog imported.'}');
        setState(() => revision++);
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    }
  }

  PopupMenuButton<String> adminMenu(Future<void> Function() reload) =>
      PopupMenuButton<String>(
        tooltip: 'Medicine catalog actions',
        onSelected: (value) async {
          switch (value) {
            case 'add':
              await addMedicine();
            case 'categories':
              await Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      MedicineCategoriesPage(session: widget.session)));
            case 'import':
              await importMedicines();
            case 'template':
              await downloadAndShare(context, widget.session.api,
                  path: '/medicines/import-template',
                  fileName: 'medline-medicine-import-template.csv',
                  subject: 'MedLine medicine import template');
            case 'export':
              await downloadAndShare(context, widget.session.api,
                  path: '/medicines/export?include_inactive=1',
                  fileName: 'medline-medicines.csv',
                  subject: 'MedLine medicine catalog');
          }
          await reload();
        },
        itemBuilder: (_) => const [
          PopupMenuItem(
              value: 'add',
              child: ListTile(
                  leading: Icon(Icons.add_rounded),
                  title: Text('Add medicine'))),
          PopupMenuItem(
              value: 'categories',
              child: ListTile(
                  leading: Icon(Icons.category_outlined),
                  title: Text('Manage categories'))),
          PopupMenuItem(
              value: 'import',
              child: ListTile(
                  leading: Icon(Icons.upload_file_rounded),
                  title: Text('Import Excel or CSV'))),
          PopupMenuItem(
              value: 'template',
              child: ListTile(
                  leading: Icon(Icons.description_outlined),
                  title: Text('Download template'))),
          PopupMenuItem(
              value: 'export',
              child: ListTile(
                  leading: Icon(Icons.download_rounded),
                  title: Text('Export catalog'))),
        ],
        icon: const Icon(Icons.more_vert_rounded),
      );

  @override
  Widget build(BuildContext context) {
    final admin = widget.role == 'admin';
    return MobileRecordListPage(
      key: ValueKey('medicine-catalog-$revision'),
      session: widget.session,
      config: RecordListConfig(
        title: 'Medicine catalog',
        subtitle: admin
            ? 'Search, review, create, edit, import, and control every medicine record.'
            : 'Search the active catalog and open a medicine for complete safety information.',
        endpoint: '/medicines',
        extraQuery: {if (admin) 'include_inactive': '1'},
        primary: (row) => '${row['name_en'] ?? 'Medicine'}',
        secondary: (row) => [
          row['name_ar'],
          row['manufacturer'],
          row['form'],
          row['dosage']
        ]
            .where((value) => value != null && '$value'.trim().isNotEmpty)
            .join(' · '),
        tertiary: (row) => '${row['code'] ?? 'No catalog code'}',
        status: (row) =>
            row['is_active'] == false || '${row['is_active']}' == '0'
                ? 'inactive'
                : 'active',
        amount: (row) =>
            row['unit_price'] == null ? '' : money(row['unit_price']),
        date: (row) => dateTimeLabel(row['created_at']),
        statusOptions: admin
            ? const {'active': 'Active', 'inactive': 'Inactive'}
            : const {},
        sortOptions: const {
          'A–Z': 'name_en',
          'Newest': 'created_at',
          'Prescription first': 'prescription_required'
        },
        initialSort: 'name_en',
        initialDirection: 'asc',
        icon: Icons.medication_outlined,
        onOpen: openMedicine,
        headerAction: admin ? (_, reload) => adminMenu(reload) : null,
      ),
    );
  }
}

class MedicineDetailMobilePage extends StatefulWidget {
  const MedicineDetailMobilePage(
      {required this.session,
      required this.medicineId,
      required this.role,
      super.key});
  final Session session;
  final int medicineId;
  final String role;

  @override
  State<MedicineDetailMobilePage> createState() =>
      _MedicineDetailMobilePageState();
}

class _MedicineDetailMobilePageState extends State<MedicineDetailMobilePage> {
  Map<String, dynamic>? medicine;
  bool loading = true;
  bool working = false;
  String? error;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final response =
          await widget.session.api.get('/medicines/${widget.medicineId}');
      if (mounted) setState(() => medicine = mapData(response['medicine']));
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> addToCart() async {
    if (working) return;
    setState(() => working = true);
    try {
      final cart = await widget.session.api.cart();
      final matches = listData(cart, key: 'items')
          .where((item) => '${item['medicine_id']}' == '${widget.medicineId}')
          .toList();
      final existing = matches.isEmpty ? null : matches.first;
      final quantity = int.tryParse('${existing?['quantity'] ?? 0}') ?? 0;
      await widget.session.api.updateCartItem(widget.medicineId, quantity + 1);
      if (mounted) showMessage(context, 'Medicine added to your order cart.');
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> toggleStatus() async {
    final current =
        medicine?['is_active'] != false && '${medicine?['is_active']}' != '0';
    final confirmed = await confirmAction(
      context,
      title: current ? 'Deactivate medicine?' : 'Activate medicine?',
      message: current
          ? 'This removes the medicine from every new pharmacy and warehouse ordering workflow. Historical records remain unchanged.'
          : 'This makes the medicine available to inventory and ordering workflows again.',
      confirmLabel: current ? 'Deactivate' : 'Activate',
      destructive: current,
    );
    if (!confirmed) return;
    setState(() => working = true);
    try {
      await widget.session.api.requestPatch(
          '/medicines/${widget.medicineId}/status', {'is_active': !current},
          idempotencyKey:
              'mobile-medicine-status-${widget.medicineId}-${current ? 'off' : 'on'}');
      await load();
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> edit() async {
    final current = medicine;
    if (current == null) return;
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) =>
            MedicineFormPage(session: widget.session, medicine: current)));
    await load();
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (error != null || medicine == null) {
      return Scaffold(
          appBar: AppBar(),
          body: MedLineErrorState(
              message: error ?? 'Medicine could not be loaded.',
              onRetry: load));
    }
    final record = medicine!;
    final availableAt = listData(record, key: 'available_at');
    final imageUrl = record['image_url']?.toString();
    final active =
        record['is_active'] != false && '${record['is_active']}' != '0';
    final safety = <(String, dynamic, IconData)>[
      ('Description', record['description'], Icons.description_outlined),
      ('Indications', record['indications'], Icons.fact_check_outlined),
      ('Directions', record['directions'], Icons.format_list_numbered_rounded),
      ('Side effects', record['side_effects'], Icons.sick_outlined),
      ('Warnings', record['warnings'], Icons.warning_amber_rounded),
      ('Contraindications', record['contraindications'], Icons.block_outlined),
      ('Drug interactions', record['drug_interactions'], Icons.hub_outlined),
      (
        'Storage instructions',
        record['storage_instructions'],
        Icons.thermostat_outlined
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Medicine details'),
        actions: widget.role == 'admin'
            ? [
                IconButton(
                    onPressed: working ? null : edit,
                    icon: const Icon(Icons.edit_outlined),
                    tooltip: 'Edit medicine')
              ]
            : null,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          if (imageUrl != null && imageUrl.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: Image.network(imageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const ColoredBox(
                        color: MedLineColors.paleBlue,
                        child: Icon(Icons.medication_outlined,
                            size: 64, color: MedLineColors.blue))),
              ),
            )
          else
            const SizedBox(
                height: 180,
                child: Card(
                    child: Center(
                        child: Icon(Icons.medication_outlined,
                            size: 72, color: MedLineColors.blue)))),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('${record['name_en'] ?? 'Medicine'}',
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: MedLineColors.text)),
                    if ('${record['name_ar'] ?? ''}'.trim().isNotEmpty)
                      Text('${record['name_ar']}',
                          style: const TextStyle(
                              color: MedLineColors.muted, fontSize: 16))
                  ])),
              const SizedBox(width: 12),
              StatusPill(active ? 'active' : 'inactive'),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(spacing: 8, runSpacing: 8, children: [
            _MetadataChip(Icons.science_outlined,
                '${record['active_ingredient'] ?? 'Ingredient not recorded'}'),
            _MetadataChip(Icons.medication_liquid_outlined,
                '${record['form'] ?? 'Form not recorded'}'),
            _MetadataChip(Icons.straighten_outlined,
                '${record['dosage'] ?? 'Dosage not recorded'}'),
            _MetadataChip(Icons.inventory_2_outlined,
                '${record['pack_size'] ?? 'Pack not recorded'}'),
            _MetadataChip(Icons.route_outlined,
                '${record['administration_route'] ?? 'Route not recorded'}'),
            _MetadataChip(
                record['prescription_required'] == true
                    ? Icons.receipt_long_rounded
                    : Icons.health_and_safety_outlined,
                record['prescription_required'] == true
                    ? 'Prescription required'
                    : 'No prescription required'),
          ]),
          const SizedBox(height: 18),
          ...safety
              .where((entry) =>
                  entry.$2 != null && '${entry.$2}'.trim().isNotEmpty)
              .map((entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: MedLineSection(
                      title: entry.$1,
                      trailing: Icon(entry.$3,
                          color: entry.$1 == 'Warnings' ||
                                  entry.$1 == 'Side effects'
                              ? MedLineColors.warning
                              : MedLineColors.blue),
                      child: Text('${entry.$2}',
                          style: const TextStyle(
                              height: 1.5, color: MedLineColors.text)),
                    ),
                  )),
          if (availableAt.isNotEmpty) ...[
            const SizedBox(height: 4),
            MedLineSection(
              title: 'Available pharmacies',
              subtitle:
                  'Current availability and price are confirmed again when an order is submitted.',
              child: Column(
                children: availableAt
                    .map(
                      (row) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.local_pharmacy_outlined),
                        title: Text('${row['business_name'] ?? 'Pharmacy'}'),
                        subtitle: Text(
                            '${row['address'] ?? ''} · ${row['available_quantity'] ?? 0} available'),
                        trailing: Text(
                          money(row['unit_price']),
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: MedLineColors.blue),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
          const SizedBox(height: 18),
          if (widget.role == 'patient')
            AsyncActionButton(
                label: 'Add to order cart',
                onPressed: addToCart,
                busy: working,
                icon: Icons.add_shopping_cart_rounded),
          if (widget.role == 'admin')
            Row(children: [
              Expanded(
                  child: AsyncActionButton(
                      label: 'Edit medicine',
                      onPressed: edit,
                      busy: working,
                      icon: Icons.edit_outlined,
                      outlined: true)),
              const SizedBox(width: 10),
              Expanded(
                  child: AsyncActionButton(
                      label: active ? 'Deactivate' : 'Activate',
                      onPressed: toggleStatus,
                      busy: working,
                      icon: Icons.power_settings_new_rounded,
                      destructive: active)),
            ]),
        ],
      ),
    );
  }
}

class _MetadataChip extends StatelessWidget {
  const _MetadataChip(this.icon, this.label);
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
        decoration: BoxDecoration(
            color: MedLineColors.paleBlue,
            borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 17, color: MedLineColors.blue),
          const SizedBox(width: 7),
          Flexible(
              child: Text(label,
                  style: const TextStyle(
                      color: MedLineColors.text,
                      fontWeight: FontWeight.w600,
                      fontSize: 12)))
        ]),
      );
}

class MedicineFormPage extends StatefulWidget {
  const MedicineFormPage({required this.session, this.medicine, super.key});
  final Session session;
  final Map<String, dynamic>? medicine;

  @override
  State<MedicineFormPage> createState() => _MedicineFormPageState();
}

class _MedicineFormPageState extends State<MedicineFormPage> {
  final controllers = <String, TextEditingController>{};
  List<Map<String, dynamic>> categories = [];
  int? categoryId;
  bool prescriptionRequired = false;
  bool active = true;
  bool saving = false;
  String? imagePath;
  String? error;

  static const fields = <(String, String, int)>[
    ('name_en', 'English name', 1),
    ('name_ar', 'Arabic name', 1),
    ('manufacturer', 'Manufacturer', 1),
    ('active_ingredient', 'Active ingredient', 1),
    ('form', 'Form', 1),
    ('dosage', 'Dosage', 1),
    ('pack_size', 'Pack size', 1),
    ('administration_route', 'Administration route', 1),
    ('code', 'Catalog code', 1),
    ('description', 'Description', 4),
    ('indications', 'Indications', 4),
    ('directions', 'Directions', 4),
    ('side_effects', 'Side effects', 4),
    ('warnings', 'Warnings', 4),
    ('contraindications', 'Contraindications', 4),
    ('drug_interactions', 'Drug interactions', 4),
    ('storage_instructions', 'Storage instructions', 3),
  ];

  @override
  void initState() {
    super.initState();
    for (final field in fields) {
      controllers[field.$1] =
          TextEditingController(text: '${widget.medicine?[field.$1] ?? ''}');
    }
    categoryId = int.tryParse('${widget.medicine?['category_id'] ?? ''}');
    prescriptionRequired = widget.medicine?['prescription_required'] == true;
    active = widget.medicine?['is_active'] != false;
    unawaited(loadCategories());
  }

  Future<void> loadCategories() async {
    try {
      final response = await widget.session.api
          .get('/medicine-categories', query: {'per_page': '100'});
      if (mounted) setState(() => categories = listData(response));
    } catch (_) {}
  }

  @override
  void dispose() {
    for (final controller in controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> chooseImage() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.image);
    if (result?.files.single.path != null) {
      setState(() => imagePath = result!.files.single.path);
    }
  }

  Future<void> save() async {
    if (controllers['name_en']!.text.trim().isEmpty ||
        controllers['name_ar']!.text.trim().isEmpty) {
      setState(() => error = 'English and Arabic names are required.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    final values = <String, String>{
      for (final field in fields) field.$1: controllers[field.$1]!.text.trim(),
      if (categoryId != null) 'category_id': '$categoryId',
      'prescription_required': prescriptionRequired ? '1' : '0',
      'is_active': active ? '1' : '0',
    };
    values.removeWhere(
        (key, value) => value.isEmpty && !['name_en', 'name_ar'].contains(key));
    try {
      final id = widget.medicine?['id'];
      await widget.session.api.multipart(
        id == null ? '/medicines' : '/medicines/$id',
        method: id == null ? 'POST' : 'PATCH',
        fields: values,
        files: {if (imagePath != null) 'image': imagePath!},
        idempotencyKey:
            'mobile-medicine-${id ?? 'new'}-${DateTime.now().microsecondsSinceEpoch}',
      );
      if (mounted) Navigator.pop(context, true);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            title: Text(
                widget.medicine == null ? 'Add medicine' : 'Edit medicine')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const PageIntro(
                title: 'Medicine record',
                subtitle:
                    'Record product identity, dosing, safety, storage, and prescription controls. Empty optional sections remain hidden from patients.'),
            const SizedBox(height: 18),
            ...fields.map((field) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextField(
                      controller: controllers[field.$1],
                      minLines: field.$3,
                      maxLines: field.$3,
                      textDirection:
                          field.$1 == 'name_ar' ? TextDirection.rtl : null,
                      decoration: InputDecoration(
                          labelText: field.$2,
                          alignLabelWithHint: field.$3 > 1)),
                )),
            DropdownButtonFormField<int?>(
              initialValue: categoryId,
              decoration: const InputDecoration(labelText: 'Category'),
              items: [
                const DropdownMenuItem<int?>(
                    value: null, child: Text('No category')),
                ...categories.map((category) => DropdownMenuItem<int?>(
                    value: int.tryParse('${category['id']}'),
                    child: Text('${category['name_en']}')))
              ],
              onChanged: (value) => setState(() => categoryId = value),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Prescription required'),
                subtitle:
                    const Text('Patients must attach item-specific evidence.'),
                value: prescriptionRequired,
                onChanged: (value) =>
                    setState(() => prescriptionRequired = value)),
            SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active medicine'),
                subtitle: const Text(
                    'Inactive medicines cannot be added to new inventory or orders.'),
                value: active,
                onChanged: (value) => setState(() => active = value)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
                onPressed: chooseImage,
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: Text(imagePath == null
                    ? 'Choose medicine image'
                    : imagePath!.split(RegExp(r'[\\/]')).last)),
            if (error != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(error!,
                      style: const TextStyle(color: MedLineColors.danger))),
            const SizedBox(height: 18),
            AsyncActionButton(
                label: widget.medicine == null
                    ? 'Create medicine'
                    : 'Save changes',
                onPressed: save,
                busy: saving,
                icon: Icons.save_outlined),
          ],
        ),
      );
}

class MedicineCategoriesPage extends StatefulWidget {
  const MedicineCategoriesPage({required this.session, super.key});
  final Session session;

  @override
  State<MedicineCategoriesPage> createState() => _MedicineCategoriesPageState();
}

class _MedicineCategoriesPageState extends State<MedicineCategoriesPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final response = await widget.session.api
          .get('/medicine-categories', query: {'per_page': '100'});
      if (mounted) setState(() => rows = listData(response));
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> edit([Map<String, dynamic>? row]) async {
    final english = TextEditingController(text: '${row?['name_en'] ?? ''}');
    final arabic = TextEditingController(text: '${row?['name_ar'] ?? ''}');
    final slug = TextEditingController(text: '${row?['slug'] ?? ''}');
    final save = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(row == null ? 'Add category' : 'Edit category'),
                content: SingleChildScrollView(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  TextField(
                      controller: english,
                      decoration:
                          const InputDecoration(labelText: 'English name')),
                  const SizedBox(height: 12),
                  TextField(
                      controller: arabic,
                      textDirection: TextDirection.rtl,
                      decoration:
                          const InputDecoration(labelText: 'Arabic name')),
                  const SizedBox(height: 12),
                  TextField(
                      controller: slug,
                      decoration: const InputDecoration(labelText: 'Slug'))
                ])),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Save'))
                ]));
    if (save == true &&
        english.text.trim().isNotEmpty &&
        arabic.text.trim().isNotEmpty) {
      try {
        final payload = {
          'name_en': english.text.trim(),
          'name_ar': arabic.text.trim(),
          'slug': slug.text.trim()
        };
        if (row == null) {
          await widget.session.api.post('/medicine-categories', payload,
              idempotencyKey:
                  'mobile-category-${DateTime.now().microsecondsSinceEpoch}');
        } else {
          await widget.session.api.requestPatch(
              '/medicine-categories/${row['id']}', payload,
              idempotencyKey: 'mobile-category-${row['id']}');
        }
        await load();
      } catch (exception) {
        if (mounted) showMessage(context, exception.toString(), error: true);
      }
    }
    english.dispose();
    arabic.dispose();
    slug.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Medicine categories')),
        floatingActionButton: FloatingActionButton.extended(
            onPressed: () => edit(),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Add category')),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? MedLineErrorState(message: error!, onRetry: load)
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                    itemCount: rows.length + 1,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return const PageIntro(
                            title: 'Medicine categories',
                            subtitle:
                                'Maintain bilingual catalog taxonomy. Existing references are preserved when names change.');
                      }
                      final row = rows[index - 1];
                      return Card(
                          child: ListTile(
                              onTap: () => edit(row),
                              leading: const CircleAvatar(
                                  backgroundColor: MedLineColors.paleBlue,
                                  child: Icon(Icons.category_outlined,
                                      color: MedLineColors.blue)),
                              title: Text('${row['name_en'] ?? 'Category'}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800)),
                              subtitle: Text(
                                  '${row['name_ar'] ?? ''} · ${row['slug'] ?? ''}'),
                              trailing: const Icon(Icons.edit_outlined),
                              minVerticalPadding: 14));
                    },
                  ),
      );
}
