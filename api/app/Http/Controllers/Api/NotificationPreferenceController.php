<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\DatabaseTransaction;

class NotificationPreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $preferences = DB::table('notification_preferences')->where('user_id', $request->user()->id)->first();
        return response()->json(['preferences' => $preferences ?? [
            'in_app_enabled' => true,
            'push_enabled' => true,
            'email_enabled' => true,
            'sms_enabled' => false,
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'in_app_enabled' => ['sometimes', 'boolean'],
            'push_enabled' => ['sometimes', 'boolean'],
            'email_enabled' => ['sometimes', 'boolean'],
            'sms_enabled' => ['sometimes', 'boolean'],
        ]);
        abort_unless($data !== [], 422, 'At least one notification preference is required.');
        DatabaseTransaction::run(function () use ($data, $request) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            $values = array_merge($data, ['updated_at' => now()]);
            if (! DB::table('notification_preferences')->where('user_id', $request->user()->id)->exists()) $values['created_at'] = now();
            DB::table('notification_preferences')->updateOrInsert(['user_id' => $request->user()->id], $values);
        });
        return response()->json(['message' => 'Notification preferences updated.', 'preferences' => DB::table('notification_preferences')->where('user_id', $request->user()->id)->first()]);
    }
}
