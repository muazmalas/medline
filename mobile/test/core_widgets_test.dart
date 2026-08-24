import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medline_mobile/core/mobile_ui.dart';
import 'package:medline_mobile/features/delivery/driver_delivery_card.dart';
import 'package:medline_mobile/features/orders/order_status.dart';
import 'package:medline_mobile/features/workspace/workspace_shell.dart';

void main() {
  test('listData accepts direct and paginated API collections', () {
    expect(
        listData(<dynamic>[
          {'id': 1}
        ]),
        [
          {'id': 1}
        ]);
    expect(
        listData({
          'data': <dynamic>[
            {'id': 2}
          ]
        }),
        [
          {'id': 2}
        ]);
    expect(listData({'data': null}), isEmpty);
  });

  testWidgets('standalone feature routes provide a Material page shell',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: mobilePageScaffold(title: 'Notifications', body: const TextField()),
    ));

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('order timeline shows only the active current workflow',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
            child: OrderStatusTimeline(status: 'partially_accepted')),
      ),
    ));

    expect(find.text('pending pharmacy review'), findsOneWidget);
    expect(find.text('partial approval required'), findsOneWidget);
    expect(find.text('partially accepted'), findsOneWidget);
    expect(find.text('ready for delivery'), findsNothing);
    expect(find.text('driver claimed'), findsNothing);
    expect(find.byIcon(Icons.check_circle), findsNWidgets(3));
  });

  testWidgets('driver delivery card exposes the order acceptance action',
      (tester) async {
    var accepted = false;
    await tester.pumpWidget(MaterialApp(
      home: DriverDeliveryCard(
        delivery: const {
          'order_public_id': 'ORD-100',
          'total': 1250,
          'delivery_address_snapshot': 'Damascus'
        },
        onAccept: () => accepted = true,
      ),
    ));

    expect(find.text('ORD-100'), findsOneWidget);
    expect(find.text('Damascus'), findsOneWidget);
    await tester.tap(find.text('Accept order'));
    expect(accepted, isTrue);
  });
}
