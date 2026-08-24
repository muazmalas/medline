<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PartnerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $operationsTimezone = (string) config('medline.operations_timezone', 'Asia/Damascus');
        $now = CarbonImmutable::now($operationsTimezone);
        $dayOfWeek = $now->dayOfWeek;
        $currentTime = $now->format('H:i:s');
        $partners = Partner::query()
            ->where('approval_status', 'approved')
            ->where('subscription_status', 'active')
            ->when($request->string('type')->isNotEmpty(), fn ($query) => $query->whereIn('type', array_values(array_intersect([$request->string('type')->toString()], ['pharmacy', 'warehouse']))))
            ->when($request->boolean('open_now'), fn ($query) => $query->whereExists(function ($hours) use ($dayOfWeek, $currentTime) {
                $hours->selectRaw('1')
                    ->from('partner_working_hours')
                    ->whereColumn('partner_working_hours.partner_id', 'partners.id')
                    ->where('partner_working_hours.day_of_week', $dayOfWeek)
                    ->where('partner_working_hours.opens_at', '<=', $currentTime)
                    ->where('partner_working_hours.closes_at', '>', $currentTime);
            }))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $search = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($search) {
                    $nested->where('business_name', 'like', $search)
                        ->orWhere('address', 'like', $search);
                });
            })
            ->orderBy('business_name')
            ->paginate(min($request->integer('per_page', 15), 50));

        $partnerIds = $partners->getCollection()->pluck('id');
        $hoursByPartner = DB::table('partner_working_hours')
            ->whereIn('partner_id', $partnerIds)
            ->orderBy('day_of_week')
            ->orderBy('opens_at')
            ->get(['partner_id', 'day_of_week', 'opens_at', 'closes_at'])
            ->groupBy('partner_id');

        $partners->getCollection()->transform(function (Partner $partner) use ($hoursByPartner, $dayOfWeek, $currentTime, $operationsTimezone) {
            $workingHours = $hoursByPartner->get($partner->id, collect())->values();
            $todayHours = $workingHours->where('day_of_week', $dayOfWeek)->values();
            $activeShift = $todayHours->first(fn ($shift) => $shift->opens_at <= $currentTime && $shift->closes_at > $currentTime);
            $partner->setAttribute('working_hours', $workingHours);
            $partner->setAttribute('today_hours', $todayHours);
            $partner->setAttribute('is_open', $activeShift !== null);
            $partner->setAttribute('open_until', $activeShift?->closes_at);
            $partner->setAttribute('operations_timezone', $operationsTimezone);

            return $partner;
        });

        return response()->json($partners);
    }

    public function show(Partner $partner): JsonResponse
    {
        abort_unless($partner->approval_status === 'approved' && $partner->subscription_status === 'active', 404);

        return response()->json(['partner' => $partner]);
    }
}
