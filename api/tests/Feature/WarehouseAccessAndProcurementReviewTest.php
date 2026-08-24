<?php

namespace Tests\Feature;

use App\Models\Medicine;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WarehouseAccessAndProcurementReviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_administrator_suspends_and_restores_linked_partner_access(): void
    {
        $administrator = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $partnerUser = User::factory()->create(['role' => 'pharmacy', 'status' => 'active']);
        $partner = Partner::create([
            'user_id' => $partnerUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Access Control Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $partnerUser->createToken('active-partner-session');

        $this->actingAs($administrator)
            ->patchJson('/api/v1/admin/users/'.$partnerUser->id.'/status', [
                'status' => 'suspended',
                'reason' => 'Operational access review.',
            ])
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $partnerUser->id, 'status' => 'suspended']);
        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'approval_status' => 'suspended', 'subscription_status' => 'active']);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $partnerUser->id]);

        $this->actingAs($administrator)
            ->patchJson('/api/v1/admin/users/'.$partnerUser->id.'/status', ['status' => 'active'])
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $partnerUser->id, 'status' => 'active']);
        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'approval_status' => 'approved', 'subscription_status' => 'active']);
    }

    public function test_warehouse_records_batch_metadata_and_controls_pharmacy_visibility(): void
    {
        $warehouseUser = User::factory()->create(['role' => 'warehouse', 'status' => 'active']);
        $warehouse = Partner::create([
            'user_id' => $warehouseUser->id,
            'type' => 'warehouse',
            'business_name' => 'Traceable Stock Warehouse',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $medicine = Medicine::create(['name_en' => 'Traceable Medicine', 'name_ar' => 'Traceable Medicine', 'is_active' => true]);

        $inventory = $this->actingAs($warehouseUser)
            ->putJson('/api/v1/partner/inventory', [
                'medicine_id' => $medicine->id,
                'quantity' => 80,
                'unit_price' => 750,
                'low_stock_threshold' => 10,
                'batch_number' => 'LOT-2026-08-A',
                'manufactured_at' => '2026-07-01',
                'expires_at' => '2027-07-01',
                'received_at' => '2026-08-19',
                'storage_location' => 'Cold room A / Shelf 3',
            ])
            ->assertCreated()
            ->assertJsonPath('inventory.batch_number', 'LOT-2026-08-A')
            ->json('inventory');

        $secondBatch = $this->actingAs($warehouseUser)
            ->putJson('/api/v1/partner/inventory', [
                'medicine_id' => $medicine->id,
                'quantity' => 35,
                'unit_price' => 790,
                'batch_number' => 'LOT-2026-08-B',
                'expires_at' => '2028-01-01',
            ])
            ->assertCreated()
            ->json('inventory');

        $this->assertNotSame($inventory['id'], $secondBatch['id']);
        $this->assertDatabaseCount('inventories', 2);

        $this->actingAs($warehouseUser)
            ->patchJson('/api/v1/partner/inventory/'.$inventory['id'].'/status', ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('inventory.is_active', 0);

        $this->actingAs($warehouseUser)
            ->getJson('/api/v1/partner/inventory?status=inactive')
            ->assertOk()
            ->assertJsonPath('data.0.batch_number', 'LOT-2026-08-A');

        $this->getJson('/api/v1/medicines?partner_id='.$warehouse->id.'&inventory_type=warehouse&available_only=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.available_quantity', 35);
    }

    public function test_warehouse_partial_procurement_requires_bounded_quantities_and_a_comment(): void
    {
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy', 'status' => 'active']);
        $warehouseUser = User::factory()->create(['role' => 'warehouse', 'status' => 'active']);
        $pharmacy = Partner::create(['user_id' => $pharmacyUser->id, 'type' => 'pharmacy', 'business_name' => 'Requesting Pharmacy', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $warehouse = Partner::create(['user_id' => $warehouseUser->id, 'type' => 'warehouse', 'business_name' => 'Reviewing Warehouse', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $medicine = Medicine::create(['name_en' => 'Partial Supply Medicine', 'name_ar' => 'Partial Supply Medicine', 'is_active' => true]);
        $inventoryId = DB::table('inventories')->insertGetId([
            'medicine_id' => $medicine->id,
            'owner_type' => 'warehouse',
            'owner_id' => $warehouse->id,
            'quantity' => 100,
            'reserved_quantity' => 0,
            'unit_price' => 500,
            'low_stock_threshold' => 5,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $scheduledFor = now()->addDays(3)->startOfMinute();
        $procurement = $this->actingAs($pharmacyUser)
            ->postJson('/api/v1/procurement', [
                'warehouse_id' => $warehouse->id,
                'delivery_address_snapshot' => 'Damascus pharmacy',
                'delivery_preference' => 'scheduled',
                'scheduled_delivery_at' => $scheduledFor->toJSON(),
                'items' => [['medicine_id' => $medicine->id, 'quantity' => 10]],
            ], ['Idempotency-Key' => 'partial-procurement-review'])
            ->assertCreated()
            ->json('procurement');
        $item = DB::table('procurement_order_items')->where('procurement_order_id', $procurement['id'])->first();

        $this->actingAs($warehouseUser)
            ->postJson('/api/v1/procurement/'.$procurement['id'].'/decision', [
                'decision' => 'partial',
                'items' => [['id' => $item->id, 'accepted_quantity' => 4]],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('note');

        $this->actingAs($warehouseUser)
            ->postJson('/api/v1/procurement/'.$procurement['id'].'/decision', [
                'decision' => 'partial',
                'note' => 'Only four units are available from the current batch.',
                'items' => [['id' => $item->id, 'accepted_quantity' => 11]],
            ])
            ->assertUnprocessable();

        $this->actingAs($warehouseUser)
            ->postJson('/api/v1/procurement/'.$procurement['id'].'/decision', [
                'decision' => 'partial',
                'note' => 'Only four units are available from the current batch.',
                'items' => [[
                    'id' => $item->id,
                    'accepted_quantity' => 4,
                    'batches' => [['inventory_id' => $inventoryId, 'quantity' => 4]],
                ]],
            ])
            ->assertOk()
            ->assertJsonPath('procurement.status', 'partial_approval_required');

        $this->assertDatabaseHas('procurement_orders', ['id' => $procurement['id'], 'warehouse_note' => 'Only four units are available from the current batch.', 'reviewed_by' => $warehouseUser->id, 'subtotal' => 2000, 'total' => 2000, 'delivery_preference' => 'scheduled', 'scheduled_delivery_at' => $scheduledFor->format('Y-m-d H:i:s')]);
        $this->assertDatabaseHas('procurement_order_items', ['id' => $item->id, 'accepted_quantity' => 4]);
        $this->assertDatabaseHas('procurement_item_batch_allocations', ['procurement_order_item_id' => $item->id, 'inventory_id' => $inventoryId, 'quantity' => 4, 'status' => 'reserved']);
        $this->assertDatabaseHas('inventories', ['owner_id' => $warehouse->id, 'medicine_id' => $medicine->id, 'reserved_quantity' => 4]);
        $this->assertDatabaseMissing('deliveries', ['procurement_order_id' => $procurement['id']]);

        $this->actingAs($pharmacyUser)
            ->postJson('/api/v1/procurement/'.$procurement['id'].'/partial-offer/decision', ['decision' => 'approve'])
            ->assertOk()
            ->assertJsonPath('procurement.status', 'partially_accepted');

        $this->assertDatabaseHas('deliveries', ['procurement_order_id' => $procurement['id'], 'status' => 'available', 'scheduled_for' => $scheduledFor->format('Y-m-d H:i:s')]);

        $pharmacyView = $this->actingAs($pharmacyUser)
            ->getJson('/api/v1/procurement/'.$procurement['id'])
            ->assertOk()
            ->assertJsonMissingPath('delivery.pin_hash')
            ->assertJsonMissingPath('delivery.pin_encrypted');
        $pharmacyView->assertJsonMissingPath('delivery.delivery_pin');

        $this->actingAs($warehouseUser)
            ->getJson('/api/v1/procurement/'.$procurement['id'])
            ->assertOk()
            ->assertJsonMissingPath('delivery.delivery_pin')
            ->assertJsonMissingPath('delivery.pin_hash')
            ->assertJsonMissingPath('delivery.pin_encrypted');
    }

    public function test_administrator_can_open_procurement_details_and_batch_options_are_returned(): void
    {
        $administrator = User::factory()->create(['role' => 'admin']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $warehouseUser = User::factory()->create(['role' => 'warehouse']);
        $pharmacy = Partner::create(['user_id' => $pharmacyUser->id, 'type' => 'pharmacy', 'business_name' => 'Detail Pharmacy', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $warehouse = Partner::create(['user_id' => $warehouseUser->id, 'type' => 'warehouse', 'business_name' => 'Detail Warehouse', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $medicine = Medicine::create(['name_en' => 'Batch Detail Medicine', 'name_ar' => 'Batch Detail Medicine', 'is_active' => true]);
        DB::table('inventories')->insert([
            'medicine_id' => $medicine->id, 'owner_type' => 'warehouse', 'owner_id' => $warehouse->id,
            'quantity' => 20, 'reserved_quantity' => 0, 'unit_price' => 300, 'low_stock_threshold' => 2,
            'batch_number' => 'DETAIL-BATCH', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $procurement = $this->actingAs($pharmacyUser)->postJson('/api/v1/procurement', [
            'warehouse_id' => $warehouse->id,
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 5]],
        ])->assertCreated()->json('procurement');

        $this->actingAs($administrator)
            ->getJson('/api/v1/procurement/'.$procurement['id'])
            ->assertOk()
            ->assertJsonPath('procurement.pharmacy_name', 'Detail Pharmacy')
            ->assertJsonPath('items.0.batch_options.0.batch_number', 'DETAIL-BATCH')
            ->assertJsonPath('items.0.batch_options.0.allocated_quantity', '5');
    }
}
