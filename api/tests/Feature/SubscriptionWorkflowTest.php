<?php

namespace Tests\Feature;

use App\Models\Partner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SubscriptionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_plans_expose_exact_partner_amounts_and_no_patient_or_driver_plan(): void
    {
        $response = $this->getJson('/api/v1/subscription-plans')->assertOk();

        $types = collect($response->json('data'))->pluck('partner_type')->all();
        $this->assertEqualsCanonicalizing(['pharmacy', 'warehouse'], $types);
        $this->assertNotContains('patient', $types);
        $this->assertNotContains('driver', $types);
        $response->assertJsonPath('data.0.currency', 'SYP');
    }

    public function test_patient_and_driver_registration_create_no_subscription(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Patient Without Plan', 'email' => 'patient-no-plan@example.test',
            'password' => 'CorrectHorse123!', 'password_confirmation' => 'CorrectHorse123!', 'role' => 'patient',
        ])->assertCreated();

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Driver Without Plan', 'email' => 'driver-no-plan@example.test',
            'password' => 'CorrectHorse123!', 'password_confirmation' => 'CorrectHorse123!', 'role' => 'driver',
            'national_id' => 'DRIVER-NO-PLAN-1', 'vehicle_type' => 'Van', 'vehicle_plate' => 'NP-1001',
        ])->assertCreated();

        $this->assertDatabaseCount('partners', 0);
        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertDatabaseHas('users', ['email' => 'patient-no-plan@example.test', 'role' => 'patient']);
        $this->assertDatabaseHas('users', ['email' => 'driver-no-plan@example.test', 'role' => 'driver']);
    }

    public function test_registration_payment_can_be_corrected_then_approved_with_access_dates(): void
    {
        Storage::fake('local');
        $amount = (float) config('medline.subscription_plans.annual_pharmacy.amount', 12000);

        $registration = $this->postJson('/api/v1/auth/register', [
            'name' => 'Correction Pharmacy Owner',
            'email' => 'correction-pharmacy@example.test',
            'phone' => '+963900001122',
            'password' => 'CorrectHorse123!',
            'password_confirmation' => 'CorrectHorse123!',
            'role' => 'pharmacy',
            'business_name' => 'Correction Pharmacy',
            'license_number' => 'PH-CORRECTION-001',
            'address' => '12 Medical Street, Damascus',
            'latitude' => 33.5138,
            'longitude' => 36.2765,
            'payment_amount' => $amount,
            'payment_proof' => UploadedFile::fake()->create('registration-receipt.pdf', 30, 'application/pdf'),
        ])->assertCreated();

        $partnerUser = User::findOrFail($registration->json('user.id'));
        $partner = Partner::where('user_id', $partnerUser->id)->firstOrFail();
        $subscription = DB::table('subscriptions')->where('partner_id', $partner->id)->firstOrFail();
        $firstProof = DB::table('payment_proofs')->where('subscription_id', $subscription->id)->firstOrFail();
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);

        $this->actingAs($admin)->getJson('/api/v1/admin/subscriptions?origin=registration')
            ->assertOk()
            ->assertJsonPath('data.0.origin', 'registration')
            ->assertJsonPath('data.0.payment_proof_id', $firstProof->id);

        $this->actingAs($admin)->postJson('/api/v1/admin/subscriptions/'.$subscription->id.'/decision', [
            'decision' => 'correction',
            'note' => 'Upload a clearer receipt showing the full exact amount.',
        ], ['Idempotency-Key' => 'registration-proof-correction'])
            ->assertOk();

        $this->assertDatabaseHas('subscriptions', ['id' => $subscription->id, 'status' => 'correction_required']);
        $this->assertDatabaseHas('payment_proofs', ['id' => $firstProof->id, 'status' => 'correction_required', 'review_note' => 'Upload a clearer receipt showing the full exact amount.']);
        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'approval_status' => 'pending', 'subscription_status' => 'inactive']);

        $this->actingAs($partnerUser)->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('access_active', false)
            ->assertJsonPath('review_subscription.status', 'correction_required')
            ->assertJsonPath('payment_proof.review_note', 'Upload a clearer receipt showing the full exact amount.');

        $this->actingAs($partnerUser)->postJson('/api/v1/subscription/payment-proof', [
            'amount' => $amount,
            'plan_code' => 'annual_pharmacy',
            'proof' => UploadedFile::fake()->create('corrected-receipt.pdf', 40, 'application/pdf'),
        ], ['Idempotency-Key' => 'corrected-registration-proof'])
            ->assertCreated()
            ->assertJsonPath('subscription_id', $subscription->id);

        $this->assertSame(1, DB::table('subscriptions')->where('partner_id', $partner->id)->count());
        $this->assertDatabaseHas('subscriptions', ['id' => $subscription->id, 'status' => 'payment_under_review']);
        $this->assertDatabaseHas('payment_proofs', ['id' => $firstProof->id, 'status' => 'under_review', 'review_note' => null]);

        $this->actingAs($admin)->postJson('/api/v1/admin/subscriptions/'.$subscription->id.'/decision', [
            'decision' => 'approve',
            'note' => 'Receipt verified.',
        ], ['Idempotency-Key' => 'approve-corrected-registration-proof'])
            ->assertOk();

        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'approval_status' => 'approved', 'subscription_status' => 'active']);
        $approved = DB::table('subscriptions')->where('id', $subscription->id)->firstOrFail();
        $this->assertSame('active', $approved->status);
        $this->assertNotNull($approved->starts_at);
        $this->assertNotNull($approved->ends_at);
        $this->assertDatabaseHas('payment_proofs', ['id' => $firstProof->id, 'status' => 'approved']);

        $this->actingAs($partnerUser)->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('access_active', true)
            ->assertJsonPath('active_subscription.starts_at', $approved->starts_at)
            ->assertJsonPath('active_subscription.ends_at', $approved->ends_at);
    }

    public function test_pending_renewal_does_not_remove_current_access(): void
    {
        Storage::fake('local');
        $user = User::factory()->create(['role' => 'warehouse', 'status' => 'active']);
        $partner = Partner::create(['user_id' => $user->id, 'type' => 'warehouse', 'business_name' => 'Active Warehouse', 'approval_status' => 'approved', 'subscription_status' => 'active']);
        DB::table('subscriptions')->insert([
            'partner_id' => $partner->id, 'origin' => 'registration', 'plan_code' => 'annual_warehouse', 'status' => 'active',
            'amount' => (float) config('medline.subscription_plans.annual_warehouse.amount', 24000), 'duration_months' => 12,
            'starts_at' => today()->subMonth(), 'ends_at' => today()->addMonths(11), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($user)->postJson('/api/v1/subscription/payment-proof', [
            'amount' => (float) config('medline.subscription_plans.annual_warehouse.amount', 24000),
            'plan_code' => 'annual_warehouse',
            'proof' => UploadedFile::fake()->create('renewal.pdf', 20, 'application/pdf'),
        ], ['Idempotency-Key' => 'active-warehouse-renewal'])->assertCreated();

        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'subscription_status' => 'active']);
        $this->actingAs($user)->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('access_active', true)
            ->assertJsonPath('active_subscription.status', 'active')
            ->assertJsonPath('review_subscription.status', 'payment_under_review');
    }
}
