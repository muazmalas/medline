<?php

namespace Tests\Feature;

use App\Models\Medicine;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MedicineOrderReviewWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_medicine_detail_includes_safety_information_and_availability(): void
    {
        [$patient, $pharmacyUser, $pharmacy] = $this->usersAndPharmacy();
        $medicine = Medicine::create([
            'name_en' => 'Amoxicillin',
            'name_ar' => 'أموكسيسيلين',
            'manufacturer' => 'MedLine Labs',
            'active_ingredient' => 'Amoxicillin trihydrate',
            'form' => 'Capsule',
            'dosage' => '500mg',
            'pack_size' => '20 capsules',
            'administration_route' => 'Oral',
            'description' => 'A prescription antibiotic product.',
            'indications' => 'Use only for clinician-diagnosed bacterial infections.',
            'side_effects' => 'Nausea, diarrhoea, or rash may occur.',
            'warnings' => 'Seek urgent help for signs of a severe allergic reaction.',
            'prescription_required' => true,
            'is_active' => true,
        ]);
        $this->stock($pharmacy, $medicine, 8, 1750);

        $this->getJson('/api/v1/medicines/'.$medicine->id)
            ->assertOk()
            ->assertJsonPath('medicine.active_ingredient', 'Amoxicillin trihydrate')
            ->assertJsonPath('medicine.side_effects', 'Nausea, diarrhoea, or rash may occur.')
            ->assertJsonPath('medicine.prescription_required', true)
            ->assertJsonPath('medicine.available_at.0.business_name', 'Workflow Pharmacy')
            ->assertJsonPath('medicine.available_at.0.available_quantity', 8);
    }

    public function test_each_required_medicine_has_a_separately_reviewed_prescription(): void
    {
        Storage::fake('local');
        [$patient, $pharmacyUser, $pharmacy] = $this->usersAndPharmacy();
        $first = Medicine::create(['name_en' => 'RX One', 'name_ar' => 'دواء أول', 'code' => 'RX-ITEM-ONE', 'prescription_required' => true, 'is_active' => true]);
        $second = Medicine::create(['name_en' => 'RX Two', 'name_ar' => 'دواء ثان', 'code' => 'RX-ITEM-TWO', 'prescription_required' => true, 'is_active' => true]);
        $this->stock($pharmacy, $first, 5, 1000);
        $this->stock($pharmacy, $second, 5, 2000);

        $created = $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Pinned patient address',
            'items' => [
                ['medicine_id' => $first->id, 'quantity' => 1],
                ['medicine_id' => $second->id, 'quantity' => 2],
            ],
        ])->assertCreated()->assertJsonPath('order.status', 'prescription_required');

        $orderId = (int) $created->json('order.id');
        $items = collect($created->json('order.items'))->keyBy('medicine_id');
        $firstUpload = $this->actingAs($patient)->postJson('/api/v1/orders/'.$orderId.'/items/'.$items[$first->id]['id'].'/prescription', [
            'prescription' => UploadedFile::fake()->create('rx-one.pdf', 30, 'application/pdf'),
        ])->assertCreated();
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'prescription_required']);

        $secondUpload = $this->actingAs($patient)->postJson('/api/v1/orders/'.$orderId.'/items/'.$items[$second->id]['id'].'/prescription', [
            'prescription' => UploadedFile::fake()->create('rx-two.pdf', 30, 'application/pdf'),
        ])->assertCreated();
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'prescription_review']);

        $this->actingAs($pharmacyUser)->postJson('/api/v1/pharmacy/prescriptions/'.$firstUpload->json('prescription_id').'/review', [
            'decision' => 'approve',
        ])->assertOk();
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'prescription_review']);

        $this->actingAs($pharmacyUser)->postJson('/api/v1/pharmacy/prescriptions/'.$secondUpload->json('prescription_id').'/review', [
            'decision' => 'approve',
        ])->assertOk();
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'pending_pharmacy_review']);
        $this->assertDatabaseCount('prescriptions', 2);
    }

    public function test_partial_offer_requires_patient_approval_before_delivery_and_keeps_excluded_items(): void
    {
        [$patient, $pharmacyUser, $pharmacy] = $this->usersAndPharmacy();
        $available = Medicine::create(['name_en' => 'Available Medicine', 'name_ar' => 'دواء متوفر', 'code' => 'PARTIAL-ONE', 'prescription_required' => false, 'is_active' => true]);
        $excluded = Medicine::create(['name_en' => 'Excluded Medicine', 'name_ar' => 'دواء غير متوفر', 'code' => 'PARTIAL-TWO', 'prescription_required' => false, 'is_active' => true]);
        $this->stock($pharmacy, $available, 10, 1000);
        $this->stock($pharmacy, $excluded, 10, 500);

        $created = $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Pinned patient address',
            'items' => [
                ['medicine_id' => $available->id, 'quantity' => 2],
                ['medicine_id' => $excluded->id, 'quantity' => 2],
            ],
        ])->assertCreated();
        $orderId = (int) $created->json('order.id');
        $items = collect($created->json('order.items'))->keyBy('medicine_id');

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'partial',
            'note' => 'No quantities were changed.',
            'items' => [
                ['id' => $items[$available->id]['id'], 'accepted_quantity' => 2],
                ['id' => $items[$excluded->id]['id'], 'accepted_quantity' => 2],
            ],
        ])->assertUnprocessable();

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'partial',
            'note' => 'An invalid quantity was submitted.',
            'items' => [
                ['id' => $items[$available->id]['id'], 'accepted_quantity' => 3],
                ['id' => $items[$excluded->id]['id'], 'accepted_quantity' => 0],
            ],
        ])->assertUnprocessable()->assertJsonPath('message', 'A fulfilled quantity cannot be greater than the quantity requested.');

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'partial',
            'items' => [
                ['id' => $items[$available->id]['id'], 'accepted_quantity' => 2],
                ['id' => $items[$excluded->id]['id'], 'accepted_quantity' => 0],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('note');

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'reject',
        ])->assertUnprocessable()->assertJsonValidationErrors('note');

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'reject',
            'note' => '     ',
        ])->assertUnprocessable()->assertJsonValidationErrors('note');

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'partial',
            'note' => 'The second medicine is temporarily unavailable.',
            'items' => [
                ['id' => $items[$available->id]['id'], 'accepted_quantity' => 2],
                ['id' => $items[$excluded->id]['id'], 'accepted_quantity' => 0],
            ],
        ])->assertOk()->assertJsonPath('order.status', 'partial_approval_required');

        $this->assertDatabaseCount('deliveries', 0);
        $this->assertDatabaseHas('order_items', ['id' => $items[$available->id]['id'], 'quantity' => 2, 'accepted_quantity' => 2]);
        $this->assertDatabaseHas('order_items', ['id' => $items[$excluded->id]['id'], 'quantity' => 2, 'accepted_quantity' => 0]);
        $this->assertDatabaseHas('inventories', ['medicine_id' => $available->id, 'reserved_quantity' => 2]);
        $this->assertDatabaseHas('inventories', ['medicine_id' => $excluded->id, 'reserved_quantity' => 0]);
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'partial_offer_note' => 'The second medicine is temporarily unavailable.']);

        $this->actingAs($patient)->getJson('/api/v1/orders/'.$orderId)
            ->assertOk()
            ->assertJsonPath('order.items.0.name_en', 'Available Medicine')
            ->assertJsonPath('order.items.1.name_en', 'Excluded Medicine')
            ->assertJsonPath('invoice.requested_subtotal', 3000)
            ->assertJsonPath('invoice.accepted_subtotal', 2000);

        $this->actingAs($patient)->postJson('/api/v1/orders/'.$orderId.'/partial-offer/decision', [
            'decision' => 'approve',
            'note' => 'Please deliver the available medicine.',
        ])->assertOk()->assertJsonPath('order.status', 'partially_accepted');

        $this->assertDatabaseCount('deliveries', 1);
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'partially_accepted', 'patient_decision_note' => 'Please deliver the available medicine.']);
    }

    public function test_pharmacy_rejection_records_the_required_patient_note(): void
    {
        [$patient, $pharmacyUser, $pharmacy] = $this->usersAndPharmacy();
        $medicine = Medicine::create(['name_en' => 'Unavailable Medicine', 'name_ar' => 'Unavailable Medicine', 'code' => 'REJECT-NOTE', 'prescription_required' => false, 'is_active' => true]);
        $this->stock($pharmacy, $medicine, 5, 700);
        $created = $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Pinned patient address',
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 1]],
        ])->assertCreated();
        $orderId = (int) $created->json('order.id');

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'reject',
            'note' => 'This medicine is currently unavailable.',
        ])->assertOk()->assertJsonPath('order.status', 'rejected');

        $this->assertDatabaseHas('orders', [
            'id' => $orderId,
            'status' => 'rejected',
            'partial_offer_note' => 'This medicine is currently unavailable.',
        ]);
    }

    public function test_authenticated_user_can_change_phone_and_password(): void
    {
        $user = User::factory()->create(['role' => 'patient', 'password' => Hash::make('OldPassword123!')]);

        $this->actingAs($user)->patchJson('/api/v1/profile', ['name' => $user->name, 'phone' => '+963900123456'])
            ->assertOk()
            ->assertJsonPath('user.phone', '+963900123456');
        $this->actingAs($user)->postJson('/api/v1/profile/password', [
            'current_password' => 'OldPassword123!',
            'password' => 'NewPassword456!',
            'password_confirmation' => 'NewPassword456!',
        ])->assertOk();

        $this->assertTrue(Hash::check('NewPassword456!', $user->fresh()->password));
    }

    public function test_declining_a_partial_offer_creates_no_delivery_and_releases_remaining_stock(): void
    {
        [$patient, $pharmacyUser, $pharmacy] = $this->usersAndPharmacy();
        $medicine = Medicine::create(['name_en' => 'Partial Quantity Medicine', 'name_ar' => 'دواء بكمية جزئية', 'code' => 'PARTIAL-DECLINE', 'prescription_required' => false, 'is_active' => true]);
        $this->stock($pharmacy, $medicine, 10, 900);
        $created = $this->actingAs($patient)->postJson('/api/v1/orders', [
            'pharmacy_id' => $pharmacy->id,
            'delivery_address_snapshot' => 'Pinned patient address',
            'items' => [['medicine_id' => $medicine->id, 'quantity' => 2]],
        ])->assertCreated();
        $orderId = (int) $created->json('order.id');
        $itemId = (int) $created->json('order.items.0.id');

        $this->actingAs($pharmacyUser)->postJson('/api/v1/partner/orders/'.$orderId.'/decision', [
            'decision' => 'partial',
            'note' => 'Only one unit is currently available.',
            'items' => [['id' => $itemId, 'accepted_quantity' => 1]],
        ])->assertOk();
        $this->actingAs($patient)->postJson('/api/v1/orders/'.$orderId.'/partial-offer/decision', [
            'decision' => 'reject',
        ])->assertOk()->assertJsonPath('order.status', 'partial_offer_rejected');

        $this->assertDatabaseCount('deliveries', 0);
        $this->assertDatabaseHas('inventories', ['medicine_id' => $medicine->id, 'reserved_quantity' => 0]);
        $this->assertDatabaseHas('order_items', ['id' => $itemId, 'quantity' => 2, 'accepted_quantity' => 1]);
    }

    private function usersAndPharmacy(): array
    {
        $patient = User::factory()->create(['role' => 'patient']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $pharmacy = Partner::create([
            'user_id' => $pharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Workflow Pharmacy',
            'address' => '12 Health Street',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);

        return [$patient, $pharmacyUser, $pharmacy];
    }

    private function stock(Partner $pharmacy, Medicine $medicine, int $quantity, float $price): void
    {
        DB::table('inventories')->insert([
            'medicine_id' => $medicine->id,
            'owner_type' => 'pharmacy',
            'owner_id' => $pharmacy->id,
            'quantity' => $quantity,
            'reserved_quantity' => 0,
            'unit_price' => $price,
            'low_stock_threshold' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
