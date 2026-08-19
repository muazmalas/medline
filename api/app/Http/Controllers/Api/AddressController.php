<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\DatabaseTransaction;

class AddressController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => DB::table('addresses')->where('user_id', $request->user()->id)->orderByDesc('is_default')->latest()->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['label' => ['required', 'string', 'max:80'], 'address_line' => ['required', 'string', 'max:1000'], 'city' => ['nullable', 'string', 'max:100'], 'district' => ['nullable', 'string', 'max:100'], 'latitude' => ['nullable', 'numeric', 'between:-90,90'], 'longitude' => ['nullable', 'numeric', 'between:-180,180'], 'is_default' => ['sometimes', 'boolean']]);
        $id = DatabaseTransaction::run(function () use ($data, $request) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            if (($data['is_default'] ?? false) || ! DB::table('addresses')->where('user_id', $request->user()->id)->exists()) DB::table('addresses')->where('user_id', $request->user()->id)->update(['is_default' => false, 'updated_at' => now()]);
            return DB::table('addresses')->insertGetId(array_merge($data, ['user_id' => $request->user()->id, 'is_default' => ($data['is_default'] ?? false) || ! DB::table('addresses')->where('user_id', $request->user()->id)->exists(), 'created_at' => now(), 'updated_at' => now()]));
        });
        return response()->json(['message' => 'Address saved.', 'address' => DB::table('addresses')->where('id', $id)->first()], 201);
    }

    public function update(Request $request, int $address): JsonResponse
    {
        $data = $request->validate(['label' => ['sometimes', 'string', 'max:80'], 'address_line' => ['sometimes', 'string', 'max:1000'], 'city' => ['nullable', 'string', 'max:100'], 'district' => ['nullable', 'string', 'max:100'], 'latitude' => ['nullable', 'numeric', 'between:-90,90'], 'longitude' => ['nullable', 'numeric', 'between:-180,180'], 'is_default' => ['sometimes', 'boolean']]);
        $updated = DatabaseTransaction::run(function () use ($data, $request, $address) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            $record = DB::table('addresses')->where('id', $address)->where('user_id', $request->user()->id)->lockForUpdate()->firstOrFail();
            $isDefault = array_key_exists('is_default', $data) ? (bool) $data['is_default'] : (bool) $record->is_default;
            if ($isDefault) {
                DB::table('addresses')->where('user_id', $request->user()->id)->update(['is_default' => false, 'updated_at' => now()]);
            } elseif ((bool) $record->is_default) {
                $replacement = DB::table('addresses')->where('user_id', $request->user()->id)->where('id', '!=', $address)->orderBy('created_at')->orderBy('id')->lockForUpdate()->first();
                if ($replacement) DB::table('addresses')->where('id', $replacement->id)->update(['is_default' => true, 'updated_at' => now()]);
                else $isDefault = true;
            }
            DB::table('addresses')->where('id', $address)->where('user_id', $request->user()->id)->update(array_merge($data, ['is_default' => $isDefault, 'updated_at' => now()]));
            return DB::table('addresses')->where('id', $address)->where('user_id', $request->user()->id)->firstOrFail();
        });
        return response()->json(['message' => 'Address updated.', 'address' => $updated]);
    }

    public function destroy(Request $request, int $address): JsonResponse
    {
        $deleted = DatabaseTransaction::run(function () use ($request, $address) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            $record = DB::table('addresses')->where('id', $address)->where('user_id', $request->user()->id)->lockForUpdate()->first();
            if (! $record) return false;
            DB::table('addresses')->where('id', $record->id)->delete();
            if (! DB::table('addresses')->where('user_id', $request->user()->id)->where('is_default', true)->exists()) {
                $replacement = DB::table('addresses')->where('user_id', $request->user()->id)->orderBy('created_at')->orderBy('id')->lockForUpdate()->first();
                if ($replacement) DB::table('addresses')->where('id', $replacement->id)->update(['is_default' => true, 'updated_at' => now()]);
            }
            return true;
        });
        abort_unless($deleted, 404);
        return response()->json(['message' => 'Address deleted.']);
    }
}
