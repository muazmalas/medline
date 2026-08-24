import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../maps/medline_map.dart';
import '../medicine/medicine_pages.dart';
import '../workspace/record_list.dart';

const procurementStatuses = <String, String>{
  'pending_warehouse_review': 'Pending warehouse review',
  'partial_approval_required': 'Partial offer',
  'partially_accepted': 'Partially accepted',
  'partial_offer_rejected': 'Partial offer rejected',
  'accepted': 'Accepted',
  'rejected': 'Rejected',
  'cancelled': 'Cancelled',
  'completed': 'Completed',
};

class ProcurementPage extends StatefulWidget {
  const ProcurementPage({required this.session, required this.role, super.key});
  final Session session;
  final String role;
  @override
  State<ProcurementPage> createState() => _ProcurementPageState();
}

class _ProcurementPageState extends State<ProcurementPage> {
  int revision = 0;
  Future<void> open(BuildContext context, Map<String, dynamic> row) async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ProcurementDetailPage(
            session: widget.session,
            role: widget.role,
            id: int.parse('${row['id']}'))));
    if (mounted) setState(() => revision++);
  }

  Future<void> create() async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => CreateProcurementPage(session: widget.session)));
    if (saved == true && mounted) setState(() => revision++);
  }

  @override
  Widget build(BuildContext context) => MobileRecordListPage(
        key: ValueKey('procurement-${widget.role}-$revision'),
        session: widget.session,
        config: RecordListConfig(
          title: 'Procurement',
          subtitle: widget.role == 'pharmacy'
              ? 'Request stock from an approved warehouse and review warehouse offers.'
              : widget.role == 'warehouse'
                  ? 'Open a request to adjust quantities, allocate warehouse batches, and record a decision.'
                  : 'Review every pharmacy-to-warehouse procurement request.',
          endpoint:
              widget.role == 'admin' ? '/admin/procurements' : '/procurement',
          primary: (row) => '${row['public_id'] ?? 'Procurement ${row['id']}'}',
          secondary: (row) =>
              '${row['warehouse_name'] ?? 'Warehouse'} → ${row['pharmacy_name'] ?? 'Pharmacy'}',
          tertiary: (row) => '${row['delivery_address_snapshot'] ?? ''}',
          status: (row) => '${row['status'] ?? 'unknown'}',
          amount: (row) => money(row['total']),
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: procurementStatuses,
          sortOptions: const {
            'Newest': 'created_at',
            'Oldest': 'created_at',
            'Highest total': 'total',
            'Lowest total': 'total'
          },
          icon: Icons.inventory_2_outlined,
          onOpen: open,
          headerAction: widget.role == 'pharmacy'
              ? (_, __) => FilledButton.icon(
                  onPressed: create,
                  icon: const Icon(Icons.add_shopping_cart_rounded),
                  label: const Text('Replenish stock'))
              : null,
        ),
      );
}

class _BatchAllocation {
  _BatchAllocation(this.batch, [int initial = 0])
      : controller = TextEditingController(text: '$initial');
  final Map<String, dynamic> batch;
  final TextEditingController controller;
}

class ProcurementDetailPage extends StatefulWidget {
  const ProcurementDetailPage(
      {required this.session, required this.role, required this.id, super.key});
  final Session session;
  final String role;
  final int id;
  @override
  State<ProcurementDetailPage> createState() => _ProcurementDetailPageState();
}

class _ProcurementDetailPageState extends State<ProcurementDetailPage> {
  Map<String, dynamic>? data;
  bool loading = true;
  bool working = false;
  String? error;
  final quantities = <int, TextEditingController>{};
  final allocations = <int, List<_BatchAllocation>>{};
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    for (final value in quantities.values) {
      value.dispose();
    }
    for (final group in allocations.values) {
      for (final value in group) {
        value.controller.dispose();
      }
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response =
          await widget.session.api.get('/procurement/${widget.id}');
      for (final item in listData(response['items'])) {
        final id = int.parse('${item['id']}');
        quantities.putIfAbsent(
            id,
            () => TextEditingController(
                text:
                    '${item['accepted_quantity'] == 0 ? item['quantity'] : item['accepted_quantity']}'));
        if (!allocations.containsKey(id)) {
          var remaining = int.tryParse(quantities[id]!.text) ?? 0;
          allocations[id] = listData(item['batch_options']).map((batch) {
            final available = int.tryParse(
                    '${batch['available_quantity'] ?? batch['available']}') ??
                0;
            final allocated = math.min(remaining, available);
            remaining -= allocated;
            return _BatchAllocation(batch, allocated);
          }).toList();
        }
      }
      if (mounted) setState(() => data = response);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<String?> noteDialog(String title) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(title),
                content: TextField(
                    controller: controller,
                    minLines: 3,
                    maxLines: 6,
                    autofocus: true,
                    decoration:
                        const InputDecoration(labelText: 'Comment (required)')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () {
                        if (controller.text.trim().length >= 5) {
                          Navigator.pop(context, controller.text.trim());
                        }
                      },
                      child: const Text('Continue'))
                ]));
    controller.dispose();
    return result;
  }

  Future<void> decide(String decision) async {
    final items = listData(data?['items']);
    if (decision == 'partial') {
      final changed = items.any((item) =>
          (int.tryParse(quantities[int.parse('${item['id']}')]?.text ?? '') ??
              0) !=
          (int.tryParse('${item['quantity']}') ?? 0));
      if (!changed) {
        showMessage(
            context, 'Change at least one quantity before approving partially.',
            error: true);
        return;
      }
    }
    final payloadItems = <Map<String, dynamic>>[];
    for (final item in items) {
      final id = int.parse('${item['id']}');
      final requested = int.tryParse('${item['quantity']}') ?? 0;
      final accepted = decision == 'reject'
          ? 0
          : int.tryParse(quantities[id]?.text ?? '') ?? -1;
      if (accepted < 0 || accepted > requested) {
        showMessage(context,
            'Fulfilled quantities must be between zero and the requested quantity.',
            error: true);
        return;
      }
      final batchRows = <Map<String, dynamic>>[];
      var batchTotal = 0;
      for (final allocation in allocations[id] ?? []) {
        final quantity = int.tryParse(allocation.controller.text) ?? 0;
        if (quantity > 0) {
          final available = int.tryParse(
                  '${allocation.batch['available_quantity'] ?? allocation.batch['available']}') ??
              0;
          if (quantity > available) {
            showMessage(context,
                'A batch allocation cannot exceed its available quantity.',
                error: true);
            return;
          }
          batchTotal += quantity;
          batchRows.add({
            'inventory_id':
                allocation.batch['id'] ?? allocation.batch['inventory_id'],
            'quantity': quantity
          });
        }
      }
      if (decision != 'reject' && batchTotal != accepted) {
        showMessage(context,
            'Allocate exactly $accepted units across batches for ${item['name_en']}.',
            error: true);
        return;
      }
      payloadItems
          .add({'id': id, 'accepted_quantity': accepted, 'batches': batchRows});
    }
    String? note;
    if (decision != 'accept') {
      note = await noteDialog(decision == 'partial'
          ? 'Explain this partial offer to the pharmacy'
          : 'Explain why this request is rejected');
      if (note == null) return;
    }
    await runAction(() => widget.session.api.post(
        '/procurement/${widget.id}/decision',
        {
          'decision': decision,
          if (note != null) 'note': note,
          if (decision != 'reject') 'items': payloadItems
        },
        idempotencyKey: 'mobile-procurement-${widget.id}-$decision'));
  }

  Future<void> partialDecision(String decision) =>
      runAction(() => widget.session.api.post(
          '/procurement/${widget.id}/partial-offer/decision',
          {'decision': decision},
          idempotencyKey: 'mobile-procurement-offer-${widget.id}-$decision'));
  Future<void> runAction(Future<Map<String, dynamic>> Function() action) async {
    setState(() => working = true);
    try {
      final response = await action();
      if (mounted) {
        showMessage(context, '${response['message'] ?? 'Update saved.'}');
      }
      await load();
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading && data == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (error != null && data == null) {
      return Scaffold(
          appBar: AppBar(),
          body: MedLineErrorState(message: error!, onRetry: load));
    }
    final procurement = mapData(data?['procurement']) ?? {};
    final items = listData(data?['items']);
    final delivery = mapData(data?['delivery']);
    final status = '${procurement['status'] ?? 'unknown'}';
    final canDecide =
        widget.role == 'warehouse' && status == 'pending_warehouse_review';
    final partial =
        widget.role == 'pharmacy' && status == 'partial_approval_required';
    return Scaffold(
        appBar: AppBar(title: const Text('Procurement details')),
        body: RefreshIndicator(
            onRefresh: load,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              PageIntro(
                  title: '${procurement['public_id'] ?? 'Procurement'}',
                  subtitle:
                      '${procurement['warehouse_name'] ?? 'Warehouse'} → ${procurement['pharmacy_name'] ?? 'Pharmacy'} · ${dateTimeLabel(procurement['created_at'])}',
                  action: StatusPill(status)),
              const SizedBox(height: 16),
              if (canDecide)
                MedLineSection(
                    title: 'Adjust requested stock',
                    subtitle:
                        'Set a quantity no greater than requested, then allocate that quantity across available warehouse batches.',
                    child: Column(
                        children: items
                            .map((item) => _WarehouseItemDecision(
                                item: item,
                                quantity:
                                    quantities[int.parse('${item['id']}')]!,
                                allocations:
                                    allocations[int.parse('${item['id']}')] ??
                                        [],
                                session: widget.session,
                                working: working))
                            .toList()))
              else
                MedLineSection(
                    title: 'Requested stock',
                    child: Column(
                        children: items
                            .map((item) => _ProcurementItem(
                                item: item, session: widget.session))
                            .toList())),
              const SizedBox(height: 12),
              MedLineSection(
                  title: 'Delivery request',
                  child: Column(children: [
                    _DetailLine(
                        'Timing',
                        procurement['delivery_preference'] == 'scheduled'
                            ? dateTimeLabel(
                                procurement['scheduled_delivery_at'])
                            : 'As soon as possible'),
                    _DetailLine(
                        'Vehicle',
                        humanize(
                            '${procurement['delivery_vehicle_type'] ?? 'motorcycle'}')),
                    _DetailLine('Delivery address',
                        '${procurement['delivery_address_snapshot'] ?? ''}')
                  ])),
              const SizedBox(height: 12),
              MedLineSection(
                  title: 'Cost snapshot',
                  subtitle:
                      'The rate, distance, and fee were permanently recorded when this request was created.',
                  child: Column(children: [
                    _DetailLine(
                        'Medicines subtotal', money(procurement['subtotal'])),
                    _DetailLine('Distance',
                        '${procurement['delivery_distance_km'] ?? '—'} km'),
                    _DetailLine('Rate at order time',
                        '${money(procurement['delivery_rate_per_km'])} / km'),
                    _DetailLine(
                        'Delivery fee', money(procurement['delivery_fee'])),
                    const Divider(),
                    _DetailLine('Total', money(procurement['total']),
                        strong: true)
                  ])),
              if (procurement['warehouse_note'] != null) ...[
                const SizedBox(height: 12),
                MedLineSection(
                    title: 'Warehouse comment',
                    child: Text('${procurement['warehouse_note']}',
                        style: const TextStyle(height: 1.5)))
              ],
              if (delivery != null) ...[
                const SizedBox(height: 12),
                MedLineSection(
                    title: 'Delivery',
                    child: Column(children: [
                      _DetailLine('Status', humanize('${delivery['status']}')),
                      _DetailLine(
                          'Scheduled',
                          delivery['scheduled_for'] == null
                              ? 'As soon as possible'
                              : dateTimeLabel(delivery['scheduled_for'])),
                    ]))
              ],
              if (canDecide) ...[
                const SizedBox(height: 16),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  FilledButton.icon(
                      onPressed: working ? null : () => decide('accept'),
                      icon: const Icon(Icons.check_rounded),
                      label: const Text('Accept all')),
                  FilledButton.tonalIcon(
                      onPressed: working ? null : () => decide('partial'),
                      icon: const Icon(Icons.call_split_rounded),
                      label: const Text('Approve partially')),
                  OutlinedButton.icon(
                      onPressed: working ? null : () => decide('reject'),
                      icon: const Icon(Icons.close_rounded),
                      label: const Text('Reject request'))
                ])
              ],
              if (partial) ...[
                const SizedBox(height: 16),
                MedLineSection(
                    title: 'Partial warehouse offer',
                    subtitle:
                        'Review the adjusted quantities and warehouse comment before a delivery is created.',
                    child: Row(children: [
                      Expanded(
                          child: FilledButton(
                              onPressed: working
                                  ? null
                                  : () => partialDecision('approve'),
                              child: const Text('Approve offer'))),
                      const SizedBox(width: 10),
                      Expanded(
                          child: OutlinedButton(
                              onPressed: working
                                  ? null
                                  : () => partialDecision('reject'),
                              child: const Text('Decline offer')))
                    ]))
              ],
              const SizedBox(height: 28),
            ])));
  }
}

class _WarehouseItemDecision extends StatelessWidget {
  const _WarehouseItemDecision(
      {required this.item,
      required this.quantity,
      required this.allocations,
      required this.session,
      required this.working});
  final Map<String, dynamic> item;
  final TextEditingController quantity;
  final List<_BatchAllocation> allocations;
  final Session session;
  final bool working;
  @override
  Widget build(BuildContext context) => Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
          padding: const EdgeInsets.all(14),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            InkWell(
                onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => MedicineDetailMobilePage(
                            session: session,
                            medicineId: int.parse('${item['medicine_id']}'),
                            role: 'warehouse'))),
                child: Row(children: [
                  Expanded(
                      child: Text('${item['name_en']}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: MedLineColors.blue))),
                  const Icon(Icons.open_in_new_rounded,
                      size: 18, color: MedLineColors.blue)
                ])),
            const SizedBox(height: 10),
            TextField(
                controller: quantity,
                enabled: !working,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                    labelText:
                        'Quantity to fulfill (requested ${item['quantity']})')),
            const SizedBox(height: 12),
            Text('Allocate batches',
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 6),
            if (allocations.isEmpty)
              const Text('No eligible batches are available.',
                  style: TextStyle(color: MedLineColors.danger)),
            ...allocations.map((allocation) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  Expanded(
                      child: Text(
                          'Lot ${allocation.batch['batch_number'] ?? 'unlabelled'}\n${allocation.batch['available_quantity'] ?? allocation.batch['available'] ?? 0} available · expires ${dateTimeLabel(allocation.batch['expires_at'])}',
                          style: const TextStyle(color: MedLineColors.muted))),
                  const SizedBox(width: 10),
                  SizedBox(
                      width: 100,
                      child: TextField(
                          controller: allocation.controller,
                          enabled: !working,
                          keyboardType: TextInputType.number,
                          decoration:
                              const InputDecoration(labelText: 'Units')))
                ])))
          ])));
}

class _ProcurementItem extends StatelessWidget {
  const _ProcurementItem({required this.item, required this.session});
  final Map<String, dynamic> item;
  final Session session;
  @override
  Widget build(BuildContext context) => ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => MedicineDetailMobilePage(
                  session: session,
                  medicineId: int.parse('${item['medicine_id']}'),
                  role: 'pharmacy'))),
      title: Text('${item['name_en']}',
          style: const TextStyle(
              fontWeight: FontWeight.w800, color: MedLineColors.blue)),
      subtitle: Text(
          'Requested ${item['quantity']} · accepted ${item['accepted_quantity'] ?? 0}'),
      trailing: Text(money(item['line_total']),
          style: const TextStyle(fontWeight: FontWeight.w800)));
}

class _DetailLine extends StatelessWidget {
  const _DetailLine(this.label, this.value, {this.strong = false});
  final String label, value;
  final bool strong;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
            child: Text(label,
                style: TextStyle(
                    color: strong ? MedLineColors.text : MedLineColors.muted,
                    fontWeight: strong ? FontWeight.w800 : FontWeight.w500))),
        Flexible(
            child: Text(value,
                textAlign: TextAlign.end,
                style: TextStyle(
                    color: strong ? MedLineColors.blue : MedLineColors.text,
                    fontWeight: FontWeight.w800,
                    fontSize: strong ? 17 : 14)))
      ]));
}

class _ProcurementDraft {
  _ProcurementDraft(this.record);
  final Map<String, dynamic> record;
  int quantity = 1;
}

class CreateProcurementPage extends StatefulWidget {
  const CreateProcurementPage({required this.session, super.key});
  final Session session;
  @override
  State<CreateProcurementPage> createState() => _CreateProcurementPageState();
}

class _CreateProcurementPageState extends State<CreateProcurementPage> {
  final warehouseSearch = TextEditingController();
  final medicineSearch = TextEditingController();
  final address = TextEditingController();
  Timer? debounce;
  Timer? routeDebounce;
  List<Map<String, dynamic>> warehouses = [];
  List<Map<String, dynamic>> catalog = [];
  Map<String, dynamic>? warehouse;
  final items = <_ProcurementDraft>[];
  int step = 0;
  bool busy = false;
  String preference = 'asap';
  String vehicle = 'motorcycle';
  DateTime? scheduled;
  Map<String, dynamic> pricing = {};
  Map<String, dynamic> profile = {};
  Map<String, dynamic>? roadEstimate;
  bool routeLoading = false;
  String? routeError;
  int routeRequest = 0;
  @override
  void initState() {
    super.initState();
    unawaited(loadBase());
  }

  @override
  void dispose() {
    debounce?.cancel();
    routeDebounce?.cancel();
    warehouseSearch.dispose();
    medicineSearch.dispose();
    address.dispose();
    super.dispose();
  }

  Future<void> loadBase() async {
    try {
      final results = await Future.wait([
        widget.session.api
            .get('/partners', query: {'type': 'warehouse', 'per_page': '30'}),
        widget.session.api.get('/subscription'),
        widget.session.api.get('/delivery-pricing/current')
      ]);
      if (mounted) {
        setState(() {
          warehouses = listData(results[0]);
          profile = mapData(results[1]['profile']) ??
              mapData(results[1]['partner']) ??
              {};
          address.text = '${profile['address'] ?? ''}';
          pricing = results[2];
        });
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    }
  }

  void later(VoidCallback value) {
    debounce?.cancel();
    debounce = Timer(const Duration(milliseconds: 300), value);
  }

  void scheduleRoadEstimate() {
    routeDebounce?.cancel();
    routeDebounce = Timer(
        const Duration(milliseconds: 320), () => unawaited(loadRoadEstimate()));
  }

  Future<void> loadRoadEstimate() async {
    final fromLatitude = toCoordinate(warehouse?['latitude']);
    final fromLongitude = toCoordinate(warehouse?['longitude']);
    final toLatitude = toCoordinate(profile['latitude']);
    final toLongitude = toCoordinate(profile['longitude']);
    final requestId = ++routeRequest;
    if ([fromLatitude, fromLongitude, toLatitude, toLongitude]
        .any((coordinate) => coordinate == null)) {
      if (mounted) {
        setState(() {
          roadEstimate = null;
          routeLoading = false;
          routeError = 'Warehouse and pharmacy coordinates are required.';
        });
      }
      return;
    }
    setState(() {
      roadEstimate = null;
      routeLoading = true;
      routeError = null;
    });
    try {
      final value = await widget.session.api.get('/delivery-pricing/estimate',
          query: {
            'from_latitude': '$fromLatitude',
            'from_longitude': '$fromLongitude',
            'to_latitude': '$toLatitude',
            'to_longitude': '$toLongitude',
            'vehicle_type': vehicle,
          });
      if (mounted && requestId == routeRequest) {
        setState(() => roadEstimate = value);
      }
    } catch (_) {
      if (mounted && requestId == routeRequest) {
        setState(() => routeError =
            'The road route could not be calculated. Check your connection and try again.');
      }
    } finally {
      if (mounted && requestId == routeRequest) {
        setState(() => routeLoading = false);
      }
    }
  }

  Future<void> findWarehouses() async {
    try {
      final response = await widget.session.api.get('/partners', query: {
        'type': 'warehouse',
        'search': warehouseSearch.text.trim(),
        'per_page': '30'
      });
      if (mounted) setState(() => warehouses = listData(response));
    } catch (_) {}
  }

  Future<void> findMedicine() async {
    if (warehouse == null) return;
    try {
      final response = await widget.session.api.get('/medicines', query: {
        'partner_id': '${warehouse!['id']}',
        'inventory_type': 'warehouse',
        'available_only': '1',
        'search': medicineSearch.text.trim(),
        'per_page': '30'
      });
      if (mounted) setState(() => catalog = listData(response));
    } catch (_) {}
  }

  void selectWarehouse(Map<String, dynamic> value) {
    setState(() {
      warehouse = value;
      warehouseSearch.text = '${value['business_name']}';
      items.clear();
      catalog = [];
      roadEstimate = null;
      routeError = null;
    });
    scheduleRoadEstimate();
  }

  void go(int value) {
    if (value > 0 && warehouse == null) {
      showMessage(context, 'Select a warehouse first.', error: true);
      return;
    }
    if (value > 1 && items.isEmpty) {
      showMessage(context, 'Add at least one medicine first.', error: true);
      return;
    }
    setState(() => step = value);
  }

  Future<void> chooseSchedule() async {
    final date = await showDatePicker(
        context: context,
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 90)),
        initialDate: DateTime.now().add(const Duration(days: 1)));
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context,
        initialTime: TimeOfDay.fromDateTime(
            DateTime.now().add(const Duration(hours: 2))));
    if (time != null) {
      setState(() => scheduled =
          DateTime(date.year, date.month, date.day, time.hour, time.minute));
    }
  }

  double? get distance =>
      double.tryParse('${roadEstimate?['distance_km'] ?? ''}');

  double get rate {
    final estimatedRate =
        double.tryParse('${roadEstimate?['rate_per_km'] ?? ''}');
    if (estimatedRate != null) return estimatedRate;
    final matches = listData(pricing['rates'])
        .where((entry) => '${entry['vehicle_type']}' == vehicle);
    return double.tryParse(
            '${matches.isEmpty ? pricing['rate_per_km'] : matches.first['rate_per_km']}') ??
        0;
  }

  double get subtotal => items.fold(
      0,
      (sum, item) =>
          sum +
          (double.tryParse('${item.record['unit_price']}') ?? 0) *
              item.quantity);
  double? get deliveryFee =>
      double.tryParse('${roadEstimate?['fee'] ?? ''}');
  Future<void> submit() async {
    if (preference == 'scheduled' && scheduled == null) {
      showMessage(context, 'Choose the delivery date and time.', error: true);
      return;
    }
    if (roadEstimate == null || routeLoading) {
      showMessage(context,
          routeError ?? 'Wait for the calculated road route before submitting.',
          error: true);
      if (!routeLoading) unawaited(loadRoadEstimate());
      return;
    }
    setState(() => busy = true);
    try {
      await widget.session.api.post(
          '/procurement',
          {
            'warehouse_id': warehouse!['id'],
            'delivery_address_snapshot': address.text.trim(),
            'delivery_preference': preference,
            'delivery_vehicle_type': vehicle,
            if (preference == 'scheduled')
              'scheduled_delivery_at': scheduled!.toUtc().toIso8601String(),
            'items': items
                .map((item) => {
                      'medicine_id': item.record['id'],
                      'quantity': item.quantity
                    })
                .toList()
          },
          idempotencyKey:
              'mobile-procurement-${DateTime.now().microsecondsSinceEpoch}');
      if (mounted) {
        showMessage(context, 'Procurement request created.');
        Navigator.pop(context, true);
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final points = <MedLineMapPoint>[
      if (mapPointFrom(warehouse,
              fallbackLabel: 'Warehouse',
              kind: MedLineMapPointKind.warehouse) !=
          null)
        mapPointFrom(warehouse,
            fallbackLabel: 'Warehouse', kind: MedLineMapPointKind.warehouse)!,
      if (mapPointFrom(profile,
              fallbackLabel: 'Pharmacy', kind: MedLineMapPointKind.pharmacy) !=
          null)
        mapPointFrom(profile,
            fallbackLabel: 'Pharmacy', kind: MedLineMapPointKind.pharmacy)!
    ];
    return Scaffold(
        appBar: AppBar(title: const Text('Replenish inventory')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const PageIntro(
              title: 'Request warehouse stock',
              subtitle:
                  'Choose a warehouse, build the stock request, then schedule and review its delivery cost.'),
          const SizedBox(height: 16),
          Row(
              children: List.generate(
                  3,
                  (index) => Expanded(
                      child: Padding(
                          padding: EdgeInsetsDirectional.only(
                              end: index < 2 ? 6 : 0),
                          child: OutlinedButton(
                              onPressed: () => go(index),
                              style: OutlinedButton.styleFrom(
                                  backgroundColor: step == index
                                      ? MedLineColors.paleBlue
                                      : Colors.white,
                                  minimumSize: const Size.fromHeight(64)),
                              child: Text('${index + 1}. ${const [
                                'Warehouse',
                                'Medicines',
                                'Review'
                              ][index]}')))))),
          const SizedBox(height: 16),
          if (step == 0) _warehouseStep(),
          if (step == 1) _medicineStep(),
          if (step == 2) _reviewStep(points)
        ]));
  }

  Widget _warehouseStep() => MedLineSection(
      title: '1. Select warehouse',
      child: Column(children: [
        TextField(
            controller: warehouseSearch,
            onChanged: (_) => later(findWarehouses),
            decoration: const InputDecoration(
                labelText: 'Search warehouses',
                prefixIcon: Icon(Icons.search_rounded))),
        ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 300),
            child: ListView.builder(
                shrinkWrap: true,
                itemCount: warehouses.length,
                itemBuilder: (_, index) {
                  final row = warehouses[index];
                  return ListTile(
                      onTap: () => selectWarehouse(row),
                      leading: const Icon(Icons.warehouse_outlined),
                      title: Text('${row['business_name']}'),
                      subtitle: Text('${row['address'] ?? ''}'),
                      trailing: '${warehouse?['id']}' == '${row['id']}'
                          ? const Icon(Icons.check_circle_rounded,
                              color: MedLineColors.success)
                          : null);
                })),
        Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton.icon(
                onPressed: warehouse == null ? null : () => go(1),
                icon: const Icon(Icons.arrow_forward_rounded),
                label: const Text('Next: Select medicines')))
      ]));
  Widget _medicineStep() => MedLineSection(
      title: '2. Select medicines',
      child: Column(children: [
        TextField(
            controller: medicineSearch,
            onChanged: (_) => later(findMedicine),
            decoration: const InputDecoration(
                labelText: 'Search warehouse catalog',
                prefixIcon: Icon(Icons.search_rounded))),
        if (medicineSearch.text.isNotEmpty)
          ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 240),
              child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: catalog.length,
                  itemBuilder: (_, index) {
                    final row = catalog[index];
                    return ListTile(
                        onTap: () {
                          if (!items.any((item) =>
                              '${item.record['id']}' == '${row['id']}')) {
                            setState(() => items.add(_ProcurementDraft(row)));
                          }
                        },
                        title: Text('${row['name_en']}'),
                        subtitle: Text(
                            '${money(row['unit_price'])} · ${row['available_quantity'] ?? 0} available'),
                        trailing: const Icon(Icons.add_circle_outline_rounded));
                  })),
        ...items.map((item) => ListTile(
            title: Text('${item.record['name_en']}',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text(money(item.record['unit_price'])),
            leading: IconButton(
                onPressed: item.quantity > 1
                    ? () => setState(() => item.quantity--)
                    : null,
                icon: const Icon(Icons.remove_circle_outline)),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              Text('${item.quantity}',
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              IconButton(
                  onPressed: () => setState(() => item.quantity++),
                  icon: const Icon(Icons.add_circle_outline)),
              IconButton(
                  onPressed: () => setState(() => items.remove(item)),
                  icon: const Icon(Icons.delete_outline,
                      color: MedLineColors.danger))
            ]))),
        Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton.icon(
                onPressed: items.isEmpty ? null : () => go(2),
                icon: const Icon(Icons.arrow_forward_rounded),
                label: const Text('Next: Review delivery')))
      ]));
  Widget _reviewStep(List<MedLineMapPoint> points) => MedLineSection(
      title: '3. Schedule and review',
      child: Column(children: [
        if (points.isNotEmpty)
          MedLineMap(
              points: points,
              routeCoordinates:
                  mapRouteCoordinates(roadEstimate?['route_geometry']),
              height: 280),
        const SizedBox(height: 12),
        TextField(
            controller: address,
            decoration:
                const InputDecoration(labelText: 'Pharmacy receiving address')),
        const SizedBox(height: 12),
        SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'asap', label: Text('ASAP')),
              ButtonSegment(value: 'scheduled', label: Text('Schedule'))
            ],
            selected: {
              preference
            },
            onSelectionChanged: (value) =>
                setState(() => preference = value.first)),
        if (preference == 'scheduled')
          ListTile(
              onTap: chooseSchedule,
              title: Text(scheduled == null
                  ? 'Choose date and time'
                  : dateTimeLabel(scheduled)),
              trailing: const Icon(Icons.calendar_month_outlined)),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
            initialValue: vehicle,
            decoration: const InputDecoration(labelText: 'Delivery vehicle'),
            items: const ['bicycle', 'motorcycle', 'car', 'van']
                .map((value) => DropdownMenuItem(
                    value: value, child: Text(humanize(value))))
                .toList(),
            onChanged: (value) {
              setState(() {
                vehicle = value ?? vehicle;
                roadEstimate = null;
                routeError = null;
              });
              scheduleRoadEstimate();
            }),
        if (routeLoading) ...[
          const SizedBox(height: 12),
          const LinearProgressIndicator(),
          const SizedBox(height: 8),
          const Align(
              alignment: AlignmentDirectional.centerStart,
              child: Text('Calculating the road route and delivery fee…')),
        ],
        if (routeError != null) ...[
          const SizedBox(height: 12),
          MedLineErrorState(message: routeError!, onRetry: loadRoadEstimate),
        ],
        const SizedBox(height: 12),
        DecoratedBox(
            decoration: BoxDecoration(
                color: MedLineColors.paleBlue,
                borderRadius: BorderRadius.circular(14)),
            child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(children: [
                  _DetailLine('Requested stock estimate', money(subtotal)),
                  _DetailLine('Road distance', distance == null
                      ? 'Waiting for route'
                      : '${distance!.toStringAsFixed(2)} km'),
                  _DetailLine('Rate', '${money(rate)} / km'),
                  _DetailLine('Route-based delivery fee', deliveryFee == null
                      ? 'Waiting for route'
                      : money(deliveryFee)),
                  const Divider(),
                  _DetailLine('Estimated total', deliveryFee == null
                      ? 'Waiting for route'
                      : money(subtotal + deliveryFee!),
                      strong: true)
                ]))),
        const SizedBox(height: 14),
        Align(
            alignment: AlignmentDirectional.centerEnd,
            child: AsyncActionButton(
                label: 'Submit procurement',
                onPressed: roadEstimate == null ? null : submit,
                busy: busy || routeLoading,
                icon: Icons.check_circle_outline_rounded))
      ]));
}
