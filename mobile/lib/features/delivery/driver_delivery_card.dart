import 'package:flutter/material.dart';

class DriverDeliveryCard extends StatelessWidget {
  const DriverDeliveryCard({required this.delivery, required this.onClaim, super.key});
  final Map<String, dynamic> delivery;
  final VoidCallback onClaim;

  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [const Icon(Icons.local_shipping_outlined, color: Color(0xff1689b8)), const SizedBox(width: 10), Expanded(child: Text('${delivery['order_public_id'] ?? 'Delivery'}', style: const TextStyle(fontWeight: FontWeight.w800))), Text('${delivery['total'] ?? ''} SP')]),
        const SizedBox(height: 10),
        Text('${delivery['delivery_address_snapshot'] ?? 'Address unavailable'}', style: const TextStyle(color: Color(0xff7892a1))),
        const SizedBox(height: 14),
        SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: onClaim, icon: const Icon(Icons.handshake_outlined), label: const Text('Claim delivery'))),
      ]),
    ),
  );
}
