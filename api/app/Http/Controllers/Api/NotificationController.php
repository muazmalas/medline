<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = DB::table('notifications')
            ->where('notifiable_type', 'App\\Models\\User')
            ->where('notifiable_id', $request->user()->id)
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 50));

        return response()->json($notifications);
    }

    public function read(Request $request, string $id): JsonResponse
    {
        $updated = DB::table('notifications')
            ->where('id', $id)
            ->where('notifiable_type', 'App\\Models\\User')
            ->where('notifiable_id', $request->user()->id)
            ->update(['read_at' => now(), 'updated_at' => now()]);

        abort_unless($updated, 404);
        return response()->json(['message' => 'Notification marked as read.']);
    }
}
