<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\AuditService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use App\Contracts\FileScanner;
use App\Models\User;
use App\Support\NotificationService;
use App\Support\DatabaseTransaction;

class SubscriptionController extends Controller
{
    public function current(Request $request): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->firstOrFail();
        $base = DB::table('subscriptions')->where('partner_id', $partner->id);
        $today = now()->toDateString();
        $activeSubscription = (clone $base)
            ->whereIn('status', ['active', 'expiring_soon', 'grace'])
            ->where(fn ($query) => $query->whereNull('starts_at')->orWhereDate('starts_at', '<=', $today))
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhereDate('ends_at', '>=', $today))
            ->orderByDesc('ends_at')
            ->first();
        $reviewSubscription = (clone $base)
            ->whereIn('status', ['payment_under_review', 'correction_required'])
            ->latest('created_at')
            ->first();
        $scheduledSubscription = (clone $base)
            ->whereIn('status', ['active', 'expiring_soon'])
            ->whereDate('starts_at', '>', $today)
            ->orderBy('starts_at')
            ->first();
        $latestSubscription = (clone $base)->latest('created_at')->first();
        $subscription = $reviewSubscription ?? $activeSubscription ?? $scheduledSubscription ?? $latestSubscription;
        $paymentProof = $subscription
            ? DB::table('payment_proofs')->where('subscription_id', $subscription->id)->latest('created_at')->first()
            : null;
        $accessActive = $partner->approval_status === 'approved'
            && ($activeSubscription !== null || $partner->subscription_status === 'active');

        return response()->json([
            'partner' => $partner,
            'subscription' => $subscription,
            'active_subscription' => $activeSubscription,
            'review_subscription' => $reviewSubscription,
            'scheduled_subscription' => $scheduledSubscription,
            'payment_proof' => $paymentProof,
            'access_active' => $accessActive,
            'access_status' => $accessActive ? 'active' : 'inactive',
        ]);
    }

    public function publicPlans(): JsonResponse
    {
        return response()->json(['data' => $this->configuredPlans()]);
    }

    public function plans(Request $request): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->firstOrFail();
        $plans = $this->configuredPlans()->where('partner_type', $partner->type)->values();
        return response()->json(['data' => $plans]);
    }

    private function configuredPlans()
    {
        return collect(config('medline.subscription_plans', []))->map(fn (array $plan, string $code) => [
            'code' => $code,
            'partner_type' => $plan['partner_type'],
            'duration_months' => (int) $plan['duration_months'],
            'amount' => $plan['amount'] !== null ? (float) $plan['amount'] : null,
            'currency' => 'SYP',
        ])->values();
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->firstOrFail();
        $data = $request->validate([
            'business_name' => ['required', 'string', 'max:180'],
            'license_number' => ['required', 'string', 'max:120', 'unique:partners,license_number,' . $partner->id],
            'address' => ['required', 'string', 'max:1000'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);
        $partner->update([...$data, 'approval_status' => 'pending', 'review_note' => null]);
        User::where('role', 'admin')->pluck('id')->each(fn ($adminId) => NotificationService::send($adminId, 'registration.resubmitted', ['partner_id' => $partner->id, 'status' => 'pending', 'message' => 'A corrected ' . $partner->type . ' application was resubmitted for review.']));
        AuditService::record($request, 'partner.resubmitted', Partner::class, $partner->id);
        return response()->json(['message' => 'Your corrected application was resubmitted for review.', 'partner' => $partner->fresh()]);
    }

    public function submitProof(Request $request, FileScanner $scanner): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->firstOrFail();
        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'plan_code' => ['nullable', 'string', 'max:64'],
            'proof' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
        ]);
        $planCode = $data['plan_code'] ?? 'annual_' . $partner->type;
        $plan = config('medline.subscription_plans.' . $planCode);
        abort_unless(is_array($plan) && $plan['partner_type'] === $partner->type, 422, 'The selected subscription plan is not available for this partner type.');
        if ($plan['amount'] !== null) {
            $submittedAmount = number_format((float) $data['amount'], 2, '.', '');
            $configuredAmount = number_format((float) $plan['amount'], 2, '.', '');
            abort_unless($submittedAmount === $configuredAmount, 422, 'The submitted amount does not match the selected subscription plan.');
        }
        $scanner->scan($data['proof']);
        $requestHash = $request->attributes->get('idempotency_request_hash') ?? hash('sha256', json_encode(['amount' => $data['amount'], 'proof' => hash_file('sha256', $data['proof']->getRealPath())], JSON_THROW_ON_ERROR));
        if ($idempotencyKey !== '' && ! $request->attributes->get('idempotency_reserved')) {
            $previous = DB::table('idempotency_keys')->where('user_id', $request->user()->id)->where('key', $idempotencyKey)->first();
            if ($previous) {
                if ($previous->request_hash !== $requestHash) return response()->json(['message' => 'The idempotency key was already used with a different request.', 'code' => 'IDEMPOTENCY_KEY_REUSED'], 409);
                return response()->json(json_decode($previous->response_body, true), $previous->response_status ?? 201);
            }
        }
        $storedPath = $data['proof']->store('private/payment-proofs');
        try {
            $payload = DatabaseTransaction::run(function () use ($data, $partner, $request, $planCode, $plan, $storedPath) {
                $partner = Partner::whereKey($partner->id)->lockForUpdate()->firstOrFail();
                $pending = DB::table('subscriptions')->where('partner_id', $partner->id)->where('status', 'payment_under_review')->lockForUpdate()->exists();
                abort_unless(! $pending, 409, 'A subscription payment proof is already awaiting review.');
                $correction = DB::table('subscriptions')->where('partner_id', $partner->id)->where('status', 'correction_required')->latest('created_at')->lockForUpdate()->first();
                if ($correction) {
                    $proof = DB::table('payment_proofs')->where('subscription_id', $correction->id)->latest('created_at')->lockForUpdate()->first();
                    $oldPath = $proof?->file_path;
                    DB::table('subscriptions')->where('id', $correction->id)->update(['plan_code' => $planCode, 'status' => 'payment_under_review', 'amount' => $data['amount'], 'duration_months' => $plan['duration_months'], 'updated_at' => now()]);
                    if ($proof) {
                        DB::table('payment_proofs')->where('id', $proof->id)->update(['submitted_by' => $request->user()->id, 'file_path' => $storedPath, 'status' => 'under_review', 'reviewed_by' => null, 'review_note' => null, 'reviewed_at' => null, 'updated_at' => now()]);
                    } else {
                        DB::table('payment_proofs')->insert(['subscription_id' => $correction->id, 'submitted_by' => $request->user()->id, 'file_path' => $storedPath, 'status' => 'under_review', 'created_at' => now(), 'updated_at' => now()]);
                    }
                    return ['message' => 'Corrected payment proof resubmitted for review.', 'subscription_id' => $correction->id, 'replaced_path' => $oldPath];
                }
                $subscriptionId = DB::table('subscriptions')->insertGetId(['partner_id' => $partner->id, 'plan_code' => $planCode, 'origin' => 'renewal', 'status' => 'payment_under_review', 'amount' => $data['amount'], 'duration_months' => $plan['duration_months'], 'starts_at' => null, 'ends_at' => null, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('payment_proofs')->insert(['subscription_id' => $subscriptionId, 'submitted_by' => $request->user()->id, 'file_path' => $storedPath, 'status' => 'under_review', 'created_at' => now(), 'updated_at' => now()]);
                return ['message' => 'Payment proof submitted for review.', 'subscription_id' => $subscriptionId, 'replaced_path' => null];
            });
        } catch (\Throwable $exception) {
            if ($storedPath) Storage::delete($storedPath);
            throw $exception;
        }
        if ($payload['replaced_path'] && $payload['replaced_path'] !== $storedPath) Storage::delete($payload['replaced_path']);
        unset($payload['replaced_path']);
        AuditService::record($request, 'subscription.payment_proof_submitted', 'subscription', $payload['subscription_id'], ['partner_id' => $partner->id, 'plan_code' => $planCode, 'amount' => $data['amount'], 'duration_months' => $plan['duration_months']]);
        User::where('role', 'admin')->pluck('id')->each(fn ($adminId) => NotificationService::send($adminId, 'subscription.payment_submitted', ['subscription_id' => $payload['subscription_id'], 'message' => 'A subscription payment proof requires review.']));
        if ($idempotencyKey !== '') DB::table('idempotency_keys')->updateOrInsert(['user_id' => $request->user()->id, 'key' => $idempotencyKey], ['request_hash' => $requestHash, 'response_status' => 201, 'response_body' => json_encode($payload, JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now()]);
        return response()->json($payload, 201);
    }

    public function downloadProof(Request $request, int $proof)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $record = DB::table('payment_proofs')->where('id', $proof)->firstOrFail();
        abort_unless(Storage::exists($record->file_path), 404);
        AuditService::record($request, 'payment_proof.downloaded', 'payment_proof', $record->id);
        return Storage::download($record->file_path);
    }

    public function downloadProofUrl(Request $request, int $proof): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        DB::table('payment_proofs')->where('id', $proof)->firstOrFail();
        return response()->json(['url' => URL::temporarySignedRoute('api.v1.payment-proof.download-signed', now()->addMinutes(5), ['proof' => $proof]), 'expires_at' => now()->addMinutes(5)->toIso8601String()]);
    }

    public function downloadProofSigned(Request $request, int $proof)
    {
        abort_unless($request->hasValidSignature(), 403);
        $record = DB::table('payment_proofs')->where('id', $proof)->firstOrFail();
        abort_unless(Storage::exists($record->file_path), 404);
        AuditService::record($request, 'payment_proof.signed_downloaded', 'payment_proof', $record->id);
        return Storage::download($record->file_path);
    }
}
