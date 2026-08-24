import 'package:flutter/material.dart';

abstract final class MedLineColors {
  static const navy = Color(0xff082f49);
  static const blue = Color(0xff1689b8);
  static const cyan = Color(0xff43b5e7);
  static const background = Color(0xfff4f7fb);
  static const paleBlue = Color(0xffe8f5fa);
  static const text = Color(0xff17384e);
  static const muted = Color(0xff527386);
  static const border = Color(0xffd3e3ec);
  static const success = Color(0xff14845d);
  static const warning = Color(0xffa76600);
  static const danger = Color(0xffc84851);
  static const review = Color(0xff7254a7);
}

ThemeData medLineTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: MedLineColors.blue,
    brightness: Brightness.light,
    surface: Colors.white,
  );
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(14),
    borderSide: const BorderSide(color: MedLineColors.border),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: MedLineColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: MedLineColors.text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 1,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: MedLineColors.text,
        fontSize: 20,
        fontWeight: FontWeight.w800,
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: MedLineColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: const BorderSide(color: MedLineColors.blue, width: 2),
      ),
      errorBorder: border.copyWith(
        borderSide: const BorderSide(color: MedLineColors.danger),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(48, 48),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      height: 72,
      backgroundColor: Colors.white,
      indicatorColor: MedLineColors.paleBlue,
      labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
    ),
    dividerTheme:
        const DividerThemeData(color: MedLineColors.border, thickness: 1),
  );
}

List<Map<String, dynamic>> listData(dynamic payload, {String key = 'data'}) {
  final raw = payload is Map ? payload[key] : payload;
  if (raw is! List) return [];
  return raw
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
}

Map<String, dynamic>? mapData(dynamic value) =>
    value is Map ? value.cast<String, dynamic>() : null;

String humanize(dynamic value) {
  final text =
      (value ?? '').toString().trim().replaceAll('_', ' ').replaceAll('.', ' ');
  if (text.isEmpty) return 'Not recorded';
  return text
      .split(RegExp(r'\s+'))
      .map((word) =>
          word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
      .join(' ');
}

String money(dynamic value, {String currency = 'SYP'}) {
  final amount = num.tryParse('${value ?? 0}') ?? 0;
  final fixed = amount.toStringAsFixed(amount % 1 == 0 ? 0 : 2);
  final parts = fixed.split('.');
  final reversed = parts.first.split('').reversed.toList();
  final grouped = <String>[];
  for (var index = 0; index < reversed.length; index += 3) {
    grouped.add(reversed.skip(index).take(3).toList().reversed.join());
  }
  final whole = grouped.reversed.join(',');
  return '$currency $whole${parts.length > 1 ? '.${parts[1]}' : ''}';
}

String dateTimeLabel(dynamic value) {
  final parsed = DateTime.tryParse('${value ?? ''}')?.toLocal();
  if (parsed == null) {
    return value == null || '$value'.isEmpty ? 'Not recorded' : '$value';
  }
  String two(int number) => number.toString().padLeft(2, '0');
  return '${parsed.year}-${two(parsed.month)}-${two(parsed.day)} ${two(parsed.hour)}:${two(parsed.minute)}';
}

Color statusColor(String status) {
  final normalized = status.toLowerCase();
  if (normalized.contains('reject') ||
      normalized.contains('cancel') ||
      normalized.contains('fail') ||
      normalized.contains('suspend') ||
      normalized.contains('inactive')) {
    return MedLineColors.danger;
  }
  if (normalized.contains('partial') ||
      normalized.contains('review') ||
      normalized.contains('pending') ||
      normalized.contains('required')) {
    return MedLineColors.warning;
  }
  if (normalized.contains('approve') ||
      normalized.contains('active') ||
      normalized.contains('complete') ||
      normalized.contains('deliver') ||
      normalized.contains('healthy') ||
      normalized.contains('accept')) {
    return MedLineColors.success;
  }
  return MedLineColors.blue;
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(status);
    return Semantics(
      label: 'Status ${humanize(status)}',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .09),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: .3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
                width: 7,
                height: 7,
                decoration:
                    BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 7),
            Flexible(
                child: Text(humanize(status),
                    style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w700,
                        fontSize: 12))),
          ],
        ),
      ),
    );
  }
}

class MedLineSection extends StatelessWidget {
  const MedLineSection(
      {required this.title,
      required this.child,
      this.subtitle,
      this.trailing,
      this.padding = const EdgeInsets.all(16),
      super.key});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: padding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: MedLineColors.text)),
                        if (subtitle != null) ...[
                          const SizedBox(height: 3),
                          Text(subtitle!,
                              style: const TextStyle(
                                  color: MedLineColors.muted, height: 1.4)),
                        ],
                      ],
                    ),
                  ),
                  if (trailing != null) ...[
                    const SizedBox(width: 12),
                    trailing!
                  ],
                ],
              ),
              const SizedBox(height: 16),
              child,
            ],
          ),
        ),
      );
}

class PageIntro extends StatelessWidget {
  const PageIntro(
      {required this.title,
      required this.subtitle,
      this.eyebrow,
      this.action,
      super.key});
  final String title;
  final String subtitle;
  final String? eyebrow;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null)
                  Text(eyebrow!.toUpperCase(),
                      style: const TextStyle(
                          color: MedLineColors.blue,
                          fontSize: 11,
                          letterSpacing: 1.2,
                          fontWeight: FontWeight.w800)),
                if (eyebrow != null) const SizedBox(height: 6),
                Text(title,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: MedLineColors.text)),
                const SizedBox(height: 5),
                Text(subtitle,
                    style: const TextStyle(
                        color: MedLineColors.muted, height: 1.45)),
              ],
            ),
          ),
          if (action != null) ...[const SizedBox(width: 12), action!],
        ],
      );
}

class MedLineErrorState extends StatelessWidget {
  const MedLineErrorState(
      {required this.message, required this.onRetry, super.key});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined,
                  size: 44, color: MedLineColors.muted),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Retry')),
            ],
          ),
        ),
      );
}

class MedLineEmptyState extends StatelessWidget {
  const MedLineEmptyState(
      {required this.title, required this.message, this.action, super.key});
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircleAvatar(
                  radius: 28,
                  backgroundColor: MedLineColors.paleBlue,
                  child: Icon(Icons.inbox_outlined,
                      color: MedLineColors.blue, size: 28)),
              const SizedBox(height: 14),
              Text(title,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 17,
                      color: MedLineColors.text)),
              const SizedBox(height: 6),
              Text(message,
                  textAlign: TextAlign.center,
                  style:
                      const TextStyle(color: MedLineColors.muted, height: 1.4)),
              if (action != null) ...[const SizedBox(height: 16), action!],
            ],
          ),
        ),
      );
}

class AsyncActionButton extends StatelessWidget {
  const AsyncActionButton(
      {required this.label,
      required this.onPressed,
      this.busy = false,
      this.icon,
      this.destructive = false,
      this.outlined = false,
      super.key});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;
  final bool destructive;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final iconWidget = busy
        ? const SizedBox.square(
            dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
        : Icon(icon ?? Icons.check_rounded, size: 19);
    if (outlined) {
      return OutlinedButton.icon(
        onPressed: busy ? null : onPressed,
        icon: iconWidget,
        label: Text(label),
        style: destructive
            ? OutlinedButton.styleFrom(foregroundColor: MedLineColors.danger)
            : null,
      );
    }
    return FilledButton.icon(
      onPressed: busy ? null : onPressed,
      icon: iconWidget,
      label: Text(label),
      style: destructive
          ? FilledButton.styleFrom(backgroundColor: MedLineColors.danger)
          : null,
    );
  }
}

Future<bool> confirmAction(BuildContext context,
    {required String title,
    required String message,
    String confirmLabel = 'Confirm',
    bool destructive = false}) async {
  return await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              style: destructive
                  ? FilledButton.styleFrom(
                      backgroundColor: MedLineColors.danger)
                  : null,
              child: Text(confirmLabel),
            ),
          ],
        ),
      ) ??
      false;
}

void showMessage(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: error ? MedLineColors.danger : MedLineColors.navy));
}
