import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'core/api_client.dart';
import 'core/session.dart';
import 'core/push_notifications.dart';
import 'core/telemetry.dart';

void main() {
  FlutterError.onError = (details) { unawaited(Telemetry.captureError(details.exception, context: 'flutter_error')); FlutterError.presentError(details); };
  PlatformDispatcher.instance.onError = (error, stack) { unawaited(Telemetry.captureError(error, context: 'platform_error')); return true; };
  runApp(const MedLineApp());
}
final ValueNotifier<Locale> medlineLocale = ValueNotifier(const Locale('en'));
final ValueNotifier<bool> medlineConnection = ValueNotifier(true);
final ValueNotifier<int> pendingMutations = ValueNotifier(0);

String localizedRole(BuildContext context, String role) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  if (!arabic) return {'admin': 'Admin', 'patient': 'Patient', 'pharmacy': 'Pharmacy', 'warehouse': 'Warehouse', 'driver': 'Driver'}[role] ?? role;
  return {'admin': '\u0627\u0644\u0645\u062f\u064a\u0631', 'patient': '\u0627\u0644\u0645\u0631\u064a\u0636', 'pharmacy': '\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629', 'warehouse': '\u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639', 'driver': '\u0627\u0644\u0633\u0627\u0626\u0642'}[role] ?? role;
}

String localizedAction(BuildContext context, String action) {
  if (Localizations.localeOf(context).languageCode != 'ar') return action;
  return {
    'Search medicine': '\u0628\u062d\u062b \u0639\u0646 \u062f\u0648\u0627\u0621',
    'My orders': '\u0637\u0644\u0628\u0627\u062a\u064a',
    'Pharmacies': '\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0627\u062a',
    'Cart': '\u0627\u0644\u0633\u0644\u0629',
    'Patient orders': '\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0645\u0631\u0636\u0649',
    'Warehouse stock': '\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639',
    'Inventory': '\u0627\u0644\u0645\u062e\u0632\u0648\u0646',
    'Procurement queue': '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062a\u0648\u0631\u064a\u062f',
    'Subscriptions': '\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643\u0627\u062a',
    'Available jobs': '\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u062a\u0627\u062d\u0629',
    'My deliveries': '\u062a\u0648\u0635\u064a\u0644\u0627\u062a\u064a',
    'Availability': '\u0627\u0644\u062a\u0648\u0641\u0631',
    'Admin dashboard': '\u0644\u0648\u062d\u0629 \u0627\u0644\u0645\u062f\u064a\u0631',
    'Security': '\u0627\u0644\u0623\u0645\u0627\u0646',
    'Notifications': '\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a',
  }[action] ?? action;
}

String localizedWorkflowAction(BuildContext context, String action) {
  if (Localizations.localeOf(context).languageCode != 'ar') return action;
  const labels = {
    'Retry': '\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629',
    'Open navigation': '\u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0627\u062d\u0629',
    'View details and invoice': '\u0639\u0631\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644 \u0648\u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629',
    'Upload prescription': '\u0631\u0641\u0639 \u0627\u0644\u0648\u0635\u0641\u0629',
    'Rate order': '\u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u0637\u0644\u0628',
    'Cancel order': '\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0637\u0644\u0628',
    'Reject': '\u0631\u0641\u0636',
    'Accept': '\u0642\u0628\u0648\u0644',
    'Claim delivery': '\u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0644\u062a\u0648\u0635\u064a\u0644',
    'Start pickup': '\u0628\u062f\u0621 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645',
    'Confirm pickup': '\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645',
    'Start delivery': '\u0628\u062f\u0621 \u0627\u0644\u062a\u0648\u0635\u064a\u0644',
    'Mark arrived': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0648\u0635\u0648\u0644',
    'Complete with PIN': '\u0625\u0643\u0645\u0627\u0644 \u0628\u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642',
    'Report failed delivery': '\u0625\u0628\u0644\u0627\u063a \u0639\u0646 \u0641\u0634\u0644 \u0627\u0644\u062a\u0648\u0635\u064a\u0644',
    'Offline': '\u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d',
    'Reconnect to refresh live data.': '\u0623\u0639\u062f \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0644\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629.',
    'Operational alerts': '\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u062a\u0634\u063a\u064a\u0644\u064a\u0629',
    'No active alerts.': '\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0646\u0634\u0637\u0629.',
    'Admin operations': '\u0639\u0645\u0644\u064a\u0627\u062a \u0627\u0644\u0645\u062f\u064a\u0631',
    'Operational alert': '\u062a\u0646\u0628\u064a\u0647 \u062a\u0634\u063a\u064a\u0644\u064a',
    'Pending updates': '\u062a\u062d\u062f\u064a\u062b\u0627\u062a \u0645\u0639\u0644\u0642\u0629',
    'Updates will sync when the connection is restored.': '\u0633\u062a\u062a\u0645 \u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u062a\u062d\u062f\u064a\u062b\u0627\u062a \u0639\u0646\u062f \u0627س\u062a\u0639\u0627د\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644.',
  };
  return labels[action] ?? action;
}

String localizedNotice(BuildContext context, String key) {
  if (Localizations.localeOf(context).languageCode != 'ar') return key;
  const labels = {
    'Sign in before adding items to your cart.': '\u0633\u062c\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0642\u0628\u0644 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0625\u0644\u0649 \u0633\u0644\u062a\u0643.',
    'Medicine added to your cart.': '\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u062f\u0648\u0627\u0621 \u0625\u0644\u0649 \u0633\u0644\u062a\u0643.',
    'Payment proof submitted for review.': '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0625\u062b\u0628\u0627\u062a \u0627\u0644\u062f\u0641\u0639 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629.',
    'Unable to open navigation.': '\u062a\u0639\u0630\u0631 \u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0627\u062d\u0629.',
    'No work is waiting for you.': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0647\u0627\u0645 \u0645\u0646\u062a\u0638\u0631\u0629 \u0644\u0643.',
  };
  return labels[key] ?? key;
}

String localizedInventoryText(BuildContext context, String key) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  if (!arabic) {
    return {
      'update': 'Update inventory',
      'medicine_id': 'Medicine ID',
      'quantity': 'Quantity',
      'unit_price': 'Unit price',
      'low_stock': 'Low-stock threshold',
      'cancel': 'Cancel',
      'save': 'Save',
      'address_required': 'Enter a medicine ID, quantity, and delivery address.',
      'available': 'available',
      'reserved': 'reserved',
    }[key] ?? key;
  }
  return {
    'update': '\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u062e\u0632\u0648\u0646',
    'medicine_id': '\u0645\u0639\u0631\u0641 \u0627\u0644\u062f\u0648\u0627\u0621',
    'quantity': '\u0627\u0644\u0643\u0645\u064a\u0629',
    'unit_price': '\u0633\u0639\u0631 \u0627\u0644\u0648\u062d\u062f\u0629',
    'low_stock': '\u062d\u062f \u0627\u0644\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0645\u0646\u062e\u0641\u0636',
    'cancel': '\u0625\u0644\u063a\u0627\u0621',
    'save': '\u062d\u0641\u0638',
    'address_required': '\u0623\u062f\u062e\u0644 \u0645\u0639\u0631\u0641 \u0627\u0644\u062f\u0648\u0627\u0621 \u0648\u0627\u0644\u0643\u0645\u064a\u0629 \u0648\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062a\u0648\u0635\u064a\u0644.',
    'available': '\u0645\u062a\u0627\u062d',
    'reserved': '\u0645\u062d\u062c\u0648\u0632',
  }[key] ?? key;
}

String localizedNavigation(BuildContext context, String key) {
  if (Localizations.localeOf(context).languageCode != 'ar') return key;
  return {'Home': '\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629', 'Orders': '\u0627\u0644\u0637\u0644\u0628\u0627\u062a', 'Profile': '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a'}[key] ?? key;
}

String localizedHomeText(BuildContext context, String key) {
  if (Localizations.localeOf(context).languageCode != 'ar') {
    return {'greeting_patient': 'How can we help today?', 'greeting_workspace': 'Your operational workspace', 'search_patient': 'Search medicines or pharmacies', 'search_workspace': 'Search your workspace', 'catalog': 'Medicine catalog', 'today': 'Today at a glance', 'search_catalog': 'Search catalog'}[key] ?? key;
  }
  return {'greeting_patient': '\u0643\u064a\u0641 \u064a\u0645\u0643\u0646\u0646\u0627 \u0645\u0633\u0627\u0639\u062f\u062a\u0643 \u0627\u0644\u064a\u0648\u0645\u061f', 'greeting_workspace': '\u0645\u0633\u0627\u062d\u062a\u0643 \u0627\u0644\u062a\u0634\u063a\u064a\u0644\u064a\u0629', 'search_patient': '\u0627\u0628\u062d\u062b \u0639\u0646 \u0627\u0644\u0623\u062f\u0648\u064a\u0629 \u0623\u0648 \u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0627\u062a', 'search_workspace': '\u0627\u0628\u062d\u062b \u0641\u064a \u0645\u0633\u0627\u062d\u062a\u0643', 'catalog': '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u062f\u0648\u064a\u0629', 'today': '\u0645\u0644\u062e\u0635 \u0627\u0644\u064a\u0648\u0645', 'search_catalog': '\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0642\u0627\u0626\u0645\u0629'}[key] ?? key;
}

String localizedCatalogText(BuildContext context, String key) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  final labels = arabic
      ? {
          'medicine_details': '\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u062f\u0648\u0627\u0621',
          'manufacturer': '\u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0645\u0635\u0646\u0639\u0629',
          'form': '\u0627\u0644\u0634\u0643\u0644',
          'dosage': '\u0627\u0644\u062c\u0631\u0639\u0629',
          'code': '\u0627\u0644\u0631\u0645\u0632',
          'prescription_required': '\u0648\u0635\u0641\u0629 \u0637\u0628\u064a\u0629 \u0645\u0637\u0644\u0648\u0628\u0629. \u0633\u064a\u0631\u0627\u062c\u0639 \u0627\u0644\u0635\u064a\u062f\u0644\u064a \u0627\u0644\u0648\u0635\u0641\u0629 \u0628\u0639\u062f \u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0637\u0644\u0628.',
          'add_to_cart': '\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0633\u0644\u0629',
          'approved_pharmacies': '\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0627\u062a \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629',
          'no_pharmacies': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0635\u064a\u062f\u0644\u064a\u0627\u062a \u0645\u0639\u062a\u0645\u062f\u0629 \u0645\u062a\u0627\u062d\u0629.',
          'my_cart': '\u0633\u0644\u062a\u064a',
          'cart_empty': '\u0633\u0644\u062a\u0643 \u0641\u0627\u0631\u063a\u0629.',
          'saved_delivery_address': '\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062a\u0648\u0635\u064a\u0644 \u0627\u0644\u0645\u062d\u0641\u0648\u0638',
          'delivery_address': '\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062a\u0648\u0635\u064a\u0644',
          'different_address': '\u0623\u0648 \u0623\u062f\u062e\u0644 \u0639\u0646\u0648\u0627\u0646\u064b\u0627 \u0622\u062e\u0631',
          'place_order': '\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0637\u0644\u0628',
          'notifications': '\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a',
          'no_notifications': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0625\u0634\u0639\u0627\u0631\u0627\u062a.',
          'mark_read': '\u062a\u0639\u0644\u064a\u0645 \u0643\u0645\u0642\u0631\u0648\u0621',
          'choose_language': '\u0627\u062e\u062a\u0631 \u0627\u0644\u0644\u063a\u0629',
          'language_saved': '\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0644\u063a\u0629 \u0645\u062d\u0644\u064a\u064b\u0627.', 'subscription_payment': '\u062f\u0641\u0639 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643', 'amount': '\u0627\u0644\u0645\u0628\u0644\u063a', 'choose_proof': '\u0627\u062e\u062a\u0631 \u0625\u062b\u0628\u0627\u062a\u0627\u064b', 'cancel': '\u0625\u0644\u063a\u0627\u0621', 'save': '\u062d\u0641\u0638', 'annual_subscription': '\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0627\u0644\u0633\u0646\u0648\u064a', 'current_status': '\u0627\u0644\u062d\u0627\u0644\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629', 'not_active': '\u063a\u064a\u0631 \u0646\u0634\u0637', 'valid_until': '\u0635\u0627\u0644\u062d \u062d\u062a\u0649', 'submit_payment_proof': '\u0625\u0631\u0633\u0627\u0644 \u0625\u062b\u0628\u0627\u062a \u0627\u0644\u062f\u0641\u0639', 'plan': '\u0627\u0644\u062e\u0637\u0629', 'contact_admin': '\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0625\u062f\u0627\u0631\u0629', 'payment_receipt_hint': '\u0627\u0631\u0641\u0639 \u0625\u064a\u0635\u0627\u0644 \u0627\u0644\u062f\u0641\u0639 \u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0625\u062f\u0627\u0631\u0629. \u064a\u062a\u0645 \u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u0645\u0644\u0641 \u0628\u0634\u0643\u0644 \u062e\u0627\u0635.', 'inventory': '\u0627\u0644\u0645\u062e\u0632\u0648\u0646', 'adjust_stock': '\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u062e\u0632\u0648\u0646', 'no_inventory': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0633\u062c\u0644\u0627\u062a \u0645\u062e\u0632\u0648\u0646 \u062d\u0627\u0644\u064a\u0627\u064b'
        }
      : {
          'medicine_details': 'Medicine details', 'manufacturer': 'Manufacturer', 'form': 'Form', 'dosage': 'Dosage', 'code': 'Code',
          'prescription_required': 'Prescription required. A pharmacist will review the prescription after checkout.', 'add_to_cart': 'Add to cart',
          'approved_pharmacies': 'Approved pharmacies', 'no_pharmacies': 'No approved pharmacies are available.', 'my_cart': 'My cart', 'cart_empty': 'Your cart is empty.',
          'saved_delivery_address': 'Saved delivery address', 'delivery_address': 'Delivery address', 'different_address': 'Or enter a different address',
          'place_order': 'Place order', 'notifications': 'Notifications', 'no_notifications': 'You have no notifications.', 'mark_read': 'Mark as read',
          'choose_language': 'Choose language', 'language_saved': 'Language saved locally.', 'subscription_payment': 'Subscription payment', 'amount': 'Amount', 'choose_proof': 'Choose proof', 'cancel': 'Cancel', 'save': 'Save', 'annual_subscription': 'Annual subscription', 'current_status': 'Current status', 'not_active': 'Not active', 'valid_until': 'Valid until', 'submit_payment_proof': 'Submit payment proof', 'plan': 'Plan', 'contact_admin': 'Contact administrator', 'payment_receipt_hint': 'Upload a payment receipt for administrator review. The file is stored privately.', 'inventory': 'Inventory', 'adjust_stock': 'Adjust stock', 'no_inventory': 'No inventory records yet.'
        };
  return labels[key] ?? key;
}

String localizedOperationsText(BuildContext context, String key) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  final labels = arabic
      ? {
          'support': 'الدعم والشكاوى', 'new_support': 'طلب دعم جديد', 'subject': 'الموضوع', 'describe_issue': 'صف المشكلة', 'attach_evidence': 'إرفاق دليل (اختياري)', 'evidence_attached': 'تم إرفاق الدليل', 'no_support': 'لا توجد طلبات دعم حالياً',
          'procurement': 'طلب مخزون المستودع', 'warehouse_stock': 'إنشاء طلب توريد للشركات', 'receiving_address': 'عنوان الاستلام', 'submit_request': 'إرسال الطلب', 'report_failed': 'الإبلاغ عن فشل التوصيل', 'reason': 'السبب', 'report': 'إبلاغ', 'confirm_delivery': 'تأكيد التوصيل', 'delivery_pin': 'رمز توصيل المريض', 'complete': 'إكمال', 'prescription_uploaded': 'تم رفع الوصفة لمراجعة الصيدلي', 'rate_order': 'تقييم طلبك', 'comment': 'تعليق (اختياري)', 'cancel': 'إلغاء', 'submit': 'إرسال',
        }
      : {
          'support': 'Support and complaints', 'new_support': 'New support request', 'subject': 'Subject', 'describe_issue': 'Describe the issue', 'attach_evidence': 'Attach evidence (optional)', 'evidence_attached': 'Evidence attached', 'no_support': 'No support requests yet.',
          'procurement': 'Request warehouse stock', 'warehouse_stock': 'Create a B2B procurement request', 'receiving_address': 'Receiving address', 'submit_request': 'Submit request', 'report_failed': 'Report failed delivery', 'reason': 'Reason', 'report': 'Report', 'confirm_delivery': 'Confirm delivery', 'delivery_pin': 'Patient delivery PIN', 'complete': 'Complete', 'prescription_uploaded': 'Prescription uploaded for pharmacist review.', 'rate_order': 'Rate your order', 'comment': 'Comment (optional)', 'cancel': 'Cancel', 'submit': 'Submit',
        };
  final corrected = <String, String>{
    ...labels,
    'support': '\u0627\u0644\u062f\u0639\u0645 \u0648\u0627\u0644\u0634\u0643\u0627\u0648\u0649',
    'new_support': '\u0637\u0644\u0628 \u062f\u0639\u0645 \u062c\u062f\u064a\u062f',
    'subject': '\u0627\u0644\u0645\u0648\u0636\u0648\u0639',
    'describe_issue': '\u0635\u0641 \u0627\u0644\u0645\u0634\u0643\u0644\u0629',
    'attach_evidence': '\u0625\u0631\u0641\u0627\u0642 \u062f\u0644\u064a\u0644 (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)',
    'evidence_attached': '\u062a\u0645 \u0625\u0631\u0641\u0627\u0642 \u0627\u0644\u062f\u0644\u064a\u0644',
    'no_support': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0637\u0644\u0628\u0627\u062a \u062f\u0639\u0645 \u062d\u0627\u0644\u064a\u0627',
    'procurement': '\u0637\u0644\u0628 \u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639',
    'warehouse_stock': '\u0625\u0646\u0634\u0627\u0621 \u0637\u0644\u0628 \u062a\u0648\u0631\u064a\u062f \u0644\u0644\u0634\u0631\u0643\u0627\u062a',
    'receiving_address': '\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645',
    'submit_request': '\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628',
    'report_failed': '\u0627\u0644\u0625\u0628\u0644\u0627\u063a \u0639\u0646 \u0641\u0634\u0644 \u0627\u0644\u062a\u0648\u0635\u064a\u0644',
    'reason': '\u0627\u0644\u0633\u0628\u0628',
    'report': '\u0625\u0628\u0644\u0627\u063a',
    'confirm_delivery': '\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0644',
    'delivery_pin': '\u0631\u0645\u0632 \u062a\u0648\u0635\u064a\u0644 \u0627\u0644\u0645\u0631\u064a\u0636',
    'complete': '\u0625\u0643\u0645\u0627\u0644',
    'prescription_uploaded': '\u062a\u0645 \u0631\u0641\u0639 \u0627\u0644\u0648\u0635\u0641\u0629 \u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0635\u064a\u062f\u0644\u064a',
    'rate_order': '\u062a\u0642\u064a\u064a\u0645 \u0637\u0644\u0628\u0643',
    'comment': '\u062a\u0639\u0644\u064a\u0642 (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)',
    'cancel': '\u0625\u0644\u063a\u0627\u0621',
    'submit': '\u0625\u0631\u0633\u0627\u0644',
  };
  return corrected[key] ?? key;
}

String localizedStatus(BuildContext context, String value) {
  final normalized = value.replaceAll('_', ' ');
  if (Localizations.localeOf(context).languageCode != 'ar') return normalized.toUpperCase();
  const labels = {
    'pending': 'قيد الانتظار', 'approved': 'معتمد', 'active': 'نشط', 'completed': 'مكتمل', 'cancelled': 'ملغى', 'rejected': 'مرفوض',
    'prescription required': 'الوصفة مطلوبة', 'pending pharmacy review': 'بانتظار مراجعة الصيدلية', 'prescription review': 'مراجعة الوصفة', 'accepted': 'مقبول', 'partially accepted': 'مقبول جزئياً', 'ready for delivery': 'جاهز للتوصيل', 'available': 'متاح', 'claimed': 'تم الاستلام', 'pickup started': 'بدأ الاستلام', 'picked up': 'تم الاستلام', 'in transit': 'قيد التوصيل', 'arrived': 'وصل', 'failed': 'فشل', 'open': 'مفتوح', 'in review': 'قيد المراجعة', 'resolved': 'تم الحل', 'under review': 'قيد المراجعة',
  };
  final corrected = <String, String>{
    ...labels,
    'pending': '\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631',
    'approved': '\u0645\u0639\u062a\u0645\u062f',
    'active': '\u0646\u0634\u0637',
    'completed': '\u0645\u0643\u062a\u0645\u0644',
    'cancelled': '\u0645\u0644\u063a\u0649',
    'rejected': '\u0645\u0631\u0641\u0648\u0636',
    'prescription required': '\u0627\u0644\u0648\u0635\u0641\u0629 \u0645\u0637\u0644\u0648\u0628\u0629',
    'pending pharmacy review': '\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629',
    'prescription review': '\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0648\u0635\u0641\u0629',
    'accepted': '\u0645\u0642\u0628\u0648\u0644',
    'partially accepted': '\u0645\u0642\u0628\u0648\u0644 \u062c\u0632\u0626\u064a\u0627',
    'ready for delivery': '\u062c\u0627\u0647\u0632 \u0644\u0644\u062a\u0648\u0635\u064a\u0644',
    'pickup started': '\u0628\u062f\u0623 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645',
    'picked up': '\u062a\u0645 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645',
    'available': '\u0645\u062a\u0627\u062d',
    'claimed': '\u062a\u0645 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645',
    'in transit': '\u0642\u064a\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0644',
    'arrived': '\u0648\u0635\u0644',
    'failed': '\u0641\u0634\u0644',
    'open': '\u0645\u0641\u062a\u0648\u062d',
    'in review': '\u0642\u064a\u062f \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629',
    'resolved': '\u062a\u0645 \u0627\u0644\u062d\u0644',
    'under review': '\u0642\u064a\u062f \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629',
  };
  return corrected[normalized] ?? normalized;
}

String localizedOrderText(BuildContext context, String key) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  if (key == 'driver_location') return arabic ? '\u0645\u0648\u0642\u0639 \u0627\u0644\u0633\u0627\u0626\u0642' : 'Driver location';
  if (key == 'location_updated') return arabic ? '\u0622\u062e\u0631 \u062a\u062d\u062f\u064a\u062b \u0644\u0644\u0645\u0648\u0642\u0639' : 'Last location update';
  if (key == 'open_map') return arabic ? '\u0641\u062a\u062d \u0627\u0644\u062e\u0631\u064a\u0637\u0629' : 'Open map';
  if (key == 'map_unavailable') return arabic ? '\u062a\u0639\u0630\u0631 \u0641\u062a\u062d \u0645\u0648\u0642\u0639 \u0627\u0644\u062a\u0648\u0635\u064a\u0644' : 'Unable to open the delivery location.';
  final labels = arabic
      ? {
          'details': 'تفاصيل الطلب', 'rate': 'تقييم هذا الطلب', 'your_rating': 'تقييمك', 'thank_you': 'شكراً لملاحظاتك.', 'delivery_pin': 'رمز التوصيل', 'invoice': 'ملخص الفاتورة', 'subtotal': 'المجموع الفرعي', 'delivery_fee': 'رسوم التوصيل', 'total': 'الإجمالي', 'payment': 'الدفع', 'timeline': 'الجدول الزمني للتوصيل', 'timeline_empty': 'سيظهر الجدول الزمني للتوصيل مع تقدم الطلب.',
        }
      : {
          'details': 'Order details', 'rate': 'Rate this order', 'your_rating': 'Your rating', 'thank_you': 'Thank you for your feedback.', 'delivery_pin': 'Delivery PIN', 'invoice': 'Invoice summary', 'subtotal': 'Subtotal', 'delivery_fee': 'Delivery fee', 'total': 'Total', 'payment': 'Payment', 'timeline': 'Delivery timeline', 'timeline_empty': 'The delivery timeline will appear as the order progresses.',
        };
  return labels[key] ?? key;
}

String localizedDashboardText(BuildContext context, String key) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  if (key == 'users') return arabic ? '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646' : 'Users';
  if (key == 'partners') return arabic ? '\u0627\u0644\u0634\u0631\u0643\u0627\u0621' : 'Partners';
  if (key == 'pending_partners') return arabic ? '\u0634\u0631\u0643\u0627\u0621 \u0645\u0639\u0644\u0642\u0648\u0646' : 'Pending partners';
  if (key == 'open_complaints') return arabic ? '\u0634\u0643\u0627\u0648\u0649 \u0645\u0641\u062a\u0648\u062d\u0629' : 'Open complaints';
  if (key == 'today') return arabic ? '\u0645\u0644\u062e\u0635 \u0627\u0644\u064a\u0648\u0645' : "Today's overview";
  final labels = arabic
      ? {
          'orders': 'الطلبات', 'pending': 'قيد الانتظار', 'deliveries': 'التوصيلات', 'low_stock': 'مخزون منخفض', 'search_begin': 'ابحث عن دواء للبدء.', 'assigned_work': 'ستظهر المهام المسندة إليك هنا.', 'driver_availability': 'توفر السائق', 'available_jobs': 'متاح لمهام التوصيل', 'approved_driver': 'سائق معتمد · يمكن استلام مهام جديدة.', 'approval_status': 'حالة الاعتماد', 'available': 'متاح', 'not_available': 'غير متاح'
        }
      : {
          'orders': 'Orders', 'pending': 'Pending', 'deliveries': 'Deliveries', 'low_stock': 'Low stock', 'search_begin': 'Search for a medicine to begin.', 'assigned_work': 'Your assigned work will appear here.', 'driver_availability': 'Driver availability', 'available_jobs': 'Available for delivery jobs', 'approved_driver': 'Approved driver · new jobs can be claimed.', 'approval_status': 'Approval status', 'available': 'Available', 'not_available': 'Not available'
        };
  return labels[key] ?? key;
}

String localizedAuthText(BuildContext context, String key) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  if (!arabic) {
    return {
      'welcome': 'Welcome to MedLine',
      'intro': 'Secure medicine delivery for every role in the healthcare chain.',
      'choose_workspace': 'Choose your workspace',
      'continue': 'Continue',
      'sign_in_title': 'Sign in to MedLine',
      'workspace_suffix': 'workspace',
      'approved_account': 'Use your approved MedLine account to continue.',
      'email': 'Email',
      'password': 'Password',
      'authenticator_code': 'Authenticator code (admin 2FA)',
      'sign_in': 'Sign in',
      'forgot_password': 'Forgot password?',
      'create_account': 'Create a MedLine account',
      'browse_guest': 'Browse as guest',
      'reset_password': 'Reset password',
      'recovery_hint': 'Request a recovery token, then enter the token from your email.',
      'send_recovery': 'Send recovery instructions',
      'recovery_token': 'Recovery token',
      'new_password': 'New password',
      'confirm_password': 'Confirm password',
      'reset': 'Reset password',
      'register_title': 'Create MedLine account',
      'register_as': 'Register as',
      'full_name': 'Full name',
      'phone': 'Phone',
      'business_name': 'Business name',
      'submit_registration': 'Submit registration',
      'cancel': 'Cancel',
      'save': 'Save',
    }[key] ?? key;
  }
  return {
    'welcome': '\u0645\u0631\u062d\u0628\u0627\u064b \u0628\u0643 \u0645\u0646 \u0645\u064a\u062f\u0644\u0627\u064a\u0646',
    'intro': '\u062a\u0648\u0635\u064a\u0644 \u0622\u0645\u0646 \u0644\u0644\u0623\u062f\u0648\u064a\u0629 \u0644\u0643\u0644 \u0623\u0637\u0631\u0627\u0641 \u0633\u0644\u0633\u0644\u0629 \u0627\u0644\u0631\u0639\u0627\u064a\u0629 \u0627\u0644\u0635\u062d\u064a\u0629.',
    'choose_workspace': '\u0627\u062e\u062a\u0631 \u0645\u0633\u0627\u062d\u062a\u0643',
    'continue': '\u0645\u062a\u0627\u0628\u0639\u0629',
    'sign_in_title': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0625\u0644\u0649 \u0645\u064a\u062f\u0644\u0627\u064a\u0646',
    'workspace_suffix': '\u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644',
    'approved_account': '\u0627\u0633\u062a\u062e\u062f\u0645 \u062d\u0633\u0627\u0628 \u0645\u064a\u062f\u0644\u0627\u064a\u0646 \u0627\u0644\u0645\u0639\u062a\u0645\u062f \u0644\u0644\u0645\u062a\u0627\u0628\u0639\u0629.',
    'email': '\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a',
    'password': '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    'authenticator_code': '\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062f\u0642\u0629 \u0644\u0644\u0645\u062f\u064a\u0631 (2FA)',
    'sign_in': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',
    'forgot_password': '\u0646\u0633\u064a\u062a \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631\u061f',
    'create_account': '\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628 \u0645\u064a\u062f\u0644\u0627\u064a\u0646',
    'browse_guest': '\u062a\u0635\u0641\u062d \u0643\u0636\u064a\u0641',
    'reset_password': '\u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    'recovery_hint': '\u0627\u0637\u0644\u0628 \u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062a\u0631\u062f\u0627\u062f، \u062b\u0645 \u0623\u062f\u062e\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0631\u0633\u0644 \u0625\u0644\u0649 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a.',
    'send_recovery': '\u0625\u0631\u0633\u0627\u0644 \u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0627\u0644\u0627\u0633\u062a\u0631\u062f\u0627\u062f',
    'recovery_token': '\u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062a\u0631\u062f\u0627\u062f',
    'new_password': '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629',
    'confirm_password': '\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    'reset': '\u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    'register_title': '\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628 \u0645\u064a\u062f\u0644\u0627\u064a\u0646',
    'register_as': '\u0627\u0644\u062a\u0633\u062c\u064a\u0644 \u0628\u0635\u0641\u0629',
    'full_name': '\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644',
    'phone': '\u0627\u0644\u0647\u0627\u062a\u0641',
    'business_name': '\u0627\u0633\u0645 \u0627\u0644\u0646\u0634\u0627\u0637',
    'submit_registration': '\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u062a\u0633\u062c\u064a\u0644',
    'cancel': '\u0625\u0644\u063a\u0627\u0621',
    'save': '\u062d\u0641\u0638',
  }[key] ?? key;
}

String localizedProfileText(BuildContext context, String key) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  if (key == 'two_factor') return arabic ? '\u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u062b\u0646\u0627\u0626\u064a \u0644\u0644\u0645\u062f\u064a\u0631' : 'Administrator 2FA';
  if (key == 'two_factor_hint') return arabic ? '\u062d\u0645\u0627\u064a\u0629 \u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u062f\u064a\u0631 \u0628\u062a\u0637\u0628\u064a\u0642 \u0645\u0635\u0627\u062f\u0642.' : 'Protect this administrator account with an authenticator app.';
  if (key == 'two_factor_enabled') return arabic ? '\u0645\u0641\u0639\u0644' : 'Enabled';
  if (key == 'two_factor_disabled') return arabic ? '\u063a\u064a\u0631 \u0645\u0641\u0639\u0644' : 'Not enabled';
  if (key == 'two_factor_setup') return arabic ? '\u062a\u0648\u0644\u064a\u062f \u0645\u0641\u062a\u0627\u062d \u0627\u0644\u0625\u0639\u062f\u0627\u062f' : 'Generate setup secret';
  if (key == 'two_factor_code') return arabic ? '\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062f\u0642\u0629 \u0627\u0644\u0645\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645' : '6-digit authenticator code';
  if (key == 'two_factor_confirm') return arabic ? '\u062a\u0623\u0643\u064a\u062f 2FA' : 'Confirm 2FA';
  if (key == 'two_factor_disable') return arabic ? '\u062a\u0639\u0637\u064a\u0644 2FA' : 'Disable 2FA';
  if (!arabic) {
    return {
      'profile': 'Profile', 'choose_language': 'Choose language', 'verify_email': 'Verify email address', 'verification_hint': 'Send a fresh verification link.',
      'verification_sent': 'Verification instructions sent.', 'saved_addresses': 'Saved delivery addresses', 'addresses_hint': 'Manage addresses used during checkout.',
      'verification_documents': 'Verification documents', 'documents_hint': 'Submit and track identity or license documents.', 'support': 'Support and complaints',
      'support_hint': 'Report an issue or review previous support requests.', 'notification_preferences': 'Notification preferences', 'notifications_hint': 'Choose how MedLine sends operational updates.',
      'two_factor': 'Administrator 2FA', 'two_factor_hint': 'Protect this administrator account with an authenticator app.',
      'language': 'Language', 'privacy': 'Privacy and documents', 'privacy_hint': 'Review privacy policy and consent choices.', 'privacy_consent': 'Privacy and consent', 'consent_summary': 'Your consent choices are stored with a policy version and audit record.', 'terms': 'Terms of service', 'terms_hint': 'Required to use the MedLine service.', 'policy': 'Privacy policy', 'policy_hint': 'Acknowledgement of how medical and account data is handled.', 'marketing': 'Optional product updates', 'marketing_hint': 'Receive non-essential MedLine communications.', 'address_title': 'Saved addresses', 'add_address': 'Add address', 'label': 'Label', 'address': 'Address', 'city': 'City', 'no_addresses': 'No saved addresses yet.', 'document_type': 'Document type', 'document_hint': 'License, identity, vehicle...', 'choose_file': 'Choose file', 'no_documents': 'No documents submitted yet.', 'new_support': 'New support request', 'subject': 'Subject', 'describe_issue': 'Describe the issue', 'attach_evidence': 'Attach evidence (optional)', 'evidence_attached': 'Evidence attached', 'no_support': 'No support requests yet.', 'support_request': 'Support request', 'notification_channels': 'Choose the channels used for MedLine operational updates.', 'in_app': 'In-app notifications', 'push': 'Push notifications', 'email_notifications': 'Email notifications', 'sms': 'SMS notifications', 'sign_out': 'Sign out', 'return_roles': 'Return to role selection',
    }[key] ?? key;
  }
  return {
    'profile': '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a', 'choose_language': '\u0627\u062e\u062a\u0631 \u0627\u0644\u0644\u063a\u0629', 'verify_email': '\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a', 'verification_hint': '\u0625\u0631\u0633\u0627ل \u0631\u0627\u0628\u0637 \u062a\u0623\u0643\u064a\u062f \u062c\u062f\u064a\u062f.',
    'verification_sent': '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0627\u0644\u062a\u0623\u0643\u064a\u062f.', 'saved_addresses': '\u0639\u0646\u0627\u0648\u064a\u0646 \u0627\u0644\u062a\u0648\u0635\u064a\u0644 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629', 'addresses_hint': '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0639\u0646\u0627\u0648\u064a\u0646 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0629 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0637\u0644\u0628.',
    'verification_documents': '\u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0627\u0644\u062a\u062d\u0642\u0642', 'documents_hint': '\u0625\u0631\u0633\u0627\u0644 \u0648\u062a\u062a\u0628\u0639 \u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0627\u0644\u0647\u0648\u064a\u0629 \u0623\u0648 \u0627\u0644\u062a\u0631\u062e\u064a\u0635.', 'support': '\u0627\u0644\u062f\u0639\u0645 \u0648\u0627\u0644\u0634\u0643\u0627\u0648\u0649',
    'support_hint': '\u0625\u0628\u0644\u0627\u063a \u0639\u0646 \u0645\u0634\u0643\u0644\u0629 \u0623\u0648 \u0645\u0631\u0627\u062c\u0639\u0629 \u0637\u0644\u0628\u0627\u062a \u0627\u0644\u062f\u0639\u0645.', 'notification_preferences': '\u062a\u0641\u0636\u064a\u0644\u0627\u062a \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a', 'notifications_hint': '\u0627\u062e\u062a\u0631 \u0643\u064a\u0641\u064a\u0629 \u0625رسال \u0645\u064aد\u0644اي\u0646 \u0644ل\u062a\u062d\u062f\u064a\u062b\u0627ت.',
    'language': '\u0627\u0644\u0644\u063a\u0629', 'privacy': '\u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629 \u0648\u0627\u0644\u0645\u0633\u062a\u0646\u062f\u0627\u062a', 'privacy_hint': '\u0645\u0631\u0627\u062c\u0639\u0629 \u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629 \u0648\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629.', 'privacy_consent': '\u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629 \u0648\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629', 'consent_summary': '\u064a\u062a\u0645 \u062a\u062e\u0632\u064a\u0646 \u062e\u064a\u0627\u0631\u0627\u062a \u0645\u0648\u0627فقتك \u0645\u0639 \u0646س\u062e\u0629 \u0627\u0644\u0633\u064a\u0627\u0633\u0629 \u0648\u0633\u062c\u0644 \u0627\u0644\u062a\u062f\u0642\u064a\u0642.', 'terms': '\u0634\u0631\u0648\u0637 \u0627\u0644\u062e\u062f\u0645\u0629', 'terms_hint': '\u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u062e\u062f\u0645\u0629 \u0645\u064a\u062f\u0644\u0627\u064a\u0646.', 'policy': '\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629', 'policy_hint': '\u0625\u0642\u0631\u0627\u0631 \u0628\u0643\u064a\u0641\u064a\u0629 \u0645\u0639\u0627\u0644\u062c\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0637\u0628\u064a\u0629 \u0648\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062d\u0633\u0627\u0628.', 'marketing': '\u062a\u062d\u062f\u064a\u062b\u0627\u062a \u0645\u0646\u062a\u062c \u0627\u062e\u062a\u064a\u0627\u0631\u064a\u0629', 'marketing_hint': '\u062a\u0644\u0642\u064a \u0631\u0633\u0627\u0626\u0644 \u0645\u064a\u062f\u0644\u0627\u064a\u0646 \u063a\u064a\u0631 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629.', 'address_title': '\u0627\u0644\u0639\u0646\u0627\u0648\u064a\u0646 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629', 'add_address': '\u0625\u0636\u0627\u0641\u0629 \u0639\u0646\u0648\u0627\u0646', 'label': '\u0627\u0644\u062a\u0633\u0645\u064a\u0629', 'address': '\u0627\u0644\u0639\u0646\u0648\u0627\u0646', 'city': '\u0627\u0644\u0645\u062f\u064a\u0646\u0629', 'no_addresses': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0639\u0646\u0627\u0648\u064a\u0646 \u0645\u062d\u0641\u0648\u0638\u0629 \u0628\u0639\u062f.', 'sign_out': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c', 'return_roles': '\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u062f\u0648\u0631',
  }[key] ?? key;
}

class MedLineApp extends StatelessWidget {
  const MedLineApp({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<Locale>(valueListenable: medlineLocale, builder: (context, locale, _) => MaterialApp(
    title: 'MedLine',
    locale: locale,
    supportedLocales: const [Locale('en'), Locale('ar')],
    localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
    debugShowCheckedModeBanner: false,
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff1689b8)), scaffoldBackgroundColor: const Color(0xfff4f7fb), useMaterial3: true),
    home: const RoleGate(),
  ));
}

class RoleGate extends StatefulWidget {
  const RoleGate({super.key});
  @override
  State<RoleGate> createState() => _RoleGateState();
}

class _RoleGateState extends State<RoleGate> {
  String role = 'patient';
  final session = Session(ApiClient());
  bool restoring = true;
  final roles = const {'patient': 'Patient', 'pharmacy': 'Pharmacy', 'warehouse': 'Warehouse', 'driver': 'Driver', 'admin': 'Admin'};

  @override
  void initState() { super.initState(); session.api.onConnectivityChanged = (online) { medlineConnection.value = online; if (online) unawaited(session.api.flushPendingMutations()); }; session.api.onMutationQueueChanged = (count) => pendingMutations.value = count; restore(); }

  Future<void> restore() async { final restored = await session.restore(); if (restored && mounted) { final profileLocale = session.user?['locale']?.toString(); if (profileLocale == 'ar' || profileLocale == 'en') medlineLocale.value = Locale(profileLocale!); final restoredRole = session.user?['role']?.toString(); if (roles.containsKey(restoredRole)) { unawaited(PushNotificationService.register(session)); Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => RoleHome(role: restoredRole!, session: session))); return; } } if (mounted) setState(() => restoring = false); }

  @override
  Widget build(BuildContext context) => restoring ? const Scaffold(body: Center(child: CircularProgressIndicator())) : Scaffold(
    backgroundColor: const Color(0xff082f49),
    body: SafeArea(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Icon(Icons.medication_rounded, color: Color(0xff43b5e7), size: 52),
      const SizedBox(height: 20),
      Text(localizedAuthText(context, 'welcome'), style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      Text(localizedAuthText(context, 'intro'), style: const TextStyle(color: Color(0xff9bc0d0), fontSize: 16)),
      const SizedBox(height: 36),
      Text(localizedAuthText(context, 'choose_workspace'), style: const TextStyle(color: Color(0xffd7e8f4), fontWeight: FontWeight.w700)),
      const SizedBox(height: 12),
      Wrap(spacing: 10, runSpacing: 10, children: roles.entries.map((entry) => ChoiceChip(label: Text(localizedRole(context, entry.key)), selected: role == entry.key, onSelected: (_) => setState(() => role = entry.key))).toList()),
      const SizedBox(height: 30),
      SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => LoginScreen(role: role, session: session))), icon: const Icon(Icons.arrow_forward_rounded), label: Padding(padding: const EdgeInsets.all(14), child: Text(localizedAuthText(context, 'continue'))))),
    ]))))),
  );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({required this.role, required this.session, super.key});
  final String role;
  final Session session;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  final twoFactorCode = TextEditingController();
  bool loading = false;
  String? error;

  Future<void> signIn() async {
    setState(() { loading = true; error = null; });
    try {
      await widget.session.signIn(email.text.trim(), password.text, twoFactorCode: widget.role == 'admin' ? twoFactorCode.text.trim() : null);
      unawaited(PushNotificationService.register(widget.session));
      final profileLocale = widget.session.user?['locale']?.toString();
      if (profileLocale == 'ar' || profileLocale == 'en') medlineLocale.value = Locale(profileLocale!);
      if (widget.session.user?['role'] != widget.role) {
        await widget.session.signOut();
        throw const ApiException(403, 'This account is not authorized for the selected workspace.');
      }
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => RoleHome(role: widget.role, session: widget.session)));
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() { email.dispose(); password.dispose(); twoFactorCode.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(localizedAuthText(context, 'sign_in_title'))),
    body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 460), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('${localizedRole(context, widget.role)} ${localizedAuthText(context, 'workspace_suffix')}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      Text(localizedAuthText(context, 'approved_account')),
      const SizedBox(height: 24),
      TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: localizedAuthText(context, 'email'), prefixIcon: const Icon(Icons.email_outlined))),
      const SizedBox(height: 14),
      TextField(controller: password, obscureText: true, onSubmitted: (_) => signIn(), decoration: InputDecoration(labelText: localizedAuthText(context, 'password'), prefixIcon: const Icon(Icons.lock_outline))),
      if (widget.role == 'admin') ...[
        const SizedBox(height: 14),
        TextField(controller: twoFactorCode, keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: localizedAuthText(context, 'authenticator_code'), prefixIcon: const Icon(Icons.verified_user_outlined))),
      ],
      if (error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(error!, style: const TextStyle(color: Colors.red))),
      const SizedBox(height: 22),
      FilledButton(onPressed: loading ? null : signIn, child: Padding(padding: const EdgeInsets.all(13), child: loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(localizedAuthText(context, 'sign_in')))),
      TextButton(onPressed: loading ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PasswordResetScreen())), child: Text(localizedAuthText(context, 'forgot_password'))),
      if (widget.role != 'admin') TextButton(onPressed: loading ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => RegisterScreen(role: widget.role))), child: Text(localizedAuthText(context, 'create_account'))),
      if (widget.role == 'patient') TextButton(onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => RoleHome(role: widget.role, session: widget.session))), child: Text(localizedAuthText(context, 'browse_guest'))),
    ])))),
  );
}

class PasswordResetScreen extends StatefulWidget {
  const PasswordResetScreen({super.key});

  @override
  State<PasswordResetScreen> createState() => _PasswordResetScreenState();
}

class _PasswordResetScreenState extends State<PasswordResetScreen> {
  final email = TextEditingController();
  final token = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();
  final api = ApiClient();
  String? message;
  bool loading = false;

  Future<void> requestToken() async {
    if (email.text.trim().isEmpty) return;
    setState(() => loading = true);
    try { final response = await api.forgotPassword(email.text.trim()); if (mounted) setState(() => message = response['message']?.toString()); } catch (exception) { if (mounted) setState(() => message = exception.toString()); } finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> reset() async {
    setState(() => loading = true);
    try { final response = await api.resetPassword(email: email.text.trim(), token: token.text.trim(), password: password.text, confirmation: confirmation.text); if (mounted) { setState(() => message = response['message']?.toString()); Navigator.of(context).pop(); } } catch (exception) { if (mounted) setState(() => message = exception.toString()); } finally { if (mounted) setState(() => loading = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedAuthText(context, 'reset_password'))), body: ListView(padding: const EdgeInsets.all(24), children: [Text(localizedAuthText(context, 'recovery_hint'), style: const TextStyle(color: Colors.grey)), const SizedBox(height: 18), TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: localizedAuthText(context, 'email'))), const SizedBox(height: 12), OutlinedButton(onPressed: loading ? null : requestToken, child: Text(localizedAuthText(context, 'send_recovery'))), const SizedBox(height: 18), TextField(controller: token, maxLength: 64, decoration: InputDecoration(labelText: localizedAuthText(context, 'recovery_token'))), TextField(controller: password, obscureText: true, decoration: InputDecoration(labelText: localizedAuthText(context, 'new_password'))), const SizedBox(height: 12), TextField(controller: confirmation, obscureText: true, decoration: InputDecoration(labelText: localizedAuthText(context, 'confirm_password'))), if (message != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(message!)), const SizedBox(height: 18), FilledButton(onPressed: loading ? null : reset, child: Text(localizedAuthText(context, 'reset')))]));
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({required this.role, super.key});
  final String role;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final name = TextEditingController();
  final email = TextEditingController();
  final phone = TextEditingController();
  final business = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();
  final session = Session(ApiClient());
  bool loading = false;
  String? error;

  Future<void> register() async {
    setState(() { loading = true; error = null; });
    try {
      final response = await session.api.register({'name': name.text.trim(), 'email': email.text.trim(), 'phone': phone.text.trim(), 'password': password.text, 'password_confirmation': confirmation.text, 'role': widget.role, if (widget.role == 'pharmacy' || widget.role == 'warehouse') 'business_name': business.text.trim()});
      await session.adopt(response);
      unawaited(PushNotificationService.register(session));
      final profileLocale = session.user?['locale']?.toString();
      if (profileLocale == 'ar' || profileLocale == 'en') medlineLocale.value = Locale(profileLocale!);
      if (mounted) Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => RoleHome(role: widget.role, session: session)), (route) => false);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final partner = widget.role == 'pharmacy' || widget.role == 'warehouse';
    return Scaffold(appBar: AppBar(title: Text(localizedAuthText(context, 'register_title'))), body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('${localizedAuthText(context, 'register_as')} ${localizedRole(context, widget.role)}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 18),
      TextField(controller: name, decoration: InputDecoration(labelText: localizedAuthText(context, 'full_name'))),
      const SizedBox(height: 12),
      TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: localizedAuthText(context, 'email'))),
      const SizedBox(height: 12),
      TextField(controller: phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: localizedAuthText(context, 'phone'))),
      if (partner) Padding(padding: const EdgeInsets.only(top: 12), child: TextField(controller: business, decoration: InputDecoration(labelText: localizedAuthText(context, 'business_name')))),
      const SizedBox(height: 12),
      TextField(controller: password, obscureText: true, decoration: InputDecoration(labelText: localizedAuthText(context, 'password'))),
      const SizedBox(height: 12),
      TextField(controller: confirmation, obscureText: true, decoration: InputDecoration(labelText: localizedAuthText(context, 'confirm_password'))),
      if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.red))),
      const SizedBox(height: 20),
      FilledButton(onPressed: loading ? null : register, child: Padding(padding: const EdgeInsets.all(13), child: loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(localizedAuthText(context, 'submit_registration')))),
    ])))));
  }
}

class RoleHome extends StatefulWidget {
  const RoleHome({required this.role, required this.session, super.key});
  final String role;
  final Session session;
  @override
  State<RoleHome> createState() => _RoleHomeState();
}

class _RoleHomeState extends State<RoleHome> {
  late final ApiClient api = widget.session.api;
  int tab = 0;
  final query = TextEditingController();
  List<Map<String, dynamic>> medicines = [];
  List<String> suggestedQueries = [];
  Map<String, dynamic> metrics = {};
  bool loading = false;
  Timer? searchDebounce;
  int searchGeneration = 0;

  @override
  void initState() {
    super.initState();
    api.onConnectivityChanged = (online) { medlineConnection.value = online; if (online) unawaited(api.flushPendingMutations()); };
    api.onMutationQueueChanged = (count) => pendingMutations.value = count;
    unawaited(api.flushPendingMutations());
    loadDashboard();
  }

  Future<void> loadDashboard() async {
    if (!widget.session.isAuthenticated) return;
    try {
      final response = await api.dashboard();
      if (mounted) setState(() => metrics = (response['metrics'] as Map?)?.cast<String, dynamic>() ?? {});
    } catch (_) {
      if (mounted) setState(() => metrics = {});
    }
  }

  Future<void> search() async {
    final generation = ++searchGeneration;
    setState(() => loading = true);
    try {
      final response = await api.get('/medicines', query: {'search': query.text, 'per_page': '10'});
      if (!mounted || generation != searchGeneration) return;
      setState(() {
        medicines = ((response['data'] as List?) ?? []).cast<Map<String, dynamic>>();
        suggestedQueries = ((response['suggested_queries'] as List?) ?? []).map((value) => '$value').toList();
      });
    } catch (_) {
      if (!mounted || generation != searchGeneration) return;
      setState(() {
        medicines = [];
        suggestedQueries = [];
      });
    } finally {
      if (mounted && generation == searchGeneration) setState(() => loading = false);
    }
  }

  Future<void> orderMedicine(Map<String, dynamic> medicine) async {
    if (!widget.session.isAuthenticated) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(localizedNotice(context, 'Sign in before adding items to your cart.'))));
      return;
    }
    try {
      final current = await widget.session.api.cart();
      Map<String, dynamic>? existing;
      for (final raw in ((current['items'] as List?) ?? [])) {
        if (raw is Map && '${raw['medicine_id']}' == '${medicine['id']}') { existing = raw.cast<String, dynamic>(); break; }
      }
      await widget.session.api.updateCartItem(int.parse('${medicine['id']}'), (int.tryParse('${existing?['quantity'] ?? 0}') ?? 0) + 1);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(localizedNotice(context, 'Medicine added to your cart.'))));
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString())));
    }
  }

  @override
  void dispose() { searchDebounce?.cancel(); query.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final title = localizedRole(context, widget.role);
    return Scaffold(
      appBar: AppBar(backgroundColor: const Color(0xff082f49), foregroundColor: Colors.white, title: Text('MedLine • $title'), actions: [IconButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => NotificationPage(session: widget.session))), icon: const Icon(Icons.notifications_none_rounded), tooltip: localizedCatalogText(context, 'notifications'))]),
      body: SafeArea(child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 760), child: ListView(padding: const EdgeInsets.all(20), children: [
        ValueListenableBuilder<bool>(valueListenable: medlineConnection, builder: (context, online, _) => online ? const SizedBox.shrink() : Card(color: const Color(0xfffff3cd), elevation: 0, child: ListTile(leading: const Icon(Icons.cloud_off_rounded, color: Colors.orange), title: Text(localizedWorkflowAction(context, 'Offline')), subtitle: Text(localizedWorkflowAction(context, 'Reconnect to refresh live data.')), trailing: IconButton(onPressed: loadDashboard, icon: const Icon(Icons.refresh_rounded), tooltip: localizedWorkflowAction(context, 'Retry'))))),
        ValueListenableBuilder<int>(valueListenable: pendingMutations, builder: (context, count, _) => count == 0 ? const SizedBox.shrink() : Card(color: const Color(0xffe8f5fa), elevation: 0, child: ListTile(leading: const Icon(Icons.sync_rounded, color: Color(0xff1689b8)), title: Text('${localizedWorkflowAction(context, 'Pending updates')}: $count'), subtitle: Text(localizedWorkflowAction(context, 'Updates will sync when the connection is restored.')), trailing: IconButton(onPressed: () => unawaited(widget.session.api.flushPendingMutations()), icon: const Icon(Icons.refresh_rounded), tooltip: localizedWorkflowAction(context, 'Retry'))))),
        Text(localizedHomeText(context, widget.role == 'patient' ? 'greeting_patient' : 'greeting_workspace'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xff102f46))),
        const SizedBox(height: 18),
        TextField(controller: query, onChanged: (_) { searchDebounce?.cancel(); searchDebounce = Timer(const Duration(milliseconds: 350), search); }, onSubmitted: (_) => search(), decoration: InputDecoration(hintText: localizedHomeText(context, widget.role == 'patient' ? 'search_patient' : 'search_workspace'), prefixIcon: const Icon(Icons.search_rounded), filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none))),
        const SizedBox(height: 22),
        _SectionTitle(title: localizedHomeText(context, widget.role == 'patient' ? 'catalog' : 'today')),
        const SizedBox(height: 12),
        if (metrics.isNotEmpty) _DashboardMetrics(metrics: metrics),
        if (metrics.isNotEmpty) const SizedBox(height: 12),
        _RoleActions(role: widget.role, onTap: (action) {
          final page = action == 'Cart' ? CartPage(session: widget.session) : action == 'Pharmacies' ? PharmacyDirectoryPage(session: widget.session) : action == 'Availability' ? DriverAvailabilityPage(session: widget.session) : action == 'Inventory' ? PartnerInventoryPage(session: widget.session) : action == 'Warehouse stock' ? ProcurementCreatePage(session: widget.session) : action == 'Subscriptions' ? SubscriptionPage(session: widget.session) : action == 'Security' ? ProfilePage(session: widget.session) : action == 'Notifications' ? NotificationPage(session: widget.session) : action == 'Admin dashboard' ? AdminOperationsPage(session: widget.session) : RoleOperationsPage(role: widget.role, session: widget.session);
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
        }),
        const SizedBox(height: 18),
        if (loading) const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())) else if (medicines.isEmpty) _EmptyCard(role: widget.role) else ...medicines.map((medicine) => _MedicineTile(medicine: medicine, onTap: widget.role == 'patient' ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => MedicineDetailPage(medicine: medicine, session: widget.session))) : null)),
        if (!loading && medicines.isEmpty && suggestedQueries.isNotEmpty) _SuggestionChips(suggestions: suggestedQueries, onSelected: (suggestion) { query.text = suggestion; search(); }),
        if (medicines.isEmpty && widget.role == 'patient') Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton.icon(onPressed: search, icon: const Icon(Icons.search), label: Text(localizedHomeText(context, 'search_catalog')))),
      ])))),
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (index) { setState(() => tab = index); if (index == 1) Navigator.of(context).push(MaterialPageRoute(builder: (_) => RoleOperationsPage(role: widget.role, session: widget.session))); if (index == 2) Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProfilePage(session: widget.session))); }, destinations: [NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: localizedNavigation(context, 'Home')), NavigationDestination(icon: const Icon(Icons.receipt_long_outlined), label: localizedNavigation(context, 'Orders')), NavigationDestination(icon: const Icon(Icons.person_outline), label: localizedNavigation(context, 'Profile'))]),
    );
  }
}

class AdminOperationsPage extends StatefulWidget {
  const AdminOperationsPage({required this.session, super.key});
  final Session session;

  @override
  State<AdminOperationsPage> createState() => _AdminOperationsPageState();
}

class _AdminOperationsPageState extends State<AdminOperationsPage> {
  Map<String, dynamic>? payload;
  String? error;
  bool loading = true;
  bool requestInFlight = false;
  Timer? refreshTimer;

  @override
  void initState() {
    super.initState();
    load();
    refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) => load());
  }

  Future<void> load() async {
    if (requestInFlight) return;
    requestInFlight = true;
    if (mounted) setState(() { loading = payload == null; error = null; });
    try { final response = await widget.session.api.adminDashboard(); if (mounted) setState(() => payload = response); }
    catch (exception) { if (mounted && payload == null) setState(() => error = exception.toString()); }
    finally {
      requestInFlight = false;
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() {
    refreshTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final metrics = (payload?['metrics'] as Map?)?.cast<String, dynamic>() ?? {};
    final alerts = ((payload?['alerts'] as List?) ?? []).whereType<Map>().map((item) => item.cast<String, dynamic>()).toList();
    return Scaffold(appBar: AppBar(title: Text(localizedWorkflowAction(context, 'Admin operations')), actions: [IconButton(onPressed: requestInFlight ? null : load, icon: const Icon(Icons.refresh_rounded), tooltip: localizedWorkflowAction(context, 'Retry'))]), body: loading && payload == null ? const Center(child: CircularProgressIndicator()) : error != null && payload == null ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [Text(error!, textAlign: TextAlign.center), const SizedBox(height: 14), FilledButton(onPressed: load, child: Text(localizedWorkflowAction(context, 'Retry')))]))) : RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(20), children: [Text(localizedDashboardText(context, 'today'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)), const SizedBox(height: 16), _AdminDashboardMetrics(metrics: metrics), const SizedBox(height: 22), Text(localizedWorkflowAction(context, 'Operational alerts'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)), const SizedBox(height: 10), if (alerts.isEmpty) Text(localizedWorkflowAction(context, 'No active alerts.')) else ...alerts.map((alert) => Card(elevation: 0, child: ListTile(leading: Icon(alert['severity'] == 'critical' ? Icons.warning_amber_rounded : Icons.info_outline_rounded, color: alert['severity'] == 'critical' ? Colors.orange : const Color(0xff1689b8)), title: Text('${alert['message'] ?? localizedWorkflowAction(context, 'Operational alert')}'), trailing: Text('${alert['count'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w800)))))]));
  }
}

class _SuggestionChips extends StatelessWidget {
  const _SuggestionChips({required this.suggestions, required this.onSelected});
  final List<String> suggestions;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Wrap(
      spacing: 8,
      runSpacing: 8,
      children: suggestions.map((suggestion) => ActionChip(label: Text(suggestion), onPressed: () => onSelected(suggestion))).toList(),
    ),
  );
}

class _AdminDashboardMetrics extends StatelessWidget {
  const _AdminDashboardMetrics({required this.metrics});
  final Map<String, dynamic> metrics;

  @override
  Widget build(BuildContext context) {
    final values = [('users', 'users'), ('partners', 'partners'), ('pending_partners', 'pending_partners'), ('open_complaints', 'open_complaints')];
    return Row(children: values.map((entry) => Expanded(child: Padding(padding: const EdgeInsets.only(right: 8), child: Card(elevation: 0, child: Padding(padding: const EdgeInsets.all(10), child: Column(children: [Text('${metrics[entry.$2] ?? 0}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xff17384e))), const SizedBox(height: 3), Text(localizedDashboardText(context, entry.$1), textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, color: Color(0xff7892a1)))])))))).toList());
  }
}

class _DashboardMetrics extends StatelessWidget {
  const _DashboardMetrics({required this.metrics});
  final Map<String, dynamic> metrics;

  @override
  Widget build(BuildContext context) {
    final values = [('orders', 'orders'), ('pending', 'pending_orders'), ('deliveries', 'active_deliveries'), ('low_stock', 'low_stock_items')];
    return Row(children: values.map((entry) => Expanded(child: Padding(padding: const EdgeInsets.only(right: 8), child: Card(elevation: 0, child: Padding(padding: const EdgeInsets.all(10), child: Column(children: [Text('${metrics[entry.$2] ?? 0}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xff17384e))), const SizedBox(height: 3), Text(localizedDashboardText(context, entry.$1), style: const TextStyle(fontSize: 10, color: Color(0xff7892a1)))])))))).toList());
  }
}

class MedicineDetailPage extends StatelessWidget {
  const MedicineDetailPage({required this.medicine, required this.session, super.key});
  final Map<String, dynamic> medicine;
  final Session session;

  Future<void> addToCart(BuildContext context) async {
    try { final current = await session.api.cart(); var quantity = 0; for (final raw in ((current['items'] as List?) ?? [])) { if (raw is Map && '${raw['medicine_id']}' == '${medicine['id']}') quantity = int.tryParse('${raw['quantity']}') ?? 0; } await session.api.updateCartItem(int.parse('${medicine['id']}'), quantity + 1); if (context.mounted) { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${localizedCatalogText(context, 'add_to_cart')} ✓'))); Navigator.of(context).pop(); } }
    catch (exception) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()))); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedCatalogText(context, 'medicine_details'))), body: ListView(padding: const EdgeInsets.all(20), children: [Card(elevation: 0, child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const CircleAvatar(radius: 32, backgroundColor: Color(0xffe8f5fa), child: Text('Rx', style: TextStyle(color: Color(0xff1689b8), fontSize: 20, fontWeight: FontWeight.w800))), const SizedBox(height: 16), Text('${medicine['name_en'] ?? 'Medicine'}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)), const SizedBox(height: 6), Text('${medicine['name_ar'] ?? ''}', style: const TextStyle(fontSize: 18, color: Color(0xff527386))), const Divider(height: 28), _detail(localizedCatalogText(context, 'manufacturer'), medicine['manufacturer']), _detail(localizedCatalogText(context, 'form'), medicine['form']), _detail(localizedCatalogText(context, 'dosage'), medicine['dosage']), _detail(localizedCatalogText(context, 'code'), medicine['code']), const SizedBox(height: 12), if (medicine['prescription_required'] == true) Text(localizedCatalogText(context, 'prescription_required'), style: const TextStyle(color: Colors.deepOrange, fontWeight: FontWeight.w700)), const SizedBox(height: 20), FilledButton.icon(onPressed: () => addToCart(context), icon: const Icon(Icons.add_shopping_cart_rounded), label: Text(localizedCatalogText(context, 'add_to_cart')))]))]));

  static Widget _detail(String label, dynamic value) { if (value == null || '$value'.isEmpty) return const SizedBox.shrink(); return Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('$label: $value', style: const TextStyle(fontSize: 15))); }
}

class PharmacyDirectoryPage extends StatefulWidget {
  const PharmacyDirectoryPage({required this.session, super.key});
  final Session session;
  @override
  State<PharmacyDirectoryPage> createState() => _PharmacyDirectoryPageState();
}

class _PharmacyDirectoryPageState extends State<PharmacyDirectoryPage> {
  List<Map<String, dynamic>> pharmacies = [];
  bool loading = true;
  String? error;

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.partners(type: 'pharmacy'); if (mounted) setState(() => pharmacies = ((response['data'] as List?) ?? []).whereType<Map>().map((item) => item.cast<String, dynamic>()).toList()); }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
    finally { if (mounted) setState(() => loading = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedCatalogText(context, 'approved_pharmacies')), actions: [IconButton(onPressed: loading ? null : load, icon: const Icon(Icons.refresh_rounded))]), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : pharmacies.isEmpty ? Center(child: Text(localizedCatalogText(context, 'no_pharmacies'))) : ListView.builder(padding: const EdgeInsets.all(20), itemCount: pharmacies.length, itemBuilder: (context, index) { final pharmacy = pharmacies[index]; return Card(elevation: 0, margin: const EdgeInsets.only(bottom: 12), child: ListTile(leading: const CircleAvatar(backgroundColor: Color(0xffe8f5fa), child: Icon(Icons.local_pharmacy_outlined, color: Color(0xff1689b8))), title: Text('${pharmacy['business_name'] ?? pharmacy['name'] ?? 'Approved pharmacy'}', style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text('${pharmacy['city'] ?? pharmacy['address'] ?? 'Service area pending'}\nStatus: ${pharmacy['subscription_status'] ?? 'active'}'), isThreeLine: true)); });
}

class CartPage extends StatefulWidget {
  const CartPage({required this.session, super.key});
  final Session session;
  @override
  State<CartPage> createState() => _CartPageState();
}

class _CartPageState extends State<CartPage> {
  List<Map<String, dynamic>> items = [];
  bool loading = true;
  String? error;
  final address = TextEditingController();
  List<Map<String, dynamic>> savedAddresses = [];
  int? selectedAddressId;
  bool submitting = false;
  String? checkoutIdempotencyKey;
  final Set<int> updatingMedicineIds = {};

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.cart(); final addressResponse = await widget.session.api.addresses(); if (mounted) setState(() { items = ((response['items'] as List?) ?? []).whereType<Map>().map((item) => item.cast<String, dynamic>()).toList(); savedAddresses = ((addressResponse['data'] as List?) ?? []).whereType<Map>().map((item) => item.cast<String, dynamic>()).toList(); selectedAddressId ??= savedAddresses.isEmpty ? null : int.tryParse('${savedAddresses.first['id']}'); }); }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
    finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> changeQuantity(Map<String, dynamic> item, int quantity) async {
    final medicineId = int.parse('${item['medicine_id']}');
    if (updatingMedicineIds.contains(medicineId)) return;
    updatingMedicineIds.add(medicineId);
    try { await widget.session.api.updateCartItem(medicineId, quantity); await load(); }
    catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()))); }
    finally { updatingMedicineIds.remove(medicineId); }
  }

  Future<void> checkout() async {
    if (submitting || items.isEmpty || (selectedAddressId == null && address.text.trim().isEmpty)) return;
    setState(() => submitting = true);
    checkoutIdempotencyKey ??= 'mobile-cart-${DateTime.now().microsecondsSinceEpoch}';
    try {
      final partners = await widget.session.api.partners(type: 'pharmacy');
      final pharmacies = (partners['data'] as List?) ?? [];
      if (pharmacies.isEmpty) throw const ApiException(404, 'No approved pharmacy is available.');
      await widget.session.api.createOrder({'pharmacy_id': pharmacies.first['id'], if (selectedAddressId != null) 'address_id': selectedAddressId else 'delivery_address_snapshot': address.text.trim(), 'items': items.map((item) => {'medicine_id': item['medicine_id'], 'quantity': item['quantity']}).toList()}, idempotencyKey: checkoutIdempotencyKey);
      await widget.session.api.clearCart();
      checkoutIdempotencyKey = null;
      if (mounted) { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${localizedCatalogText(context, 'place_order')} ✓'))); Navigator.of(context).pop(); }
    } catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()))); }
    finally { if (mounted) setState(() => submitting = false); }
  }

  @override
  void dispose() { address.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedCatalogText(context, 'my_cart'))), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : items.isEmpty ? Center(child: Text(localizedCatalogText(context, 'cart_empty'))) : ListView(padding: const EdgeInsets.all(20), children: [...items.map((item) => Card(elevation: 0, child: ListTile(title: Text('${item['name_en'] ?? 'Medicine'}'), subtitle: Text('${item['name_ar'] ?? ''}'), trailing: Row(mainAxisSize: MainAxisSize.min, children: [IconButton(onPressed: () => changeQuantity(item, (int.tryParse('${item['quantity']}') ?? 1) - 1), icon: const Icon(Icons.remove_circle_outline)), Text('${item['quantity']}'), IconButton(onPressed: () => changeQuantity(item, (int.tryParse('${item['quantity']}') ?? 0) + 1), icon: const Icon(Icons.add_circle_outline))])))), const SizedBox(height: 16), if (savedAddresses.isNotEmpty) DropdownButtonFormField<int>(value: selectedAddressId, decoration: InputDecoration(labelText: localizedCatalogText(context, 'saved_delivery_address'), border: const OutlineInputBorder()), items: savedAddresses.map((item) => DropdownMenuItem<int>(value: int.tryParse('${item['id']}'), child: Text('${item['label'] ?? item['address_line'] ?? 'Saved address'}'))).toList(), onChanged: (value) => setState(() => selectedAddressId = value)), if (savedAddresses.isNotEmpty) const SizedBox(height: 12), TextField(controller: address, maxLines: 3, decoration: InputDecoration(labelText: localizedCatalogText(context, savedAddresses.isEmpty ? 'delivery_address' : 'different_address'), border: const OutlineInputBorder()), onChanged: (_) { if (address.text.trim().isNotEmpty) setState(() => selectedAddressId = null); }), const SizedBox(height: 16), FilledButton.icon(onPressed: checkout, icon: const Icon(Icons.shopping_bag_outlined), label: Text(localizedCatalogText(context, 'place_order')))]);
}

class NotificationPage extends StatefulWidget {
  const NotificationPage({required this.session, super.key});
  final Session session;

  @override
  State<NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends State<NotificationPage> {
  List<Map<String, dynamic>> rows = [];
  final Set<int> deletingIds = {};
  final Set<String> busyNotificationIds = {};
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final response = await widget.session.api.notifications();
      final value = response['data'];
      if (mounted) setState(() => rows = value is List ? value.whereType<Map>().map((item) => item.cast<String, dynamic>()).toList() : []);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> markRead(String id) async {
    if (busyNotificationIds.contains(id)) return;
    busyNotificationIds.add(id);
    try {
      await widget.session.api.readNotification(id, idempotencyKey: 'mobile-notification-read-$id');
      await load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => markRead(id))));
    } finally {
      busyNotificationIds.remove(id);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(localizedCatalogText(context, 'notifications')), actions: [IconButton(onPressed: loading ? null : load, icon: const Icon(Icons.refresh_rounded))]),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
            ? Center(child: Text(error!))
            : rows.isEmpty
                ? Center(child: Text(localizedCatalogText(context, 'no_notifications')))
                : RefreshIndicator(onRefresh: load, child: ListView.builder(padding: const EdgeInsets.all(12), itemCount: rows.length, itemBuilder: (context, index) {
                    final row = rows[index];
                    final data = row['data'];
                    final message = data is String ? data : '${row['type'] ?? 'MedLine update'}';
                    final unread = row['read_at'] == null;
                    return Card(elevation: 0, child: ListTile(isThreeLine: true, leading: Icon(unread ? Icons.notifications_active_rounded : Icons.notifications_none_rounded, color: unread ? const Color(0xff1689b8) : Colors.grey), title: Text('${row['type'] ?? 'MedLine notification'}'), subtitle: Text(message), trailing: unread ? IconButton(onPressed: () => markRead('${row['id']}'), icon: const Icon(Icons.done_rounded), tooltip: localizedCatalogText(context, 'mark_read')) : null));
                  }),
  );
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({required this.session, super.key});
  final Session session;

  Future<void> signOut(BuildContext context) async {
    try {
      if (session.isAuthenticated) await PushNotificationService.revoke(session);
      if (session.isAuthenticated) await session.api.logout(refreshToken: session.refreshToken);
    } finally {
      await session.signOut();
      if (context.mounted) Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const RoleGate()), (route) => false);
    }
  }

  Future<void> changeLocale(BuildContext context) async {
    final selected = await showDialog<String>(context: context, builder: (context) => SimpleDialog(title: Text(localizedCatalogText(context, 'choose_language')), children: [SimpleDialogOption(onPressed: () => Navigator.pop(context, 'en'), child: const Text('English')), SimpleDialogOption(onPressed: () => Navigator.pop(context, 'ar'), child: const Text('العربية'))]));
    if (selected == null) return;
    medlineLocale.value = Locale(selected);
    if (session.isAuthenticated) { try { await session.api.updateProfile({'locale': selected}, idempotencyKey: 'mobile-profile-locale-$selected'); session.user?['locale'] = selected; } catch (exception) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${localizedCatalogText(context, 'language_saved')} $exception'))); } }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedProfileText(context, 'profile'))), body: ListView(padding: const EdgeInsets.all(20), children: [
    const CircleAvatar(radius: 34, child: Icon(Icons.person_rounded, size: 34)),
    const SizedBox(height: 14),
    Center(child: Text('${session.user?['name'] ?? 'Guest patient'}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
    Center(child: Text('${session.user?['email'] ?? 'Browse-only access'}', style: const TextStyle(color: Colors.grey))),
    const SizedBox(height: 24),
    if (session.isAuthenticated && session.user?['email_verified_at'] == null) ListTile(leading: const Icon(Icons.mark_email_unread_outlined), title: Text(localizedProfileText(context, 'verify_email')), subtitle: Text(localizedProfileText(context, 'verification_hint')), onTap: () async { try { await session.api.resendVerification(); if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(localizedProfileText(context, 'verification_sent')))); } catch (exception) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()))); } }),
    if (session.isAuthenticated && session.user?['role'] == 'patient') ListTile(leading: const Icon(Icons.location_on_outlined), title: Text(localizedProfileText(context, 'saved_addresses')), subtitle: Text(localizedProfileText(context, 'addresses_hint')), onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AddressPage(session: session)))),
    if (session.isAuthenticated && ['pharmacy', 'warehouse', 'driver'].contains(session.user?['role'])) ListTile(leading: const Icon(Icons.verified_user_outlined), title: Text(localizedProfileText(context, 'verification_documents')), subtitle: Text(localizedProfileText(context, 'documents_hint')), onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => VerificationDocumentsPage(session: session)))),
    if (session.isAuthenticated && session.user?['role'] == 'admin') ListTile(leading: const Icon(Icons.security_outlined), title: Text(localizedProfileText(context, 'two_factor')), subtitle: Text(localizedProfileText(context, 'two_factor_hint')), onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TwoFactorPage(session: session)))),
    if (session.isAuthenticated) ListTile(leading: const Icon(Icons.support_agent_outlined), title: Text(localizedProfileText(context, 'support')), subtitle: Text(localizedProfileText(context, 'support_hint')), onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SupportPage(session: session)))),
    ListTile(leading: const Icon(Icons.notifications_active_outlined), title: Text(localizedProfileText(context, 'notification_preferences')), subtitle: Text(localizedProfileText(context, 'notifications_hint')), onTap: session.isAuthenticated ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => NotificationPreferencesPage(session: session))) : null),
    ListTile(leading: const Icon(Icons.language_rounded), title: const Text('Language'), subtitle: Text(medlineLocale.value.languageCode == 'ar' ? 'العربية' : 'English'), onTap: () => changeLocale(context)),
    ListTile(leading: const Icon(Icons.privacy_tip_outlined), title: Text(localizedProfileText(context, 'privacy')), subtitle: Text(localizedProfileText(context, 'privacy_hint')), onTap: session.isAuthenticated ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PrivacyConsentPage(session: session))) : null),
    const SizedBox(height: 16),
    OutlinedButton.icon(onPressed: () => signOut(context), icon: const Icon(Icons.logout_rounded), label: Text(localizedProfileText(context, session.isAuthenticated ? 'sign_out' : 'return_roles'))),
  ]));
}

class TwoFactorPage extends StatefulWidget {
  const TwoFactorPage({required this.session, super.key});
  final Session session;

  @override
  State<TwoFactorPage> createState() => _TwoFactorPageState();
}

class _TwoFactorPageState extends State<TwoFactorPage> {
  bool loading = true;
  bool enabled = false;
  bool working = false;
  String? secret;
  String? error;
  final code = TextEditingController();

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.twoFactorStatus(); if (mounted) setState(() => enabled = response['enabled'] == true); }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
    finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> setup() async {
    if (working) return;
    setState(() { working = true; error = null; });
    try { final response = await widget.session.api.twoFactorSetup(idempotencyKey: 'mobile-2fa-setup'); if (mounted) setState(() => secret = response['secret']?.toString()); }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
    finally { if (mounted) setState(() => working = false); }
  }

  Future<void> confirm() async {
    if (working || code.text.trim().length != 6) return;
    setState(() { working = true; error = null; });
    try { await widget.session.api.confirmTwoFactor(code.text.trim(), idempotencyKey: 'mobile-2fa-confirm'); if (mounted) setState(() { enabled = true; secret = null; code.clear(); }); }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
    finally { if (mounted) setState(() => working = false); }
  }

  Future<void> disable() async {
    if (working || code.text.trim().length != 6) return;
    setState(() { working = true; error = null; });
    try { await widget.session.api.disableTwoFactor(code.text.trim(), idempotencyKey: 'mobile-2fa-disable'); if (mounted) setState(() { enabled = false; code.clear(); }); }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
    finally { if (mounted) setState(() => working = false); }
  }

  @override
  void dispose() { code.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedProfileText(context, 'two_factor'))), body: loading ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [Text(localizedProfileText(context, 'two_factor_hint')), const SizedBox(height: 18), if (error != null) Text(error!, style: const TextStyle(color: Colors.red)), Text(localizedProfileText(context, enabled ? 'two_factor_enabled' : 'two_factor_disabled'), style: const TextStyle(fontWeight: FontWeight.w700)), const SizedBox(height: 14), if (!enabled) FilledButton.icon(onPressed: working ? null : setup, icon: const Icon(Icons.qr_code_2_outlined), label: Text(localizedProfileText(context, 'two_factor_setup'))), if (secret != null) ...[const SizedBox(height: 14), SelectableText(secret!, style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.2)), const SizedBox(height: 14)], if (secret != null || enabled) TextField(controller: code, keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: localizedProfileText(context, 'two_factor_code'), border: const OutlineInputBorder())), if (secret != null) Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton(onPressed: working ? null : confirm, child: Text(localizedProfileText(context, 'two_factor_confirm')))), if (enabled) Padding(padding: const EdgeInsets.only(top: 12), child: OutlinedButton(onPressed: working ? null : disable, child: Text(localizedProfileText(context, 'two_factor_disable'))))]);
}

class PrivacyConsentPage extends StatefulWidget {
  const PrivacyConsentPage({required this.session, super.key});
  final Session session;
  @override
  State<PrivacyConsentPage> createState() => _PrivacyConsentPageState();
}

class _PrivacyConsentPageState extends State<PrivacyConsentPage> {
  final values = <String, bool>{'terms_of_service': false, 'privacy_policy': false, 'marketing': false};
  final Set<String> savingTypes = {};
  bool loading = true;
  String? error;

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.consents(); for (final raw in ((response['data'] as List?) ?? [])) { if (raw is Map) values['${raw['consent_type']}'] = true; } }
    catch (exception) { error = exception.toString(); }
    finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> update(String type, bool value) async {
    if (savingTypes.contains(type)) return;
    savingTypes.add(type);
    try { if (value) { await widget.session.api.grantConsent(type, '2026-08-18', idempotencyKey: 'mobile-consent-$type-grant'); } else { await widget.session.api.revokeConsent(type, idempotencyKey: 'mobile-consent-$type-revoke'); } if (mounted) setState(() => values[type] = value); }
    catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()))); }
    finally { savingTypes.remove(type); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedProfileText(context, 'privacy_consent'))), body: loading ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [if (error != null) Text(error!, style: const TextStyle(color: Colors.red)), Text(localizedProfileText(context, 'consent_summary'), style: const TextStyle(color: Colors.grey)), const SizedBox(height: 14), SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(localizedProfileText(context, 'terms')), subtitle: Text(localizedProfileText(context, 'terms_hint')), value: values['terms_of_service'] == true, onChanged: (value) => update('terms_of_service', value)), SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(localizedProfileText(context, 'policy')), subtitle: Text(localizedProfileText(context, 'policy_hint')), value: values['privacy_policy'] == true, onChanged: (value) => update('privacy_policy', value)), SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(localizedProfileText(context, 'marketing')), subtitle: Text(localizedProfileText(context, 'marketing_hint')), value: values['marketing'] == true, onChanged: (value) => update('marketing', value))]);
}

class AddressPage extends StatefulWidget {
  const AddressPage({required this.session, super.key});
  final Session session;

  @override
  State<AddressPage> createState() => _AddressPageState();
}

class _AddressPageState extends State<AddressPage> {
  List<Map<String, dynamic>> rows = [];
  final Set<int> deletingIds = {};
  bool adding = false;
  bool loading = true;
  String? error;
  String? pendingAddressFingerprint;
  String? pendingAddressKey;

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.addresses(); if (mounted) setState(() => rows = ((response['data'] as List?) ?? []).map((item) => Map<String, dynamic>.from(item as Map)).toList()); } catch (exception) { if (mounted) setState(() => error = exception.toString()); } finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> addAddress() async {
    if (adding) return;
    adding = true;
    final label = TextEditingController(); final line = TextEditingController(); final city = TextEditingController();
    final save = await showDialog<bool>(context: context, builder: (context) => AlertDialog(title: Text(localizedProfileText(context, 'add_address')), content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: label, decoration: InputDecoration(labelText: localizedProfileText(context, 'label'))), TextField(controller: line, decoration: InputDecoration(labelText: localizedProfileText(context, 'address'))), TextField(controller: city, decoration: InputDecoration(labelText: localizedProfileText(context, 'city')))]), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: Text(localizedAuthText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(localizedAuthText(context, 'save')))]));
    if (save != true || line.text.trim().isEmpty) { label.dispose(); line.dispose(); city.dispose(); adding = false; return; }
    final payload = {'label': label.text.trim(), 'address_line': line.text.trim(), 'city': city.text.trim(), 'is_default': rows.isEmpty};
    final fingerprint = '${payload['label']}|${payload['address_line']}|${payload['city']}|${payload['is_default']}';
    if (pendingAddressFingerprint != fingerprint) { pendingAddressFingerprint = fingerprint; pendingAddressKey = 'mobile-address-create-${fingerprint.hashCode}'; }
    try { await widget.session.api.createAddress(payload, idempotencyKey: pendingAddressKey); pendingAddressFingerprint = null; pendingAddressKey = null; await load(); } catch (exception) { if (mounted) setState(() => error = exception.toString()); } finally { label.dispose(); line.dispose(); city.dispose(); adding = false; }
  }

  Future<void> remove(int id) async { if (deletingIds.contains(id)) return; deletingIds.add(id); try { await widget.session.api.deleteAddress(id, idempotencyKey: 'mobile-address-delete-$id'); await load(); } catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => remove(id)))); } finally { deletingIds.remove(id); } }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedProfileText(context, 'address_title')), actions: [IconButton(onPressed: addAddress, icon: const Icon(Icons.add_location_alt_outlined))]), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : rows.isEmpty ? Center(child: Text(localizedProfileText(context, 'no_addresses'))) : ListView.builder(padding: const EdgeInsets.all(16), itemCount: rows.length, itemBuilder: (context, index) { final row = rows[index]; return Card(child: ListTile(title: Text('${row['label'] ?? localizedProfileText(context, 'address')}'), subtitle: Text('${row['address_line'] ?? ''}${row['city'] == null ? '' : ', ${row['city']}'}'), leading: row['is_default'] == true ? const Icon(Icons.star, color: Colors.amber) : const Icon(Icons.location_on_outlined), trailing: IconButton(onPressed: () => remove(int.parse('${row['id']}')), icon: const Icon(Icons.delete_outline))); }));
}

class VerificationDocumentsPage extends StatefulWidget {
  const VerificationDocumentsPage({required this.session, super.key});
  final Session session;

  @override
  State<VerificationDocumentsPage> createState() => _VerificationDocumentsPageState();
}

class _VerificationDocumentsPageState extends State<VerificationDocumentsPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  bool uploading = false;
  String? error;

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.verificationDocuments(); if (mounted) setState(() => rows = ((response['data'] as List?) ?? []).map((item) => Map<String, dynamic>.from(item as Map)).toList()); } catch (exception) { if (mounted) setState(() => error = exception.toString()); } finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> upload() async {
    final type = TextEditingController();
    final selected = await showDialog<String>(context: context, builder: (context) => AlertDialog(title: Text(localizedProfileText(context, 'document_type')), content: TextField(controller: type, decoration: InputDecoration(hintText: localizedProfileText(context, 'document_hint'))), actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(localizedAuthText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, type.text.trim()), child: Text(localizedProfileText(context, 'choose_file')))]));
    type.dispose();
    if (selected == null || selected.isEmpty) return;
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'], withData: false);
    final path = result?.files.single.path;
    if (path == null) return;
    if (uploading) return;
    uploading = true;
    try { await widget.session.api.uploadVerificationDocument(selected, path, idempotencyKey: 'mobile-verification-${selected.hashCode}-${path.hashCode}'); await load(); } catch (exception) { if (mounted) setState(() => error = exception.toString()); } finally { uploading = false; }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedProfileText(context, 'verification_documents')), actions: [IconButton(onPressed: upload, icon: const Icon(Icons.upload_file_outlined))]), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : rows.isEmpty ? Center(child: Text(localizedProfileText(context, 'no_documents'))) : ListView.builder(padding: const EdgeInsets.all(16), itemCount: rows.length, itemBuilder: (context, index) { final row = rows[index]; return Card(child: ListTile(title: Text('${row['document_type'] ?? localizedProfileText(context, 'document_type')}'), subtitle: Text('${row['status'] ?? 'under_review'}'), leading: const Icon(Icons.description_outlined))); }));
}

class SupportPage extends StatefulWidget {
  const SupportPage({required this.session, super.key});
  final Session session;

  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  bool submitting = false;
  String? error;
  String? pendingComplaintFingerprint;
  String? pendingComplaintKey;

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async { try { final response = await widget.session.api.complaints(); if (mounted) setState(() => rows = ((response['data'] as List?) ?? []).map((item) => Map<String, dynamic>.from(item as Map)).toList()); } catch (exception) { if (mounted) setState(() => error = exception.toString()); } finally { if (mounted) setState(() => loading = false); } }

  Future<void> create() async {
    final subject = TextEditingController(); final description = TextEditingController();
    String? attachmentPath;
    final save = await showDialog<bool>(context: context, builder: (context) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(title: Text(localizedOperationsText(context, 'new_support')), content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: subject, decoration: InputDecoration(labelText: localizedOperationsText(context, 'subject'))), TextField(controller: description, maxLines: 4, decoration: InputDecoration(labelText: localizedOperationsText(context, 'describe_issue'))), const SizedBox(height: 8), OutlinedButton.icon(onPressed: () async { final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf']); final path = result?.files.single.path; if (path != null) setDialogState(() => attachmentPath = path); }, icon: const Icon(Icons.attach_file), label: Text(attachmentPath == null ? localizedOperationsText(context, 'attach_evidence') : localizedOperationsText(context, 'evidence_attached'))), if (attachmentPath != null) Text(attachmentPath!.split(RegExp(r'[\\/]')).last, maxLines: 1, overflow: TextOverflow.ellipsis)]), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: Text(localizedOperationsText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(localizedOperationsText(context, 'submit')))])));
    if (save != true || subject.text.trim().isEmpty || description.text.trim().isEmpty) { subject.dispose(); description.dispose(); return; }
    if (submitting) { subject.dispose(); description.dispose(); return; }
    if (mounted) setState(() => submitting = true);
    final subjectText = subject.text.trim();
    final descriptionText = description.text.trim();
    final fingerprint = '$subjectText|$descriptionText|${attachmentPath ?? ''}';
    if (pendingComplaintFingerprint != fingerprint) {
      pendingComplaintFingerprint = fingerprint;
      pendingComplaintKey = 'mobile-complaint-${fingerprint.hashCode}';
    }
    try { await widget.session.api.createComplaint({'category': 'general_support', 'subject': subjectText, 'description': descriptionText, 'priority': 'normal'}, filePath: attachmentPath, idempotencyKey: pendingComplaintKey); pendingComplaintFingerprint = null; pendingComplaintKey = null; await load(); } catch (exception) { if (mounted) setState(() => error = exception.toString()); } finally { if (mounted) setState(() => submitting = false); subject.dispose(); description.dispose(); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedOperationsText(context, 'support')), actions: [IconButton(onPressed: create, icon: const Icon(Icons.add_comment_outlined))]), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : rows.isEmpty ? Center(child: Text(localizedOperationsText(context, 'no_support'))) : ListView.builder(padding: const EdgeInsets.all(16), itemCount: rows.length, itemBuilder: (context, index) { final row = rows[index]; return Card(child: ListTile(title: Text('${row['subject'] ?? localizedOperationsText(context, 'support')}'), subtitle: Text('${row['status'] ?? 'open'} · ${row['description'] ?? ''}'))); }));
}

class NotificationPreferencesPage extends StatefulWidget {
  const NotificationPreferencesPage({required this.session, super.key});
  final Session session;

  @override
  State<NotificationPreferencesPage> createState() => _NotificationPreferencesPageState();
}

class _NotificationPreferencesPageState extends State<NotificationPreferencesPage> {
  Map<String, dynamic> preferences = {'in_app_enabled': true, 'push_enabled': true, 'email_enabled': true, 'sms_enabled': false};
  final Set<String> savingKeys = {};
  String? error;
  bool loading = true;

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.notificationPreferences(); if (mounted) setState(() => preferences = {...preferences, ...Map<String, dynamic>.from(response['preferences'] as Map)}); } catch (exception) { if (mounted) setState(() => error = exception.toString()); } finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> save(String key, bool value) async {
    if (savingKeys.contains(key)) return;
    final previous = preferences[key] == true;
    setState(() => preferences[key] = value);
    savingKeys.add(key);
    try { await widget.session.api.updateNotificationPreferences({key: value}, idempotencyKey: 'mobile-notification-preference-$key-${value ? 'on' : 'off'}'); } catch (exception) { if (mounted) setState(() { preferences[key] = previous; error = exception.toString(); }); } finally { savingKeys.remove(key); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedProfileText(context, 'notification_preferences')), body: loading ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [if (error != null) Text(error!, style: const TextStyle(color: Colors.red)), Text(localizedProfileText(context, 'notification_channels')), const SizedBox(height: 12), ...{'in_app_enabled': 'in_app', 'push_enabled': 'push', 'email_enabled': 'email_notifications', 'sms_enabled': 'sms'}.entries.map((entry) => SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(localizedProfileText(context, entry.value)), value: preferences[entry.key] == true, onChanged: (value) => save(entry.key, value)))]));
}

class SubscriptionPage extends StatefulWidget {
  const SubscriptionPage({required this.session, super.key});
  final Session session;

  @override
  State<SubscriptionPage> createState() => _SubscriptionPageState();
}

class _SubscriptionPageState extends State<SubscriptionPage> {
  Map<String, dynamic>? subscription;
  Map<String, dynamic>? plan;
  bool loading = true;
  bool submittingProof = false;
  String? paymentProofKey;
  String? paymentProofFingerprint;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final response = await widget.session.api.subscription();
      final plansResponse = await widget.session.api.subscriptionPlans();
      if (mounted) setState(() { subscription = (response['subscription'] as Map?)?.cast<String, dynamic>(); final plans = plansResponse['data'] as List?; plan = plans != null && plans.isNotEmpty ? (plans.first as Map).cast<String, dynamic>() : null; });
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> uploadProof() async {
    if (submittingProof) return;
    final amountController = TextEditingController();
    final amount = await showDialog<num>(context: context, builder: (context) => AlertDialog(title: Text(localizedCatalogText(context, 'subscription_payment')), content: TextField(controller: amountController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: localizedCatalogText(context, 'amount'))), actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(localizedCatalogText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, num.tryParse(amountController.text)), child: Text(localizedCatalogText(context, 'choose_proof')))]));
    amountController.dispose();
    if (amount == null) return;
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'], withData: false);
    final path = result?.files.single.path;
    if (path == null) return;
    final fingerprint = '$amount|$path|${plan?['code'] ?? ''}';
    if (paymentProofFingerprint != fingerprint) {
      paymentProofFingerprint = fingerprint;
      paymentProofKey = 'mobile-payment-proof-${DateTime.now().microsecondsSinceEpoch}';
    }
    setState(() => submittingProof = true);
    try {
      await widget.session.api.uploadPaymentProof(amount, path, planCode: plan?['code']?.toString(), idempotencyKey: paymentProofKey);
      await load();
      paymentProofKey = null;
      paymentProofFingerprint = null;
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(localizedNotice(context, 'Payment proof submitted for review.'))));
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString())));
    } finally {
      if (mounted) setState(() => submittingProof = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedCatalogText(context, 'annual_subscription')), actions: [IconButton(onPressed: loading ? null : load, icon: const Icon(Icons.refresh_rounded))]), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : ListView(padding: const EdgeInsets.all(20), children: [Card(elevation: 0, child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(localizedCatalogText(context, 'current_status'), style: const TextStyle(color: Colors.grey)), const SizedBox(height: 8), Text('${subscription?['status'] ?? localizedCatalogText(context, 'not_active')}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)), if (subscription?['ends_at'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${localizedCatalogText(context, 'valid_until')} ${subscription?['ends_at']}')), if (plan?['code'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${localizedCatalogText(context, 'plan')}: ${plan?['code']} · ${plan?['amount'] ?? localizedCatalogText(context, 'contact_admin')}'))])), const SizedBox(height: 18), Text(localizedCatalogText(context, 'payment_receipt_hint'), style: const TextStyle(color: Colors.grey)), const SizedBox(height: 14), FilledButton.icon(onPressed: uploadProof, icon: const Icon(Icons.upload_file_rounded), label: Text(localizedCatalogText(context, 'submit_payment_proof'))]);
}

class PartnerInventoryPage extends StatefulWidget {
  const PartnerInventoryPage({required this.session, super.key});
  final Session session;

  @override
  State<PartnerInventoryPage> createState() => _PartnerInventoryPageState();
}

class _PartnerInventoryPageState extends State<PartnerInventoryPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final response = await widget.session.api.partnerInventory();
      final value = response['data'];
      if (mounted) setState(() => rows = value is List ? value.whereType<Map>().map((item) => item.cast<String, dynamic>()).toList() : []);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> editInventory() async {
    final medicineId = TextEditingController();
    final quantity = TextEditingController();
    final price = TextEditingController();
    final threshold = TextEditingController(text: '5');
    final submitted = await showDialog<bool>(context: context, builder: (context) => AlertDialog(title: Text(localizedInventoryText(context, 'update')), content: SingleChildScrollView(child: Column(children: [TextField(controller: medicineId, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: localizedInventoryText(context, 'medicine_id'))), TextField(controller: quantity, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: localizedInventoryText(context, 'quantity'))), TextField(controller: price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: localizedInventoryText(context, 'unit_price'))), TextField(controller: threshold, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: localizedInventoryText(context, 'low_stock')))])), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: Text(localizedInventoryText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(localizedInventoryText(context, 'save')))]));
    final id = int.tryParse(medicineId.text);
    final qty = int.tryParse(quantity.text);
    final unitPrice = num.tryParse(price.text);
    final lowStock = int.tryParse(threshold.text) ?? 5;
    medicineId.dispose(); quantity.dispose(); price.dispose(); threshold.dispose();
    if (submitted != true || id == null || qty == null || unitPrice == null) return;
    try {
      await widget.session.api.upsertInventory(medicineId: id, quantity: qty, unitPrice: unitPrice, lowStockThreshold: lowStock, idempotencyKey: 'mobile-inventory-$id-$qty-$unitPrice-$lowStock');
      await load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedCatalogText(context, 'inventory')), actions: [IconButton(onPressed: loading ? null : load, icon: const Icon(Icons.refresh_rounded))]), floatingActionButton: FloatingActionButton.extended(onPressed: editInventory, icon: const Icon(Icons.add_rounded), label: Text(localizedCatalogText(context, 'adjust_stock'))), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : rows.isEmpty ? Center(child: Text(localizedCatalogText(context, 'no_inventory'))) : RefreshIndicator(onRefresh: load, child: ListView.builder(padding: const EdgeInsets.all(16), itemCount: rows.length, itemBuilder: (context, index) { final row = rows[index]; return Card(elevation: 0, child: ListTile(title: Text('${row['name_en'] ?? 'Medicine'}', style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text('${row['name_ar'] ?? ''}'), trailing: Text('${row['quantity'] ?? 0} available\n${row['reserved_quantity'] ?? 0} reserved', textAlign: TextAlign.right)); })));
}

class ProcurementCreatePage extends StatefulWidget {
  const ProcurementCreatePage({required this.session, super.key});
  final Session session;

  @override
  State<ProcurementCreatePage> createState() => _ProcurementCreatePageState();
}

class _ProcurementCreatePageState extends State<ProcurementCreatePage> {
  final medicineId = TextEditingController();
  final quantity = TextEditingController(text: '1');
  final address = TextEditingController();
  bool loading = false;
  String? message;
  String? idempotencyKey;

  Future<void> submit() async {
    final id = int.tryParse(medicineId.text);
    final qty = int.tryParse(quantity.text);
    if (id == null || qty == null || qty < 1 || address.text.trim().isEmpty) {
      setState(() => message = localizedInventoryText(context, 'address_required'));
      return;
    }
    setState(() { loading = true; message = null; });
    idempotencyKey ??= 'mobile-procurement-${DateTime.now().microsecondsSinceEpoch}';
    try {
      final response = await widget.session.api.partners(type: 'warehouse');
      final warehouses = (response['data'] as List? ?? []);
      if (warehouses.isEmpty) throw const ApiException(404, 'No approved warehouse is available.');
      await widget.session.api.createProcurement({'warehouse_id': warehouses.first['id'], 'delivery_address_snapshot': address.text.trim(), 'items': [{'medicine_id': id, 'quantity': qty}]}, idempotencyKey: idempotencyKey);
      idempotencyKey = null;
      if (mounted) setState(() => message = '${localizedOperationsText(context, 'submit_request')} ✓');
    } catch (exception) {
      if (mounted) setState(() => message = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedOperationsText(context, 'procurement'))), body: ListView(padding: const EdgeInsets.all(20), children: [
    Text(localizedOperationsText(context, 'warehouse_stock'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
    const SizedBox(height: 18),
    TextField(controller: medicineId, keyboardType: TextInputType.number, onChanged: (_) => idempotencyKey = null, decoration: InputDecoration(labelText: localizedCatalogText(context, 'medicine_details'))),
    const SizedBox(height: 12),
    TextField(controller: quantity, keyboardType: TextInputType.number, onChanged: (_) => idempotencyKey = null, decoration: InputDecoration(labelText: localizedInventoryText(context, 'quantity'))),
    const SizedBox(height: 12),
    TextField(controller: address, maxLines: 3, onChanged: (_) => idempotencyKey = null, decoration: InputDecoration(labelText: localizedOperationsText(context, 'receiving_address'))),
    if (message != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(message!, style: TextStyle(color: message!.startsWith('Procurement') ? Colors.green : Colors.red))),
    const SizedBox(height: 20),
    FilledButton(onPressed: loading ? null : submit, child: Padding(padding: const EdgeInsets.all(13), child: loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(localizedOperationsText(context, 'submit_request')))),
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
  bool saving = false;
  String approval = 'pending';
  String? error;

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try { final response = await widget.session.api.driverAvailability(); if (mounted) setState(() { available = response['is_available'] == true; approval = '${response['approval_status'] ?? 'pending'}'; }); }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
    finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> update(bool value) async {
    if (saving) return;
    if (mounted) setState(() => saving = true);
    try { await widget.session.api.updateDriverAvailability(value, idempotencyKey: 'mobile-driver-availability-${value ? 'on' : 'off'}'); if (mounted) setState(() => available = value); }
    catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()))); }
    finally { if (mounted) setState(() => saving = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(localizedDashboardText(context, 'driver_availability'))), body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : ListView(padding: const EdgeInsets.all(20), children: [Card(elevation: 0, child: SwitchListTile(title: Text(localizedDashboardText(context, 'available_jobs')), subtitle: Text(approval == 'approved' ? localizedDashboardText(context, 'approved_driver') : '${localizedDashboardText(context, 'approval_status')}: ${localizedStatus(context, approval)}'), value: available, onChanged: approval == 'approved' ? update : null))]);
}

class RoleOperationsPage extends StatefulWidget {
  const RoleOperationsPage({required this.role, required this.session, super.key});
  final String role;
  final Session session;

  @override
  State<RoleOperationsPage> createState() => _RoleOperationsPageState();
}

class _RoleOperationsPageState extends State<RoleOperationsPage> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  String? error;
  final Set<String> busyOperations = {};
  Timer? locationTimer;

  Future<void> openNavigation(String address) async {
    final uri = Uri.https('www.openstreetmap.org', '/search', {'query': address});
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(localizedNotice(context, 'Unable to open navigation.'))));
  }

  @override
  void initState() {
    super.initState();
    load();
    if (widget.role == 'driver') locationTimer = Timer.periodic(const Duration(seconds: 30), (_) => pushActiveLocations());
  }

  @override
  void dispose() {
    locationTimer?.cancel();
    super.dispose();
  }

  List<Map<String, dynamic>> listFrom(Map<String, dynamic> response) {
    final value = response['data'];
    if (value is! List) return [];
    return value.whereType<Map>().map((item) => item.cast<String, dynamic>()).toList();
  }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final api = widget.session.api;
      var nextRows = <Map<String, dynamic>>[];
      if (widget.role == 'driver') {
        try { nextRows.addAll(listFrom(await api.availableDeliveries())); } catch (_) { }
        try { nextRows.addAll(listFrom(await api.mineDeliveries())); } catch (_) { }
        final seen = <String>{}; nextRows = nextRows.where((row) => seen.add('${row['id']}')).toList();
      } else {
        final response = switch (widget.role) {
          'patient' => await api.orders(),
          'pharmacy' => await api.partnerOrders(),
          _ => await api.procurement(),
        };
        nextRows = listFrom(response);
      }
      if (mounted) setState(() => rows = nextRows);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> pushActiveLocations() async {
    final active = rows.where((row) => ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'].contains('${row['status']}')).toList();
    if (active.isEmpty) return;
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return;
    try {
      final position = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 50));
      for (final row in active) {
        final id = int.tryParse('${row['id'] ?? ''}');
        if (id == null) continue;
        try {
          await widget.session.api.updateDeliveryLocation(id, latitude: position.latitude, longitude: position.longitude, accuracyMeters: position.accuracy);
        } catch (_) {
          // Location telemetry is best effort and must never block delivery actions.
        }
      }
    } catch (_) {
      // Permission/provider failures remain non-blocking for the driver workflow.
    }
  }

  Future<void> decide(int id, String decision) async {
    final operation = 'decision:$id:$decision';
    if (!beginOperation(operation)) return;
    try {
      if (widget.role == 'pharmacy') {
        await widget.session.api.decideOrder(id, decision, idempotencyKey: 'mobile-order-decision-$id-$decision');
      } else {
        await widget.session.api.decideProcurement(id, decision, idempotencyKey: 'mobile-procurement-decision-$id-$decision');
      }
      await load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => decide(id, decision))));
    } finally {
      endOperation(operation);
    }
  }

  Future<void> claim(int id) async {
    if (!beginOperation('claim:$id')) return;
    try {
      await widget.session.api.claimDelivery(id, idempotencyKey: 'mobile-delivery-claim-$id');
      await load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => claim(id))));
    } finally {
      endOperation('claim:$id');
    }
  }

  Future<void> updateDriverStatus(int id, String status) async {
    final operation = 'status:$id:$status';
    if (!beginOperation(operation)) return;
    try {
      await widget.session.api.updateDelivery(id, status, idempotencyKey: 'mobile-delivery-$id-$status');
      await load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => updateDriverStatus(id, status))));
    } finally {
      endOperation(operation);
    }
  }

  Future<void> failDelivery(int id) async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(context: context, builder: (context) => AlertDialog(title: Text(localizedOperationsText(context, 'report_failed')), content: TextField(controller: reasonController, maxLines: 3, decoration: InputDecoration(labelText: localizedOperationsText(context, 'reason'), hintText: localizedOperationsText(context, 'reason'))), actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(localizedOperationsText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, reasonController.text.trim()), child: Text(localizedOperationsText(context, 'report')))]));
    reasonController.dispose();
    if (reason == null || reason.isEmpty) return;
    final operation = 'failed:$id:${reason.hashCode}';
    if (!beginOperation(operation)) return;
    await submitFailedDelivery(id, reason, operation);
  }

  Future<void> submitFailedDelivery(int id, String reason, String operation) async {
    try { await widget.session.api.updateDelivery(id, 'failed', failureReason: reason, idempotencyKey: 'mobile-delivery-$id-failed-${reason.hashCode}'); await load(); } catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => submitFailedDelivery(id, reason, operation)))); } finally { endOperation(operation); }
  }

  Future<void> completeDriverDelivery(int id) async {
    final pinController = TextEditingController();
    final pin = await showDialog<String>(context: context, builder: (context) => AlertDialog(title: Text(localizedOperationsText(context, 'confirm_delivery')), content: TextField(controller: pinController, keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: localizedOperationsText(context, 'delivery_pin'))), actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(localizedOperationsText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, pinController.text.trim()), child: Text(localizedOperationsText(context, 'complete')))]));
    pinController.dispose();
    if (pin == null || pin.length != 6) return;
    const operationPrefix = 'complete:';
    final operation = '$operationPrefix$id';
    if (!beginOperation(operation)) return;
    try {
      await widget.session.api.completeDelivery(id, pin, idempotencyKey: 'mobile-delivery-$id-complete');
      await load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => completeDriverDeliveryWithPin(id, pin, operation))));
    } finally {
      endOperation(operation);
    }
  }

  Future<void> completeDriverDeliveryWithPin(int id, String pin, String operation) async {
    try { await widget.session.api.completeDelivery(id, pin, idempotencyKey: 'mobile-delivery-$id-complete'); await load(); } catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => completeDriverDeliveryWithPin(id, pin, operation)))); } finally { endOperation(operation); }
  }

  bool beginOperation(String key) {
    if (busyOperations.contains(key)) return false;
    if (mounted) setState(() => busyOperations.add(key));
    return true;
  }

  void endOperation(String key) {
    if (mounted) setState(() => busyOperations.remove(key));
  }

  Future<void> uploadPrescription(int orderId) async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'], withData: false);
    final path = result?.files.single.path;
    if (path == null) return;
    final operation = 'prescription:$orderId';
    if (!beginOperation(operation)) return;
    try {
      await widget.session.api.uploadPrescription(orderId, path, idempotencyKey: 'mobile-prescription-$orderId-${path.hashCode}');
      await load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(localizedOperationsText(context, 'prescription_uploaded'))));
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString())));
    } finally {
      endOperation(operation);
    }
  }

  Future<void> rateCompletedOrder(int orderId) async {
    var score = 5;
    final comment = TextEditingController();
    final submit = await showDialog<bool>(context: context, builder: (context) => AlertDialog(title: Text(localizedOperationsText(context, 'rate_order')), content: Column(mainAxisSize: MainAxisSize.min, children: [DropdownButtonFormField<int>(value: score, items: [1, 2, 3, 4, 5].map((value) => DropdownMenuItem(value: value, child: Text('$value / 5'))).toList(), onChanged: (value) => score = value ?? 5), TextField(controller: comment, maxLines: 3, decoration: InputDecoration(labelText: localizedOperationsText(context, 'comment')))]), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: Text(localizedOperationsText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(localizedOperationsText(context, 'submit')))]));
    if (submit != true) { comment.dispose(); return; }
    final operation = 'rating:$orderId';
    if (!beginOperation(operation)) { comment.dispose(); return; }
    try { await widget.session.api.rateOrder(orderId, score, comment: comment.text.trim(), idempotencyKey: 'mobile-rating-$orderId'); await load(); } catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()))); } finally { comment.dispose(); endOperation(operation); }
  }

  Future<void> cancelPatientOrder(int orderId) async {
    final operation = 'cancel:$orderId';
    if (!beginOperation(operation)) return;
    try { await widget.session.api.cancelOrder(orderId, reason: 'Cancelled by patient from mobile.', idempotencyKey: 'mobile-order-cancel-$orderId'); await load(); } catch (exception) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString()), action: SnackBarAction(label: localizedWorkflowAction(context, 'Retry'), onPressed: () => cancelPatientOrder(orderId)))); } finally { endOperation(operation); }
  }

  String titleForRow(Map<String, dynamic> row) => switch (widget.role) {
    'patient' => 'Order ${row['public_id'] ?? row['id'] ?? ''}',
    'pharmacy' => 'Patient order ${row['public_id'] ?? row['id'] ?? ''}',
    'warehouse' => 'Procurement ${row['public_id'] ?? row['id'] ?? ''}',
    _ => 'Delivery ${row['public_id'] ?? row['id'] ?? ''}',
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('${localizedRole(context, widget.role)} operations'), actions: [IconButton(onPressed: loading ? null : load, icon: const Icon(Icons.refresh_rounded))]),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
            ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.cloud_off_rounded, size: 42), const SizedBox(height: 12), Text(error!, textAlign: TextAlign.center), const SizedBox(height: 16), FilledButton(onPressed: load, child: Text(localizedWorkflowAction(context, 'Retry')))])))
            : rows.isEmpty
                ? Center(child: Text(localizedNotice(context, 'No work is waiting for you.')))
                : RefreshIndicator(onRefresh: load, child: ListView.builder(padding: const EdgeInsets.all(16), itemCount: rows.length, itemBuilder: (context, index) {
                    final row = rows[index];
                    final status = '${row['status'] ?? 'unknown'}';
                    final id = int.tryParse('${row['id'] ?? ''}');
                    return Card(elevation: 0, margin: const EdgeInsets.only(bottom: 12), child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(titleForRow(row), style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xff17384e))),
                      const SizedBox(height: 8),
                      Text(localizedStatus(context, status), style: const TextStyle(color: Color(0xff1689b8), fontWeight: FontWeight.w700)),
                      if (row['total'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${localizedOrderText(context, 'total')}: ${row['total']}')),
                      if (row['delivery_address_snapshot'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${row['delivery_address_snapshot']}')),
                      if (row['delivery_address_snapshot'] != null && widget.role == 'driver') Padding(padding: const EdgeInsets.only(top: 10), child: OutlinedButton.icon(onPressed: () => openNavigation('${row['delivery_address_snapshot']}'), icon: const Icon(Icons.navigation_outlined), label: Text(localizedWorkflowAction(context, 'Open navigation')))),
                      if (id != null && widget.role == 'patient') Padding(padding: const EdgeInsets.only(top: 12), child: OutlinedButton.icon(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: id, session: widget.session))), icon: const Icon(Icons.receipt_long_outlined), label: Text(localizedWorkflowAction(context, 'View details and invoice')))),
                      if (id != null && widget.role == 'patient' && status == 'prescription_required') Padding(padding: const EdgeInsets.only(top: 12), child: OutlinedButton.icon(onPressed: () => uploadPrescription(id), icon: const Icon(Icons.upload_file_rounded), label: Text(localizedWorkflowAction(context, 'Upload prescription')))),
                      if (id != null && widget.role == 'patient' && status == 'completed') Padding(padding: const EdgeInsets.only(top: 12), child: OutlinedButton.icon(onPressed: () => rateCompletedOrder(id), icon: const Icon(Icons.star_outline_rounded), label: Text(localizedWorkflowAction(context, 'Rate order')))),
                      if (id != null && widget.role == 'patient' && ['prescription_required', 'pending_pharmacy_review', 'prescription_review', 'accepted', 'partially_accepted', 'ready_for_delivery'].contains(status)) Padding(padding: const EdgeInsets.only(top: 12), child: OutlinedButton.icon(onPressed: () => cancelPatientOrder(id), icon: const Icon(Icons.cancel_outlined), label: Text(localizedWorkflowAction(context, 'Cancel order')))),
                      if (id != null && ((widget.role == 'pharmacy' || widget.role == 'warehouse') && status.contains('pending'))) Padding(padding: const EdgeInsets.only(top: 12), child: Wrap(spacing: 8, children: [OutlinedButton(onPressed: () => decide(id, 'reject'), child: Text(localizedWorkflowAction(context, 'Reject'))), FilledButton(onPressed: () => decide(id, 'accept'), child: Text(localizedWorkflowAction(context, 'Accept')))])),
                      if (id != null && widget.role == 'driver' && status == 'available') Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton.icon(onPressed: () => claim(id), icon: const Icon(Icons.handshake_outlined), label: Text(localizedWorkflowAction(context, 'Claim delivery')))),
                      if (id != null && widget.role == 'driver' && status == 'claimed') Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton(onPressed: () => updateDriverStatus(id, 'pickup_started'), child: Text(localizedWorkflowAction(context, 'Start pickup')))),
                      if (id != null && widget.role == 'driver' && status == 'pickup_started') Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton(onPressed: () => updateDriverStatus(id, 'picked_up'), child: Text(localizedWorkflowAction(context, 'Confirm pickup')))),
                      if (id != null && widget.role == 'driver' && status == 'picked_up') Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton(onPressed: () => updateDriverStatus(id, 'in_transit'), child: Text(localizedWorkflowAction(context, 'Start delivery')))),
                      if (id != null && widget.role == 'driver' && status == 'in_transit') Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton(onPressed: () => updateDriverStatus(id, 'arrived'), child: Text(localizedWorkflowAction(context, 'Mark arrived')))),
                      if (id != null && widget.role == 'driver' && status == 'arrived') Padding(padding: const EdgeInsets.only(top: 12), child: FilledButton.icon(onPressed: () => completeDriverDelivery(id), icon: const Icon(Icons.verified_rounded), label: Text(localizedWorkflowAction(context, 'Complete with PIN')))),
                      if (id != null && widget.role == 'driver' && ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'].contains(status)) Padding(padding: const EdgeInsets.only(top: 8), child: TextButton.icon(onPressed: () => failDelivery(id), icon: const Icon(Icons.report_problem_outlined), label: Text(localizedWorkflowAction(context, 'Report failed delivery')))),
                    ])));
                  }),
  );
}

class OrderDetailPage extends StatefulWidget {
  const OrderDetailPage({required this.orderId, required this.session, super.key});
  final int orderId;
  final Session session;

  @override
  State<OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends State<OrderDetailPage> {
  Map<String, dynamic>? payload;
  String? error;
  Timer? refreshTimer;

  @override
  void initState() {
    super.initState();
    load();
    refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) => load());
  }

  Future<void> load() async {
    try {
      final response = await widget.session.api.orderDetails(widget.orderId);
      if (mounted) {
        setState(() => payload = response);
        final status = ((response['order'] as Map?)?['status'] ?? '').toString();
        if (['completed', 'cancelled', 'rejected'].contains(status)) refreshTimer?.cancel();
      }
    }
    catch (exception) { if (mounted) setState(() => error = exception.toString()); }
  }

  @override
  void dispose() { refreshTimer?.cancel(); super.dispose(); }

  Future<void> rateOrder() async {
    var score = 5;
    final comment = TextEditingController();
    final submit = await showDialog<bool>(context: context, builder: (context) => AlertDialog(title: Text(localizedOrderText(context, 'rate')), content: Column(mainAxisSize: MainAxisSize.min, children: [DropdownButtonFormField<int>(value: score, items: [1, 2, 3, 4, 5].map((value) => DropdownMenuItem(value: value, child: Text('$value / 5'))).toList(), onChanged: (value) => score = value ?? 5), TextField(controller: comment, maxLines: 3, decoration: InputDecoration(labelText: localizedOperationsText(context, 'comment')))]), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: Text(localizedOperationsText(context, 'cancel'))), FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(localizedOperationsText(context, 'submit')))]));
    if (submit != true) { comment.dispose(); return; }
    try {
      await widget.session.api.rateOrder(widget.orderId, score, comment: comment.text.trim(), idempotencyKey: 'mobile-rating-${widget.orderId}');
      await load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString())));
    } finally {
      comment.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = (payload?['order'] as Map?)?.cast<String, dynamic>();
    final invoice = (payload?['invoice'] as Map?)?.cast<String, dynamic>();
    final timeline = (payload?['timeline'] as List?)?.whereType<Map>().map((item) => item.cast<String, dynamic>()).toList() ?? [];
    final delivery = (payload?['delivery'] as Map?)?.cast<String, dynamic>();
    final rating = (payload?['rating'] as Map?)?.cast<String, dynamic>();
    return Scaffold(appBar: AppBar(title: Text(localizedOrderText(context, 'details'))), body: error != null ? Center(child: Text(error!)) : order == null ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [Text('Order ${order['public_id'] ?? order['id']}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)), const SizedBox(height: 8), Text(localizedStatus(context, '${order['status'] ?? 'unknown'}'), style: const TextStyle(color: Color(0xff1689b8), fontWeight: FontWeight.w700)), if (order['status'] == 'completed' && rating == null) Padding(padding: const EdgeInsets.only(top: 16), child: OutlinedButton.icon(onPressed: rateOrder, icon: const Icon(Icons.star_outline_rounded), label: Text(localizedOrderText(context, 'rate')))), if (rating != null) Padding(padding: const EdgeInsets.only(top: 16), child: Card(elevation: 0, child: ListTile(leading: const Icon(Icons.star_rounded, color: Colors.amber), title: Text('${localizedOrderText(context, 'your_rating')}: ${rating['score'] ?? '-'}/5'), subtitle: Text('${rating['comment'] ?? localizedOrderText(context, 'thank_you')}')))), if (delivery?['last_latitude'] != null && delivery?['last_longitude'] != null && delivery?['status'] != 'delivered') Padding(padding: const EdgeInsets.only(top: 16), child: Card(color: const Color(0xffe8f5fa), elevation: 0, child: ListTile(leading: const Icon(Icons.location_on_outlined, color: Color(0xff1689b8)), title: Text(localizedOrderText(context, 'driver_location'), style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text('${localizedOrderText(context, 'location_updated')}: ${delivery?['location_updated_at'] ?? '-'}'), trailing: IconButton(onPressed: () async { final uri = Uri.https('www.openstreetmap.org', '/', {'mlat': '${delivery?['last_latitude']}', 'mlon': '${delivery?['last_longitude']}', 'zoom': '15'}); if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(localizedOrderText(context, 'map_unavailable')))); }, icon: const Icon(Icons.map_outlined), tooltip: localizedOrderText(context, 'open_map'))))), if (delivery?['delivery_pin'] != null) Padding(padding: const EdgeInsets.only(top: 16), child: Card(color: const Color(0xffe8f5fa), elevation: 0, child: ListTile(leading: const Icon(Icons.pin_outlined, color: Color(0xff1689b8)), title: Text(localizedOrderText(context, 'delivery_pin'), style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text('${delivery?['delivery_pin']}', style: const TextStyle(fontSize: 24, letterSpacing: 4, fontWeight: FontWeight.w800))))), const SizedBox(height: 18), Card(elevation: 0, child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(localizedOrderText(context, 'invoice'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)), const SizedBox(height: 10), Text('${localizedOrderText(context, 'subtotal')}: ${invoice?['subtotal'] ?? order['subtotal'] ?? '0.00'}'), Text('${localizedOrderText(context, 'delivery_fee')}: ${invoice?['delivery_fee'] ?? order['delivery_fee'] ?? '0.00'}'), const Divider(), Text('${localizedOrderText(context, 'total')}: ${invoice?['total'] ?? order['total'] ?? '0.00'}', style: const TextStyle(fontWeight: FontWeight.w800)), Text('${localizedOrderText(context, 'payment')}: ${invoice?['payment_method'] ?? order['payment_method'] ?? 'cash_on_delivery'}')]))), if (timeline.isNotEmpty) ...[const SizedBox(height: 18), Text(localizedOrderText(context, 'timeline'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)), const SizedBox(height: 8), ...timeline.map((event) => ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.check_circle_outline, color: Color(0xff1689b8)), title: Text(localizedStatus(context, '${event['to_status'] ?? 'updated'}')), subtitle: Text('${event['created_at'] ?? ''}')))], if (timeline.isEmpty) Padding(padding: const EdgeInsets.only(top: 18), child: Text(localizedOrderText(context, 'timeline_empty'), style: const TextStyle(color: Colors.grey))) ]));
  }
}

class _SectionTitle extends StatelessWidget { const _SectionTitle({required this.title}); final String title; @override Widget build(BuildContext context) => Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xff17384e))); }
class _RoleActions extends StatelessWidget { const _RoleActions({required this.role, required this.onTap}); final String role; final ValueChanged<String> onTap; @override Widget build(BuildContext context) { final actions = switch (role) { 'patient' => const [('Search medicine', Icons.search_rounded), ('My orders', Icons.receipt_long_rounded), ('Pharmacies', Icons.local_pharmacy_outlined), ('Cart', Icons.shopping_cart_outlined)], 'pharmacy' => const [('Patient orders', Icons.receipt_long_rounded), ('Warehouse stock', Icons.warehouse_rounded), ('Inventory', Icons.inventory_2_rounded)], 'warehouse' => const [('Procurement queue', Icons.local_shipping_rounded), ('Inventory', Icons.inventory_2_rounded), ('Subscriptions', Icons.card_membership_rounded)], 'admin' => const [('Admin dashboard', Icons.dashboard_customize_outlined), ('Security', Icons.security_outlined), ('Notifications', Icons.notifications_none_rounded)], _ => const [('Available jobs', Icons.local_shipping_rounded), ('My deliveries', Icons.route_rounded), ('Availability', Icons.toggle_on_rounded)] }; return Semantics(container: true, label: '${localizedRole(context, role)} actions', child: Row(children: actions.map<Widget>((action) => Expanded(child: Padding(padding: const EdgeInsets.only(right: 8), child: InkWell(onTap: () => onTap(action.$1), borderRadius: BorderRadius.circular(14), child: Card(elevation: 0, color: Colors.white, child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [Icon(action.$2, color: const Color(0xff1689b8)), const SizedBox(height: 8), Text(localizedAction(context, action.$1), textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xff34586d)))])))))).toList())); } }
class _EmptyCard extends StatelessWidget { const _EmptyCard({required this.role}); final String role; @override Widget build(BuildContext context) => Card(elevation: 0, child: Padding(padding: const EdgeInsets.all(22), child: Column(children: [const Icon(Icons.space_dashboard_outlined, size: 36, color: Color(0xff1689b8)), const SizedBox(height: 10), Text(role == 'patient' ? localizedDashboardText(context, 'search_begin') : localizedDashboardText(context, 'assigned_work'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xff7892a1)))]))); }
class _MedicineTile extends StatelessWidget { const _MedicineTile({required this.medicine, this.onTap}); final Map<String, dynamic> medicine; final VoidCallback? onTap; @override Widget build(BuildContext context) => Card(elevation: 0, child: ListTile(onTap: onTap, leading: const CircleAvatar(backgroundColor: Color(0xffe8f5fa), child: Text('Rx', style: TextStyle(color: Color(0xff117eaa), fontWeight: FontWeight.w800))), title: Text('${medicine['name_en'] ?? 'Medicine'}', style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text('${medicine['name_ar'] ?? ''} · ${medicine['manufacturer'] ?? ''}'), trailing: const Icon(Icons.chevron_right_rounded))); }
