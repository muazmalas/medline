<?php

namespace Tests\Feature;

use App\Events\MedlineNotificationCreated;
use App\Models\User;
use App\Support\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NotificationBroadcastTest extends TestCase
{
    use RefreshDatabase;

    public function test_notification_is_persisted_and_broadcast_to_the_private_user_channel(): void
    {
        Event::fake([MedlineNotificationCreated::class]);
        $user = User::factory()->create(['role' => 'patient', 'locale' => 'en']);

        NotificationService::send($user, 'order.created_patient', [
            'order_id' => 'ORD-LOCAL-001',
            'message' => 'Your order was submitted.',
        ]);

        $this->assertDatabaseHas('notifications', [
            'id' => DB::table('notifications')->where('notifiable_id', $user->id)->value('id'),
            'notifiable_id' => $user->id,
            'type' => 'order.created_patient',
        ]);
        Event::assertDispatched(MedlineNotificationCreated::class, fn (MedlineNotificationCreated $event): bool => $event->userId === $user->id && $event->type === 'order.created_patient');
    }
}
