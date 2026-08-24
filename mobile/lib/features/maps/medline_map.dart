import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/mobile_ui.dart';

class MedLineMapPoint {
  const MedLineMapPoint(
      {required this.latitude,
      required this.longitude,
      required this.label,
      this.kind = MedLineMapPointKind.destination});

  final double latitude;
  final double longitude;
  final String label;
  final MedLineMapPointKind kind;

  LatLng get coordinate => LatLng(latitude, longitude);
}

enum MedLineMapPointKind { pharmacy, warehouse, pickup, destination, driver }

class MedLineMap extends StatelessWidget {
  const MedLineMap({
    required this.points,
    this.height = 320,
    this.onTap,
    this.selectedPoint,
    this.drawRoute = true,
    this.routeCoordinates = const [],
    this.controller,
    super.key,
  });

  final List<MedLineMapPoint> points;
  final double height;
  final ValueChanged<LatLng>? onTap;
  final MedLineMapPoint? selectedPoint;
  final bool drawRoute;
  final List<LatLng> routeCoordinates;
  final MapController? controller;

  @override
  Widget build(BuildContext context) {
    final visible = [...points, if (selectedPoint != null) selectedPoint!];
    final markerCoordinates = visible.map((point) => point.coordinate).toList();
    final coordinates = routeCoordinates.length >= 2
        ? [...routeCoordinates, ...markerCoordinates]
        : markerCoordinates;
    final center = coordinates.isEmpty
        ? const LatLng(33.5138, 36.2765)
        : coordinates.first;
    return Semantics(
      label: onTap == null
          ? 'Route map'
          : 'Interactive map. Tap to place the delivery pin.',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          height: height,
          child: FlutterMap(
            mapController: controller,
            options: MapOptions(
              initialCenter: center,
              initialZoom: coordinates.length > 1 ? 11 : 14,
              initialCameraFit: coordinates.length > 1
                  ? CameraFit.coordinates(
                      coordinates: coordinates,
                      padding: const EdgeInsets.all(44),
                      maxZoom: 15)
                  : null,
              minZoom: 3,
              maxZoom: 18,
              onTap:
                  onTap == null ? null : (_, coordinate) => onTap!(coordinate),
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.medline.mobile',
                maxZoom: 19,
              ),
              if (drawRoute && routeCoordinates.length >= 2)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: routeCoordinates,
                      color: MedLineColors.blue,
                      strokeWidth: 5,
                    ),
                  ],
                ),
              MarkerLayer(
                markers: visible.map((point) {
                  final (icon, color) = switch (point.kind) {
                    MedLineMapPointKind.pharmacy => (
                        Icons.local_pharmacy_rounded,
                        MedLineColors.success
                      ),
                    MedLineMapPointKind.warehouse => (
                        Icons.warehouse_rounded,
                        MedLineColors.review
                      ),
                    MedLineMapPointKind.pickup => (
                        Icons.inventory_2_rounded,
                        MedLineColors.success
                      ),
                    MedLineMapPointKind.driver => (
                        Icons.local_shipping_rounded,
                        MedLineColors.warning
                      ),
                    MedLineMapPointKind.destination => (
                        Icons.location_on_rounded,
                        MedLineColors.blue
                      ),
                  };
                  return Marker(
                    point: point.coordinate,
                    width: 54,
                    height: 54,
                    child: Tooltip(
                      message: point.label,
                      child: Semantics(
                        label: point.label,
                        child: DecoratedBox(
                          decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                    color: Color(0x29000000),
                                    blurRadius: 8,
                                    offset: Offset(0, 3))
                              ]),
                          child: Icon(icon, color: color, size: 31),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const RichAttributionWidget(
                attributions: [
                  TextSourceAttribution('OpenStreetMap contributors')
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

List<LatLng> mapRouteCoordinates(dynamic rawGeometry) {
  dynamic geometry = rawGeometry;
  if (geometry is! Map) return const [];
  final coordinates = geometry['coordinates'];
  if (coordinates is! List) return const [];

  return coordinates.map<LatLng?>((raw) {
    if (raw is! List || raw.length < 2) return null;
    final longitude = toCoordinate(raw[0]);
    final latitude = toCoordinate(raw[1]);
    return latitude == null || longitude == null ? null : LatLng(latitude, longitude);
  }).whereType<LatLng>().toList(growable: false);
}

double? toCoordinate(dynamic value) =>
    value == null ? null : double.tryParse('$value');

MedLineMapPoint? mapPointFrom(
  dynamic raw, {
  required String fallbackLabel,
  required MedLineMapPointKind kind,
}) {
  if (raw is! Map) return null;
  final latitude = toCoordinate(raw['latitude']);
  final longitude = toCoordinate(raw['longitude']);
  if (latitude == null || longitude == null) return null;
  return MedLineMapPoint(
    latitude: latitude,
    longitude: longitude,
    label:
        '${raw['label'] ?? raw['business_name'] ?? raw['address'] ?? fallbackLabel}',
    kind: kind,
  );
}
