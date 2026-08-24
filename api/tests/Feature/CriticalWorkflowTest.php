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
        $pharmacy = Partner::create(['user_id' => $pharmacyUser->id, 'type' => 'pharmacy', 'business_name' => 'Delivery Pharmacy', 'approval_status' => 'approved', 'subscription_status' => 'active', 'latitude' => 33.5138, 'longitude' => 36.2765]);
        $driverId = DB::table('drivers')->insertGetId(['user_id' => $driverUser->id, 'approval_status' => 'approved', 'is_available' => true, 'created_at' => now(), 'updated_at' => now()]);
        $scheduledFor = now()->addDay()->startOfMinute();
        $orderId = DB::table('orders')->insertGetId(['public_id' => 'ORD-DEL-TEST-000000000000', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id, 'status' => 'accepted', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'pending', 'subtotal' => 100, 'delivery_fee' => 125, 'total' => 225, 'delivery_address_snapshot' => 'Damascus, Test District', 'delivery_latitude' => 33.5256, 'delivery_longitude' => 36.2886, 'delivery_preference' => 'scheduled', 'scheduled_delivery_at' => $scheduledFor, 'created_at' => now(), 'updated_at' => now()]);
        $medicine = Medicine::create(['name_en' => 'Driver Pickup Medicine', 'name_ar' => 'Driver Pickup Medicine', 'code' => 'DRIVER-PICKUP-1', 'is_active' => true]);
        DB::table('order_items')->insert(['order_id' => $orderId, 'medicine_id' => $medicine->id, 'quantity' => 2, 'accepted_quantity' => 2, 'unit_price' => 50, 'line_total' => 100, 'created_at' => now(), 'updated_at' => now()]);
        $deliveryId = DB::table('deliveries')->insertGetId(['public_id' => 'DEL-TEST-000000000000000', 'order_id' => $orderId, 'status' => 'available', 'scheduled_for' => $scheduledFor, 'created_at' => now(), 'updated_at' => now()]);

        $this->actingAs($driverUser)
            ->getJson('/api/v1/deliveries/available?search=Damascus&sort_by=job_price&sort_direction=desc')
            ->assertOk()
            ->assertJsonPath('data.0.id', $deliveryId)
            ->assertJsonPath('data.0.delivery_address_snapshot', 'Damascus, Test District')
            ->assertJsonPath('data.0.job_price', '125.00')
            ->assertJsonPath('data.0.scheduled_for', $scheduledFor->format('Y-m-d H:i:s'));

        $this->actingAs($driverUser)
            ->getJson('/api/v1/deliveries/'.$deliveryId)
            ->assertOk()
            ->assertJsonPath('delivery.can_claim', true)
            ->assertJsonPath('route.pickup.latitude', '33.5138000')
            ->assertJsonPath('route.dropoff.latitude', 33.5256)
            ->assertJsonPath('items.0.name_en', 'Driver Pickup Medicine')
            ->assertJsonPath('items.0.pickup_quantity', 2);

        $this->actingAs($driverUser)->postJson('/api/v1/deliveries/'.$deliveryId.'/claim', [], ['Idempotency-Key' => 'claim-critical-1'])->assertOk()->assertJsonPath('delivery.status', 'claimed');
        $this->actingAs($driverUser)->postJson('/api/v1/deliveries/'.$deliveryId.'/status', ['status' => 'pickup_started'], ['Idempotency-Key' => 'status-critical-1'])->assertUnprocessable();
        $this->actingAs($pharmacyUser)->postJson('/api/v1/deliveries/'.$deliveryId.'/pickup-verification/initiate')->assertOk();
        $this->actingAs($driverUser)->postJson('/api/v1/deliveries/'.$deliveryId.'/status', ['status' => 'arrived'], ['Idempotency-Key' => 'status-critical-skip'])->assertStatus(409);

        $this->assertDatabaseHas('deliveries', ['id' => $deliveryId, 'driver_id' => $driverId, 'status' => 'pickup_started']);
    }

    public function test_scheduled_patient_order_keeps_requested_time_when_delivery_is_created(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $pharmacy = Partner::create(['user_id' => $pharmacyUser->id, 'type' => 'pharmacy', 'business_name' => 'Scheduled Pharmacy', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $medicine = Medicine::create(['name_en' => 'Scheduled Medicine', 'name_ar' => 'Scheduled Medicine', 'code' => 'SCHEDULED-1', 'prescription_required' => false, 'is_active' => true]);
        DB::table('inventories')->insert(['medicine_id' => $medicine->id, 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy->id, 'quantity' => 5, 'reserved_quantity' => 0, 'unit_price' => 100, 'low_stock_threshold' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $scheduledFor = now()->addDays(2)->startOfMinute();

        $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Scheduled delivery address',
            'delivery_preference' => 'scheduled',
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('scheduled_delivery_at');

        $order = $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Scheduled delivery address',
            'delivery_preference' => 'scheduled',
            'scheduled_delivery_at' => $scheduledFor->toJSON(),
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ])->assertCreated()->assertJsonPath('order.delivery_preference', 'scheduled')->json('order');

        $this->actingAs($pharmacyUser)
            ->postJson('/api/v1/partner/orders/'.$order['id'].'/decision', ['decision' => 'accept'], ['Idempotency-Key' => 'scheduled-order-accept'])
            ->assertOk();

        $this->assertDatabaseHas('orders', ['id' => $order['id'], 'delivery_preference' => 'scheduled', 'scheduled_delivery_at' => $scheduledFor->format('Y-m-d H:i:s')]);
        $this->assertDatabaseHas('deliveries', ['order_id' => $order['id'], 'status' => 'available', 'scheduled_for' => $scheduledFor->format('Y-m-d H:i:s')]);
    }
}
