import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../medicine/medicine_pages.dart';
import '../workspace/record_list.dart';

class InventoryPage extends StatefulWidget {
  const InventoryPage({required this.session, required this.role, super.key});
  final Session session;
  final String role;

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  int revision = 0;

  Future<void> addOrUpdate() async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) =>
            InventoryEntryPage(session: widget.session, role: widget.role)));
    if (mounted) setState(() => revision++);
  }

  Future<void> open(BuildContext context, Map<String, dynamic> row) async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => InventoryRecordPage(
            session: widget.session, role: widget.role, record: row)));
    if (mounted) setState(() => revision++);
  }

  @override
  Widget build(BuildContext context) {
    final operational = widget.role == 'pharmacy' || widget.role == 'warehouse';
    return MobileRecordListPage(
      key: ValueKey('inventory-${widget.role}-$revision'),
      session: widget.session,
      config: RecordListConfig(
        title: 'Inventory overview',
        subtitle: widget.role == 'warehouse'
            ? 'Every restock is a separate traceable batch. Search stock, review expiry, and control pharmacy visibility.'
            : widget.role == 'pharmacy'
                ? 'Review current pharmacy stock, reserved units, pricing, and low-stock health.'
                : 'Review inventory owned by every approved pharmacy and warehouse.',
        endpoint:
            widget.role == 'admin' ? '/admin/inventory' : '/partner/inventory',
        primary: (row) => '${row['name_en'] ?? 'Medicine'}',
        secondary: (row) =>
            '${row['owner_name'] ?? humanize(row['owner_type'])} · ${row['quantity'] ?? 0} units · ${row['reserved_quantity'] ?? 0} reserved',
        tertiary: (row) => widget.role == 'warehouse'
            ? 'Batch ${row['batch_number'] ?? 'not recorded'} · Expires ${dateTimeLabel(row['expires_at'])}'
            : '${row['manufacturer'] ?? ''}',
        status: (row) => row['is_active'] == false ||
                '${row['is_active']}' == '0'
            ? 'inactive'
            : '${row['stock_health'] ?? (((num.tryParse('${row['quantity']}') ?? 0) - (num.tryParse('${row['reserved_quantity']}') ?? 0)) <= (num.tryParse('${row['low_stock_threshold']}') ?? 0) ? 'low_stock' : 'healthy')}',
        amount: (row) => money(row['unit_price']),
        date: (row) => dateTimeLabel(row['created_at']),
        statusOptions: const {
          'healthy': 'Healthy',
          'low_stock': 'Low stock',
          'expired': 'Expired',
          'inactive': 'Inactive'
        },
        sortOptions: const {
          'A–Z': 'name_en',
          'Most available': 'available_quantity',
          'Newest': 'created_at',
          'Highest price': 'unit_price'
        },
        initialSort: 'name_en',
        initialDirection: 'asc',
        icon: Icons.inventory_2_outlined,
        onOpen: open,
        headerAction: operational
            ? (_, __) => IconButton.filled(
                onPressed: addOrUpdate,
                tooltip: widget.role == 'warehouse'
                    ? 'Add warehouse batch'
                    : 'Update pharmacy stock',
                icon: const Icon(Icons.add_rounded))
            : null,
      ),
    );
  }
}

class InventoryRecordPage extends StatefulWidget {
  const InventoryRecordPage(
      {required this.session,
      required this.role,
      required this.record,
      super.key});
  final Session session;
  final String role;
  final Map<String, dynamic> record;

  @override
  State<InventoryRecordPage> createState() => _InventoryRecordPageState();
}

class _InventoryRecordPageState extends State<InventoryRecordPage> {
  bool busy = false;
  late bool active = widget.record['is_active'] != false &&
      '${widget.record['is_active']}' != '0';

  Future<void> toggle() async {
    final confirmed = await confirmAction(context,
        title: active ? 'Deactivate this batch?' : 'Activate this batch?',
        message: active
            ? 'It will be hidden from new pharmacy replenishment requests. Existing reservations remain protected.'
            : 'It will be available for new pharmacy replenishment requests.',
        confirmLabel: active ? 'Deactivate' : 'Activate',
        destructive: active);
    if (!confirmed) return;
    setState(() => busy = true);
    try {
      await widget.session.api.requestPatch(
          '/partner/inventory/${widget.record['id']}/status',
          {'is_active': !active},
          idempotencyKey:
              'mobile-inventory-status-${widget.record['id']}-${active ? 'off' : 'on'}');
      if (mounted) setState(() => active = !active);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final row = widget.record;
    final available = (num.tryParse('${row['quantity']}') ?? 0) -
        (num.tryParse('${row['reserved_quantity']}') ?? 0);
    final fields = <(String, dynamic)>[
      ('Owner', row['owner_name'] ?? humanize(row['owner_type'])),
      ('Total quantity', row['quantity']),
      ('Reserved quantity', row['reserved_quantity']),
      ('Available quantity', available),
      ('Unit price', money(row['unit_price'])),
      ('Low-stock level', row['low_stock_threshold']),
      ('Batch / lot', row['batch_number']),
      ('Manufactured', row['manufactured_at']),
      ('Expires', row['expires_at']),
      ('Received', row['received_at']),
      ('Storage location', row['storage_location']),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Inventory record')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          PageIntro(
              title: '${row['name_en'] ?? 'Medicine'}',
              subtitle: widget.role == 'warehouse'
                  ? 'Warehouse batch ${row['batch_number'] ?? 'without a lot number'}'
                  : 'Inventory owned by ${row['owner_name'] ?? humanize(row['owner_type'])}',
              action: StatusPill(active ? 'active' : 'inactive')),
          const SizedBox(height: 18),
          MedLineSection(
            title: 'Stock and traceability',
            child: Column(
              children: fields
                  .where((field) =>
                      field.$2 != null && '${field.$2}'.trim().isNotEmpty)
                  .map(
                    (field) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(field.$1),
                      trailing: SizedBox(
                        width: 180,
                        child: Text(
                          '${field.$2}',
                          textAlign: TextAlign.end,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: MedLineColors.text),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => MedicineDetailMobilePage(
                      session: widget.session,
                      medicineId:
                          int.parse('${row['medicine_id'] ?? row['id']}'),
                      role: widget.role))),
              icon: const Icon(Icons.medication_outlined),
              label: const Text('Open medicine details')),
          if (widget.role == 'warehouse') ...[
            const SizedBox(height: 10),
            AsyncActionButton(
                label: active ? 'Deactivate batch' : 'Activate batch',
                onPressed: toggle,
                busy: busy,
                icon: Icons.power_settings_new_rounded,
                destructive: active),
          ],
        ],
      ),
    );
  }
}

class InventoryEntryPage extends StatefulWidget {
  const InventoryEntryPage(
      {required this.session, required this.role, super.key});
  final Session session;
  final String role;

  @override
  State<InventoryEntryPage> createState() => _InventoryEntryPageState();
}

class _InventoryEntryPageState extends State<InventoryEntryPage> {
  final search = TextEditingController();
  final quantity = TextEditingController();
  final unitPrice = TextEditingController();
  final lowStock = TextEditingController(text: '5');
  final batch = TextEditingController();
  final storage = TextEditingController();
  DateTime? manufacturedAt;
  DateTime? expiresAt;
  DateTime? receivedAt = DateTime.now();
  Map<String, dynamic>? selected;
  List<Map<String, dynamic>> suggestions = [];
  Timer? debounce;
  bool searching = false;
  bool saving = false;
  String? error;

  bool get warehouse => widget.role == 'warehouse';

  @override
  void initState() {
    super.initState();
    unawaited(findMedicines());
  }

  @override
  void dispose() {
    debounce?.cancel();
    for (final controller in [
      search,
      quantity,
      unitPrice,
      lowStock,
      batch,
      storage
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> findMedicines() async {
    setState(() => searching = true);
    try {
      final response = await widget.session.api.get('/medicines',
          query: {'search': search.text.trim(), 'per_page': '20'});
      if (mounted) setState(() => suggestions = listData(response));
    } catch (_) {
      if (mounted) setState(() => suggestions = []);
    } finally {
      if (mounted) setState(() => searching = false);
    }
  }

  void searchChanged(String value) {
    if (selected != null && value != '${selected!['name_en']}') selected = null;
    debounce?.cancel();
    debounce = Timer(const Duration(milliseconds: 300), findMedicines);
  }

  Future<DateTime?> pickDate(DateTime? current,
          {DateTime? first, DateTime? last}) =>
      showDatePicker(
          context: context,
          initialDate: current ?? DateTime.now(),
          firstDate: first ?? DateTime(2000),
          lastDate: last ?? DateTime(2100));

  String iso(DateTime value) => value.toIso8601String().split('T').first;

  Future<void> save() async {
    final qty = int.tryParse(quantity.text);
    final price = num.tryParse(unitPrice.text);
    if (selected == null ||
        qty == null ||
        price == null ||
        (warehouse && qty < 1)) {
      setState(() => error =
          'Choose an active medicine and enter a valid quantity and unit price.');
      return;
    }
    if (manufacturedAt != null &&
        expiresAt != null &&
        !expiresAt!.isAfter(manufacturedAt!)) {
      setState(
          () => error = 'Expiry date must be after the manufactured date.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final payload = <String, dynamic>{
        'medicine_id': selected!['id'],
        'quantity': qty,
        'unit_price': price,
        'low_stock_threshold': int.tryParse(lowStock.text) ?? 5,
        if (warehouse && batch.text.trim().isNotEmpty)
          'batch_number': batch.text.trim(),
        if (warehouse && manufacturedAt != null)
          'manufactured_at': iso(manufacturedAt!),
        if (warehouse && expiresAt != null) 'expires_at': iso(expiresAt!),
        if (warehouse && receivedAt != null) 'received_at': iso(receivedAt!),
        if (warehouse && storage.text.trim().isNotEmpty)
          'storage_location': storage.text.trim(),
      };
      await widget.session.api.requestPut('/partner/inventory', payload,
          idempotencyKey:
              'mobile-inventory-${selected!['id']}-${DateTime.now().microsecondsSinceEpoch}');
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
                warehouse ? 'Add warehouse batch' : 'Update pharmacy stock')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            PageIntro(
                title: warehouse ? 'New stock batch' : 'Pharmacy stock',
                subtitle: warehouse
                    ? 'Each submission creates a separate record so lot, expiry, storage, price, and audit history remain traceable.'
                    : 'Select an active catalog medicine and update the saleable quantity and patient price.'),
            const SizedBox(height: 18),
            TextField(
                controller: search,
                onChanged: searchChanged,
                decoration: const InputDecoration(
                    labelText: 'Medicine catalog',
                    hintText: 'Search name, Arabic name, manufacturer, or code',
                    prefixIcon: Icon(Icons.search_rounded))),
            if (selected == null)
              Card(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 260),
                  child: searching
                      ? const Center(
                          child: Padding(
                              padding: EdgeInsets.all(20),
                              child: CircularProgressIndicator()))
                      : ListView.builder(
                          shrinkWrap: true,
                          itemCount: suggestions.length,
                          itemBuilder: (context, index) {
                            final row = suggestions[index];
                            return ListTile(
                                onTap: () => setState(() {
                                      selected = row;
                                      search.text = '${row['name_en']}';
                                    }),
                                title: Text('${row['name_en']}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text([
                                  row['name_ar'],
                                  row['manufacturer'],
                                  row['dosage']
                                ]
                                    .where((value) =>
                                        value != null && '$value'.isNotEmpty)
                                    .join(' · ')),
                                trailing: const Icon(
                                    Icons.add_circle_outline_rounded));
                          },
                        ),
                ),
              )
            else
              Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: StatusPill('${selected!['name_en']} selected')),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(
                  child: TextField(
                      controller: quantity,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                          labelText: warehouse
                              ? 'Batch quantity'
                              : 'Available quantity'))),
              const SizedBox(width: 10),
              Expanded(
                  child: TextField(
                      controller: unitPrice,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration:
                          const InputDecoration(labelText: 'Unit price (SYP)')))
            ]),
            const SizedBox(height: 12),
            TextField(
                controller: lowStock,
                keyboardType: TextInputType.number,
                decoration:
                    const InputDecoration(labelText: 'Low-stock level')),
            if (warehouse) ...[
              const SizedBox(height: 18),
              MedLineSection(
                title: 'Batch traceability',
                subtitle:
                    'Recommended for recalls, FEFO rotation, and expiry monitoring.',
                child: Column(children: [
                  TextField(
                      controller: batch,
                      decoration: const InputDecoration(
                          labelText: 'Batch / lot number')),
                  const SizedBox(height: 12),
                  _DateField(
                      label: 'Manufactured date',
                      value: manufacturedAt,
                      onTap: () async {
                        final value = await pickDate(manufacturedAt,
                            last: DateTime.now());
                        if (value != null) {
                          setState(() => manufacturedAt = value);
                        }
                      }),
                  const SizedBox(height: 12),
                  _DateField(
                      label: 'Expiry date',
                      value: expiresAt,
                      onTap: () async {
                        final value = await pickDate(expiresAt,
                            first: DateTime.now().add(const Duration(days: 1)));
                        if (value != null) setState(() => expiresAt = value);
                      }),
                  const SizedBox(height: 12),
                  _DateField(
                      label: 'Date received',
                      value: receivedAt,
                      onTap: () async {
                        final value =
                            await pickDate(receivedAt, last: DateTime.now());
                        if (value != null) setState(() => receivedAt = value);
                      }),
                  const SizedBox(height: 12),
                  TextField(
                      controller: storage,
                      decoration: const InputDecoration(
                          labelText: 'Storage location',
                          hintText: 'Aisle, shelf, or cold room')),
                ]),
              ),
            ],
            if (error != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(error!,
                      style: const TextStyle(color: MedLineColors.danger))),
            const SizedBox(height: 18),
            AsyncActionButton(
                label: warehouse ? 'Save batch' : 'Save stock',
                onPressed: save,
                busy: saving,
                icon: Icons.inventory_2_outlined),
          ],
        ),
      );
}

class _DateField extends StatelessWidget {
  const _DateField(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: InputDecorator(
            decoration: InputDecoration(
                labelText: label,
                suffixIcon: const Icon(Icons.calendar_today_outlined)),
            child: Text(value == null
                ? 'Not set'
                : value!.toIso8601String().split('T').first)),
      );
}
