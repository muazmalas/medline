<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;
use App\Support\AuditService;
use App\Support\NotificationService;
use App\Support\DatabaseTransaction;

class AdminController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        return response()->json([
            'metrics' => [
                'users' => User::count(),
                'patients' => User::where('role', 'patient')->count(),
                'partners' => Partner::count(),
                'pending_partners' => Partner::where('approval_status', 'pending')->count(),
                'orders' => DB::table('orders')->count(),
                'active_deliveries' => DB::table('deliveries')->whereIn('status', ['available', 'claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'])->count(),
                'open_complaints' => DB::table('complaints')->whereIn('status', ['open', 'in_review'])->count(),
            ],
            'alerts' => [
                ['key' => 'low_stock', 'severity' => 'warning', 'count' => DB::table('inventories')->whereColumn('quantity', '<=', 'low_stock_threshold')->count(), 'message' => 'Inventory records are at or below their low-stock threshold.'],
                ['key' => 'failed_deliveries', 'severity' => 'critical', 'count' => DB::table('deliveries')->where('status', 'failed')->count(), 'message' => 'Failed deliveries require reassignment or support review.'],
                ['key' => 'open_complaints', 'severity' => 'warning', 'count' => DB::table('complaints')->whereIn('status', ['open', 'in_review'])->count(), 'message' => 'Customer complaints are awaiting support action.'],
                ['key' => 'pending_partners', 'severity' => 'info', 'count' => Partner::where('approval_status', 'pending')->count(), 'message' => 'Pharmacy and warehouse applications are awaiting administrator review.'],
            ],
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $sortColumns = [
            'name' => 'users.name',
            'email' => 'users.email',
            'company' => 'partners.business_name',
            'role' => 'users.role',
            'status' => 'users.status',
            'created_at' => 'users.created_at',
        ];
        $sortBy = $request->string('sort_by')->toString();
        $sortColumn = $sortColumns[$sortBy] ?? 'users.created_at';
        $sortDirection = $request->string('sort_direction')->lower()->toString() === 'asc' ? 'asc' : 'desc';
        $users = User::query()
            ->leftJoin('partners', 'partners.user_id', '=', 'users.id')
            ->select('users.*', 'partners.business_name as company_name', 'partners.type as company_type')
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) { $like = '%' . $request->string('search')->toString() . '%'; $query->where(fn ($nested) => $nested->where('users.name', 'like', $like)->orWhere('users.email', 'like', $like)->orWhere('users.role', 'like', $like)->orWhere('users.status', 'like', $like)->orWhere('partners.business_name', 'like', $like)); })
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('users.status', $request->string('status')->toString()))
            ->when($request->string('role')->isNotEmpty(), fn ($query) => $query->where('users.role', $request->string('role')->toString()))
            ->orderBy($sortColumn, $sortDirection)
            ->orderByDesc('users.id')
            ->paginate(min($request->integer('per_page', 30), 100));
        return response()->json($users);
    }

    public function notificationDeliveryHealth(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $since = now()->subHours(24);
        $base = DB::table('notification_delivery_attempts')->where('attempted_at', '>=', $since);
        $byStatus = (clone $base)->select('status')->selectRaw('COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $byChannel = (clone $base)->select('channel')->selectRaw('COUNT(*) as total')->groupBy('channel')->pluck('total', 'channel');
        $recentFailures = (clone $base)->where('status', 'failed')->select('notification_id', 'notification_type', 'channel', 'provider', 'http_status', 'attempted_at')->latest('attempted_at')->limit(25)->get();

        return response()->json([
            'window' => ['from' => $since->toIso8601String(), 'to' => now()->toIso8601String()],
            'totals' => ['attempts' => (clone $base)->count(), 'by_status' => $byStatus, 'by_channel' => $byChannel],
            'recent_failures' => $recentFailures,
        ]);
    }

    public function updateUserStatus(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        abort_if($request->user()->id === $user->id, 422, 'An administrator cannot suspend the current account.');
        $data = $request->validate(['status' => ['required', 'in:active,suspended'], 'reason' => ['nullable', 'string', 'max:1000']]);
        $user = DatabaseTransaction::run(function () use ($user, $data) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $locked->update(['status' => $data['status']]);
            if ($locked->role === 'driver') {
                $driver = DB::table('drivers')->where('user_id', $locked->id)->lockForUpdate()->first();
                if ($driver) {
                    $approvalStatus = $driver->approval_status;
                    if ($data['status'] === 'suspended' && $approvalStatus === 'approved') $approvalStatus = 'suspended';
                    if ($data['status'] === 'active' && $approvalStatus === 'suspended') $approvalStatus = 'approved';
                    DB::table('drivers')->where('id', $driver->id)->update(['approval_status' => $approvalStatus, 'is_available' => false, 'updated_at' => now()]);
                }
            }
            if (in_array($locked->role, ['pharmacy', 'warehouse'], true)) {
                $partner = DB::table('partners')->where('user_id', $locked->id)->lockForUpdate()->first();
                if ($partner && $data['status'] === 'suspended' && $partner->approval_status === 'approved') {
                    DB::table('partners')->where('id', $partner->id)->update(['approval_status' => 'suspended', 'updated_at' => now()]);
                }
                if ($partner && $data['status'] === 'active' && $partner->approval_status === 'suspended') {
                    DB::table('partners')->where('id', $partner->id)->update(['approval_status' => 'approved', 'updated_at' => now()]);
                }
            }
            if ($data['status'] === 'suspended') {
                $locked->tokens()->delete();
                $locked->refreshTokens()->update(['revoked_at' => now(), 'updated_at' => now()]);
            }
            return $locked->fresh();
        });
        AuditService::record($request, 'user.' . $data['status'], User::class, $user->id, ['reason' => $data['reason'] ?? null]);
        return response()->json(['message' => 'User account status updated.', 'user' => $user]);
    }

    public function updateUserRole(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        abort_if($request->user()->id === $user->id, 422, 'An administrator cannot change the current account role.');
        $data = $request->validate(['role' => ['required', 'in:patient,pharmacy,warehouse,driver,admin'], 'reason' => ['nullable', 'string', 'max:1000']]);
        [$user, $oldRole] = DatabaseTransaction::run(function () use ($user, $data) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $existingPartner = DB::table('partners')->where('user_id', $locked->id)->first();
            $existingDriver = DB::table('drivers')->where('user_id', $locked->id)->exists();
            if ($existingPartner && $data['role'] !== $existingPartner->type) abort(422, 'Deactivate or reassign the existing pharmacy or warehouse profile before changing this role.');
            if ($existingDriver && $data['role'] !== 'driver') abort(422, 'Offboard the existing driver profile before changing this role.');
            if (in_array($data['role'], ['pharmacy', 'warehouse'], true)) abort_unless(DB::table('partners')->where('user_id', $locked->id)->where('type', $data['role'])->exists(), 422, 'The user must have a matching pharmacy or warehouse profile before this role is assigned.');
            if ($data['role'] === 'driver') abort_unless(DB::table('drivers')->where('user_id', $locked->id)->exists(), 422, 'The user must have a driver profile before this role is assigned.');
            $oldRole = $locked->role;
            $locked->update(['role' => $data['role']]);
            return [$locked->fresh(), $oldRole];
        });
        AuditService::record($request, 'user.role_updated', User::class, $user->id, ['from' => $oldRole, 'to' => $data['role'], 'reason' => $data['reason'] ?? null]);
        return response()->json(['message' => 'User role updated.', 'user' => $user->fresh()]);
    }

    public function partners(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $sortColumns = [
            'business_name' => 'business_name',
            'license_number' => 'license_number',
            'type' => 'type',
            'approval_status' => 'approval_status',
            'subscription_status' => 'subscription_status',
            'created_at' => 'created_at',
        ];
        $sortBy = $request->string('sort_by')->toString();
        $sortColumn = $sortColumns[$sortBy] ?? 'created_at';
        $sortDirection = $request->string('sort_direction')->lower()->toString() === 'asc' ? 'asc' : 'desc';
        $partners = Partner::query()
            ->when($request->string('type')->isNotEmpty(), fn ($query) => $query->where('type', $request->string('type')->toString()))
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('approval_status', $request->string('status')->toString()))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) {
                    $nested->where('business_name', 'like', $like)
                        ->orWhere('license_number', 'like', $like)
                        ->orWhere('address', 'like', $like)
                        ->orWhere('type', 'like', $like)
                        ->orWhere('approval_status', 'like', $like);
                });
            })
            ->orderBy($sortColumn, $sortDirection)
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 30), 100));
        return response()->json($partners);
    }

    public function partner(Partner $partner): JsonResponse
    {
        abort_unless(request()->user()->role === 'admin', 403);
        $record = DB::table('partners')->leftJoin('users', 'users.id', '=', 'partners.user_id')->where('partners.id', $partner->id)->select('partners.*', 'users.name as contact_name', 'users.email as contact_email')->firstOrFail();
        $subscription = DB::table('subscriptions')->where('partner_id', $partner->id)->latest('created_at')->first();
        $proof = $subscription ? DB::table('payment_proofs')->where('subscription_id', $subscription->id)->latest('created_at')->first() : null;
        $record->subscription_id = $subscription?->id;
        $record->subscription_plan_code = $subscription?->plan_code;
        $record->latest_subscription_status = $subscription?->status ?? 'not_submitted';
        $record->subscription_amount = $subscription?->amount;
        $record->subscription_starts_at = $subscription?->starts_at;
        $record->subscription_ends_at = $subscription?->ends_at;
        $record->payment_proof_id = $proof?->id;
        $record->payment_proof_status = $proof?->status ?? 'not_submitted';
        $record->payment_proof_review_note = $proof?->review_note;
        $record->working_hours = DB::table('partner_working_hours')
            ->where('partner_id', $partner->id)
            ->orderBy('day_of_week')
            ->orderBy('opens_at')
            ->get(['day_of_week', 'opens_at', 'closes_at']);
        return response()->json(['partner' => $record]);
    }

    public function driver(int $driver): JsonResponse
    {
        abort_unless(request()->user()->role === 'admin', 403);
        $profile = DB::table('drivers')->join('users', 'users.id', '=', 'drivers.user_id')->where('drivers.id', $driver)->select('drivers.*', 'users.name', 'users.email')->firstOrFail();
        $trips = DB::table('deliveries')->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where('deliveries.driver_id', $driver)->select('deliveries.id', 'deliveries.public_id', 'deliveries.order_id', 'deliveries.procurement_order_id', 'deliveries.status', 'deliveries.claimed_at', 'deliveries.completed_at', 'deliveries.created_at', DB::raw('COALESCE(orders.public_id, procurement_orders.public_id) as order_public_id'))->latest('deliveries.created_at')->get()->map(function ($trip) {
            $start = $trip->claimed_at ? strtotime((string) $trip->claimed_at) : null;
            $end = $trip->completed_at ? strtotime((string) $trip->completed_at) : ($start ? now()->timestamp : null);
            $trip->duration_minutes = $start && $end ? max(1, (int) round(($end - $start) / 60)) : null;
            $trip->estimated_minutes = 45;
            return $trip;
        });
        $counts = $trips->groupBy('status')->map->count();
        return response()->json(['driver' => $profile, 'summary' => ['total' => $trips->count(), 'accepted' => (int) ($counts['accepted'] ?? 0), 'in_progress' => (int) $counts->only(['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'])->sum(), 'completed' => (int) ($counts['delivered'] ?? 0), 'cancelled' => (int) ($counts['cancelled'] ?? 0), 'failed' => (int) ($counts['failed'] ?? 0)], 'trips' => $trips]);
    }

    public function procurements(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $sortable = ['public_id' => 'procurement_orders.public_id', 'pharmacy_name' => 'pharmacies.business_name', 'warehouse_name' => 'warehouses.business_name', 'subtotal' => 'procurement_orders.subtotal', 'delivery_fee' => 'procurement_orders.delivery_fee', 'total' => 'procurement_orders.total', 'status' => 'procurement_orders.status', 'created_at' => 'procurement_orders.created_at'];
        $sortBy = $sortable[$request->string('sort_by')->toString()] ?? 'procurement_orders.created_at';
        $direction = $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc';
        $rows = DB::table('procurement_orders')->join('partners as pharmacies', 'pharmacies.id', '=', 'procurement_orders.pharmacy_id')->join('partners as warehouses', 'warehouses.id', '=', 'procurement_orders.warehouse_id')->select('procurement_orders.*', 'pharmacies.business_name as pharmacy_name', 'warehouses.business_name as warehouse_name')->when($request->string('search')->isNotEmpty(), function ($query) use ($request) { $like = '%' . $request->string('search')->toString() . '%'; $query->where(fn ($nested) => $nested->where('procurement_orders.public_id', 'like', $like)->orWhere('pharmacies.business_name', 'like', $like)->orWhere('warehouses.business_name', 'like', $like)->orWhere('procurement_orders.status', 'like', $like)); })->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('procurement_orders.status', $request->string('status')->toString()))->orderBy($sortBy, $direction)->orderBy('procurement_orders.id', $direction)->paginate(min($request->integer('per_page', 30), 100));
        return response()->json($rows);
    }

    public function inventory(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $sortable = ['name_en' => 'medicines.name_en', 'owner_name' => 'partners.business_name', 'available_quantity' => DB::raw('(inventories.quantity - inventories.reserved_quantity)'), 'quantity' => 'inventories.quantity', 'reserved_quantity' => 'inventories.reserved_quantity', 'unit_price' => 'inventories.unit_price', 'stock_health' => DB::raw('(inventories.quantity - inventories.reserved_quantity - inventories.low_stock_threshold)'), 'created_at' => 'inventories.created_at', 'updated_at' => 'inventories.updated_at'];
        $sortBy = $sortable[$request->string('sort_by')->toString()] ?? 'medicines.name_en';
        $direction = $request->string('sort_direction')->toString() === 'desc' ? 'desc' : 'asc';
        $rows = DB::table('inventories')->join('medicines', 'medicines.id', '=', 'inventories.medicine_id')->join('partners', function ($join) { $join->on('partners.id', '=', 'inventories.owner_id')->whereColumn('partners.type', 'inventories.owner_type'); })->select('inventories.*', 'medicines.name_en', 'medicines.name_ar', 'medicines.manufacturer', 'medicines.prescription_required', 'partners.business_name as owner_name')->when($request->string('search')->isNotEmpty(), function ($query) use ($request) { $like = '%' . $request->string('search')->toString() . '%'; $query->where(fn ($nested) => $nested->where('medicines.name_en', 'like', $like)->orWhere('medicines.manufacturer', 'like', $like)->orWhere('partners.business_name', 'like', $like)); })->when($request->string('status')->toString() === 'low_stock', fn ($query) => $query->whereRaw('(inventories.quantity - inventories.reserved_quantity) <= inventories.low_stock_threshold'))->when($request->string('status')->toString() === 'healthy', fn ($query) => $query->whereRaw('(inventories.quantity - inventories.reserved_quantity) > inventories.low_stock_threshold'))->orderBy($sortBy, $direction)->orderBy('inventories.id', $direction)->paginate(min($request->integer('per_page', 50), 100));
        return response()->json($rows);
    }

    public function deliveries(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $deliveries = DB::table('deliveries')
            ->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')
            ->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')
            ->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.scheduled_for', 'deliveries.driver_id', 'deliveries.created_at', DB::raw('COALESCE(orders.public_id, procurement_orders.public_id) as order_public_id'), DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'), DB::raw('COALESCE(orders.delivery_fee, procurement_orders.delivery_fee) as job_price'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) {
                    $nested->where('deliveries.public_id', 'like', $like)->orWhere('orders.public_id', 'like', $like)->orWhere('procurement_orders.public_id', 'like', $like)->orWhere('deliveries.status', 'like', $like);
                });
            })
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('deliveries.status', $request->string('status')->toString()))
            ->orderBy(match ($request->string('sort_by')->toString()) { 'public_id' => 'deliveries.public_id', 'related_order' => 'order_public_id', 'delivery_address_snapshot' => 'delivery_address_snapshot', 'scheduled_for' => 'deliveries.scheduled_for', 'status' => 'deliveries.status', 'job_price' => 'job_price', 'total' => 'total', default => 'deliveries.created_at' }, $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc')
            ->orderBy('deliveries.id', $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc')
            ->paginate(min($request->integer('per_page', 30), 100));

        return response()->json($deliveries);
    }

    public function subscriptions(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $subscriptions = DB::table('subscriptions')
            ->join('partners', 'partners.id', '=', 'subscriptions.partner_id')
            ->join('users', 'users.id', '=', 'partners.user_id')
            ->leftJoin('payment_proofs', 'payment_proofs.subscription_id', '=', 'subscriptions.id')
            ->select('subscriptions.*', 'partners.business_name', 'partners.type', 'partners.approval_status', 'users.name as contact_name', 'users.email as contact_email', 'payment_proofs.id as payment_proof_id', 'payment_proofs.status as proof_status', 'payment_proofs.review_note', 'payment_proofs.reviewed_at')
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('subscriptions.status', $request->string('status')->toString()))
            ->when($request->string('origin')->isNotEmpty(), fn ($query) => $query->where('subscriptions.origin', $request->string('origin')->toString()))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(fn ($nested) => $nested->where('partners.business_name', 'like', $like)->orWhere('users.name', 'like', $like)->orWhere('users.email', 'like', $like)->orWhere('subscriptions.plan_code', 'like', $like));
            })
            ->latest('subscriptions.created_at')
            ->paginate(min($request->integer('per_page', 30), 100));

        return response()->json($subscriptions);
    }

    public function complaints(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $complaints = DB::table('complaints')
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) { $nested->where('subject', 'like', $like)->orWhere('category', 'like', $like)->orWhere('status', 'like', $like); });
            })
            ->latest()
            ->paginate(min($request->integer('per_page', 30), 100));

        return response()->json($complaints);
    }

    public function ratings(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $sortColumns = [
            'public_id' => 'orders.public_id',
            'author' => 'users.name',
            'score' => 'ratings.score',
            'status' => 'ratings.hidden_at',
            'created_at' => 'ratings.created_at',
        ];
        $sortBy = $request->string('sort_by')->toString();
        $sortColumn = $sortColumns[$sortBy] ?? 'ratings.created_at';
        $sortDirection = $request->string('sort_direction')->lower()->toString() === 'asc' ? 'asc' : 'desc';
        $ratings = DB::table('ratings')
            ->join('orders', 'orders.id', '=', 'ratings.order_id')
            ->join('users', 'users.id', '=', 'ratings.created_by')
            ->select('ratings.*', 'orders.public_id', 'users.name as creator_name', 'users.email as creator_email')
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) { $nested->where('ratings.comment', 'like', $like)->orWhere('users.name', 'like', $like)->orWhere('orders.public_id', 'like', $like); });
            })
            ->when($request->string('status')->toString() === 'visible', fn ($query) => $query->whereNull('ratings.hidden_at'))
            ->when($request->string('status')->toString() === 'hidden', fn ($query) => $query->whereNotNull('ratings.hidden_at'))
            ->orderBy($sortColumn, $sortDirection)
            ->orderByDesc('ratings.id')
            ->paginate(min($request->integer('per_page', 30), 100));

        return response()->json($ratings);
    }

    public function moderateRating(Request $request, int $rating): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['decision' => ['required', 'in:hide,restore'], 'reason' => ['nullable', 'string', 'max:500']]);
        $record = DB::table('ratings')->where('id', $rating)->first();
        abort_unless($record, 404, 'Rating not found.');
        $hidden = $data['decision'] === 'hide';
        DB::table('ratings')->where('id', $rating)->update(['hidden_at' => $hidden ? now() : null, 'moderated_by' => $request->user()->id, 'moderation_reason' => $hidden ? ($data['reason'] ?? 'Hidden by administrator review.') : null, 'updated_at' => now()]);
        AuditService::record($request, 'rating.' . $data['decision'], 'rating', $rating, ['reason' => $data['reason'] ?? null]);
        return response()->json(['message' => $hidden ? 'Rating hidden.' : 'Rating restored.']);
    }

    public function complaintReport(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $base = DB::table('complaints');
        return response()->json([
            'totals' => [
                'all' => (clone $base)->count(),
                'open' => (clone $base)->where('status', 'open')->count(),
                'in_review' => (clone $base)->where('status', 'in_review')->count(),
                'resolved' => (clone $base)->where('status', 'resolved')->count(),
                'rejected' => (clone $base)->where('status', 'rejected')->count(),
            ],
            'by_category' => DB::table('complaints')->select('category')->selectRaw('count(*) as total')->groupBy('category')->orderByDesc('total')->get(),
            'by_priority' => DB::table('complaints')->select('priority')->selectRaw('count(*) as total')->groupBy('priority')->orderByDesc('total')->get(),
            'recent' => DB::table('complaints')->selectRaw('DATE(created_at) as day')->selectRaw('count(*) as total')->where('created_at', '>=', now()->subDays(30))->groupByRaw('DATE(created_at)')->orderBy('day')->get(),
        ]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $logs = DB::table('audit_logs')
            ->leftJoin('users', 'users.id', '=', 'audit_logs.actor_id')
            ->select('audit_logs.id', 'audit_logs.action', 'audit_logs.auditable_type', 'audit_logs.auditable_id', 'audit_logs.metadata', 'audit_logs.ip_address', 'audit_logs.created_at', 'audit_logs.action as public_id', 'users.name as business_name', 'audit_logs.auditable_type as name_ar', 'users.name as actor_name', 'users.email as actor_email')
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) { $nested->where('audit_logs.action', 'like', $like)->orWhere('audit_logs.auditable_type', 'like', $like)->orWhere('users.name', 'like', $like)->orWhere('users.email', 'like', $like); });
            })
            ->latest('audit_logs.created_at')
            ->paginate(min($request->integer('per_page', 50), 100));

        return response()->json($logs);
    }

    public function auditExport(Request $request): StreamedResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $query = DB::table('audit_logs')->leftJoin('users', 'users.id', '=', 'audit_logs.actor_id')->select('audit_logs.id', 'audit_logs.action', 'audit_logs.auditable_type', 'audit_logs.auditable_id', 'audit_logs.metadata', 'audit_logs.ip_address', 'audit_logs.created_at', 'users.name as actor_name', 'users.email as actor_email');
        if ($request->string('search')->isNotEmpty()) {
            $like = '%' . $request->string('search')->toString() . '%';
            $query->where(function ($nested) use ($like) { $nested->where('audit_logs.action', 'like', $like)->orWhere('audit_logs.auditable_type', 'like', $like)->orWhere('users.name', 'like', $like)->orWhere('users.email', 'like', $like); });
        }
        $rows = $query->latest('audit_logs.created_at')->limit(5000)->get();
        return response()->streamDownload(function () use ($rows) {
            $output = fopen('php://output', 'wb');
            fputcsv($output, ['id', 'action', 'entity_type', 'entity_id', 'actor_name', 'actor_email', 'ip_address', 'metadata', 'created_at']);
            foreach ($rows as $row) fputcsv($output, [$row->id, $row->action, $row->auditable_type, $row->auditable_id, $row->actor_name, $row->actor_email, $row->ip_address, $row->metadata, $row->created_at]);
            fclose($output);
        }, 'medline-audit-log.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function decidePartner(Request $request, Partner $partner): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['decision' => ['required', 'in:approve,reject,correction'], 'note' => ['nullable', 'required_if:decision,correction', 'string', 'max:1000']]);
        $status = match ($data['decision']) { 'approve' => 'approved', 'reject' => 'rejected', default => 'correction_required' };
        $partner = DatabaseTransaction::run(function () use ($partner, $status, $data, $request) {
            $locked = Partner::whereKey($partner->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($locked->approval_status, ['pending', 'correction_required'], true), 409, 'This pharmacy or warehouse application has already been finalized.');
            $locked->update(['approval_status' => $status, 'review_note' => $status === 'correction_required' ? ($data['note'] ?? null) : null]);
            $initialSubscription = DB::table('subscriptions')->where('partner_id', $locked->id)->where('origin', 'registration')->latest('created_at')->lockForUpdate()->first();
            $initialProof = $initialSubscription ? DB::table('payment_proofs')->where('subscription_id', $initialSubscription->id)->latest('created_at')->lockForUpdate()->first() : null;
            if ($status === 'approved') {
                $locked->update(['subscription_status' => $initialSubscription?->status === 'active' ? 'active' : 'inactive']);
            } elseif ($status === 'rejected') {
                if ($initialSubscription) DB::table('subscriptions')->where('id', $initialSubscription->id)->update(['status' => 'rejected', 'updated_at' => now()]);
                if ($initialProof) DB::table('payment_proofs')->where('id', $initialProof->id)->update(['status' => 'rejected', 'reviewed_by' => $request->user()->id, 'review_note' => $data['note'] ?? null, 'reviewed_at' => now(), 'updated_at' => now()]);
                $locked->update(['subscription_status' => 'inactive']);
            }
            return $locked->fresh();
        });
        $organization = ucfirst((string) $partner->type);
        $message = match ($data['decision']) {
            'correction' => $organization . ' application needs correction. Admin note: ' . $data['note'],
            'approve' => $organization . ' details were approved. Subscription access begins after the payment receipt is approved in the subscription review.',
            default => $organization . ' application was rejected.',
        };
        NotificationService::send($partner->user_id, 'registration.' . $data['decision'], ['partner_id' => $partner->id, 'status' => $status, 'note' => $data['note'] ?? null, 'message' => $message]);
        AuditService::record($request, 'partner.' . $data['decision'], Partner::class, $partner->id, ['note' => $data['note'] ?? null]);
        return response()->json(['message' => ucfirst($partner->type) . ' decision saved.', 'partner' => $partner]);
    }

    public function decidePayment(Request $request, int $subscription): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['decision' => ['required', 'in:approve,reject,correction'], 'note' => ['nullable', 'required_if:decision,correction', 'string', 'max:1000']]);
        $record = DB::table('subscriptions')->where('id', $subscription)->firstOrFail();
        $status = match ($data['decision']) { 'approve' => 'active', 'correction' => 'correction_required', default => 'rejected' };
        DatabaseTransaction::run(function () use ($record, $status, $data, $request) {
            $lockedSubscription = DB::table('subscriptions')->where('id', $record->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedSubscription->status === 'payment_under_review', 409, 'This subscription payment has already been reviewed.');
            $proof = DB::table('payment_proofs')->where('subscription_id', $lockedSubscription->id)->where('status', 'under_review')->lockForUpdate()->first();
            abort_unless($proof, 409, 'No pending payment proof remains for this subscription.');
            $subscriptionUpdate = ['status' => $status, 'updated_at' => now()];
            if ($status === 'active') {
                $current = DB::table('subscriptions')
                    ->where('partner_id', $lockedSubscription->partner_id)
                    ->where('id', '!=', $lockedSubscription->id)
                    ->whereIn('status', ['active', 'expiring_soon', 'grace'])
                    ->whereDate('ends_at', '>=', today())
                    ->orderByDesc('ends_at')
                    ->lockForUpdate()
                    ->first();
                $startsAt = ($lockedSubscription->origin ?? 'renewal') === 'renewal' && $current?->ends_at
                    ? \Illuminate\Support\Carbon::parse($current->ends_at)->addDay()
                    : today();
                $subscriptionUpdate['starts_at'] = $startsAt->toDateString();
                $subscriptionUpdate['ends_at'] = $startsAt->copy()->addMonths((int) $lockedSubscription->duration_months)->toDateString();
            }
            DB::table('subscriptions')->where('id', $lockedSubscription->id)->update($subscriptionUpdate);
            DB::table('payment_proofs')->where('id', $proof->id)->update(['status' => $status === 'active' ? 'approved' : $status, 'reviewed_by' => $request->user()->id, 'review_note' => $data['note'] ?? null, 'reviewed_at' => now(), 'updated_at' => now()]);
            $partner = DB::table('partners')->where('id', $lockedSubscription->partner_id)->lockForUpdate()->firstOrFail();
            $partnerUpdate = ['updated_at' => now()];
            if ($status === 'active') {
                if (($lockedSubscription->origin ?? 'renewal') === 'registration' && $partner->approval_status === 'pending') {
                    $partnerUpdate['approval_status'] = 'approved';
                    $partnerUpdate['review_note'] = null;
                }
                $approvalStatus = $partnerUpdate['approval_status'] ?? $partner->approval_status;
                $partnerUpdate['subscription_status'] = $approvalStatus === 'approved' ? 'active' : 'inactive';
            } elseif (($lockedSubscription->origin ?? 'renewal') === 'registration' && $status === 'rejected') {
                $partnerUpdate['approval_status'] = 'rejected';
                $partnerUpdate['subscription_status'] = 'inactive';
                $partnerUpdate['review_note'] = $data['note'] ?? null;
            }
            DB::table('partners')->where('id', $lockedSubscription->partner_id)->update($partnerUpdate);
        });
        $partnerUserId = DB::table('partners')->where('id', $record->partner_id)->value('user_id');
        $message = match ($data['decision']) {
            'approve' => 'Your subscription payment was approved. Your subscription dates are now available.',
            'correction' => 'Your payment proof needs correction. Admin note: ' . $data['note'],
            default => 'Your subscription payment was rejected.' . (empty($data['note']) ? '' : ' Admin note: ' . $data['note']),
        };
        if ($partnerUserId) NotificationService::send($partnerUserId, 'subscription.' . $data['decision'], ['subscription_id' => $record->id, 'status' => $status, 'note' => $data['note'] ?? null, 'message' => $message]);
        AuditService::record($request, 'subscription.' . $data['decision'], 'subscription', $record->id, ['note' => $data['note'] ?? null]);
        return response()->json(['message' => 'Payment decision saved.']);
    }

    public function reassignDelivery(Request $request, int $delivery): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);
        DatabaseTransaction::run(function () use ($delivery, $data, $request) {
            $row = DB::table('deliveries')->where('id', $delivery)->lockForUpdate()->firstOrFail();
            abort_unless($row->status === 'failed', 409, 'Only failed deliveries can be reassigned.');
            DB::table('deliveries')->where('id', $delivery)->update(['driver_id' => null, 'status' => 'available', 'claimed_at' => null, 'failure_reason' => $data['reason'], 'pin_attempts' => 0, 'pin_locked_at' => null, 'pickup_code_hash' => null, 'pickup_code_sent_at' => null, 'pickup_code_expires_at' => null, 'pickup_code_verified_at' => null, 'pickup_code_attempts' => 0, 'pickup_code_locked_at' => null, 'recipient_code_hash' => null, 'recipient_code_sent_at' => null, 'recipient_code_expires_at' => null, 'recipient_code_verified_at' => null, 'recipient_code_attempts' => 0, 'recipient_code_locked_at' => null, 'last_latitude' => null, 'last_longitude' => null, 'location_accuracy_meters' => null, 'location_updated_at' => null, 'updated_at' => now()]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $request->user()->id, 'from_status' => 'failed', 'to_status' => 'reassigned', 'note' => $data['reason'], 'created_at' => now(), 'updated_at' => now()]);
        });
        AuditService::record($request, 'delivery.reassigned', 'delivery', $delivery, ['reason' => $data['reason']]);
        return response()->json(['message' => 'Delivery returned to the available queue.']);
    }
}
