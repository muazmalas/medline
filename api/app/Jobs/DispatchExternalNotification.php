<?php

namespace App\Jobs;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Client\Response;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Throwable;
use Illuminate\Support\Facades\Log;
use App\Support\DatabaseTransaction;

class DispatchExternalNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries;

    public function __construct(
        public int $userId,
        public string $type,
        public array $data,
        public string $notificationId,
    ) {
        $this->tries = max(1, (int) config('medline.notifications.max_attempts', 3));
        $this->onQueue('notifications');
    }

    public function handle(): void
    {
        $user = User::find($this->userId);
        if (! $user) return;
        $preferences = DB::table('notification_preferences')->where('user_id', $user->id)->first();
        $preferences ??= (object) ['push_enabled' => true, 'email_enabled' => true, 'sms_enabled' => false];

        if ($preferences->push_enabled) {
            $this->sendPush($user);
        }
        if ($preferences->email_enabled && $user->email) {
            $this->sendEmail($user);
        }
        if ($preferences->sms_enabled && $user->phone) {
            $this->sendSms($user);
        }
    }

    public function failed(Throwable $exception): void
    {
        Log::error('medline.notification.delivery_failed', [
            'notification_id' => $this->notificationId,
            'user_id' => $this->userId,
            'notification_type' => $this->type,
            'exception' => get_class($exception),
            'message' => $this->safeExcerpt($exception->getMessage()),
        ]);

        $this->recordAttempt('queue', 'laravel', 'failed', null, $this->safeExcerpt($exception->getMessage()), hash('sha256', 'job:' . $this->notificationId));
    }

    private function sendPush(User $user): void
    {
        $endpoint = config('medline.notifications.fcm_endpoint');
        $bearer = config('medline.notifications.fcm_bearer_token');
        $tokens = DB::table('device_tokens')->where('user_id', $user->id)->whereNull('revoked_at')->get();
        if (! $endpoint || ! $bearer || $tokens->isEmpty()) return;
        foreach ($tokens as $device) {
            try {
                $targetKey = hash('sha256', 'device:' . $device->id);
                if (! $this->claimTarget('push', $targetKey)) continue;
                $token = Crypt::decryptString($device->token_encrypted);
                $response = Http::timeout(10)->retry(2, 200)->withToken($bearer)->post($endpoint, ['message' => ['token' => $token, 'notification' => ['title' => 'MedLine update', 'body' => (string) ($this->data['message'] ?? 'You have a new MedLine update.')], 'data' => ['type' => $this->type]]]);
                $this->record('push', 'fcm', $response, $targetKey);
                if ($response->status() === 404 || $response->status() === 410) DB::table('device_tokens')->where('id', $device->id)->update(['revoked_at' => now(), 'updated_at' => now()]);
            } catch (Throwable $exception) {
                $this->recordFailure('push', 'fcm', $exception->getMessage(), hash('sha256', 'device:' . $device->id));
                throw $exception;
            }
        }
    }

    private function sendEmail(User $user): void
    {
        $targetKey = hash('sha256', 'email:' . strtolower($user->email));
        if (! $this->claimTarget('email', $targetKey)) return;
        try {
            Mail::raw((string) ($this->data['message'] ?? 'You have a new MedLine update.'), function ($message) use ($user) {
                $message->to($user->email)->subject('MedLine notification');
            });
            $this->recordSuccess('email', 'mail', null, $targetKey);
        } catch (Throwable $exception) {
            $this->recordFailure('email', 'mail', $exception->getMessage(), $targetKey);
            throw $exception;
        }
    }

    private function sendSms(User $user): void
    {
        $endpoint = config('medline.notifications.sms_endpoint');
        $bearer = config('medline.notifications.sms_bearer_token');
        if (! $endpoint || ! $bearer) return;
        $targetKey = hash('sha256', 'sms:' . $user->phone);
        if (! $this->claimTarget('sms', $targetKey)) return;
        try {
            $response = Http::timeout(10)->retry(2, 200)->withToken($bearer)->post($endpoint, ['to' => $user->phone, 'message' => (string) ($this->data['message'] ?? 'MedLine update')]);
            $this->record('sms', 'configured-sms', $response, $targetKey);
        } catch (Throwable $exception) {
            $this->recordFailure('sms', 'configured-sms', $exception->getMessage(), $targetKey);
            throw $exception;
        }
    }

    private function record(string $channel, string $provider, Response $response, string $targetKey): void
    {
        $this->markTarget($channel, $targetKey, $response->successful() ? 'sent' : 'failed');
        $this->recordAttempt($channel, $provider, $response->successful() ? 'sent' : 'failed', $response->status(), $response->body(), $targetKey);
        if ($response->failed()) throw new \RuntimeException('Notification provider returned HTTP ' . $response->status());
    }

    private function recordSuccess(string $channel, string $provider, ?Response $response, string $targetKey): void
    {
        $this->markTarget($channel, $targetKey, 'sent');
        $this->recordAttempt($channel, $provider, 'sent', $response?->status(), $response?->body(), $targetKey);
    }

    private function recordFailure(string $channel, string $provider, string $message, string $targetKey): void
    {
        $this->markTarget($channel, $targetKey, 'failed');
        $this->recordAttempt($channel, $provider, 'failed', null, $message, $targetKey);
    }

    private function claimTarget(string $channel, string $targetKey): bool
    {
        return DatabaseTransaction::run(function () use ($channel, $targetKey) {
            $claim = DB::table('notification_delivery_claims')->where('notification_id', $this->notificationId)->where('channel', $channel)->where('target_key', $targetKey)->lockForUpdate()->first();
            if (! $claim) {
                DB::table('notification_delivery_claims')->insert(['notification_id' => $this->notificationId, 'user_id' => $this->userId, 'channel' => $channel, 'target_key' => $targetKey, 'status' => 'sending', 'created_at' => now(), 'updated_at' => now()]);
                return true;
            }
            if ($claim->status === 'sent') return false;
            if ($claim->status === 'sending' && $claim->updated_at && now()->diffInMinutes($claim->updated_at) < 5) return false;
            DB::table('notification_delivery_claims')->where('id', $claim->id)->update(['status' => 'sending', 'updated_at' => now()]);
            return true;
        });
    }

    private function markTarget(string $channel, string $targetKey, string $status): void
    {
        DB::table('notification_delivery_claims')->where('notification_id', $this->notificationId)->where('channel', $channel)->where('target_key', $targetKey)->update(['status' => $status, 'updated_at' => now()]);
    }

    private function recordAttempt(string $channel, string $provider, string $status, ?int $httpStatus, ?string $response, string $targetKey): void
    {
        DB::table('notification_delivery_attempts')->insert([
            'notification_id' => $this->notificationId,
            'user_id' => $this->userId,
            'notification_type' => $this->type,
            'channel' => $channel,
            'target_key' => $targetKey,
            'provider' => $provider,
            'status' => $status,
            'http_status' => $httpStatus,
            'response_excerpt' => $this->safeExcerpt($response),
            'attempted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function safeExcerpt(?string $value): ?string
    {
        if ($value === null || $value === '') return null;
        $redacted = preg_replace('/(authorization|token|password|secret|pin|prescription|document|phone|email)\s*[:=]\s*[^,;\s}]+/i', '$1=[REDACTED]', $value) ?? $value;
        return mb_substr($redacted, 0, 500);
    }
}
