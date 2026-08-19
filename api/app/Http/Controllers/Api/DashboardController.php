<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $metrics = ['orders' => 0, 'pending_orders' => 0, 'active_deliveries' => 0, 'inventory_items' => 0, 'low_stock_items' => 0, 'pending_procurement' => 0, 'available_deliveries' => 0, 'completed_orders' => 0];

        if ($user->role === 'patient') {
            $metrics['orders'] = DB::table('orders')->where('patient_id', $user->id)->count();
            $metrics['pending_orders'] = DB::table('orders')->where('patient_id', $user->id)->whereIn('status', ['pending_pharmacy_review', 'prescription_required', 'prescription_review', 'accepted', 'partially_accepted'])->count();
            $metrics['active_deliveries'] = DB::table('deliveries')->join('orders', 'orders.id', '=', 'deliveries.order_id')->where('orders.patient_id', $user->id)->whereIn('deliveries.status', ['available', 'claimed', 'picked_up', 'in_transit', 'arrived'])->count();
            $metrics['completed_orders'] = DB::table('orders')->where('patient_id', $user->id)->where('status', 'completed')->count();
        } elseif ($user->role === 'driver') {
            $driver = DB::table('drivers')->where('user_id', $user->id)->first();
            if ($driver) {
                $metrics['available_deliveries'] = DB::table('deliveries')->where('status', 'available')->count();
                $metrics['active_deliveries'] = DB::table('deliveries')->where('driver_id', $driver->id)->whereIn('status', ['claimed', 'picked_up', 'in_transit', 'arrived'])->count();
                $metrics['completed_orders'] = DB::table('deliveries')->where('driver_id', $driver->id)->where('status', 'delivered')->count();
            }
        } else {
            $partner = Partner::where('user_id', $user->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
            $metrics['inventory_items'] = DB::table('inventories')->where('owner_type', $partner->type)->where('owner_id', $partner->id)->count();
            $metrics['low_stock_items'] = DB::table('inventories')->where('owner_type', $partner->type)->where('owner_id', $partner->id)->whereColumn('quantity', '<=', 'low_stock_threshold')->count();
            if ($partner->type === 'pharmacy') {
                $metrics['orders'] = DB::table('orders')->where('pharmacy_id', $partner->id)->count();
                $metrics['pending_orders'] = DB::table('orders')->where('pharmacy_id', $partner->id)->whereIn('status', ['pending_pharmacy_review', 'prescription_review'])->count();
                $metrics['active_deliveries'] = DB::table('deliveries')->join('orders', 'orders.id', '=', 'deliveries.order_id')->where('orders.pharmacy_id', $partner->id)->whereIn('deliveries.status', ['available', 'claimed', 'picked_up', 'in_transit', 'arrived'])->count();
                $metrics['pending_procurement'] = DB::table('procurement_orders')->where('pharmacy_id', $partner->id)->whereIn('status', ['pending_warehouse_review', 'accepted', 'partially_accepted'])->count();
            } else {
                $metrics['pending_procurement'] = DB::table('procurement_orders')->where('warehouse_id', $partner->id)->where('status', 'pending_warehouse_review')->count();
                $metrics['completed_orders'] = DB::table('procurement_orders')->where('warehouse_id', $partner->id)->whereIn('status', ['accepted', 'partially_accepted', 'completed'])->count();
            }
        }

        return response()->json(['role' => $user->role, 'metrics' => $metrics]);
    }
}
