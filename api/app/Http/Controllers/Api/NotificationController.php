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
        $baseQuery = DB::table('notifications')
            ->where('notifiable_type', 'App\\Models\\User')
            ->where('notifiable_id', $request->user()->id);
        $unreadCount = (clone $baseQuery)->whereNull('read_at')->count();
        $search = trim($request->string('search')->toString());
        $status = $request->string('status')->toString();
        $sort = $request->string('sort_by', 'created_at')->toString();
        $sortColumn = in_array($sort, ['type', 'read_at', 'created_at'], true) ? $sort : 'created_at';
        $sortDirection = $request->string('sort_direction')->lower()->toString() === 'asc' ? 'asc' : 'desc';
        $query = (clone $baseQuery)
            ->when($search !== '', function ($query) use ($search) {
                $like = "%{$search}%";
                $query->where(fn ($nested) => $nested->where('type', 'like', $like)->orWhere('data', 'like', $like));
            })
            ->when($status === 'read', fn ($query) => $query->whereNotNull('read_at'))
            ->when($status === 'unread', fn ($query) => $query->whereNull('read_at'));
        $notifications = $query
            ->orderBy($sortColumn, $sortDirection)
            ->orderBy('id', 'desc')
            ->paginate(min($request->integer('per_page', 20), 50));

        $payload = $notifications->toArray();
        $payload['unread_count'] = $unreadCount;

        return response()->json($payload);
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

    public function destroy(Request $request, string $id): JsonResponse
    {
        $deleted = DB::table('notifications')->where('id', $id)->where('notifiable_type', 'App\\Models\\User')->where('notifiable_id', $request->user()->id)->delete();
        abort_unless($deleted, 404);
        return response()->json(['message' => 'Notification deleted.']);
    }
}
