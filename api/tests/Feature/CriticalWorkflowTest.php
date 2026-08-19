<?php

namespace Tests\Feature;

use App\Models\Medicine;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CriticalWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_prescription_required_medicine_stops_order_before_pharmacy_review(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $pharmacy = Partner::create(['user_id' => $pharmacyUser->id, 'type' => 'pharmacy', 'business_name' => 'Licensed Pharmacy', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $medicine = Medicine::create(['name_en' => 'Prescription Medicine', 'name_ar' => 'دواء بوصفة', 'code' => 'RX-TEST-1', 'prescription_required' => true, 'is_active' => true]);
        DB::table('inventories')->insert(['medicine_id' => $medicine->id, 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy->id, 'quantity' => 5, 'reserved_quantity' => 0, 'unit_price' => 100, 'low_stock_threshold' => 1, 'created_at' => now(), 'updated_at' => now()]);

        $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Damascus, Test District',
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ])->assertCreated()->assertJsonPath('order.status', 'prescription_required');

        $this->assertDatabaseHas('orders', ['patient_id' => $patient->id, 'status' => 'prescription_required']);
        $this->assertDatabaseHas('inventories', ['medicine_id' => $medicine->id, 'reserved_quantity' => 1]);
    }

    public function test_driver_claims_delivery_and_cannot_skip_status_transition(): void
    {
        $driverUser = User::factory()->create(['role' => 'driver']);
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $pharmacy = Partner::create(['user_id' => $pharmacyUser->id, 'type' => 'pharmacy', 'business_name' => 'Delivery Pharmacy', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $driverId = DB::table('drivers')->insertGetId(['user_id' => $driverUser->id, 'approval_status' => 'approved', 'is_available' => true, 'created_at' => now(), 'updated_at' => now()]);
        $orderId = DB::table('orders')->insertGetId(['public_id' => 'ORD-DEL-TEST-000000000000', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id, 'status' => 'accepted', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'pending', 'subtotal' => 100, 'delivery_fee' => 0, 'total' => 100, 'delivery_address_snapshot' => 'Damascus, Test District', 'created_at' => now(), 'updated_at' => now()]);
        $deliveryId = DB::table('deliveries')->insertGetId(['public_id' => 'DEL-TEST-000000000000000', 'order_id' => $orderId, 'status' => 'available', 'created_at' => now(), 'updated_at' => now()]);

        $this->actingAs($driverUser)->postJson('/api/v1/deliveries/'.$deliveryId.'/claim', [], ['Idempotency-Key' => 'claim-critical-1'])->assertOk()->assertJsonPath('delivery.status', 'claimed');
        $this->actingAs($driverUser)->postJson('/api/v1/deliveries/'.$deliveryId.'/status', ['status' => 'pickup_started'], ['Idempotency-Key' => 'status-critical-1'])->assertOk();
        $this->actingAs($driverUser)->postJson('/api/v1/deliveries/'.$deliveryId.'/status', ['status' => 'arrived'], ['Idempotency-Key' => 'status-critical-skip'])->assertStatus(409);

        $this->assertDatabaseHas('deliveries', ['id' => $deliveryId, 'driver_id' => $driverId, 'status' => 'pickup_started']);
    }
}
