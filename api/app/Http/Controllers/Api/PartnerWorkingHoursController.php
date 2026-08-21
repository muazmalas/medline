<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PartnerWorkingHoursController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $partner = $this->pharmacy($request);

        return response()->json([
            'data' => DB::table('partner_working_hours')
                ->where('partner_id', $partner->id)
                ->orderBy('day_of_week')
                ->orderBy('opens_at')
                ->get(['id', 'day_of_week', 'opens_at', 'closes_at']),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $partner = $this->pharmacy($request);
        $data = $request->validate([
            'shifts' => ['present', 'array', 'max:42'],
            'shifts.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'shifts.*.opens_at' => ['required', 'date_format:H:i'],
            'shifts.*.closes_at' => ['required', 'date_format:H:i'],
        ]);

        $grouped = collect($data['shifts'])->groupBy('day_of_week');
        foreach ($grouped as $day => $shifts) {
            $ordered = $shifts->sortBy('opens_at')->values();
            foreach ($ordered as $index => $shift) {
                if ($shift['opens_at'] >= $shift['closes_at']) {
                    throw ValidationException::withMessages(["shifts.{$day}" => 'Closing time must be later than opening time.']);
                }
                $previous = $index > 0 ? $ordered[$index - 1] : null;
                if ($previous && $shift['opens_at'] < $previous['closes_at']) {
                    throw ValidationException::withMessages(["shifts.{$day}" => 'Working-hour shifts on the same day cannot overlap.']);
                }
            }
        }

        DatabaseTransaction::run(function () use ($partner, $data): void {
            DB::table('partner_working_hours')->where('partner_id', $partner->id)->delete();
            if ($data['shifts'] === []) return;
            $now = now();
            DB::table('partner_working_hours')->insert(array_map(fn (array $shift) => [
                'partner_id' => $partner->id,
                'day_of_week' => $shift['day_of_week'],
                'opens_at' => $shift['opens_at'],
                'closes_at' => $shift['closes_at'],
                'created_at' => $now,
                'updated_at' => $now,
            ], $data['shifts']));
        });

        AuditService::record($request, 'partner.working_hours_updated', 'partner', $partner->id, ['shift_count' => count($data['shifts'])]);

        return response()->json(['message' => 'Working hours updated.', 'shifts' => $data['shifts']]);
    }

    private function pharmacy(Request $request): object
    {
        abort_unless($request->user()->role === 'pharmacy', 403);
        return DB::table('partners')->where('user_id', $request->user()->id)->where('type', 'pharmacy')->firstOrFail();
    }
}
