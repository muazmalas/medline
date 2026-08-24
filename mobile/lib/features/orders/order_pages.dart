import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/file_actions.dart';
import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../maps/medline_map.dart';
import '../medicine/medicine_pages.dart';
import '../workspace/record_list.dart';

const orderStatuses = <String, String>{
  'prescription_required': 'Prescription required',
  'prescription_review': 'Prescription review',
  'pending_pharmacy_review': 'Pending pharmacy review',
  'partial_approval': 'Partial offer',
  'accepted': 'Accepted',
  'cancelled': 'Cancelled',
  'rejected': 'Rejected',
  'completed': 'Completed',
};

class OrdersPage extends StatefulWidget {
  const OrdersPage({required this.session, required this.role, super.key});
  final Session session;
  final String role;

  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  int revision = 0;

  Future<void> open(BuildContext context, Map<String, dynamic> row) async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => OrderDetailMobilePage(
            session: widget.session,
            role: widget.role,
            orderId: int.parse('${row['id']}'))));
    if (mounted) setState(() => revision++);
  }

  Future<void> create() async {
    final created = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => CreateOrderPage(session: widget.session)));
    if (created == true && mounted) setState(() => revision++);
  }

  @override
  Widget build(BuildContext context) => MobileRecordListPage(
        key: ValueKey('orders-${widget.role}-$revision'),
        session: widget.session,
        config: RecordListConfig(
          title: widget.role == 'pharmacy' ? 'Patient orders' : 'Orders',
          subtitle: widget.role == 'pharmacy'
              ? 'Open an order to review each medicine, prescription, quantity, and partial decision.'
              : 'Search, sort, and open any order. Newest orders appear first.',
          endpoint: widget.role == 'pharmacy' ? '/partner/orders' : '/orders',
          primary: (row) => '${row['public_id'] ?? 'Order ${row['id']}'}',
          secondary: (row) => '${row['medicine_names'] ?? _itemNames(row)}',
          tertiary: (row) => [
            row['customer_name'],
            row['pharmacy_name'],
            row['delivery_address_snapshot']
          ]
              .where((value) => value != null && '$value'.trim().isNotEmpty)
              .join(' · '),
          status: (row) => '${row['status'] ?? 'unknown'}',
          amount: (row) => money(row['total']),
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: orderStatuses,
          sortOptions: const {
            'Newest': 'created_at',
            'Oldest': 'created_at',
            'Highest total': 'total',
            'Lowest total': 'total'
          },
          icon: Icons.receipt_long_outlined,
          onOpen: open,
          headerAction: widget.role == 'patient'
              ? (_, __) => FilledButton.icon(
                  onPressed: create,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('New order'))
              : null,
        ),
      );

  String _itemNames(Map<String, dynamic> row) {
    final items = listData(row['items']);
    return items
        .map((item) =>
            '${item['name_en'] ?? item['medicine_name'] ?? 'Medicine'}')
        .join(', ');
  }
}

class OrderDetailMobilePage extends StatefulWidget {
  const OrderDetailMobilePage(
      {required this.session,
      required this.role,
      required this.orderId,
      super.key});
  final Session session;
  final String role;
  final int orderId;

  @override
  State<OrderDetailMobilePage> createState() => _OrderDetailMobilePageState();
}

class _OrderDetailMobilePageState extends State<OrderDetailMobilePage> {
  Map<String, dynamic>? data;
  bool loading = true;
  bool working = false;
  String? error;
  final note = TextEditingController();
  final quantities = <int, TextEditingController>{};

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    note.dispose();
    for (final controller in quantities.values) {
      controller.dispose();
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
          await widget.session.api.get('/orders/${widget.orderId}');
      final order = mapData(response['order']) ?? {};
      for (final item in listData(order['items'])) {
        final id = int.tryParse('${item['id']}');
        if (id != null) {
          quantities.putIfAbsent(
              id,
              () => TextEditingController(
                  text:
                      '${item['accepted_quantity'] ?? item['quantity'] ?? 0}'));
        }
      }
      if (mounted) setState(() => data = response);
    } catch (_) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> upload(Map<String, dynamic> item) async {
    final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf']);
    final path = picked?.files.single.path;
    if (path == null) return;
    setState(() => working = true);
    try {
      await widget.session.api.uploadItemPrescription(
          widget.orderId, int.parse('${item['id']}'), path,
          idempotencyKey:
              'mobile-rx-${widget.orderId}-${item['id']}-${DateTime.now().microsecondsSinceEpoch}');
      await load();
      if (mounted) {
        showMessage(context, 'Prescription attached to ${item['name_en']}.');
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> reviewPrescription(int prescriptionId, String decision) async {
    final reviewNote = decision == 'reject'
        ? await _askNote('Reason for rejecting this prescription',
            required: true)
        : null;
    if (decision == 'reject' && reviewNote == null) return;
    await _run(() => widget.session.api.post(
        '/pharmacy/prescriptions/$prescriptionId/review',
        {'decision': decision, if (reviewNote != null) 'note': reviewNote},
        idempotencyKey: 'mobile-rx-review-$prescriptionId-$decision'));
  }

  Future<String?> _askNote(String title, {bool required = false}) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
            controller: controller,
            minLines: 3,
            maxLines: 6,
            autofocus: true,
            decoration: InputDecoration(
                labelText: required ? 'Comment (required)' : 'Comment')),
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
    return value;
  }

  Future<void> decide(String decision) async {
    final order = mapData(data?['order']) ?? {};
    final items = listData(order['items']);
    final decisions = items.map((item) {
      final id = int.parse('${item['id']}');
      return {
        'id': id,
        'accepted_quantity': int.tryParse(quantities[id]?.text ?? '') ?? 0
      };
    }).toList();
    final changed = items.any((item) {
      final id = int.parse('${item['id']}');
      return (int.tryParse(quantities[id]?.text ?? '') ?? 0) !=
          (int.tryParse('${item['quantity']}') ?? 0);
    });
    if (decision == 'partial' && !changed) {
      showMessage(context,
          'Change at least one requested quantity before approving partially.',
          error: true);
      return;
    }
    for (final item in items) {
      final id = int.parse('${item['id']}');
      final requested = int.tryParse('${item['quantity']}') ?? 0;
      final accepted = int.tryParse(quantities[id]?.text ?? '') ?? -1;
      if (accepted < 0 || accepted > requested) {
        showMessage(context,
            'Fulfilled quantities must be between zero and the requested quantity.',
            error: true);
        return;
      }
    }
    String? decisionNote;
    if (decision != 'accept') {
      decisionNote = await _askNote(
          decision == 'partial'
              ? 'Explain the partial offer to the patient'
              : 'Explain why this order is rejected',
          required: true);
      if (decisionNote == null) return;
    }
    await _run(() => widget.session.api.post(
        '/partner/orders/${widget.orderId}/decision',
        {
          'decision': decision,
          if (decision == 'partial') 'items': decisions,
          if (decisionNote != null) 'note': decisionNote
        },
        idempotencyKey: 'mobile-order-decision-${widget.orderId}-$decision'));
  }

  Future<void> patientPartial(String decision) =>
      _run(() => widget.session.api.post(
          '/orders/${widget.orderId}/partial-offer/decision',
          {'decision': decision},
          idempotencyKey: 'mobile-order-partial-${widget.orderId}-$decision'));

  Future<void> cancel() async {
    final reason = await _askNote('Why are you cancelling this order?');
    if (reason == null) return;
    await _run(() => widget.session.api.post(
        '/orders/${widget.orderId}/cancel', {'reason': reason},
        idempotencyKey: 'mobile-order-cancel-${widget.orderId}'));
  }

  Future<void> rate() async {
    int score = 5;
    final controller = TextEditingController();
    final submitted = await showDialog<bool>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, setLocal) => AlertDialog(
                  title: const Text('Rate this order'),
                  content: Column(mainAxisSize: MainAxisSize.min, children: [
                    SegmentedButton<int>(
                        segments: [1, 2, 3, 4, 5]
                            .map((value) => ButtonSegment(
                                value: value, label: Text('$value')))
                            .toList(),
                        selected: {score},
                        onSelectionChanged: (value) =>
                            setLocal(() => score = value.first)),
                    const SizedBox(height: 14),
                    TextField(
                        controller: controller,
                        maxLines: 3,
                        decoration: const InputDecoration(
                            labelText: 'Comment (optional)')),
                  ]),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Submit'))
                  ],
                )));
    if (submitted == true) {
      await _run(() => widget.session.api.rateOrder(widget.orderId, score,
          comment: controller.text.trim(),
          idempotencyKey: 'mobile-rating-${widget.orderId}'));
    }
    controller.dispose();
  }

  Future<void> _run(Future<Map<String, dynamic>> Function() action) async {
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
    final order = mapData(data?['order']) ?? {};
    final delivery = mapData(data?['delivery']);
    final route = mapData(data?['route']) ?? {};
    final invoice = mapData(data?['invoice']) ?? {};
    final items = listData(order['items']);
    final pickup = mapPointFrom(route['pickup'],
        fallbackLabel: 'Pickup', kind: MedLineMapPointKind.pickup);
    final dropoff = mapPointFrom(route['dropoff'],
        fallbackLabel: 'Delivery address',
        kind: MedLineMapPointKind.destination);
    final points = [if (pickup != null) pickup, if (dropoff != null) dropoff];
    final status = '${order['status'] ?? 'unknown'}';
    final canPharmacyDecide = widget.role == 'pharmacy' &&
        ['pending_pharmacy_review', 'prescription_review'].contains(status);
    final awaitingPatientPartial =
        widget.role == 'patient' && status == 'partial_approval';
    return Scaffold(
      appBar: AppBar(title: const Text('Order details')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            PageIntro(
                title: '${order['public_id'] ?? 'Order'}',
                subtitle:
                    '${humanize(status)} · ${dateTimeLabel(order['created_at'])}',
                action: StatusPill(status)),
            const SizedBox(height: 16),
            if (points.isNotEmpty) MedLineMap(points: points, height: 270),
            if (points.isNotEmpty) const SizedBox(height: 16),
            MedLineSection(
              title: 'Medicines and prescriptions',
              subtitle:
                  'Each prescription stays attached to its specific medicine.',
              child: Column(
                  children: items
                      .map((item) => _OrderItemCard(
                            item: item,
                            role: widget.role,
                            controller:
                                quantities[int.tryParse('${item['id']}')],
                            editableQuantity: canPharmacyDecide,
                            working: working,
                            onOpenMedicine: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                    builder: (_) => MedicineDetailMobilePage(
                                        session: widget.session,
                                        medicineId:
                                            int.parse('${item['medicine_id']}'),
                                        role: widget.role))),
                            onUpload: widget.role == 'patient' &&
                                    item['prescription_required'] == true
                                ? () => upload(item)
                                : null,
                            onViewPrescription:
                                mapData(item['prescription'])?['id'] != null
                                    ? () => downloadAndShare(
                                          context,
                                          widget.session.api,
                                          path:
                                              '/prescriptions/${mapData(item['prescription'])!['id']}/download',
                                          fileName:
                                              'prescription-${mapData(item['prescription'])!['id']}',
                                          subject: 'Order prescription',
                                        )
                                    : null,
                            onReview: widget.role == 'pharmacy' &&
                                    '${mapData(item['prescription'])?['status']}' ==
                                        'pending_review'
                                ? (decision) => reviewPrescription(
                                    int.parse(
                                        '${mapData(item['prescription'])!['id']}'),
                                    decision)
                                : null,
                          ))
                      .toList()),
            ),
            const SizedBox(height: 12),
            MedLineSection(
                title: 'Order summary',
                child: _Invoice(invoice: invoice, order: order)),
            if (delivery != null) ...[
              const SizedBox(height: 12),
              MedLineSection(
                  title: 'Delivery',
                  subtitle:
                      'Secure handoff codes are emailed only when each verification step is initiated.',
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _KeyValue('Status', humanize('${delivery['status']}')),
                        _KeyValue(
                            'Scheduled',
                            delivery['scheduled_for'] == null
                                ? 'As soon as possible'
                                : dateTimeLabel(delivery['scheduled_for'])),
                        if (mapData(delivery['driver']) != null)
                          _KeyValue('Driver',
                              '${mapData(delivery['driver'])!['name']} · ${humanize('${mapData(delivery['driver'])!['vehicle_type']}')}'),
                      ])),
            ],
            if (listData(data?['timeline']).isNotEmpty) ...[
              const SizedBox(height: 12),
              MedLineSection(
                  title: 'Timeline',
                  child: Column(
                      children: listData(data?['timeline'])
                          .map((event) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.history_rounded),
                              title: Text(humanize('${event['to_status']}')),
                              subtitle: Text(
                                  '${event['note'] ?? ''}${event['note'] == null ? '' : ' · '}${dateTimeLabel(event['created_at'])}')))
                          .toList())),
            ],
            if (canPharmacyDecide) ...[
              const SizedBox(height: 16),
              Text('Order decision',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
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
                    label: const Text('Reject order')),
              ]),
            ],
            if (awaitingPatientPartial) ...[
              const SizedBox(height: 16),
              MedLineSection(
                  title: 'Partial offer',
                  subtitle:
                      '${order['partial_offer_note'] ?? 'The pharmacy changed one or more quantities.'}',
                  child: Row(children: [
                    Expanded(
                        child: FilledButton(
                            onPressed: working
                                ? null
                                : () => patientPartial('approve'),
                            child: const Text('Approve offer'))),
                    const SizedBox(width: 10),
                    Expanded(
                        child: OutlinedButton(
                            onPressed:
                                working ? null : () => patientPartial('reject'),
                            child: const Text('Decline offer'))),
                  ])),
            ],
            if (widget.role == 'patient' &&
                ['completed'].contains(status) &&
                data?['rating'] == null) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                  onPressed: working ? null : rate,
                  icon: const Icon(Icons.star_outline_rounded),
                  label: const Text('Rate this order'))
            ],
            if (widget.role == 'patient' &&
                [
                  'prescription_required',
                  'prescription_review',
                  'pending_pharmacy_review'
                ].contains(status)) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                  onPressed: working ? null : cancel,
                  icon: const Icon(Icons.cancel_outlined),
                  label: const Text('Cancel order'))
            ],
            const SizedBox(height: 28),
          ],
        ),
      ),
    );
  }
}

class _OrderItemCard extends StatelessWidget {
  const _OrderItemCard(
      {required this.item,
      required this.role,
      required this.working,
      required this.onOpenMedicine,
      this.controller,
      this.editableQuantity = false,
      this.onUpload,
      this.onViewPrescription,
      this.onReview});
  final Map<String, dynamic> item;
  final String role;
  final bool working;
  final VoidCallback onOpenMedicine;
  final TextEditingController? controller;
  final bool editableQuantity;
  final VoidCallback? onUpload;
  final VoidCallback? onViewPrescription;
  final ValueChanged<String>? onReview;

  @override
  Widget build(BuildContext context) {
    final prescription = mapData(item['prescription']);
    final required = item['prescription_required'] == true ||
        item['prescription_required_snapshot'] == true;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(
              onTap: onOpenMedicine,
              child: Row(children: [
                Expanded(
                    child: Text('${item['name_en'] ?? 'Medicine'}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: MedLineColors.blue))),
                const Icon(Icons.open_in_new_rounded,
                    size: 18, color: MedLineColors.blue)
              ])),
          const SizedBox(height: 4),
          Text(
              [item['dosage'], item['manufacturer']]
                  .where((value) => value != null && '$value'.isNotEmpty)
                  .join(' · '),
              style: const TextStyle(color: MedLineColors.muted)),
          const SizedBox(height: 10),
          if (editableQuantity)
            TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                    labelText:
                        'Quantity to fulfill (requested ${item['quantity']})'))
          else
            Wrap(spacing: 16, runSpacing: 6, children: [
              Text('Requested ${item['quantity']}',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('Accepted ${item['accepted_quantity'] ?? 0}'),
              Text(money(item['unit_price']),
                  style: const TextStyle(
                      color: MedLineColors.blue, fontWeight: FontWeight.w800))
            ]),
          const SizedBox(height: 10),
          StatusPill(required
              ? '${prescription?['status'] ?? 'prescription required'}'
              : 'no prescription required'),
          if (prescription?['review_note'] != null)
            Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Pharmacist note: ${prescription!['review_note']}',
                    style: const TextStyle(color: MedLineColors.muted))),
          if (onUpload != null ||
              onViewPrescription != null ||
              onReview != null) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (onUpload != null)
                OutlinedButton.icon(
                    onPressed: working ? null : onUpload,
                    icon: const Icon(Icons.upload_file_rounded),
                    label: Text(prescription == null
                        ? 'Upload prescription'
                        : 'Replace prescription')),
              if (onViewPrescription != null)
                OutlinedButton.icon(
                    onPressed: onViewPrescription,
                    icon: const Icon(Icons.visibility_outlined),
                    label: const Text('View document')),
              if (onReview != null)
                FilledButton.tonalIcon(
                    onPressed: working ? null : () => onReview!('approve'),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Approve')),
              if (onReview != null)
                OutlinedButton.icon(
                    onPressed: working ? null : () => onReview!('reject'),
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('Reject')),
            ]),
          ],
        ]),
      ),
    );
  }
}

class _Invoice extends StatelessWidget {
  const _Invoice({required this.invoice, required this.order});
  final Map<String, dynamic> invoice;
  final Map<String, dynamic> order;
  @override
  Widget build(BuildContext context) => Column(children: [
        _KeyValue('Medicines subtotal',
            money(invoice['subtotal'] ?? order['subtotal'])),
        _KeyValue('Tax (${invoice['tax_rate'] ?? order['tax_rate'] ?? 0}%)',
            money(invoice['tax_amount'] ?? order['tax_amount'])),
        _KeyValue('Delivery fee',
            money(invoice['delivery_fee'] ?? order['delivery_fee'])),
        if (invoice['delivery_distance_km'] != null)
          _KeyValue(
              'Road distance', '${invoice['delivery_distance_km']} km'),
        if (invoice['delivery_rate_per_km'] != null)
          _KeyValue('Rate at order time',
              '${money(invoice['delivery_rate_per_km'])} / km'),
        const Divider(height: 24),
        _KeyValue('Total', money(invoice['total'] ?? order['total']),
            strong: true),
      ]);
}

class _KeyValue extends StatelessWidget {
  const _KeyValue(this.label, this.value, {this.strong = false});
  final String label;
  final String value;
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
        const SizedBox(width: 12),
        Flexible(
            child: Text(value,
                textAlign: TextAlign.end,
                style: TextStyle(
                    color: strong ? MedLineColors.blue : MedLineColors.text,
                    fontWeight: FontWeight.w800,
                    fontSize: strong ? 17 : 14)))
      ]));
}

class _DraftMedicine {
  _DraftMedicine(this.record);
  final Map<String, dynamic> record;
  int quantity = 1;
  String? prescriptionPath;
}

class CreateOrderPage extends StatefulWidget {
  const CreateOrderPage({required this.session, super.key});
  final Session session;
  @override
  State<CreateOrderPage> createState() => _CreateOrderPageState();
}

class _CreateOrderPageState extends State<CreateOrderPage> {
  final pharmacySearch = TextEditingController();
  final medicineSearch = TextEditingController();
  final address = TextEditingController();
  final patientNote = TextEditingController();
  final mapController = MapController();
  Timer? debounce;
  Timer? routeDebounce;
  List<Map<String, dynamic>> pharmacySuggestions = [];
  List<Map<String, dynamic>> medicineSuggestions = [];
  Map<String, dynamic>? pharmacy;
  final medicines = <_DraftMedicine>[];
  LatLng? deliveryPin;
  int step = 0;
  bool loading = false;
  bool searching = false;
  String deliveryPreference = 'asap';
  String vehicleType = 'motorcycle';
  DateTime? scheduled;
  Map<String, dynamic> pricing = {};
  Map<String, dynamic>? roadEstimate;
  bool routeLoading = false;
  String? routeError;
  int routeRequest = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_findPharmacies());
    unawaited(_loadPricing());
  }

  @override
  void dispose() {
    debounce?.cancel();
    routeDebounce?.cancel();
    pharmacySearch.dispose();
    medicineSearch.dispose();
    address.dispose();
    patientNote.dispose();
    super.dispose();
  }

  Future<void> _loadPricing() async {
    try {
      final value = await widget.session.api.get('/delivery-pricing/current',
          query: {'vehicle_type': vehicleType});
      if (mounted) setState(() => pricing = value);
    } catch (_) {}
  }

  void _scheduleRoadEstimate() {
    routeDebounce?.cancel();
    routeDebounce = Timer(
        const Duration(milliseconds: 320), () => unawaited(_loadRoadEstimate()));
  }

  Future<void> _loadRoadEstimate() async {
    final fromLatitude = toCoordinate(pharmacy?['latitude']);
    final fromLongitude = toCoordinate(pharmacy?['longitude']);
    final destination = deliveryPin;
    final requestId = ++routeRequest;
    if (fromLatitude == null ||
        fromLongitude == null ||
        destination == null) {
      if (mounted) {
        setState(() {
          roadEstimate = null;
          routeLoading = false;
          routeError = null;
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
            'to_latitude': '${destination.latitude}',
            'to_longitude': '${destination.longitude}',
            'vehicle_type': vehicleType,
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

  void _debounce(VoidCallback callback) {
    debounce?.cancel();
    debounce = Timer(const Duration(milliseconds: 320), callback);
  }

  Future<void> _findPharmacies() async {
    setState(() => searching = true);
    try {
      final result = await widget.session.api.get('/partners', query: {
        'type': 'pharmacy',
        'search': pharmacySearch.text.trim(),
        'per_page': '20'
      });
      if (mounted) setState(() => pharmacySuggestions = listData(result));
    } catch (_) {
      if (mounted) setState(() => pharmacySuggestions = []);
    } finally {
      if (mounted) setState(() => searching = false);
    }
  }

  Future<void> _findMedicines() async {
    if (pharmacy == null) return;
    setState(() => searching = true);
    try {
      final result = await widget.session.api.get('/medicines', query: {
        'partner_id': '${pharmacy!['id']}',
        'inventory_type': 'pharmacy',
        'available_only': '1',
        'search': medicineSearch.text.trim(),
        'per_page': '20'
      });
      if (mounted) setState(() => medicineSuggestions = listData(result));
    } catch (_) {
      if (mounted) setState(() => medicineSuggestions = []);
    } finally {
      if (mounted) setState(() => searching = false);
    }
  }

  void selectPharmacy(Map<String, dynamic> selected) {
    setState(() {
      pharmacy = selected;
      pharmacySearch.text = '${selected['business_name']}';
      medicineSuggestions = [];
      medicines.clear();
      roadEstimate = null;
      routeError = null;
    });
    final lat = toCoordinate(selected['latitude']);
    final lon = toCoordinate(selected['longitude']);
    if (lat != null && lon != null) {
      mapController.move(LatLng(lat, lon), 14);
    }
    _scheduleRoadEstimate();
  }

  void addMedicine(Map<String, dynamic> selected) {
    if (medicines
        .any((entry) => '${entry.record['id']}' == '${selected['id']}')) {
      return;
    }
    setState(() {
      medicines.add(_DraftMedicine(selected));
      medicineSearch.clear();
      medicineSuggestions = [];
    });
  }

  Future<void> pickPrescription(_DraftMedicine item) async {
    final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf']);
    if (result?.files.single.path != null) {
      setState(() => item.prescriptionPath = result!.files.single.path);
    }
  }

  double? get distanceKm =>
      double.tryParse('${roadEstimate?['distance_km'] ?? ''}');

  double get rate {
    final estimatedRate =
        double.tryParse('${roadEstimate?['rate_per_km'] ?? ''}');
    if (estimatedRate != null) return estimatedRate;
    final rates = listData(pricing['rates']);
    final match = rates.where((row) => '${row['vehicle_type']}' == vehicleType);
    return double.tryParse(
            '${match.isNotEmpty ? match.first['rate_per_km'] : pricing['rate_per_km'] ?? 0}') ??
        0;
  }

  double get subtotal => medicines.fold(
      0,
      (sum, item) =>
          sum +
          (double.tryParse('${item.record['unit_price']}') ?? 0) *
              item.quantity);
  double? get deliveryFee =>
      double.tryParse('${roadEstimate?['fee'] ?? ''}');
  double get tax =>
      subtotal *
      ((double.tryParse('${pricing['tax_rate_percent']}') ?? 0) / 100);

  bool _canOpen(int target) =>
      target == 0 ||
      (target == 1 && pharmacy != null) ||
      (target == 2 &&
          pharmacy != null &&
          medicines.isNotEmpty &&
          medicines
              .where((item) => item.record['prescription_required'] == true)
              .every((item) => item.prescriptionPath != null));
  void go(int target) {
    if (!_canOpen(target)) {
      showMessage(
          context,
          target == 1
              ? 'Select a pharmacy first.'
              : 'Add medicines and attach every required prescription first.',
          error: true);
      return;
    }
    setState(() => step = target);
  }

  Future<void> scheduleDate() async {
    final date = await showDatePicker(
        context: context,
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 90)),
        initialDate: scheduled ?? DateTime.now().add(const Duration(days: 1)));
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context,
        initialTime: TimeOfDay.fromDateTime(
            scheduled ?? DateTime.now().add(const Duration(hours: 2))));
    if (time != null) {
      setState(() => scheduled =
          DateTime(date.year, date.month, date.day, time.hour, time.minute));
    }
  }

  Future<void> submit() async {
    if (deliveryPin == null || address.text.trim().isEmpty) {
      showMessage(context,
          'Pin the delivery address and enter a readable address label.',
          error: true);
      return;
    }
    if (deliveryPreference == 'scheduled' && scheduled == null) {
      showMessage(context, 'Choose the delivery date and time.', error: true);
      return;
    }
    if (roadEstimate == null || routeLoading) {
      showMessage(context,
          routeError ?? 'Wait for the calculated road route before creating the order.',
          error: true);
      if (!routeLoading) unawaited(_loadRoadEstimate());
      return;
    }
    setState(() => loading = true);
    try {
      final response = await widget.session.api.createOrder({
        'pharmacy_id': pharmacy!['id'],
        'delivery_address_snapshot': address.text.trim(),
        'delivery_latitude': deliveryPin!.latitude,
        'delivery_longitude': deliveryPin!.longitude,
        'delivery_preference': deliveryPreference,
        'delivery_vehicle_type': vehicleType,
        if (scheduled != null && deliveryPreference == 'scheduled')
          'scheduled_delivery_at': scheduled!.toUtc().toIso8601String(),
        if (patientNote.text.trim().isNotEmpty)
          'patient_note': patientNote.text.trim(),
        'items': medicines
            .map((item) =>
                {'medicine_id': item.record['id'], 'quantity': item.quantity})
            .toList(),
      },
          idempotencyKey:
              'mobile-order-${DateTime.now().microsecondsSinceEpoch}');
      final created = mapData(response['order']) ?? {};
      final createdItems = listData(created['items']);
      for (final draft
          in medicines.where((item) => item.prescriptionPath != null)) {
        final createdItem = createdItems.where(
            (item) => '${item['medicine_id']}' == '${draft.record['id']}');
        if (createdItem.isNotEmpty) {
          await widget.session.api.uploadItemPrescription(
              int.parse('${created['id']}'),
              int.parse('${createdItem.first['id']}'),
              draft.prescriptionPath!,
              idempotencyKey:
                  'mobile-order-rx-${created['id']}-${createdItem.first['id']}');
        }
      }
      if (mounted) {
        showMessage(context, 'Order created. The newest order is shown first.');
        Navigator.pop(context, true);
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pharmacyPoint = mapPointFrom(pharmacy,
        fallbackLabel: 'Selected pharmacy', kind: MedLineMapPointKind.pharmacy);
    final selectedPoint = deliveryPin == null
        ? null
        : MedLineMapPoint(
            latitude: deliveryPin!.latitude,
            longitude: deliveryPin!.longitude,
            label: 'Delivery address');
    return Scaffold(
      appBar: AppBar(title: const Text('Create medicine order')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const PageIntro(
            title: 'Create a medicine order',
            subtitle:
                'Select a pharmacy, add all medicines with item-specific prescriptions, then confirm delivery and cost.'),
        const SizedBox(height: 16),
        Row(
            children: List.generate(
                3,
                (index) => Expanded(
                    child: Padding(
                        padding:
                            EdgeInsetsDirectional.only(end: index < 2 ? 6 : 0),
                        child: _StepButton(
                            number: index + 1,
                            label: const [
                              'Pharmacy',
                              'Medicines',
                              'Delivery'
                            ][index],
                            active: step == index,
                            complete: index == 0
                                ? pharmacy != null
                                : index == 1
                                    ? medicines.isNotEmpty
                                    : deliveryPin != null,
                            onTap: () => go(index)))))),
        const SizedBox(height: 16),
        if (step == 0) _stepPharmacy(pharmacyPoint),
        if (step == 1) _stepMedicines(),
        if (step == 2) _stepDelivery(pharmacyPoint, selectedPoint),
      ]),
    );
  }

  Widget _stepPharmacy(MedLineMapPoint? point) => MedLineSection(
      title: '1. Select pharmacy',
      subtitle:
          'Search by name or address. Selecting a result zooms to its approved location.',
      child: Column(children: [
        TextField(
            controller: pharmacySearch,
            onChanged: (_) => _debounce(_findPharmacies),
            decoration: const InputDecoration(
                labelText: 'Search pharmacies',
                prefixIcon: Icon(Icons.search_rounded))),
        if (pharmacy == null)
          ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 250),
              child: Card(
                  child: searching
                      ? const Center(child: CircularProgressIndicator())
                      : ListView.builder(
                          shrinkWrap: true,
                          itemCount: pharmacySuggestions.length,
                          itemBuilder: (_, index) {
                            final row = pharmacySuggestions[index];
                            return ListTile(
                                onTap: () => selectPharmacy(row),
                                leading:
                                    const Icon(Icons.local_pharmacy_outlined),
                                title: Text('${row['business_name']}'),
                                subtitle: Text('${row['address'] ?? ''}'));
                          }))),
        if (point != null) ...[
          const SizedBox(height: 12),
          MedLineMap(
              points: [point], controller: mapController, drawRoute: false),
          const SizedBox(height: 12),
          Align(
              alignment: AlignmentDirectional.centerEnd,
              child: FilledButton.icon(
                  onPressed: () => go(1),
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: const Text('Next: Select medicine')))
        ],
      ]));

  Widget _stepMedicines() => MedLineSection(
      title: '2. Select medicines',
      subtitle:
          'Add multiple medicines. Every prescription-required item needs its own file.',
      child: Column(children: [
        TextField(
            controller: medicineSearch,
            onChanged: (_) => _debounce(_findMedicines),
            decoration: const InputDecoration(
                labelText: 'Medicine',
                hintText: 'Name, Arabic name, manufacturer, or code',
                prefixIcon: Icon(Icons.search_rounded))),
        if (medicineSearch.text.isNotEmpty)
          ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 230),
              child: Card(
                  child: searching
                      ? const Center(child: CircularProgressIndicator())
                      : ListView.builder(
                          shrinkWrap: true,
                          itemCount: medicineSuggestions.length,
                          itemBuilder: (_, index) {
                            final row = medicineSuggestions[index];
                            return ListTile(
                                onTap: () => addMedicine(row),
                                title: Text('${row['name_en']}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                    '${row['manufacturer'] ?? ''} · ${money(row['unit_price'])} · ${row['available_quantity'] ?? 0} available'),
                                trailing: row['prescription_required'] == true
                                    ? const Icon(Icons.receipt_long_outlined,
                                        color: MedLineColors.warning)
                                    : const Icon(
                                        Icons.add_circle_outline_rounded));
                          }))),
        ...medicines.map((item) => Card(
            child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Expanded(
                            child: InkWell(
                                onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(
                                        builder: (_) =>
                                            MedicineDetailMobilePage(
                                                session: widget.session,
                                                medicineId: int.parse(
                                                    '${item.record['id']}'),
                                                role: 'patient'))),
                                child: Text('${item.record['name_en']}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        color: MedLineColors.blue)))),
                        IconButton(
                            onPressed: () =>
                                setState(() => medicines.remove(item)),
                            icon: const Icon(Icons.delete_outline_rounded,
                                color: MedLineColors.danger))
                      ]),
                      Row(children: [
                        Expanded(
                            child: Text(
                                '${money(item.record['unit_price'])} each')),
                        IconButton(
                            onPressed: item.quantity > 1
                                ? () => setState(() => item.quantity--)
                                : null,
                            icon: const Icon(Icons.remove_circle_outline)),
                        Text('${item.quantity}',
                            style:
                                const TextStyle(fontWeight: FontWeight.w800)),
                        IconButton(
                            onPressed: item.quantity <
                                    (int.tryParse(
                                            '${item.record['available_quantity']}') ??
                                        100)
                                ? () => setState(() => item.quantity++)
                                : null,
                            icon: const Icon(Icons.add_circle_outline))
                      ]),
                      if (item.record['prescription_required'] == true)
                        OutlinedButton.icon(
                            onPressed: () => pickPrescription(item),
                            icon: Icon(item.prescriptionPath == null
                                ? Icons.upload_file_rounded
                                : Icons.check_circle_outline_rounded),
                            label: Text(item.prescriptionPath == null
                                ? 'Attach prescription for this medicine'
                                : 'Prescription attached')),
                    ])))),
        const SizedBox(height: 8),
        Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton.icon(
                onPressed: medicines.isNotEmpty ? () => go(2) : null,
                icon: const Icon(Icons.arrow_forward_rounded),
                label: const Text('Next: Select delivery address'))),
      ]));

  Widget _stepDelivery(
          MedLineMapPoint? pharmacyPoint, MedLineMapPoint? selectedPoint) =>
      MedLineSection(
          title: '3. Select delivery address',
          subtitle:
              'Tap the map to pin the destination, choose timing and vehicle type, then review the permanent cost snapshot.',
          child: Column(children: [
            MedLineMap(
                points: [if (pharmacyPoint != null) pharmacyPoint],
                selectedPoint: selectedPoint,
                routeCoordinates:
                    mapRouteCoordinates(roadEstimate?['route_geometry']),
                onTap: (point) {
                  setState(() {
                    deliveryPin = point;
                    roadEstimate = null;
                    routeError = null;
                  });
                  _scheduleRoadEstimate();
                }),
            const SizedBox(height: 12),
            TextField(
                controller: address,
                decoration: const InputDecoration(
                    labelText: 'Delivery address label',
                    prefixIcon: Icon(Icons.location_on_outlined))),
            const SizedBox(height: 12),
            SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                      value: 'asap',
                      label: Text('As soon as possible'),
                      icon: Icon(Icons.bolt_rounded)),
                  ButtonSegment(
                      value: 'scheduled',
                      label: Text('Schedule'),
                      icon: Icon(Icons.schedule_rounded))
                ],
                selected: {
                  deliveryPreference
                },
                onSelectionChanged: (value) =>
                    setState(() => deliveryPreference = value.first)),
            if (deliveryPreference == 'scheduled') ...[
              const SizedBox(height: 10),
              ListTile(
                  onTap: scheduleDate,
                  tileColor: MedLineColors.paleBlue,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  leading: const Icon(Icons.calendar_month_outlined),
                  title: Text(scheduled == null
                      ? 'Choose date and time'
                      : dateTimeLabel(scheduled)),
                  trailing: const Icon(Icons.chevron_right_rounded))
            ],
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
                initialValue: vehicleType,
                decoration:
                    const InputDecoration(labelText: 'Delivery vehicle'),
                items: const ['bicycle', 'motorcycle', 'car', 'van']
                    .map((type) => DropdownMenuItem(
                        value: type, child: Text(humanize(type))))
                    .toList(),
                onChanged: (value) {
                  if (value == null) return;
                  setState(() {
                    vehicleType = value;
                    roadEstimate = null;
                    routeError = null;
                  });
                  unawaited(_loadPricing());
                  _scheduleRoadEstimate();
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
              MedLineErrorState(
                  message: routeError!, onRetry: _loadRoadEstimate),
            ],
            const SizedBox(height: 12),
            TextField(
                controller: patientNote,
                maxLines: 3,
                decoration: const InputDecoration(
                    labelText: 'Note to pharmacy or driver (optional)')),
            const SizedBox(height: 14),
            DecoratedBox(
                decoration: BoxDecoration(
                    color: MedLineColors.paleBlue,
                    borderRadius: BorderRadius.circular(14)),
                child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(children: [
                      _KeyValue('Medicines subtotal', money(subtotal)),
                      _KeyValue('Road distance', distanceKm == null
                          ? 'Waiting for route'
                          : '${distanceKm!.toStringAsFixed(2)} km'),
                      _KeyValue('Rate', '${money(rate)} / km'),
                      _KeyValue('Route-based delivery fee',
                          deliveryFee == null ? 'Waiting for route' : money(deliveryFee)),
                      _KeyValue('Tax', money(tax)),
                      const Divider(),
                      _KeyValue('Estimated total',
                          deliveryFee == null
                              ? 'Waiting for route'
                              : money(subtotal + deliveryFee! + tax),
                          strong: true),
                    ]))),
            const SizedBox(height: 14),
            Align(
                alignment: AlignmentDirectional.centerEnd,
                child: AsyncActionButton(
                    label: 'Create order',
                    onPressed: roadEstimate == null ? null : submit,
                    busy: loading || routeLoading,
                    icon: Icons.check_circle_outline_rounded)),
          ]));
}

class _StepButton extends StatelessWidget {
  const _StepButton(
      {required this.number,
      required this.label,
      required this.active,
      required this.complete,
      required this.onTap});
  final int number;
  final String label;
  final bool active;
  final bool complete;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
      button: true,
      label: 'Step $number $label',
      child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
              constraints: const BoxConstraints(minHeight: 72),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
              decoration: BoxDecoration(
                  color: active
                      ? MedLineColors.paleBlue
                      : complete
                          ? const Color(0xffe8f7f0)
                          : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: active ? MedLineColors.blue : MedLineColors.border,
                      width: active ? 2 : 1)),
              child: Column(children: [
                CircleAvatar(
                    radius: 14,
                    backgroundColor: complete
                        ? MedLineColors.success
                        : active
                            ? MedLineColors.blue
                            : MedLineColors.border,
                    foregroundColor:
                        complete || active ? Colors.white : MedLineColors.muted,
                    child:
                        Icon(complete ? Icons.check_rounded : null, size: 16)),
                const SizedBox(height: 6),
                Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w800))
              ]))));
}
