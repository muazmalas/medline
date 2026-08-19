<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Partner;
use App\Support\AuditService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RatingController extends Controller
{
    public function store(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['score' => ['required', 'integer', 'min:1', 'max:5'], 'comment' => ['nullable', 'string', 'max:2000']]);
        $partnerUserId = (int) Partner::whereKey($order->pharmacy_id)->value('user_id');
        abort_unless($order->status === 'completed' && in_array($request->user()->id, [$order->patient_id, $partnerUserId], true), 403, 'You may rate only a completed order you participated in.');
        abort_if(DB::table('ratings')->where('order_id', $order->id)->where('created_by', $request->user()->id)->exists(), 409, 'You have already rated this order.');
        try {
            $ratingId = DB::table('ratings')->insertGetId(['order_id' => $order->id, 'created_by' => $request->user()->id, 'score' => $data['score'], 'comment' => $data['comment'] ?? null, 'created_at' => now(), 'updated_at' => now()]);
        } catch (QueryException $exception) {
            if (($exception->errorInfo[0] ?? null) !== '23000') throw $exception;
            return response()->json(['message' => 'You have already rated this order.', 'code' => 'RATING_ALREADY_EXISTS'], 409);
        }
        AuditService::record($request, 'rating.created', 'rating', $ratingId, ['order_id' => $order->id, 'score' => $data['score']]);
        return response()->json(['message' => 'Rating submitted.', 'rating_id' => $ratingId], 201);
    }
}
