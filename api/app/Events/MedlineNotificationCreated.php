<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MedlineNotificationCreated implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly int $userId,
        public readonly string $notificationId,
        public readonly string $type,
        public readonly array $data,
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('users.'.$this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->notificationId,
            'type' => $this->type,
            'data' => $this->data,
            'created_at' => now()->toISOString(),
        ];
    }
}
