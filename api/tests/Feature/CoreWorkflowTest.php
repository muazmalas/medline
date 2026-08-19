<?php

namespace Tests\Feature;

use App\Models\Partner;
use App\Models\User;
use App\Support\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CoreWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_read_and_mark_their_notification_without_cross_user_access(): void
    {
        $patient = User::factory()->create(['role' => 'patient']);
        $otherPatient = User::factory()->create(['role' => 'patient']);
        NotificationService::send($patient, 'delivery.completed', ['message' => 'Delivery completed.']);
        NotificationService::send($otherPatient, 'delivery.completed', ['message' => 'Other delivery completed.']);
        $notificationId = (string) DB::table('notifications')->where('notifiable_id', $patient->id)->value('id');
        $otherNotificationId = (string) DB::table('notifications')->where('notifiable_id', $otherPatient->id)->value('id');

        $this->actingAs($patient)->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($patient)->postJson('/api/v1/notifications/'.$notificationId.'/read', [], ['Idempotency-Key' => 'test-notification-read'])->assertOk();
        $this->actingAs($patient)->postJson('/api/v1/notifications/'.$otherNotificationId.'/read', [], ['Idempotency-Key' => 'test-other-notification-read'])->assertNotFound();
        $this->assertNotNull(DB::table('notifications')->where('id', $notificationId)->value('read_at'));
    }

    public function test_user_can_update_notification_preferences_transactionally(): void
    {
        $user = User::factory()->create(['role' => 'patient']);

        $this->actingAs($user)->patchJson('/api/v1/notification-preferences', [
            'in_app_enabled' => false,
            'email_enabled' => true,
        ], ['Idempotency-Key' => 'test-preferences-update'])
            ->assertOk()
            ->assertJsonPath('preferences.in_app_enabled', 0)
            ->assertJsonPath('preferences.email_enabled', 1);

        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $user->id,
            'in_app_enabled' => 0,
            'email_enabled' => 1,
        ]);
    }

    public function test_approved_partner_can_view_its_configured_subscription_plan(): void
    {
        $user = User::factory()->create(['role' => 'pharmacy']);
        Partner::create([
            'user_id' => $user->id,
            'type' => 'pharmacy',
            'business_name' => 'Test Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);

        $this->actingAs($user)->getJson('/api/v1/subscription/plans')
            ->assertOk()
            ->assertJsonPath('data.0.code', 'annual_pharmacy')
            ->assertJsonPath('data.0.duration_months', 12);
    }
}
