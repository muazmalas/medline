<?php

namespace Tests\Feature;

use App\Contracts\MapProvider;
use App\Models\Medicine;
use App\Models\Order;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DeliveryPricingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app->instance(MapProvider::class, new class implements MapProvider
        {
            public function geocode(string $address): array
            {
                return ['latitude' => 0.0, 'longitude' => 0.0, 'display_name' => $address];
            }

            public function route(float $fromLatitude, float $fromLongitude, float $toLatitude, float $toLongitude): array
            {
                return [
                    'distance_meters' => 111190.0,
                    'duration_seconds' => 7200,
                    'geometry' => ['type' => 'LineString', 'coordinates' => [[$fromLongitude, $fromLatitude], [$toLongitude, $toLatitude]]],
                    'provider' => 'test-router',
                ];
            }
        });
    }

    public function test_administrator_can_change_the_rate_and_every_version_is_audited(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $patient = User::factory()->create(['role' => 'patient']);

        $this->actingAs($patient)->getJson('/api/v1/admin/delivery-pricing')->assertForbidden();

        $this->actingAs($admin)
            ->getJson('/api/v1/admin/delivery-pricing')
            ->assertOk()
            ->assertJsonPath('current.rate_per_km', 100)
            ->assertJsonPath('history.0.reason', 'Initial system delivery rate');

        $this->actingAs($admin)
            ->withHeader('Idempotency-Key', 'delivery-rate-change-150')
            ->postJson('/api/v1/admin/delivery-pricing', [
                'rate_per_km' => 150,
                'reason' => 'Fuel and operating costs increased.',
            ])
            ->assertCreated()
            ->assertJsonPath('current.rate_per_km', 150)
            ->assertJsonPath('history.0.changed_by_name', $admin->name)
            ->assertJsonPath('history.0.reason', 'Fuel and operating costs increased.')
            ->assertJsonCount(2, 'history');

        $this->assertDatabaseHas('delivery_pricing_rates', [
            'rate_per_km' => 150,
            'changed_by' => $admin->id,
            'reason' => 'Fuel and operating costs increased.',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $admin->id,
            'action' => 'delivery_pricing.rate_changed',
            'auditable_type' => 'delivery_pricing_rate',
        ]);
    }

    public function test_order_snapshots_distance_rate_and_fee_when_it_is_created(): void
    {
        config(['medline.tax_rate' => 5]);
        $admin = User::factory()->create(['role' => 'admin']);
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacy = Partner::create([
            'user_id' => User::factory()->create(['role' => 'pharmacy'])->id,
            'type' => 'pharmacy',
            'business_name' => 'Priced Delivery Pharmacy',
            'latitude' => 0,
            'longitude' => 0,
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $medicine = Medicine::create([
            'name_en' => 'Delivery Pricing Medicine',
            'name_ar' => 'Delivery Pricing Medicine',
            'code' => 'DELIVERY-PRICE-1',
            'is_active' => true,
        ]);
        DB::table('inventories')->insert([
            'medicine_id' => $medicine->id,
            'owner_type' => 'pharmacy',
            'owner_id' => $pharmacy->id,
            'quantity' => 5,
            'reserved_quantity' => 0,
            'unit_price' => 500,
            'low_stock_threshold' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($patient)
            ->getJson('/api/v1/medicines?available_only=1&partner_id='.$pharmacy->id)
            ->assertOk()
            ->assertJsonPath('data.0.unit_price', '500.00')
            ->assertJsonPath('data.0.available_quantity', 5);

        $this->actingAs($patient)
            ->getJson('/api/v1/delivery-pricing/current')
            ->assertOk()
            ->assertJsonPath('tax_rate_percent', 5);

        $this->actingAs($admin)->postJson('/api/v1/admin/delivery-pricing', [
            'rate_per_km' => 150,
            'reason' => 'Set the test delivery rate.',
        ])->assertCreated();
        $pricingRateId = (int) DB::table('delivery_pricing_rates')->latest('id')->value('id');

        $created = $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Pinned map location (0.000000, 1.000000)',
            'delivery_latitude' => 0,
            'delivery_longitude' => 1,
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ])->assertCreated();

        $order = Order::findOrFail((int) $created->json('order.id'));
        $this->assertSame($pricingRateId, (int) $order->delivery_pricing_rate_id);
        $this->assertSame('111.19', $order->delivery_distance_km);
        $this->assertSame('150.00', $order->delivery_rate_per_km);
        $this->assertSame('16679.00', $order->delivery_fee);
        $this->assertSame('5.00', $order->tax_rate);
        $this->assertSame('25.00', $order->tax_amount);
        $this->assertSame('17204.00', $order->total);

        $this->actingAs($patient)
            ->getJson('/api/v1/orders/'.$order->id)
            ->assertOk()
            ->assertJsonPath('invoice.tax_rate', '5.00')
            ->assertJsonPath('invoice.tax_amount', '25.00')
            ->assertJsonPath('invoice.total', '17204.00');

        $this->actingAs($admin)->postJson('/api/v1/admin/delivery-pricing', [
            'rate_per_km' => 200,
            'reason' => 'Apply a later rate to future orders only.',
        ])->assertCreated();

        $order->refresh();
        $this->assertSame('150.00', $order->delivery_rate_per_km);
        $this->assertSame('16679.00', $order->delivery_fee);
    }

    public function test_vehicle_rates_are_versioned_independently_and_snapshotted_on_orders(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacy = Partner::create([
            'user_id' => User::factory()->create(['role' => 'pharmacy'])->id,
            'type' => 'pharmacy',
            'business_name' => 'Vehicle Rate Pharmacy',
            'latitude' => 0,
            'longitude' => 0,
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $medicine = Medicine::create(['name_en' => 'Vehicle Rate Medicine', 'name_ar' => 'Vehicle Rate Medicine', 'code' => 'VEHICLE-RATE-1', 'is_active' => true]);
        DB::table('inventories')->insert(['medicine_id' => $medicine->id, 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy->id, 'quantity' => 5, 'reserved_quantity' => 0, 'unit_price' => 100, 'low_stock_threshold' => 1, 'created_at' => now(), 'updated_at' => now()]);

        $this->actingAs($admin)->postJson('/api/v1/admin/delivery-pricing', [
            'vehicle_type' => 'bicycle',
            'rate_per_km' => 75,
            'reason' => 'Updated bicycle operating costs.',
        ])->assertCreated()->assertJsonPath('rates.0.vehicle_type', 'bicycle');

        $this->actingAs($patient)
            ->getJson('/api/v1/delivery-pricing/current?vehicle_type=bicycle')
            ->assertOk()
            ->assertJsonPath('vehicle_type', 'bicycle')
            ->assertJsonPath('rate_per_km', 75);

        $created = $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Bicycle delivery location',
            'delivery_latitude' => 0,
            'delivery_longitude' => 1,
            'delivery_vehicle_type' => 'bicycle',
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ])->assertCreated();

        $order = Order::findOrFail((int) $created->json('order.id'));
        $this->assertSame('bicycle', $order->delivery_vehicle_type);
        $this->assertSame('75.00', $order->delivery_rate_per_km);
        $this->assertSame('8339.00', $order->delivery_fee);
    }

    public function test_pharmacy_replenishment_snapshots_warehouse_delivery_cost_and_multiple_items(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $warehouseUser = User::factory()->create(['role' => 'warehouse']);
        $pharmacy = Partner::create([
            'user_id' => $pharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Central Pharmacy',
            'address' => 'Central pharmacy registered address',
            'latitude' => 0,
            'longitude' => 1,
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $warehouse = Partner::create([
            'user_id' => $warehouseUser->id,
            'type' => 'warehouse',
            'business_name' => 'Regional Warehouse',
            'address' => 'Regional warehouse address',
            'latitude' => 0,
            'longitude' => 0,
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $firstMedicine = Medicine::create(['name_en' => 'First stock item', 'name_ar' => 'First stock item', 'code' => 'PROC-PRICE-1', 'is_active' => true]);
        $secondMedicine = Medicine::create(['name_en' => 'Second stock item', 'name_ar' => 'Second stock item', 'code' => 'PROC-PRICE-2', 'is_active' => true]);
        foreach ([[$firstMedicine->id, 500], [$secondMedicine->id, 250]] as [$medicineId, $unitPrice]) {
            DB::table('inventories')->insert([
                'medicine_id' => $medicineId,
                'owner_type' => 'warehouse',
                'owner_id' => $warehouse->id,
                'quantity' => 20,
                'reserved_quantity' => 0,
                'unit_price' => $unitPrice,
                'low_stock_threshold' => 2,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $this->actingAs($warehouseUser)
            ->getJson('/api/v1/partner/inventory?search=stock&status=healthy&sort_by=available_quantity&sort_direction=desc&per_page=5')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('per_page', 5)
            ->assertJsonPath('data.0.owner_name', $warehouse->business_name);

        $this->actingAs($admin)->postJson('/api/v1/admin/delivery-pricing', [
            'rate_per_km' => 150,
            'reason' => 'Set procurement delivery rate.',
        ])->assertCreated();

        $this->actingAs($pharmacyUser)
            ->getJson('/api/v1/delivery-pricing/current')
            ->assertOk()
            ->assertJsonPath('rate_per_km', 150);

        $created = $this->actingAs($pharmacyUser)
            ->withHeader('Idempotency-Key', 'procurement-pricing-snapshot')
            ->postJson('/api/v1/procurement', [
                'warehouse_id' => $warehouse->id,
                'items' => [
                    ['medicine_id' => $firstMedicine->id, 'quantity' => 2],
                    ['medicine_id' => $secondMedicine->id, 'quantity' => 4],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('procurement.delivery_address_snapshot', $pharmacy->address);

        $procurementId = (int) $created->json('procurement.id');
        $procurement = DB::table('procurement_orders')->where('id', $procurementId)->first();
        $this->assertSame('2000.00', $procurement->subtotal);
        $this->assertSame('111.19', $procurement->delivery_distance_km);
        $this->assertSame('150.00', $procurement->delivery_rate_per_km);
        $this->assertSame('16679.00', $procurement->delivery_fee);
        $this->assertSame('18679.00', $procurement->total);
        $this->assertNotNull($procurement->delivery_pricing_rate_id);
        $this->assertDatabaseHas('inventories', ['owner_id' => $warehouse->id, 'medicine_id' => $firstMedicine->id, 'reserved_quantity' => 2]);
        $this->assertDatabaseHas('inventories', ['owner_id' => $warehouse->id, 'medicine_id' => $secondMedicine->id, 'reserved_quantity' => 4]);

        $this->actingAs($pharmacyUser)
            ->getJson('/api/v1/procurement?search=Regional&status=pending_warehouse_review&sort_by=total&sort_direction=desc&per_page=5')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $procurementId)
            ->assertJsonPath('per_page', 5);

        $this->actingAs($admin)->postJson('/api/v1/admin/delivery-pricing', [
            'rate_per_km' => 200,
            'reason' => 'Apply a newer rate to future replenishments.',
        ])->assertCreated();

        $unchanged = DB::table('procurement_orders')->where('id', $procurementId)->first();
        $this->assertSame('150.00', $unchanged->delivery_rate_per_km);
        $this->assertSame('16679.00', $unchanged->delivery_fee);
    }
}
