<?php

namespace Tests\Feature;

use App\Models\Medicine;
use App\Models\Order;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ApiFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_returns_service_status(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('service', 'medline-api');
    }

    public function test_patient_can_register_and_wait_for_administrator_approval(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Test Patient',
            'email' => 'patient@example.test',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
            'role' => 'patient',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.role', 'patient')
            ->assertJsonMissingPath('token')
            ->assertJsonStructure(['message', 'user' => ['id', 'name', 'email', 'role']]);
    }

    public function test_medicine_search_matches_english_and_arabic_names(): void
    {
        Medicine::create([
            'name_en' => 'Paracetamol',
            'name_ar' => 'باراسيتامول',
            'manufacturer' => 'MedLine Labs',
            'code' => 'TEST-PARA',
            'is_active' => true,
        ]);

        $this->getJson('/api/v1/medicines?search=Para')
            ->assertOk()
            ->assertJsonPath('data.0.name_en', 'Paracetamol');
    }

    public function test_order_search_matches_public_id_status_and_address(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacy = Partner::create([
            'user_id' => User::factory()->create(['role' => 'pharmacy'])->id,
            'type' => 'pharmacy',
            'business_name' => 'Search Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        Order::create([
            'public_id' => 'SEARCH-ORDER-001', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id,
            'status' => 'pending_pharmacy_review', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'pending',
            'subtotal' => 100, 'delivery_fee' => 0, 'total' => 100, 'delivery_address_snapshot' => 'Central Damascus',
        ]);
        Order::create([
            'public_id' => 'OTHER-ORDER-001', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id,
            'status' => 'completed', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'paid',
            'subtotal' => 200, 'delivery_fee' => 0, 'total' => 200, 'delivery_address_snapshot' => 'Other address',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/v1/orders?search=SEARCH-ORDER')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', 'SEARCH-ORDER-001');
    }

    public function test_orders_default_to_newest_created_first(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacy = Partner::create([
            'user_id' => User::factory()->create(['role' => 'pharmacy'])->id,
            'type' => 'pharmacy',
            'business_name' => 'Chronological Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $older = Order::create([
            'public_id' => 'ORDER-OLDER', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id,
            'status' => 'completed', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'paid',
            'subtotal' => 100, 'delivery_fee' => 0, 'total' => 100, 'delivery_address_snapshot' => 'Older address',
        ]);
        $newer = Order::create([
            'public_id' => 'ORDER-NEWEST', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id,
            'status' => 'pending_pharmacy_review', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'pending',
            'subtotal' => 200, 'delivery_fee' => 0, 'total' => 200, 'delivery_address_snapshot' => 'Newest address',
        ]);
        DB::table('orders')->where('id', $older->id)->update(['created_at' => now()->subMinute()]);
        DB::table('orders')->where('id', $newer->id)->update(['created_at' => now()]);

        $this->actingAs($admin)
            ->getJson('/api/v1/orders')
            ->assertOk()
            ->assertJsonPath('data.0.public_id', 'ORDER-NEWEST')
            ->assertJsonPath('data.1.public_id', 'ORDER-OLDER');
    }

    public function test_administrator_partner_search_matches_name_license_and_status(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Partner::create([
            'user_id' => User::factory()->create(['role' => 'pharmacy'])->id,
            'type' => 'pharmacy', 'business_name' => 'Central Search Pharmacy', 'license_number' => 'PH-SEARCH-001',
            'approval_status' => 'approved', 'subscription_status' => 'active',
        ]);
        Partner::create([
            'user_id' => User::factory()->create(['role' => 'pharmacy'])->id,
            'type' => 'pharmacy', 'business_name' => 'Other Pharmacy', 'license_number' => 'PH-OTHER-001',
            'approval_status' => 'pending', 'subscription_status' => 'inactive',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/v1/admin/partners?type=pharmacy&search=Central')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.business_name', 'Central Search Pharmacy');
    }

    public function test_administrator_management_tables_support_filters_sorting_and_pagination(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->create(['name' => 'Zara Patient', 'role' => 'patient', 'status' => 'active']);
        User::factory()->create(['name' => 'Amal Patient', 'role' => 'patient', 'status' => 'active']);
        User::factory()->create(['name' => 'Suspended Driver', 'role' => 'driver', 'status' => 'suspended']);

        $this->actingAs($admin)
            ->getJson('/api/v1/admin/users?role=patient&status=active&sort_by=name&sort_direction=asc&per_page=5')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Amal Patient')
            ->assertJsonPath('data.1.name', 'Zara Patient')
            ->assertJsonPath('per_page', 5);

        $pharmacy = Partner::create([
            'user_id' => User::factory()->create(['role' => 'pharmacy'])->id,
            'type' => 'pharmacy',
            'business_name' => 'Ratings Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $patient = User::factory()->create(['role' => 'patient']);
        $visibleOrder = Order::create([
            'public_id' => 'RATING-VISIBLE', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id,
            'status' => 'completed', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'paid',
            'subtotal' => 100, 'delivery_fee' => 0, 'total' => 100, 'delivery_address_snapshot' => 'Visible address',
        ]);
        $hiddenOrder = Order::create([
            'public_id' => 'RATING-HIDDEN', 'patient_id' => $patient->id, 'pharmacy_id' => $pharmacy->id,
            'status' => 'completed', 'payment_method' => 'cash_on_delivery', 'payment_status' => 'paid',
            'subtotal' => 100, 'delivery_fee' => 0, 'total' => 100, 'delivery_address_snapshot' => 'Hidden address',
        ]);
        DB::table('ratings')->insert([
            ['order_id' => $visibleOrder->id, 'created_by' => $patient->id, 'score' => 5, 'comment' => 'Visible feedback', 'hidden_at' => null, 'created_at' => now(), 'updated_at' => now()],
            ['order_id' => $hiddenOrder->id, 'created_by' => $patient->id, 'score' => 2, 'comment' => 'Hidden feedback', 'hidden_at' => now(), 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->actingAs($admin)
            ->getJson('/api/v1/admin/ratings?status=hidden&sort_by=score&sort_direction=asc&per_page=5')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', 'RATING-HIDDEN')
            ->assertJsonPath('data.0.score', 2);
    }

    public function test_authenticated_user_can_view_current_user(): void
    {
        $user = User::factory()->create(['role' => 'patient']);

        $this->actingAs($user)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_patient_order_requires_and_respects_locked_stock(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $pharmacy = Partner::create([
            'user_id' => $pharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Test Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $medicine = Medicine::create([
            'name_en' => 'Limited Stock Medicine',
            'name_ar' => 'دواء محدود',
            'code' => 'LIMITED-1',
            'is_active' => true,
        ]);
        DB::table('inventories')->insert([
            'medicine_id' => $medicine->id,
            'owner_type' => 'pharmacy',
            'owner_id' => $pharmacy->id,
            'quantity' => 1,
            'reserved_quantity' => 0,
            'unit_price' => 500,
            'low_stock_threshold' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $payload = [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Damascus, Al-Hamra',
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ];

        $this->actingAs($patient)->postJson('/api/v1/orders', $payload)
            ->assertCreated()
            ->assertJsonPath('order.status', 'pending_pharmacy_review');

        $this->actingAs($patient)->postJson('/api/v1/orders', $payload)
            ->assertStatus(422)
            ->assertJsonPath('code', 'ORDER_STOCK_UNAVAILABLE');
    }

    public function test_patient_order_idempotency_key_replays_existing_order(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $pharmacy = Partner::create([
            'user_id' => $pharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Idempotent Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $medicine = Medicine::create([
            'name_en' => 'Replay Medicine',
            'name_ar' => 'دواء الاختبار',
            'code' => 'REPLAY-1',
            'is_active' => true,
        ]);
        DB::table('inventories')->insert([
            'medicine_id' => $medicine->id,
            'owner_type' => 'pharmacy',
            'owner_id' => $pharmacy->id,
            'quantity' => 3,
            'reserved_quantity' => 0,
            'unit_price' => 250,
            'low_stock_threshold' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $payload = [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Damascus, Al-Mazzeh',
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ];

        $first = $this->actingAs($patient)
            ->withHeader('Idempotency-Key', 'replay-order-001')
            ->postJson('/api/v1/orders', $payload)
            ->assertCreated();

        $second = $this->actingAs($patient)
            ->withHeader('Idempotency-Key', 'replay-order-001')
            ->postJson('/api/v1/orders', $payload)
            ->assertCreated();

        $this->assertSame($first->json('order.id'), $second->json('order.id'));
        $this->assertSame(1, DB::table('orders')->count());
        $this->assertSame(1, DB::table('inventories')->value('reserved_quantity'));
    }
}
