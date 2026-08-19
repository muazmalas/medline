<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PartnerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $partners = Partner::query()
            ->where('approval_status', 'approved')
            ->where('subscription_status', 'active')
            ->when($request->string('type')->isNotEmpty(), fn ($query) => $query->whereIn('type', array_values(array_intersect([$request->string('type')->toString()], ['pharmacy', 'warehouse']))))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $search = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($search) {
                    $nested->where('business_name', 'like', $search)
                        ->orWhere('address', 'like', $search);
                });
            })
            ->orderBy('business_name')
            ->paginate(min($request->integer('per_page', 15), 50));

        return response()->json($partners);
    }

    public function show(Partner $partner): JsonResponse
    {
        abort_unless($partner->approval_status === 'approved' && $partner->subscription_status === 'active', 404);

        return response()->json(['partner' => $partner]);
    }
}
