import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';

import '../../core/mobile_ui.dart';
import '../../core/session.dart';
import '../maps/medline_map.dart';
import '../medicine/medicine_pages.dart';
import '../workspace/record_list.dart';

const deliveryStatuses = <String, String>{
  'available': 'Available',
  'claimed': 'Claimed',
  'pickup_started': 'Pickup started',
  'picked_up': 'In transit',
  'in_transit': 'In transit',
  'arrived': 'Arrived',
  'delivered': 'Delivered',
  'failed': 'Failed',
  'cancelled': 'Cancelled',
};

class DeliveriesPage extends StatefulWidget {
  const DeliveriesPage(
      {required this.session,
      required this.role,
      this.availableOnly = false,
      super.key});
  final Session session;
  final String role;
  final bool availableOnly;
  @override
  State<DeliveriesPage> createState() => _DeliveriesPageState();
}

class _DeliveriesPageState extends State<DeliveriesPage> {
  int revision = 0;
  Future<void> open(BuildContext context, Map<String, dynamic> row) async {
    await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => DeliveryDetailPage(
                session: widget.session,
                role: widget.role,
                id: int.parse('${row['id']}'))));
    if (mounted) setState(() => revision++);
  }

  String get endpoint => widget.availableOnly
      ? '/deliveries/available'
      : widget.role == 'admin'
          ? '/admin/deliveries'
          : widget.role == 'pharmacy' || widget.role == 'warehouse'
              ? '/partner/deliveries'
              : '/deliveries/mine';
  @override
  Widget build(BuildContext context) => MobileRecordListPage(
      key:
          ValueKey('delivery-${widget.role}-${widget.availableOnly}-$revision'),
      session: widget.session,
      config: RecordListConfig(
          title:
              widget.availableOnly ? 'Available orders' : 'Deliveries',
          subtitle: widget.availableOnly
              ? 'Open an order to review its road route, schedule, manifest, vehicle requirement, and route-based fee before accepting it.'
              : 'Open a delivery for its live route, complete medicine manifest, cost snapshot, and status timeline.',
          endpoint: endpoint,
          primary: (row) => '${row['public_id'] ?? 'Delivery ${row['id']}'}',
          secondary: (row) =>
              '${row['order_public_id'] ?? row['procurement_public_id'] ?? 'Related order'} · ${row['delivery_address_snapshot'] ?? ''}',
          tertiary: (row) => row['scheduled_for'] == null
              ? 'As soon as possible'
              : 'Scheduled ${dateTimeLabel(row['scheduled_for'])}',
          status: (row) => '${row['status'] ?? 'unknown'}',
          amount: (row) => money(row['job_price']),
          date: (row) => dateTimeLabel(row['created_at']),
          statusOptions: widget.availableOnly
              ? const {'available': 'Available'}
              : deliveryStatuses,
          sortOptions: const {
            'Newest': 'created_at',
            'Oldest': 'created_at',
            'Highest fee': 'job_price',
            'Soonest scheduled': 'scheduled_for'
          },
          icon: Icons.local_shipping_outlined,
          onOpen: open));
}

class DeliveryDetailPage extends StatefulWidget {
  const DeliveryDetailPage(
      {required this.session, required this.role, required this.id, super.key});
  final Session session;
  final String role;
  final int id;
  @override
  State<DeliveryDetailPage> createState() => _DeliveryDetailPageState();
}

class _DeliveryDetailPageState extends State<DeliveryDetailPage> {
  Map<String, dynamic>? data;
  bool loading = true;
  bool working = false;
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
      final response = await widget.session.api.get('/deliveries/${widget.id}');
      if (mounted) setState(() => data = response);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> run(Future<Map<String, dynamic>> Function() action) async {
    setState(() => working = true);
    try {
      final response = await action();
      if (mounted) {
        showMessage(context, '${response['message'] ?? 'Delivery updated.'}');
      }
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      await load();
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> acceptOrder() async {
    final ok = await confirmAction(context,
        title: 'Accept this order?',
        message:
            'You are committing to the calculated road route, schedule, vehicle requirement, and displayed route-based fee.',
        confirmLabel: 'Accept order');
    if (ok) {
      await run(() => widget.session.api.post(
          '/deliveries/${widget.id}/accept-order', {},
          idempotencyKey: 'mobile-order-accept-${widget.id}'));
    }
  }

  Future<void> update(String status) async {
    String? reason;
    if (status == 'failed') {
      reason = await ask('Explain why the delivery failed');
      if (reason == null) return;
    }
    await _sendLocation();
    await run(() => widget.session.api.post('/deliveries/${widget.id}/status',
        {'status': status, if (reason != null) 'failure_reason': reason},
        idempotencyKey: 'mobile-delivery-${widget.id}-$status'));
  }

  Future<void> _sendLocation() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }
      final position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 12)));
      await widget.session.api.post('/deliveries/${widget.id}/location', {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy_meters': position.accuracy
      });
    } catch (_) {}
  }

  Future<String?> ask(String title) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(title),
                content: TextField(
                    controller: controller,
                    autofocus: true,
                    keyboardType: TextInputType.text,
                    maxLength: 1000,
                    minLines: 3,
                    maxLines: 6,
                    decoration:
                        const InputDecoration(labelText: 'Reason (required)')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () {
                        final value = controller.text.trim();
                        if (value.length >= 5) {
                          Navigator.pop(context, value);
                        }
                      },
                      child: const Text('Continue'))
                ]));
    controller.dispose();
    return result;
  }

  Future<String?> verificationCode(String title, String guidance) =>
      showDialog<String>(
          context: context,
          builder: (_) => _VerificationCodeDialog(
              title: title, guidance: guidance));

  Future<void> initiatePickupVerification() => run(() => widget.session.api
      .post('/deliveries/${widget.id}/pickup-verification/initiate', {}));

  Future<void> verifyPickup() async {
    final code = await verificationCode('Verify driver pickup',
        'Enter the 4-digit code shown by the driver before handing over any medicines.');
    if (code != null) {
      await run(() => widget.session.api.post(
          '/deliveries/${widget.id}/pickup-verification/verify',
          {'code': code}));
    }
  }

  Future<void> initiateRecipientVerification() async {
    await _sendLocation();
    await run(() => widget.session.api.post(
        '/deliveries/${widget.id}/recipient-verification/initiate', {}));
  }

  Future<void> verifyRecipient() async {
    final code = await verificationCode('Verify recipient handoff',
        'Enter the 4-digit code given to you by the recipient. Complete this before handing over the medicines.');
    if (code != null) {
      await run(() => widget.session.api.post(
          '/deliveries/${widget.id}/recipient-verification/verify',
          {'code': code},
          idempotencyKey:
              'mobile-recipient-verification-${widget.id}-${DateTime.now().millisecondsSinceEpoch}'));
    }
  }

  Future<void> reassign() async {
    final reason =
        await ask('Reason for returning this failed delivery to the queue');
    if (reason != null) {
      await run(() => widget.session.api.post(
          '/admin/deliveries/${widget.id}/reassign', {'reason': reason},
          idempotencyKey: 'mobile-delivery-reassign-${widget.id}'));
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
    final delivery = mapData(data?['delivery']) ?? {};
    final recipient = mapData(data?['recipient']) ?? {};
    final route = mapData(data?['route']) ?? {};
    final pickupDetails = mapData(route['pickup']) ?? {};
    final items = listData(data?['items']);
    final events = listData(data?['events']);
    final pickup = mapPointFrom(pickupDetails,
        fallbackLabel: 'Pickup', kind: MedLineMapPointKind.pickup);
    final dropoff = mapPointFrom(route['dropoff'],
        fallbackLabel: 'Delivery address',
        kind: MedLineMapPointKind.destination);
    final driverLat = toCoordinate(delivery['last_latitude']);
    final driverLon = toCoordinate(delivery['last_longitude']);
    final points = <MedLineMapPoint>[
      if (pickup != null) pickup,
      if (dropoff != null) dropoff,
      if (driverLat != null && driverLon != null)
        MedLineMapPoint(
            latitude: driverLat,
            longitude: driverLon,
            label: 'Driver live location',
            kind: MedLineMapPointKind.driver)
    ];
    final status = '${delivery['status'] ?? 'unknown'}';
    return Scaffold(
        appBar: AppBar(title: const Text('Delivery details')),
        body: RefreshIndicator(
            onRefresh: load,
            child: ListView(padding: const EdgeInsets.all(16), children: [
              PageIntro(
                  title: '${delivery['public_id'] ?? 'Delivery'}',
                  subtitle:
                      '${delivery['order_public_id'] ?? delivery['procurement_public_id'] ?? humanize('${delivery['source_type']}')} · ${delivery['scheduled_for'] == null ? 'As soon as possible' : dateTimeLabel(delivery['scheduled_for'])}',
                  action: StatusPill(status)),
              const SizedBox(height: 16),
              if (points.isNotEmpty)
                MedLineMap(
                    points: points,
                    routeCoordinates: mapRouteCoordinates(route['geometry']),
                    height: 310),
              if (points.isNotEmpty) const SizedBox(height: 12),
              MedLineSection(
                  title: 'Route and compensation',
                    child: Column(children: [
                    _Line('Pickup',
                        '${pickupDetails['label'] ?? pickupDetails['business_name'] ?? 'Pickup location'}'),
                    _Line('Destination',
                        '${delivery['delivery_address_snapshot'] ?? mapData(route['dropoff'])?['label'] ?? ''}'),
                    _Line(
                        'Vehicle',
                        humanize(
                            '${delivery['delivery_vehicle_type'] ?? 'motorcycle'}')),
                    _Line('Road distance',
                        '${delivery['delivery_distance_km'] ?? '—'} km'),
                    _Line('Rate snapshot',
                        '${money(delivery['delivery_rate_per_km'])} / km'),
                    _Line('Driver fee', money(delivery['job_price']),
                        strong: true)
                  ])),
              if (widget.role == 'driver') ...[
                const SizedBox(height: 12),
                MedLineSection(
                    title:
                        '${humanize('${pickupDetails['type'] ?? 'pickup'}')} information',
                    subtitle:
                        'Pickup organization and contact information.',
                    child: Column(children: [
                      _Line('Organization',
                          '${pickupDetails['business_name'] ?? pickupDetails['label'] ?? 'Not provided'}'),
                      _Line('Contact name',
                          '${pickupDetails['contact_name'] ?? 'Not provided'}'),
                      _Line('Email',
                          '${pickupDetails['contact_email'] ?? 'Not provided'}'),
                      _Line('Phone',
                          '${pickupDetails['contact_phone'] ?? 'Not provided'}'),
                      _Line('Pickup address',
                          '${pickupDetails['address'] ?? 'Not provided'}',
                          strong: true)
                    ])),
                const SizedBox(height: 12),
                MedLineSection(
                    title: 'Delivery recipient',
                    subtitle:
                        'Contact information and the exact destination for this handoff.',
                    child: Column(children: [
                      _Line(
                          'Recipient',
                          '${recipient['organization_name'] ?? recipient['name'] ?? 'Not provided'}'),
                      _Line('Contact name',
                          '${recipient['name'] ?? 'Not provided'}'),
                      _Line('Email',
                          '${recipient['email'] ?? 'Not provided'}'),
                      _Line('Phone',
                          '${recipient['phone'] ?? 'Not provided'}'),
                      _Line(
                          'Delivery destination',
                          '${delivery['delivery_address_snapshot'] ?? mapData(route['dropoff'])?['label'] ?? 'Not provided'}',
                          strong: true)
                    ]))
              ],
              const SizedBox(height: 12),
              MedLineSection(
                  title: 'Pickup manifest',
                  subtitle:
                      'Verify every medicine and quantity before leaving the pickup location.',
                  child: Column(
                      children: items
                          .map((item) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) => MedicineDetailMobilePage(
                                          session: widget.session,
                                          medicineId: int.parse(
                                              '${item['medicine_id']}'),
                                          role: widget.role))),
                              leading: const Icon(Icons.medication_outlined),
                              title: Text('${item['name_en']}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      color: MedLineColors.blue)),
                              subtitle: Text([item['dosage'], item['manufacturer']]
                                  .where((value) =>
                                      value != null && '$value'.isNotEmpty)
                                  .join(' · ')),
                              trailing: Text('× ${item['pickup_quantity']}', style: const TextStyle(fontWeight: FontWeight.w900))))
                          .toList())),
              if (mapData(delivery['driver']) != null) ...[
                const SizedBox(height: 12),
                MedLineSection(
                    title: 'Assigned driver',
                    child: Column(children: [
                      _Line('Name', '${mapData(delivery['driver'])!['name']}'),
                      _Line(
                          'Vehicle',
                          humanize(
                              '${mapData(delivery['driver'])!['vehicle_type']}')),
                      _Line('Plate',
                          '${mapData(delivery['driver'])!['vehicle_plate'] ?? 'Not recorded'}')
                    ]))
              ],
              if (status != 'available') ...[
                const SizedBox(height: 12),
                _verificationSection(delivery),
              ],
              if (events.isNotEmpty) ...[
                const SizedBox(height: 12),
                MedLineSection(
                    title: 'Delivery timeline',
                    child: Column(
                        children: events
                            .map((event) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(Icons.history_rounded),
                                title: Text(humanize('${event['to_status']}')),
                                subtitle: Text(
                                    '${dateTimeLabel(event['created_at'])}${event['note'] == null ? '' : ' · ${event['note']}'}')))
                            .toList()))
              ],
              if (widget.role == 'driver') ..._driverActions(status, delivery),
              if (widget.role == 'admin' && status == 'failed') ...[
                const SizedBox(height: 16),
                AsyncActionButton(
                    label: 'Return to available queue',
                    onPressed: reassign,
                    busy: working,
                    icon: Icons.restart_alt_rounded)
              ],
              const SizedBox(height: 28),
            ])));
  }

  List<Widget> _driverActions(String status, Map<String, dynamic> delivery) {
    final actions = <Widget>[];
    VoidCallback? callback;
    String? label;
    IconData icon = Icons.arrow_forward_rounded;
    if (status == 'available' && delivery['can_accept_order'] == true) {
      label = 'Accept this order';
      callback = acceptOrder;
      icon = Icons.local_shipping_outlined;
    } else if (status == 'picked_up' || status == 'in_transit') {
      label = 'Mark arrived';
      callback = () => update('arrived');
      icon = Icons.location_on_outlined;
    }
    if (label != null) {
      actions.add(const SizedBox(height: 16));
      actions.add(AsyncActionButton(
          label: label, onPressed: callback!, busy: working, icon: icon));
    }
    if (['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived']
        .contains(status)) {
      actions.add(const SizedBox(height: 8));
      actions.add(OutlinedButton.icon(
          onPressed: working ? null : () => update('failed'),
          icon: const Icon(Icons.report_problem_outlined),
          label: const Text('Report failed delivery')));
    }
    return actions;
  }

  Widget _verificationSection(Map<String, dynamic> delivery) {
    final verification = mapData(delivery['verification']) ?? {};
    final pickup = mapData(verification['pickup']) ?? {'state': 'not_started'};
    final recipient =
        mapData(verification['recipient']) ?? {'state': 'not_started'};
    final pickupPartner = delivery['viewer_is_pickup_partner'] == true;
    final recipientViewer = delivery['viewer_is_recipient'] == true;

    return MedLineSection(
        title: 'Two-step handoff verification',
        subtitle:
            'Separate 4-digit codes protect pickup from the fulfilment partner and final delivery to the recipient.',
        child: Column(children: [
          _VerificationStepCard(
              number: 1,
              title: 'Pickup partner → driver',
              state: '${pickup['state'] ?? 'not_started'}',
              expiresAt: pickup['expires_at'],
              description: pickupPartner
                  ? 'When the driver arrives, email a code to the driver. Enter the code shown in person before handing over medicines.'
                  : widget.role == 'driver'
                      ? 'The pickup partner sends this code to your email. Show it to staff so they can verify the handoff.'
                      : 'The fulfilment partner verifies the driver pickup before the trip starts.',
              actions: [
                if (pickupPartner &&
                    delivery['can_initiate_pickup_verification'] == true)
                  AsyncActionButton(
                      label: pickup['state'] == 'not_started'
                          ? 'Send code to driver'
                          : 'Send a new code',
                      onPressed: initiatePickupVerification,
                      busy: working,
                      icon: Icons.mark_email_unread_outlined),
                if (pickupPartner && delivery['can_verify_pickup'] == true)
                  AsyncActionButton(
                      label: 'Verify driver pickup',
                      onPressed: verifyPickup,
                      busy: working,
                      icon: Icons.verified_user_outlined),
              ]),
          const SizedBox(height: 12),
          _VerificationStepCard(
              number: 2,
              title: 'Driver → recipient',
              state: '${recipient['state'] ?? 'not_started'}',
              expiresAt: recipient['expires_at'],
              description: widget.role == 'driver'
                  ? 'At the destination, email a code to the recipient. Enter it before handing over medicines.'
                  : recipientViewer
                      ? 'At arrival, you receive a code by email. Give it to the driver only after inspecting the order.'
                      : 'The driver verifies the recipient before completing the medicine handoff.',
              actions: [
                if (widget.role == 'driver' &&
                    delivery['can_initiate_recipient_verification'] == true)
                  AsyncActionButton(
                      label: recipient['state'] == 'not_started'
                          ? 'Send code to recipient'
                          : 'Send a new code',
                      onPressed: initiateRecipientVerification,
                      busy: working,
                      icon: Icons.mark_email_unread_outlined),
                if (widget.role == 'driver' &&
                    delivery['can_verify_recipient'] == true)
                  AsyncActionButton(
                      label: 'Verify & complete handoff',
                      onPressed: verifyRecipient,
                      busy: working,
                      icon: Icons.verified_outlined),
              ])
        ]));
  }
}

class _VerificationStepCard extends StatelessWidget {
  const _VerificationStepCard(
      {required this.number,
      required this.title,
      required this.state,
      required this.description,
      required this.actions,
      this.expiresAt});
  final int number;
  final String title, state, description;
  final dynamic expiresAt;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final verified = state == 'verified';
    final attention = state == 'expired' || state == 'locked';
    final color = verified
        ? MedLineColors.success
        : attention
            ? MedLineColors.danger
            : MedLineColors.blue;
    return Semantics(
        container: true,
        label: 'Verification step $number, ${humanize(state)}',
        child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
                color: color.withValues(alpha: .055),
                border: Border.all(color: color.withValues(alpha: .28)),
                borderRadius: BorderRadius.circular(16)),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(12)),
                    child: Text('$number',
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900))),
                const SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(title,
                          style: const TextStyle(
                              color: MedLineColors.text,
                              fontWeight: FontWeight.w900,
                              fontSize: 15)),
                      const SizedBox(height: 5),
                      Text(humanize(state),
                          style: TextStyle(
                              color: color,
                              fontSize: 12,
                              fontWeight: FontWeight.w800))
                    ]))
              ]),
              const SizedBox(height: 12),
              Text(description,
                  style: const TextStyle(
                      color: MedLineColors.muted, height: 1.5)),
              if (expiresAt != null && state == 'code_sent') ...[
                const SizedBox(height: 6),
                Text('Expires ${dateTimeLabel(expiresAt)}',
                    style: const TextStyle(
                        color: MedLineColors.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700))
              ],
              for (final action in actions) ...[
                const SizedBox(height: 12),
                SizedBox(width: double.infinity, child: action)
              ]
            ])));
  }
}

class _VerificationCodeDialog extends StatefulWidget {
  const _VerificationCodeDialog(
      {required this.title, required this.guidance});
  final String title, guidance;

  @override
  State<_VerificationCodeDialog> createState() =>
      _VerificationCodeDialogState();
}

class _VerificationCodeDialogState extends State<_VerificationCodeDialog> {
  final formKey = GlobalKey<FormState>();
  final controller = TextEditingController();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
      title: Text(widget.title),
      content: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(widget.guidance,
                style: const TextStyle(color: MedLineColors.muted, height: 1.45)),
            const SizedBox(height: 16),
            TextFormField(
                controller: controller,
                autofocus: true,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                textDirection: TextDirection.ltr,
                textAlign: TextAlign.center,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(4)
                ],
                style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 10),
                decoration: const InputDecoration(
                    labelText: '4-digit verification code',
                    helperText: 'Use the most recently emailed code.',
                    counterText: ''),
                validator: (value) => RegExp(r'^\d{4}$').hasMatch(value ?? '')
                    ? null
                    : 'Enter the complete 4-digit code.',
                onFieldSubmitted: (_) => _submit())
          ])),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel')),
        FilledButton(onPressed: _submit, child: const Text('Verify code'))
      ]);

  void _submit() {
    if (formKey.currentState?.validate() == true) {
      Navigator.pop(context, controller.text);
    }
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.strong = false});
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

class DriverAvailabilityPage extends StatefulWidget {
  const DriverAvailabilityPage({required this.session, super.key});
  final Session session;
  @override
  State<DriverAvailabilityPage> createState() => _DriverAvailabilityPageState();
}

class _DriverAvailabilityPageState extends State<DriverAvailabilityPage> {
  bool loading = true;
  bool available = false;
  Map<String, dynamic> profile = {};
  String? error;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final response = await widget.session.api.get('/driver/availability');
      if (mounted) {
        setState(() {
          profile = mapData(response['driver']) ?? response;
          available = profile['is_available'] == true ||
              '${profile['is_available']}' == '1';
        });
      }
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> toggle(bool value) async {
    setState(() => loading = true);
    try {
      await widget.session.api.requestPatch(
          '/driver/availability', {'is_available': value},
          idempotencyKey: 'mobile-driver-availability-$value');
      setState(() => available = value);
    } catch (exception) {
      if (mounted) showMessage(context, exception.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const PageIntro(
            title: 'Driver availability',
            subtitle:
                'Only approved, available drivers see jobs matching their registered vehicle type.'),
        const SizedBox(height: 16),
        MedLineSection(
            title: 'Work status',
            child: SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: available,
                onChanged: loading ? null : toggle,
                title: Text(
                    available ? 'Available for jobs' : 'Not accepting jobs',
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(error ??
                    'Vehicle: ${humanize('${profile['vehicle_type'] ?? 'not recorded'}')} · ${profile['vehicle_plate'] ?? 'plate not recorded'}')))
      ]);
}
