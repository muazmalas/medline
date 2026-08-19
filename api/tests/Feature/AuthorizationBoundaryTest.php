<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
