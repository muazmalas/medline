<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DriverController extends Controller
{
    public function availability(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->firstOrFail();
        return response()->json(['approval_status' => $driver->approval_status, 'is_available' => (bool) $driver->is_available]);
    }

    public function updateAvailability(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $data = $request->validate(['is_available' => ['required', 'boolean']]);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->firstOrFail();
        abort_unless($driver->approval_status === 'approved', 403, 'Driver approval is required before availability can be changed.');
        DB::table('drivers')->where('id', $driver->id)->update(['is_available' => $data['is_available'], 'updated_at' => now()]);
        AuditService::record($request, 'driver.availability_updated', 'driver', $driver->id, ['is_available' => $data['is_available']]);
        return response()->json(['message' => 'Availability updated.', 'is_available' => (bool) $data['is_available']]);
    }
}
