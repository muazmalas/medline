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
                'active_deliveries' => DB::table('deliveries')->whereIn('status', ['available', 'claimed', 'in_transit'])->count(),
                'open_complaints' => DB::table('complaints')->whereIn('status', ['open', 'in_review'])->count(),
            ],
            'alerts' => [
                ['key' => 'low_stock', 'severity' => 'warning', 'count' => DB::table('inventories')->whereColumn('quantity', '<=', 'low_stock_threshold')->count(), 'message' => 'Inventory records are at or below their low-stock threshold.'],
                ['key' => 'failed_deliveries', 'severity' => 'critical', 'count' => DB::table('deliveries')->where('status', 'failed')->count(), 'message' => 'Failed deliveries require reassignment or support review.'],
                ['key' => 'open_complaints', 'severity' => 'warning', 'count' => DB::table('complaints')->whereIn('status', ['open', 'in_review'])->count(), 'message' => 'Customer complaints are awaiting support action.'],
                ['key' => 'pending_partners', 'severity' => 'info', 'count' => Partner::where('approval_status', 'pending')->count(), 'message' => 'Partner applications are awaiting administrator review.'],
            ],
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $users = User::query()
            ->leftJoin('partners', 'partners.user_id', '=', 'users.id')
            ->select('users.*', 'partners.business_name as company_name', 'partners.type as company_type')
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) { $like = '%' . $request->string('search')->toString() . '%'; $query->where(fn ($nested) => $nested->where('users.name', 'like', $like)->orWhere('users.email', 'like', $like)->orWhere('partners.business_name', 'like', $like)); })
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('users.status', $request->string('status')->toString()))
            ->latest('users.created_at')
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
            if ($existingPartner && $data['role'] !== $existingPartner->type) abort(422, 'Offboard or reassign the existing partner profile before changing this role.');
            if ($existingDriver && $data['role'] !== 'driver') abort(422, 'Offboard the existing driver profile before changing this role.');
            if (in_array($data['role'], ['pharmacy', 'warehouse'], true)) abort_unless(DB::table('partners')->where('user_id', $locked->id)->where('type', $data['role'])->exists(), 422, 'The user must have a matching partner profile before this role is assigned.');
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
        $partners = Partner::query()
            ->when($request->string('type')->isNotEmpty(), fn ($query) => $query->where('type', $request->string('type')->toString()))
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('approval_status', $request->string('status')->toString()))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) {
                    $nested->where('business_name', 'like', $like)
                        ->orWhere('license_number', 'like', $like)
                        ->orWhere('type', 'like', $like)
                        ->orWhere('approval_status', 'like', $like);
                });
            })
            ->latest()
            ->paginate(min($request->integer('per_page', 30), 100));
        return response()->json($partners);
    }

    public function deliveries(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $deliveries = DB::table('deliveries')
            ->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')
            ->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')
            ->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.driver_id', 'deliveries.created_at', DB::raw('COALESCE(orders.public_id, procurement_orders.public_id) as order_public_id'), DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) {
                    $nested->where('deliveries.public_id', 'like', $like)->orWhere('orders.public_id', 'like', $like)->orWhere('procurement_orders.public_id', 'like', $like)->orWhere('deliveries.status', 'like', $like);
                });
            })
            ->latest('deliveries.created_at')
            ->paginate(min($request->integer('per_page', 30), 100));

        return response()->json($deliveries);
    }

    public function subscriptions(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $subscriptions = DB::table('subscriptions')
            ->join('partners', 'partners.id', '=', 'subscriptions.partner_id')
            ->leftJoin('payment_proofs', 'payment_proofs.subscription_id', '=', 'subscriptions.id')
            ->select('subscriptions.*', 'partners.business_name', 'partners.type', 'payment_proofs.id as payment_proof_id', 'payment_proofs.status as proof_status')
            ->when($request->string('search')->isNotEmpty(), fn ($query) => $query->where('partners.business_name', 'like', '%' . $request->string('search')->toString() . '%'))
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
        $ratings = DB::table('ratings')
            ->join('orders', 'orders.id', '=', 'ratings.order_id')
            ->join('users', 'users.id', '=', 'ratings.created_by')
            ->select('ratings.*', 'orders.public_id', 'users.name as creator_name', 'users.email as creator_email')
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) { $nested->where('ratings.comment', 'like', $like)->orWhere('users.name', 'like', $like)->orWhere('orders.public_id', 'like', $like); });
            })
            ->latest('ratings.created_at')
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
        $data = $request->validate(['decision' => ['required', 'in:approve,reject,correction'], 'note' => ['nullable', 'string', 'max:1000']]);
        $status = match ($data['decision']) { 'approve' => 'approved', 'reject' => 'rejected', default => 'correction_required' };
        $partner = DatabaseTransaction::run(function () use ($partner, $status) {
            $locked = Partner::whereKey($partner->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($locked->approval_status, ['pending', 'correction_required'], true), 409, 'This partner application has already been finalized.');
            $locked->update(['approval_status' => $status]);
            return $locked->fresh();
        });
        NotificationService::send($partner->user_id, 'registration.' . $data['decision'], ['partner_id' => $partner->id, 'status' => $status, 'message' => 'Your MedLine partner application was updated.']);
        AuditService::record($request, 'partner.' . $data['decision'], Partner::class, $partner->id, ['note' => $data['note'] ?? null]);
        return response()->json(['message' => 'Partner decision saved.', 'partner' => $partner]);
    }

    public function decidePayment(Request $request, int $subscription): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['decision' => ['required', 'in:approve,reject'], 'note' => ['nullable', 'string', 'max:1000']]);
        $record = DB::table('subscriptions')->where('id', $subscription)->firstOrFail();
        $status = $data['decision'] === 'approve' ? 'active' : 'rejected';
        DatabaseTransaction::run(function () use ($record, $status, $data, $request) {
            $lockedSubscription = DB::table('subscriptions')->where('id', $record->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedSubscription->status === 'payment_under_review', 409, 'This subscription payment has already been reviewed.');
            $proof = DB::table('payment_proofs')->where('subscription_id', $lockedSubscription->id)->where('status', 'under_review')->lockForUpdate()->first();
            abort_unless($proof, 409, 'No pending payment proof remains for this subscription.');
            $subscriptionUpdate = ['status' => $status, 'updated_at' => now()];
            if ($status === 'active') {
                $subscriptionUpdate['starts_at'] = now()->toDateString();
                $subscriptionUpdate['ends_at'] = now()->addMonths((int) $lockedSubscription->duration_months)->toDateString();
            }
            DB::table('subscriptions')->where('id', $lockedSubscription->id)->update($subscriptionUpdate);
            DB::table('payment_proofs')->where('id', $proof->id)->update(['status' => $status, 'reviewed_by' => $request->user()->id, 'review_note' => $data['note'] ?? null, 'reviewed_at' => now(), 'updated_at' => now()]);
            DB::table('partners')->where('id', $lockedSubscription->partner_id)->lockForUpdate()->firstOrFail();
            DB::table('partners')->where('id', $lockedSubscription->partner_id)->update(['subscription_status' => $status === 'active' ? 'active' : 'inactive', 'updated_at' => now()]);
        });
        $partnerUserId = DB::table('partners')->where('id', $record->partner_id)->value('user_id');
        if ($partnerUserId) NotificationService::send($partnerUserId, 'subscription.' . $data['decision'], ['subscription_id' => $record->id, 'status' => $status, 'message' => 'Your MedLine subscription payment review was updated.']);
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
            DB::table('deliveries')->where('id', $delivery)->update(['driver_id' => null, 'status' => 'available', 'claimed_at' => null, 'failure_reason' => $data['reason'], 'pin_attempts' => 0, 'pin_locked_at' => null, 'last_latitude' => null, 'last_longitude' => null, 'location_accuracy_meters' => null, 'location_updated_at' => null, 'updated_at' => now()]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $request->user()->id, 'from_status' => 'failed', 'to_status' => 'reassigned', 'note' => $data['reason'], 'created_at' => now(), 'updated_at' => now()]);
        });
        AuditService::record($request, 'delivery.reassigned', 'delivery', $delivery, ['reason' => $data['reason']]);
        return response()->json(['message' => 'Delivery returned to the available queue.']);
    }
}
