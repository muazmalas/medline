import 'package:flutter/material.dart';

class OrderStatusTimeline extends StatelessWidget {
  const OrderStatusTimeline({required this.status, super.key});
  final String status;

  static List<String> workflowFor(String current) {
    return switch (current) {
      'prescription_required' => ['prescription_required'],
      'prescription_review' => ['prescription_required', 'prescription_review'],
      'partial_approval_required' => [
          'pending_pharmacy_review',
          'partial_approval_required'
        ],
      'partially_accepted' => [
          'pending_pharmacy_review',
          'partial_approval_required',
          'partially_accepted'
        ],
      'partial_offer_rejected' => [
          'pending_pharmacy_review',
          'partial_approval_required',
          'partial_offer_rejected'
        ],
      'accepted' => ['pending_pharmacy_review', 'accepted'],
      'completed' => ['pending_pharmacy_review', 'accepted', 'completed'],
      'rejected' => ['pending_pharmacy_review', 'rejected'],
      'cancelled' => ['cancelled'],
      _ => ['pending_pharmacy_review'],
    };
  }

  @override
  Widget build(BuildContext context) {
    final statuses = workflowFor(status);
    final currentIndex = statuses.indexOf(status);
    return Column(
        children: statuses.asMap().entries.map((entry) {
      final active = entry.key <= currentIndex;
      return ListTile(
        dense: true,
        leading: Icon(
            active ? Icons.check_circle : Icons.radio_button_unchecked,
            color: active ? const Color(0xff1689b8) : const Color(0xffb8c8d0),
            size: 20),
        title: Text(entry.value.replaceAll('_', ' '),
            style: TextStyle(
                fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                color: active
                    ? const Color(0xff17384e)
                    : const Color(0xff8ba0ac))),
      );
    }).toList());
  }
}
