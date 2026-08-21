<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Medicine;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AuthorizationBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_patient_cannot_access_administrator_dashboard(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);

        $this->actingAs($patient)
            ->getJson('/api/v1/admin/dashboard')
            ->assertForbidden();
    }

    public function test_two_factor_enabled_administrator_cannot_sign_in_without_authenticator_code(): void
    {
        $administrator = User::factory()->create([
            'role' => 'admin',
            'status' => 'active',
            'password' => 'password123',
            'two_factor_enabled' => true,
            'two_factor_secret' => Crypt::encryptString('JBSWY3DPEHPK3PXP'),
            'two_factor_confirmed_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $administrator->email,
            'password' => 'password123',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'AUTH_TWO_FACTOR_REQUIRED');

        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $administrator->id,
        ]);
    }

    public function test_pharmacy_cannot_access_administrator_user_directory(): void
    {
        $pharmacy = User::factory()->create(['role' => 'pharmacy']);

        $this->actingAs($pharmacy)
            ->getJson('/api/v1/admin/users')
            ->assertForbidden();
    }

    public function test_patient_cannot_manage_partner_inventory(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);

        $this->actingAs($patient)
            ->getJson('/api/v1/partner/inventory')
            ->assertForbidden();
    }

    public function test_driver_cannot_access_partner_inventory_even_with_a_direct_api_link(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);

        $this->actingAs($driver)
            ->getJson('/api/v1/partner/inventory')
            ->assertForbidden();

        $this->actingAs($driver)
            ->getJson('/api/v1/admin/inventory')
            ->assertForbidden();
    }

    public function test_only_administrators_create_medicines_and_warehouses_stock_active_catalog_items_immediately(): void
    {
        $administrator = User::factory()->create(['role' => 'admin']);
        $warehouseUser = User::factory()->create(['role' => 'warehouse', 'status' => 'active']);
        $warehouse = Partner::create([
            'user_id' => $warehouseUser->id,
            'type' => 'warehouse',
            'business_name' => 'Catalog Stock Warehouse',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);

        $this->actingAs($warehouseUser)
            ->postJson('/api/v1/medicines', [
                'name_en' => 'Unauthorized New Medicine',
                'name_ar' => 'Unauthorized New Medicine',
            ], ['Idempotency-Key' => 'warehouse-create-medicine'])
            ->assertForbidden();

        $activeMedicine = $this->actingAs($administrator)
            ->postJson('/api/v1/medicines', [
                'name_en' => 'Administrator Catalog Medicine',
                'name_ar' => 'Administrator Catalog Medicine',
                'code' => 'ADMIN-CATALOG-001',
                'is_active' => true,
            ], ['Idempotency-Key' => 'admin-create-medicine'])
            ->assertCreated()
            ->json('medicine');
        $inactiveMedicine = Medicine::create([
            'name_en' => 'Inactive Catalog Medicine',
            'name_ar' => 'Inactive Catalog Medicine',
            'code' => 'INACTIVE-CATALOG-001',
            'is_active' => false,
        ]);

        $this->actingAs($warehouseUser)
            ->putJson('/api/v1/partner/inventory', [
                'medicine_id' => $activeMedicine['id'],
                'quantity' => 120,
                'unit_price' => 1850,
                'low_stock_threshold' => 15,
            ], ['Idempotency-Key' => 'warehouse-stock-active-medicine'])
            ->assertCreated()
            ->assertJsonPath('inventory.quantity', 120);

        $this->assertDatabaseHas('inventories', [
            'owner_type' => 'warehouse',
            'owner_id' => $warehouse->id,
            'medicine_id' => $activeMedicine['id'],
            'quantity' => 120,
        ]);
        $this->actingAs($warehouseUser)
            ->getJson('/api/v1/partner/inventory')
            ->assertOk()
            ->assertJsonPath('data.0.name_en', 'Administrator Catalog Medicine');
        $this->getJson('/api/v1/medicines?partner_id='.$warehouse->id.'&inventory_type=warehouse&available_only=1')
            ->assertOk()
            ->assertJsonPath('data.0.available_quantity', 120);

        $this->actingAs($warehouseUser)
            ->putJson('/api/v1/partner/inventory', [
                'medicine_id' => $inactiveMedicine->id,
                'quantity' => 10,
                'unit_price' => 500,
            ], ['Idempotency-Key' => 'warehouse-stock-inactive-medicine'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('medicine_id');
    }

    public function test_patient_cannot_view_another_patients_order(): void
    {
        $owner = User::factory()->create(['role' => 'patient']);
        $otherPatient = User::factory()->create(['role' => 'patient']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $pharmacy = Partner::create([
            'user_id' => $pharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Authorization Test Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $order = Order::create([
            'public_id' => 'ML-AUTH-ORDER-001',
            'patient_id' => $owner->id,
            'pharmacy_id' => $pharmacy->id,
            'status' => 'pending_pharmacy_review',
            'payment_method' => 'cash_on_delivery',
            'payment_status' => 'pending',
            'subtotal' => 100,
            'delivery_fee' => 0,
            'total' => 100,
            'delivery_address_snapshot' => 'Private test address',
        ]);

        $this->actingAs($otherPatient)
            ->getJson('/api/v1/orders/' . $order->id)
            ->assertForbidden();
    }

    public function test_administrator_cannot_change_own_status_or_role(): void
    {
        $administrator = User::factory()->create(['role' => 'admin', 'status' => 'active']);

        $this->actingAs($administrator)
            ->patchJson('/api/v1/admin/users/' . $administrator->id . '/status', [
                'status' => 'suspended',
            ])
            ->assertUnprocessable();

        $this->actingAs($administrator)
            ->patchJson('/api/v1/admin/users/' . $administrator->id . '/role', [
                'role' => 'patient',
            ])
            ->assertUnprocessable();
    }

    public function test_pharmacy_cannot_decide_another_pharmacys_order(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);
        $actingPharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $owningPharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $actingPharmacy = Partner::create([
            'user_id' => $actingPharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Acting Authorization Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $owningPharmacy = Partner::create([
            'user_id' => $owningPharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Owning Authorization Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $order = Order::create([
            'public_id' => 'ML-AUTH-ORDER-002',
            'patient_id' => $patient->id,
            'pharmacy_id' => $owningPharmacy->id,
            'status' => 'pending_pharmacy_review',
            'payment_method' => 'cash_on_delivery',
            'payment_status' => 'pending',
            'subtotal' => 100,
            'delivery_fee' => 0,
            'total' => 100,
            'delivery_address_snapshot' => 'Private partner test address',
        ]);

        $this->actingAs($actingPharmacyUser)
            ->postJson('/api/v1/partner/orders/' . $order->id . '/decision', [
                'decision' => 'accept',
            ])
            ->assertForbidden();

        $this->assertNotSame($actingPharmacy->id, $owningPharmacy->id);
    }

    public function test_patient_cannot_download_another_users_private_verification_document(): void
    {
        Storage::fake('local');
        $documentOwner = User::factory()->create(['role' => 'pharmacy']);
        $otherPatient = User::factory()->create(['role' => 'patient']);
        $path = 'private/verification-documents/authorization-boundary.pdf';
        Storage::disk('local')->put($path, 'private test document');
        $documentId = DB::table('verification_documents')->insertGetId([
            'user_id' => $documentOwner->id,
            'document_type' => 'license',
            'file_path' => $path,
            'status' => 'under_review',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($otherPatient)
            ->get('/api/v1/verification-documents/' . $documentId . '/download')
            ->assertForbidden();
    }

    public function test_non_administrator_cannot_read_audit_log(): void
    {
        $pharmacy = User::factory()->create(['role' => 'pharmacy']);

        $this->actingAs($pharmacy)
            ->getJson('/api/v1/admin/audit-logs')
            ->assertForbidden();
    }
}
