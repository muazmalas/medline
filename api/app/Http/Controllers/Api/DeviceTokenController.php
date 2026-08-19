<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use App\Support\DatabaseTransaction;

class DeviceTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'min:20', 'max:4096'],
            'platform' => ['required', 'string', 'in:android,ios,web'],
            'device_id' => ['nullable', 'string', 'max:180'],
        ]);

        $hash = hash('sha256', $data['token']);
        DatabaseTransaction::run(function () use ($data, $hash, $request) {
            $existing = DB::table('device_tokens')->where('token_hash', $hash)->lockForUpdate()->first();
            $payload = [
                'user_id' => $request->user()->id,
                'token_encrypted' => Crypt::encryptString($data['token']),
                'platform' => $data['platform'],
                'device_id' => $data['device_id'] ?? null,
                'last_seen_at' => now(),
                'revoked_at' => null,
                'updated_at' => now(),
            ];
            if ($existing) {
                DB::table('device_tokens')->where('id', $existing->id)->update($payload);
            } else {
                DB::table('device_tokens')->insert($payload + ['token_hash' => $hash, 'created_at' => now()]);
            }
        });

        return response()->json(['message' => 'Device token registered.']);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'min:20', 'max:4096']]);
        $updated = DB::table('device_tokens')
            ->where('user_id', $request->user()->id)
            ->where('token_hash', hash('sha256', $data['token']))
            ->update(['revoked_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => $updated ? 'Device token revoked.' : 'Device token was already inactive.']);
    }
}
