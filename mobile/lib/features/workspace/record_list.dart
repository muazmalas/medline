import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/mobile_ui.dart';
import '../../core/session.dart';

typedef RecordLabel = String Function(Map<String, dynamic> row);
typedef RecordOpen = Future<void> Function(
    BuildContext context, Map<String, dynamic> row);

class RecordListConfig {
  const RecordListConfig({
    required this.title,
    required this.subtitle,
    required this.endpoint,
    required this.primary,
    required this.secondary,
    required this.status,
    this.tertiary,
    this.amount,
    this.date,
    this.statusOptions = const {},
    this.sortOptions = const {'Newest': 'created_at', 'Oldest': 'created_at'},
    this.initialSort = 'created_at',
    this.initialDirection = 'desc',
    this.emptyTitle = 'No records yet',
    this.emptyMessage = 'Records will appear here when they are available.',
    this.icon = Icons.description_outlined,
    this.onOpen,
    this.headerAction,
    this.extraQuery = const {},
  });

  final String title;
  final String subtitle;
  final String endpoint;
  final RecordLabel primary;
  final RecordLabel secondary;
  final RecordLabel? tertiary;
  final RecordLabel status;
  final RecordLabel? amount;
  final RecordLabel? date;
  final Map<String, String> statusOptions;
  final Map<String, String> sortOptions;
  final String initialSort;
  final String initialDirection;
  final String emptyTitle;
  final String emptyMessage;
  final IconData icon;
  final RecordOpen? onOpen;
  final Widget Function(BuildContext context, Future<void> Function() reload)?
      headerAction;
  final Map<String, String> extraQuery;
}

class MobileRecordListPage extends StatefulWidget {
  const MobileRecordListPage(
      {required this.session, required this.config, super.key});
  final Session session;
  final RecordListConfig config;

  @override
  State<MobileRecordListPage> createState() => _MobileRecordListPageState();
}

class _MobileRecordListPageState extends State<MobileRecordListPage> {
  final search = TextEditingController();
  Timer? debounce;
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  String? error;
  String status = '';
  late String sortBy = widget.config.initialSort;
  late String sortDirection = widget.config.initialDirection;
  int page = 1;
  int lastPage = 1;
  int perPage = 10;
  int total = 0;
  int generation = 0;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void didUpdateWidget(covariant MobileRecordListPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.config.endpoint == widget.config.endpoint) return;
    search.clear();
    status = '';
    sortBy = widget.config.initialSort;
    sortDirection = widget.config.initialDirection;
    page = 1;
    unawaited(load());
  }

  @override
  void dispose() {
    debounce?.cancel();
    search.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final requestGeneration = ++generation;
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final payload = await widget.session.api.get(
        widget.config.endpoint,
        query: {
          ...widget.config.extraQuery,
          if (search.text.trim().isNotEmpty) 'search': search.text.trim(),
          if (status.isNotEmpty) 'status': status,
          'sort_by': sortBy,
          'sort_direction': sortDirection,
          'per_page': '$perPage',
          'page': '$page',
        },
      );
      if (!mounted || requestGeneration != generation) return;
      final nextRows = listData(payload);
      final meta = mapData(payload['meta']);
      setState(() {
        rows = nextRows;
        lastPage = int.tryParse(
                '${payload['last_page'] ?? meta?['last_page'] ?? 1}') ??
            1;
        total = int.tryParse(
                '${payload['total'] ?? meta?['total'] ?? nextRows.length}') ??
            nextRows.length;
      });
    } catch (exception) {
      if (mounted && requestGeneration == generation) {
        setState(() => error = exception.toString());
      }
    } finally {
      if (mounted && requestGeneration == generation) {
        setState(() => loading = false);
      }
    }
  }

  void searchChanged(String _) {
    debounce?.cancel();
    debounce = Timer(const Duration(milliseconds: 350), () {
      page = 1;
      unawaited(load());
    });
  }

  Future<void> open(Map<String, dynamic> row) async {
    final callback = widget.config.onOpen;
    if (callback == null) return;
    await callback(context, row);
    if (mounted) await load();
  }

  @override
  Widget build(BuildContext context) {
    final config = widget.config;
    return RefreshIndicator(
      onRefresh: load,
      child: CustomScrollView(
        key: PageStorageKey(config.endpoint),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            sliver: SliverToBoxAdapter(
              child: PageIntro(
                title: config.title,
                subtitle: config.subtitle,
                action: config.headerAction?.call(context, load),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            sliver: SliverToBoxAdapter(
              child: Column(
                children: [
                  TextField(
                    controller: search,
                    onChanged: searchChanged,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) {
                      page = 1;
                      unawaited(load());
                    },
                    decoration: const InputDecoration(
                      labelText: 'Search records',
                      hintText: 'Search across visible fields',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (config.statusOptions.isNotEmpty)
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            initialValue: status,
                            isExpanded: true,
                            decoration:
                                const InputDecoration(labelText: 'Status'),
                            items: [
                              const DropdownMenuItem(
                                  value: '', child: Text('All statuses')),
                              ...config.statusOptions.entries.map((entry) =>
                                  DropdownMenuItem(
                                      value: entry.key,
                                      child: Text(entry.value))),
                            ],
                            onChanged: (value) {
                              setState(() {
                                status = value ?? '';
                                page = 1;
                              });
                              unawaited(load());
                            },
                          ),
                        ),
                      if (config.statusOptions.isNotEmpty)
                        const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: '$sortBy|$sortDirection',
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Sort'),
                          items: _sortItems(config),
                          onChanged: (value) {
                            final parts = (value ?? '').split('|');
                            if (parts.length != 2) return;
                            setState(() {
                              sortBy = parts.first;
                              sortDirection = parts.last;
                              page = 1;
                            });
                            unawaited(load());
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(
                        loading
                            ? 'Updating records…'
                            : '$total ${total == 1 ? 'record' : 'records'}',
                        style: const TextStyle(
                            color: MedLineColors.muted,
                            fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
          ),
          if (loading && rows.isEmpty)
            const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator()))
          else if (error != null && rows.isEmpty)
            SliverFillRemaining(
                hasScrollBody: false,
                child: MedLineErrorState(message: error!, onRetry: load))
          else if (rows.isEmpty)
            SliverFillRemaining(
                hasScrollBody: false,
                child: MedLineEmptyState(
                    title: config.emptyTitle, message: config.emptyMessage))
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              sliver: SliverList.builder(
                itemCount: rows.length,
                itemBuilder: (context, index) {
                  final row = rows[index];
                  final interactive = config.onOpen != null;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Semantics(
                      button: interactive,
                      label: interactive ? 'Open ${config.primary(row)}' : null,
                      child: Card(
                        child: InkWell(
                          onTap: interactive ? () => open(row) : null,
                          borderRadius: BorderRadius.circular(16),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  backgroundColor: MedLineColors.paleBlue,
                                  foregroundColor: MedLineColors.blue,
                                  child: Icon(config.icon, size: 21),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(config.primary(row),
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              color: MedLineColors.text)),
                                      const SizedBox(height: 4),
                                      Text(config.secondary(row),
                                          style: const TextStyle(
                                              color: MedLineColors.muted,
                                              height: 1.35)),
                                      if (config.tertiary != null &&
                                          config.tertiary!(row)
                                              .trim()
                                              .isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(config.tertiary!(row),
                                            style: const TextStyle(
                                                color: MedLineColors.muted,
                                                fontSize: 12)),
                                      ],
                                      const SizedBox(height: 10),
                                      Wrap(
                                        spacing: 10,
                                        runSpacing: 8,
                                        crossAxisAlignment:
                                            WrapCrossAlignment.center,
                                        children: [
                                          StatusPill(config.status(row)),
                                          if (config.amount != null)
                                            Text(config.amount!(row),
                                                style: const TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    color: MedLineColors.blue)),
                                          if (config.date != null)
                                            Text(config.date!(row),
                                                style: const TextStyle(
                                                    color: MedLineColors.muted,
                                                    fontSize: 12)),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                if (interactive)
                                  const Padding(
                                      padding: EdgeInsets.only(top: 8),
                                      child: Icon(Icons.chevron_right_rounded,
                                          color: MedLineColors.muted)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: [
                  DropdownButton<int>(
                    value: perPage,
                    borderRadius: BorderRadius.circular(12),
                    items: const [10, 25, 50]
                        .map((size) => DropdownMenuItem(
                            value: size, child: Text('$size per page')))
                        .toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() {
                        perPage = value;
                        page = 1;
                      });
                      unawaited(load());
                    },
                  ),
                  const Spacer(),
                  IconButton.filledTonal(
                    onPressed: page > 1
                        ? () {
                            setState(() => page--);
                            unawaited(load());
                          }
                        : null,
                    tooltip: 'Previous page',
                    icon: const Icon(Icons.chevron_left_rounded),
                  ),
                  Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Text('$page of $lastPage',
                          style: const TextStyle(fontWeight: FontWeight.w700))),
                  IconButton.filledTonal(
                    onPressed: page < lastPage
                        ? () {
                            setState(() => page++);
                            unawaited(load());
                          }
                        : null,
                    tooltip: 'Next page',
                    icon: const Icon(Icons.chevron_right_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<DropdownMenuItem<String>> _sortItems(RecordListConfig config) {
    final items = <DropdownMenuItem<String>>[];
    for (final entry in config.sortOptions.entries) {
      final direction = entry.key.toLowerCase().contains('oldest') ||
              entry.key.toLowerCase().contains('a–z') ||
              entry.key.toLowerCase().contains('lowest')
          ? 'asc'
          : 'desc';
      items.add(DropdownMenuItem(
          value: '${entry.value}|$direction', child: Text(entry.key)));
    }
    if (!items.any((item) => item.value == '$sortBy|$sortDirection')) {
      items.add(DropdownMenuItem(
          value: '$sortBy|$sortDirection',
          child: Text(
              '${humanize(sortBy)} ${sortDirection == 'asc' ? 'ascending' : 'descending'}')));
    }
    return items;
  }
}
