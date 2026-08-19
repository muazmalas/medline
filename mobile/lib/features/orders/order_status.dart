import 'package:flutter/material.dart';

class OrderStatusTimeline extends StatelessWidget {
  const OrderStatusTimeline({required this.status, super.key});
  final String status;

  static const statuses = ['pending_pharmacy_review', 'accepted', 'ready_for_delivery', 'driver_claimed', 'in_transit', 'completed'];

  @override
  Widget build(BuildContext context) {
    final currentIndex = statuses.indexOf(status);
    return Column(children: statuses.asMap().entries.map((entry) {
      final active = entry.key <= currentIndex;
      return ListTile(
        dense: true,
        leading: Icon(active ? Icons.check_circle : Icons.radio_button_unchecked, color: active ? const Color(0xff1689b8) : const Color(0xffb8c8d0), size: 20),
        title: Text(entry.value.replaceAll('_', ' '), style: TextStyle(fontWeight: active ? FontWeight.w700 : FontWeight.w400, color: active ? const Color(0xff17384e) : const Color(0xff8ba0ac))),
      );
    }).toList());
  }
}
