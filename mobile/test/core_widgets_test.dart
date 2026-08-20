import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medline_mobile/features/delivery/driver_delivery_card.dart';
import 'package:medline_mobile/features/orders/order_status.dart';

void main() {
  testWidgets('order timeline marks completed stages and keeps future stages visible', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: OrderStatusTimeline(status: 'in_transit')),
      ),
    ));

    expect(find.text('pending pharmacy review'), findsOneWidget);
    expect(find.text('in transit'), findsOneWidget);
    expect(find.text('completed'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsNWidgets(5));
    expect(find.byIcon(Icons.radio_button_unchecked), findsOneWidget);
  });

  testWidgets('driver delivery card exposes the delivery and claim action', (tester) async {
    var claimed = false;
    await tester.pumpWidget(MaterialApp(
      home: DriverDeliveryCard(
        delivery: const {'order_public_id': 'ORD-100', 'total': 1250, 'delivery_address_snapshot': 'Damascus'},
        onClaim: () => claimed = true,
      ),
    ));

    expect(find.text('ORD-100'), findsOneWidget);
    expect(find.text('Damascus'), findsOneWidget);
    await tester.tap(find.text('Claim delivery'));
    expect(claimed, isTrue);
  });
}
