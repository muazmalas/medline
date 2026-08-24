<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DeliveryPricingService;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DeliveryPricingController extends Controller
{
    public function current(Request $request, DeliveryPricingService $pricing): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['patient', 'pharmacy', 'admin'], true), 403);
        $vehicleType = $pricing->normalizeVehicleType($request->string('vehicle_type')->toString());
        $current = $pricing->current($vehicleType);

        return response()->json([
            'id' => $current->id ? (int) $current->id : null,
            'vehicle_type' => $vehicleType,
            'rate_per_km' => (float) $current->rate_per_km,
            'rates' => collect($pricing->allCurrent())->map(fn (object $rate) => [
                'id' => $rate->id ? (int) $rate->id : null,
                'vehicle_type' => (string) $rate->vehicle_type,
                'rate_per_km' => (float) $rate->rate_per_km,
                'effective_at' => $rate->effective_at,
            ])->values(),
            'tax_rate_percent' => (float) config('medline.tax_rate', 0),
            'currency' => config('medline.currency', 'SYP'),
            'effective_at' => $current->effective_at,
        ]);
    }

    public function estimate(Request $request, DeliveryPricingService $pricing): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['patient', 'pharmacy', 'admin'], true), 403);
        $data = $request->validate([
            'from_latitude' => ['required', 'numeric', 'between:-90,90'],
            'from_longitude' => ['required', 'numeric', 'between:-180,180'],
            'to_latitude' => ['required', 'numeric', 'between:-90,90'],
            'to_longitude' => ['required', 'numeric', 'between:-180,180'],
            'vehicle_type' => ['nullable', 'string', 'in:'.implode(',', $pricing->vehicleTypes())],
        ]);
        $vehicleType = $pricing->normalizeVehicleType($data['vehicle_type'] ?? null);

        try {
            $estimate = $pricing->estimate(
                (float) $data['from_latitude'],
                (float) $data['from_longitude'],
                (float) $data['to_latitude'],
                (float) $data['to_longitude'],
                $pricing->current($vehicleType),
            );
        } catch (RuntimeException $exception) {
            if ($exception->getMessage() !== 'ROAD_ROUTE_UNAVAILABLE') {
                throw $exception;
            }

            return response()->json([
                'message' => 'The road route could not be calculated right now. Please retry before creating the order.',
                'code' => 'ROAD_ROUTE_UNAVAILABLE',
            ], 503);
        }

        return response()->json([
            ...$estimate,
            'vehicle_type' => $vehicleType,
            'currency' => config('medline.currency', 'SYP'),
        ]);
    }

    public function index(Request $request, DeliveryPricingService $pricing): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $current = $pricing->current('motorcycle');
        $allHistory = DB::table('delivery_pricing_rates')
            ->leftJoin('users', 'users.id', '=', 'delivery_pricing_rates.changed_by')
            ->select('delivery_pricing_rates.id', 'delivery_pricing_rates.vehicle_type', 'delivery_pricing_rates.rate_per_km', 'delivery_pricing_rates.reason', 'delivery_pricing_rates.effective_at', 'delivery_pricing_rates.created_at', 'users.name as changed_by_name', 'users.email as changed_by_email')
            ->orderByDesc('delivery_pricing_rates.effective_at')
            ->orderByDesc('delivery_pricing_rates.id')
            ->limit(100)
            ->get();
        $history = $allHistory->where('vehicle_type', 'motorcycle')->values();

        return response()->json([
            'current' => [
                'id' => $current->id ? (int) $current->id : null,
                'vehicle_type' => 'motorcycle',
                'rate_per_km' => (float) $current->rate_per_km,
                'reason' => $current->reason,
                'effective_at' => $current->effective_at,
            ],
            'rates' => collect($pricing->allCurrent())->map(fn (object $rate) => [
                'id' => $rate->id ? (int) $rate->id : null,
                'vehicle_type' => (string) $rate->vehicle_type,
                'rate_per_km' => (float) $rate->rate_per_km,
                'reason' => $rate->reason,
                'effective_at' => $rate->effective_at,
            ])->values(),
            'vehicle_types' => $pricing->vehicleTypes(),
            'history' => $history,
            'all_history' => $allHistory,
            'currency' => config('medline.currency', 'SYP'),
        ]);
    }

    public function store(Request $request, DeliveryPricingService $pricing): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate([
            'vehicle_type' => ['nullable', 'string', 'in:'.implode(',', $pricing->vehicleTypes())],
            'rate_per_km' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $change = DatabaseTransaction::run(function () use ($data, $request, $pricing) {
            $vehicleType = $pricing->normalizeVehicleType($data['vehicle_type'] ?? null);
            $previous = $pricing->current($vehicleType, true);
            abort_if(abs((float) $previous->rate_per_km - (float) $data['rate_per_km']) < 0.005, 422, 'Enter a rate that is different from the current delivery rate.');
            $now = now();
            $rateId = DB::table('delivery_pricing_rates')->insertGetId([
                'vehicle_type' => $vehicleType,
                'rate_per_km' => round((float) $data['rate_per_km'], 2),
                'changed_by' => $request->user()->id,
                'reason' => trim($data['reason']),
                'effective_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            return ['id' => $rateId, 'vehicle_type' => $vehicleType, 'previous_rate_per_km' => (float) $previous->rate_per_km];
        }, config('medline.database_transaction_attempts', 3));

        AuditService::record($request, 'delivery_pricing.rate_changed', 'delivery_pricing_rate', $change['id'], [
            'from_rate_per_km' => $change['previous_rate_per_km'],
            'to_rate_per_km' => round((float) $data['rate_per_km'], 2),
            'vehicle_type' => $change['vehicle_type'],
            'currency' => config('medline.currency', 'SYP'),
            'reason' => trim($data['reason']),
        ]);

        return $this->index($request, $pricing)->setStatusCode(201);
    }
}
