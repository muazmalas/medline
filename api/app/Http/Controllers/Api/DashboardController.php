<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Services\DeliveryPricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function show(Request $request, DeliveryPricingService $pricing): JsonResponse
    {
        $user = $request->user();
        $metrics = ['orders' => 0, 'pending_orders' => 0, 'active_deliveries' => 0, 'inventory_items' => 0, 'low_stock_items' => 0, 'pending_procurement' => 0, 'available_deliveries' => 0, 'completed_orders' => 0, 'claimed_by_driver' => 0, 'ready_for_pickup' => 0];

        if ($user->role === 'patient') {
            $metrics['orders'] = DB::table('orders')->where('patient_id', $user->id)->count();
            $metrics['pending_orders'] = DB::table('orders')->where('patient_id', $user->id)->whereIn('status', ['pending_pharmacy_review', 'prescription_required', 'prescription_review', 'accepted', 'partially_accepted'])->count();
            $metrics['active_deliveries'] = DB::table('deliveries')->join('orders', 'orders.id', '=', 'deliveries.order_id')->where('orders.patient_id', $user->id)->whereIn('deliveries.status', ['available', 'claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'])->count();
            $metrics['completed_orders'] = DB::table('orders')->where('patient_id', $user->id)->where('status', 'completed')->count();
        } elseif ($user->role === 'driver') {
            $driver = DB::table('drivers')->where('user_id', $user->id)->first();
            if ($driver) {
                $vehicleType = $pricing->normalizeVehicleType($driver->vehicle_type);
                if ($driver->approval_status === 'approved' && $driver->is_available) {
                    $metrics['available_deliveries'] = DB::table('deliveries')
                        ->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')
                        ->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')
                        ->where('deliveries.status', 'available')
                        ->whereRaw("LOWER(COALESCE(orders.delivery_vehicle_type, procurement_orders.delivery_vehicle_type, 'motorcycle')) = ?", [$vehicleType])
                        ->count();
                }
                $metrics['active_deliveries'] = DB::table('deliveries')->where('driver_id', $driver->id)->whereIn('status', ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'])->count();
                $metrics['completed_orders'] = DB::table('deliveries')->where('driver_id', $driver->id)->where('status', 'delivered')->count();
            }
        } elseif (in_array($user->role, ['pharmacy', 'warehouse'], true)) {
            $partner = Partner::where('user_id', $user->id)
                ->where('type', $user->role)
                ->where('approval_status', 'approved')
                ->where('subscription_status', 'active')
                ->firstOrFail();
            $metrics['inventory_items'] = DB::table('inventories')->where('owner_type', $partner->type)->where('owner_id', $partner->id)->count();
            $metrics['low_stock_items'] = DB::table('inventories')->where('owner_type', $partner->type)->where('owner_id', $partner->id)->whereColumn('quantity', '<=', 'low_stock_threshold')->count();
            if ($partner->type === 'pharmacy') {
                $metrics['orders'] = DB::table('orders')->where('pharmacy_id', $partner->id)->count();
                $metrics['pending_orders'] = DB::table('orders')->where('pharmacy_id', $partner->id)->whereIn('status', ['pending_pharmacy_review', 'prescription_review'])->count();
                $metrics['active_deliveries'] = DB::table('deliveries')->join('orders', 'orders.id', '=', 'deliveries.order_id')->where('orders.pharmacy_id', $partner->id)->whereIn('deliveries.status', ['available', 'claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'])->count();
                $metrics['claimed_by_driver'] = DB::table('deliveries')->join('orders', 'orders.id', '=', 'deliveries.order_id')->where('orders.pharmacy_id', $partner->id)->where('deliveries.status', 'claimed')->count();
                $metrics['ready_for_pickup'] = DB::table('deliveries')->join('orders', 'orders.id', '=', 'deliveries.order_id')->where('orders.pharmacy_id', $partner->id)->where('deliveries.status', 'pickup_started')->count();
                $metrics['pending_procurement'] = DB::table('procurement_orders')->where('pharmacy_id', $partner->id)->whereIn('status', ['pending_warehouse_review', 'accepted', 'partially_accepted'])->count();
            } else {
                $metrics['pending_procurement'] = DB::table('procurement_orders')->where('warehouse_id', $partner->id)->where('status', 'pending_warehouse_review')->count();
                $metrics['completed_orders'] = DB::table('procurement_orders')->where('warehouse_id', $partner->id)->whereIn('status', ['accepted', 'partially_accepted', 'completed'])->count();
                $metrics['claimed_by_driver'] = DB::table('deliveries')->join('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where('procurement_orders.warehouse_id', $partner->id)->where('deliveries.status', 'claimed')->count();
                $metrics['ready_for_pickup'] = DB::table('deliveries')->join('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where('procurement_orders.warehouse_id', $partner->id)->where('deliveries.status', 'pickup_started')->count();
            }
        } else {
            abort(403, 'This account role does not have an operational dashboard.');
        }

        return response()->json(['role' => $user->role, 'metrics' => $metrics]);
    }
}
