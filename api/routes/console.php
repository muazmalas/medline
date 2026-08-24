<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use App\Support\NotificationService;
use App\Services\DeliveryPricingService;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('medline:subscriptions-maintain', function () {
    $today = now()->toDateString();
    $reminderDate = now()->addDays(30)->toDateString();
    $expiring = DB::table('subscriptions')->where('status', 'active')->whereDate('ends_at', '>', $today)->whereDate('ends_at', '<=', $reminderDate)->get();
    foreach ($expiring as $subscription) {
        $transitioned = DB::table('subscriptions')->where('id', $subscription->id)->where('status', 'active')->update(['status' => 'expiring_soon', 'updated_at' => now()]);
        if (! $transitioned) continue;
        $userId = DB::table('partners')->where('id', $subscription->partner_id)->value('user_id');
        if ($userId && ! DB::table('notifications')->where('notifiable_id', $userId)->where('type', 'subscription.expiring_soon')->where('data', 'like', '%"subscription_id":' . $subscription->id . '%')->whereDate('created_at', $today)->exists()) {
            NotificationService::send($userId, 'subscription.expiring_soon', ['subscription_id' => $subscription->id, 'message' => 'Your MedLine subscription expires soon.']);
        }
    }
    $expired = DB::table('subscriptions')->whereIn('status', ['active', 'expiring_soon'])->whereDate('ends_at', '<', $today)->get();
    foreach ($expired as $subscription) {
        $transitioned = DB::table('subscriptions')->where('id', $subscription->id)->whereIn('status', ['active', 'expiring_soon'])->update(['status' => 'expired', 'updated_at' => now()]);
        if (! $transitioned) continue;
        DB::table('partners')->where('id', $subscription->partner_id)->update(['subscription_status' => 'inactive', 'updated_at' => now()]);
        $userId = DB::table('partners')->where('id', $subscription->partner_id)->value('user_id');
        if ($userId) NotificationService::send($userId, 'subscription.expired', ['subscription_id' => $subscription->id, 'message' => 'Your MedLine subscription has expired.']);
    }
    $this->info('Subscription maintenance completed.');
})->purpose('Mark subscriptions expiring or expired and notify affected partners');

Schedule::command('medline:subscriptions-maintain')->dailyAt('01:00');

Artisan::command('medline:deliveries-release-stale', function () {
    $cutoff = now()->subMinutes((int) config('medline.delivery_claim_timeout_minutes', 30));
    $stale = DB::table('deliveries')->where('status', 'claimed')->whereNotNull('claimed_at')->where('claimed_at', '<', $cutoff)->get();
    foreach ($stale as $delivery) {
        DB::transaction(function () use ($delivery) {
            $row = DB::table('deliveries')->where('id', $delivery->id)->lockForUpdate()->first();
            if (! $row || $row->status !== 'claimed') return;
            DB::table('deliveries')->where('id', $row->id)->update(['driver_id' => null, 'status' => 'available', 'claimed_at' => null, 'failure_reason' => 'Claim timed out and was released.', 'updated_at' => now()]);
            DB::table('delivery_events')->insert(['delivery_id' => $row->id, 'actor_id' => null, 'from_status' => 'claimed', 'to_status' => 'reassigned', 'note' => 'Claim timeout', 'created_at' => now(), 'updated_at' => now()]);
        });
    }
    $this->info('Released ' . $stale->count() . ' stale delivery claims.');
})->purpose('Release delivery claims abandoned past the configured timeout');

Schedule::command('medline:deliveries-release-stale')->everyFiveMinutes();

Artisan::command('medline:idempotency-prune', function () {
    $cutoff = now()->subDays((int) config('medline.idempotency_retention_days', 7));
    $deleted = DB::table('idempotency_keys')->where('created_at', '<', $cutoff)->delete();
    $this->info("Pruned {$deleted} expired idempotency keys.");
})->purpose('Remove idempotency records beyond the configured retry-retention window');

Schedule::command('medline:idempotency-prune')->dailyAt('03:00');

Artisan::command('medline:notification-attempts-prune', function () {
    $cutoff = now()->subDays((int) config('medline.notification_attempt_retention_days', 90));
    $attempts = DB::table('notification_delivery_attempts')->where('attempted_at', '<', $cutoff)->delete();
    $claims = DB::table('notification_delivery_claims')->where('updated_at', '<', $cutoff)->delete();
    $this->info("Pruned {$attempts} notification attempts and {$claims} delivery claims.");
})->purpose('Prune notification delivery operational history beyond the configured retention window');

Schedule::command('medline:notification-attempts-prune')->dailyAt('03:15');

Artisan::command('medline:auth-artifacts-prune', function () {
    $now = now();
    $expiredTokens = DB::table('personal_access_tokens')->whereNotNull('expires_at')->where('expires_at', '<', $now)->delete();
    $resetTokens = DB::table('password_reset_tokens')->where('created_at', '<', $now->copy()->subHour())->delete();
    $verificationTokens = DB::table('email_verification_tokens')->where('created_at', '<', $now->copy()->subDay())->delete();
    $refreshTokens = DB::table('refresh_tokens')->where(function ($query) use ($now) {
        $query->where('expires_at', '<', $now)->orWhere(function ($revoked) use ($now) {
            $revoked->whereNotNull('revoked_at')->where('revoked_at', '<', $now->copy()->subDays(30));
        });
    })->delete();
    $this->info("Pruned {$expiredTokens} expired access tokens, {$refreshTokens} refresh tokens, {$resetTokens} password-reset tokens, and {$verificationTokens} email-verification tokens.");
})->purpose('Remove expired bearer tokens and short-lived authentication artifacts');

Schedule::command('medline:auth-artifacts-prune')->dailyAt('03:30');

Artisan::command('medline:routes:backfill {--force : Recalculate routes that already have a snapshot}', function () {
    /** @var DeliveryPricingService $pricing */
    $pricing = app(DeliveryPricingService::class);
    $force = (bool) $this->option('force');
    $updated = 0;
    $failed = 0;
    $skipped = 0;

    $orders = DB::table('orders')
        ->join('partners as pharmacies', 'pharmacies.id', '=', 'orders.pharmacy_id')
        ->leftJoin('addresses', 'addresses.id', '=', 'orders.address_id')
        ->when(! $force, fn ($query) => $query->whereNull('orders.delivery_route_geometry'))
        ->select(
            'orders.id', 'orders.public_id', 'orders.subtotal', 'orders.tax_amount', 'orders.delivery_pricing_rate_id',
            'orders.delivery_rate_per_km', 'orders.delivery_vehicle_type',
            'pharmacies.latitude as from_latitude', 'pharmacies.longitude as from_longitude',
            DB::raw('COALESCE(orders.delivery_latitude, addresses.latitude) as to_latitude'),
            DB::raw('COALESCE(orders.delivery_longitude, addresses.longitude) as to_longitude'),
        )
        ->orderBy('orders.id')
        ->get();

    foreach ($orders as $order) {
        if ($order->from_latitude === null || $order->from_longitude === null || $order->to_latitude === null || $order->to_longitude === null) {
            $this->warn("Skipped {$order->public_id}: route coordinates are incomplete.");
            $skipped++;
            continue;
        }

        try {
            $rate = $order->delivery_rate_per_km !== null
                ? (object) ['id' => $order->delivery_pricing_rate_id, 'rate_per_km' => (float) $order->delivery_rate_per_km]
                : $pricing->current($order->delivery_vehicle_type);
            $estimate = $pricing->estimate((float) $order->from_latitude, (float) $order->from_longitude, (float) $order->to_latitude, (float) $order->to_longitude, $rate);
            DB::table('orders')->where('id', $order->id)->update([
                'delivery_distance_km' => $estimate['distance_km'],
                'delivery_rate_per_km' => $estimate['rate_per_km'],
                'delivery_fee' => $estimate['fee'],
                'delivery_route_geometry' => json_encode($estimate['route_geometry'], JSON_THROW_ON_ERROR),
                'delivery_route_duration_seconds' => $estimate['route_duration_seconds'],
                'delivery_route_provider' => $estimate['route_provider'],
                'total' => (float) $order->subtotal + (float) $order->tax_amount + $estimate['fee'],
                'updated_at' => now(),
            ]);
            $updated++;
        } catch (Throwable $exception) {
            report($exception);
            $this->warn("Skipped {$order->public_id}: the road route provider was unavailable.");
            $failed++;
        }
    }

    $procurements = DB::table('procurement_orders')
        ->join('partners as warehouses', 'warehouses.id', '=', 'procurement_orders.warehouse_id')
        ->join('partners as pharmacies', 'pharmacies.id', '=', 'procurement_orders.pharmacy_id')
        ->when(! $force, fn ($query) => $query->whereNull('procurement_orders.delivery_route_geometry'))
        ->select(
            'procurement_orders.id', 'procurement_orders.public_id', 'procurement_orders.status', 'procurement_orders.subtotal',
            'procurement_orders.delivery_pricing_rate_id', 'procurement_orders.delivery_rate_per_km', 'procurement_orders.delivery_vehicle_type',
            'warehouses.latitude as from_latitude', 'warehouses.longitude as from_longitude',
            'pharmacies.latitude as to_latitude', 'pharmacies.longitude as to_longitude',
        )
        ->orderBy('procurement_orders.id')
        ->get();

    foreach ($procurements as $order) {
        if ($order->from_latitude === null || $order->from_longitude === null || $order->to_latitude === null || $order->to_longitude === null) {
            $this->warn("Skipped {$order->public_id}: route coordinates are incomplete.");
            $skipped++;
            continue;
        }

        try {
            $rate = $order->delivery_rate_per_km !== null
                ? (object) ['id' => $order->delivery_pricing_rate_id, 'rate_per_km' => (float) $order->delivery_rate_per_km]
                : $pricing->current($order->delivery_vehicle_type);
            $estimate = $pricing->estimate((float) $order->from_latitude, (float) $order->from_longitude, (float) $order->to_latitude, (float) $order->to_longitude, $rate);
            $zeroTotalStatuses = ['rejected', 'cancelled', 'partial_offer_rejected'];
            DB::table('procurement_orders')->where('id', $order->id)->update([
                'delivery_distance_km' => $estimate['distance_km'],
                'delivery_rate_per_km' => $estimate['rate_per_km'],
                'delivery_fee' => $estimate['fee'],
                'delivery_route_geometry' => json_encode($estimate['route_geometry'], JSON_THROW_ON_ERROR),
                'delivery_route_duration_seconds' => $estimate['route_duration_seconds'],
                'delivery_route_provider' => $estimate['route_provider'],
                'total' => in_array($order->status, $zeroTotalStatuses, true) ? 0 : (float) $order->subtotal + $estimate['fee'],
                'updated_at' => now(),
            ]);
            $updated++;
        } catch (Throwable $exception) {
            report($exception);
            $this->warn("Skipped {$order->public_id}: the road route provider was unavailable.");
            $failed++;
        }
    }

    $this->info("Stored {$updated} authoritative road route snapshot(s). Skipped: {$skipped}. Failed: {$failed}.");
    return $failed > 0 ? 1 : 0;
})->purpose('Backfill stored road geometry, distance, duration, and route-based delivery fees');
