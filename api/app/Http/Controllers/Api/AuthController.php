<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Models\RefreshToken;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Crypt;
use App\Support\AuditService;
use App\Support\NotificationService;
use App\Support\DatabaseTransaction;
use App\Contracts\FileScanner;
use Illuminate\Support\Facades\Storage;
use Throwable;

class AuthController extends Controller
{
    public function register(Request $request, FileScanner $scanner): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'email', 'max:180', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:32', 'unique:users,phone'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'role' => ['required', Rule::in(['patient', 'pharmacy', 'warehouse', 'driver'])],
            'business_name' => ['required_if:role,pharmacy,warehouse', 'nullable', 'string', 'max:180'],
            'license_number' => ['required_if:role,pharmacy,warehouse', 'nullable', 'string', 'max:120', 'unique:partners,license_number'],
            'address' => ['required_if:role,pharmacy,warehouse', 'nullable', 'string', 'max:1000'],
            'latitude' => ['required_if:role,pharmacy,warehouse', 'nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['required_if:role,pharmacy,warehouse', 'nullable', 'numeric', 'between:-180,180'],
            'payment_amount' => ['required_if:role,pharmacy,warehouse', 'nullable', 'numeric', 'min:0'],
            'payment_proof' => ['required_if:role,pharmacy,warehouse', 'nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
            'national_id' => ['required_if:role,driver', 'nullable', 'string', 'max:120', 'unique:drivers,national_id'],
            'vehicle_type' => ['required_if:role,driver', 'nullable', 'string', 'max:64'],
            'vehicle_plate' => ['required_if:role,driver', 'nullable', 'string', 'max:32'],
            'transport' => ['sometimes', 'in:bearer,cookie'],
        ]);

        $proofPath = null;
        if (in_array($data['role'], ['pharmacy', 'warehouse'], true)) {
            $planCode = 'annual_' . $data['role'];
            $plan = config('medline.subscription_plans.' . $planCode);
            abort_unless(is_array($plan), 422, 'The annual subscription plan is not configured.');
            if ($plan['amount'] !== null) {
                abort_unless(number_format((float) $data['payment_amount'], 2, '.', '') === number_format((float) $plan['amount'], 2, '.', ''), 422, 'The registration payment amount does not match the annual subscription plan.');
            }
            $scanner->scan($data['payment_proof']);
            $proofPath = $data['payment_proof']->store('private/payment-proofs');
        }

        try {
        $user = DatabaseTransaction::run(function () use ($data, $request, $proofPath) {
            $created = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'role' => $data['role'],
                'status' => in_array($data['role'], ['patient', 'driver'], true) ? 'pending' : 'active',
                'locale' => $request->string('locale', 'en')->toString() === 'ar' ? 'ar' : 'en',
                'password' => $data['password'],
            ]);

            if (in_array($created->role, ['pharmacy', 'warehouse'], true)) {
                $partner = Partner::create([
                    'user_id' => $created->id,
                    'type' => $created->role,
                    'business_name' => $data['business_name'],
                    'phone' => $created->phone,
                    'license_number' => $data['license_number'] ?? null,
                    'address' => $data['address'] ?? null,
                    'latitude' => $data['latitude'] ?? null,
                    'longitude' => $data['longitude'] ?? null,
                    'approval_status' => 'pending',
                    'subscription_status' => 'inactive',
                ]);
                $planCode = 'annual_' . $created->role;
                $plan = config('medline.subscription_plans.' . $planCode);
                $subscriptionId = DB::table('subscriptions')->insertGetId([
                    'partner_id' => $partner->id,
                    'plan_code' => $planCode,
                    'origin' => 'registration',
                    'status' => 'payment_under_review',
                    'amount' => $data['payment_amount'],
                    'duration_months' => $plan['duration_months'],
                    'starts_at' => null,
                    'ends_at' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                DB::table('payment_proofs')->insert([
                    'subscription_id' => $subscriptionId,
                    'submitted_by' => $created->id,
                    'file_path' => $proofPath,
                    'status' => 'under_review',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            if ($created->role === 'driver') {
                DB::table('drivers')->insert(['user_id' => $created->id, 'national_id' => $data['national_id'] ?? null, 'vehicle_type' => $data['vehicle_type'] ?? null, 'vehicle_plate' => $data['vehicle_plate'] ?? null, 'approval_status' => 'pending', 'is_available' => false, 'created_at' => now(), 'updated_at' => now()]);
            }
            return $created;
        });
        } catch (Throwable $exception) {
            if ($proofPath) Storage::delete($proofPath);
            throw $exception;
        }
        $this->sendVerification($user);
        User::where('role', 'admin')->pluck('id')->each(fn ($adminId) => NotificationService::send($adminId, 'registration.submitted', ['user_id' => $user->id, 'role' => $user->role, 'message' => 'A new ' . ($user->role === 'patient' ? 'customer' : $user->role) . ' application requires administrator approval.']));

        if (in_array($user->role, ['patient', 'driver'], true)) {
            return response()->json([
                'message' => 'Registration submitted. An administrator must approve your account before you can sign in.',
                'user' => $user,
            ], 201);
        }

        [$accessToken, $refreshToken] = $this->issueSessionTokens($user);

        return $this->withRefreshCookie(response()->json([
            'message' => 'Registration submitted successfully.',
            'user' => $user,
            'token' => $accessToken,
            ...(($data['transport'] ?? 'bearer') === 'cookie' ? [] : ['refresh_token' => $refreshToken]),
        ], 201), $refreshToken);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'transport' => ['sometimes', 'in:bearer,cookie'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            AuditService::record($request, 'auth.login_failed', User::class, $user?->id, ['email_hash' => hash('sha256', strtolower($data['email']))]);
            return response()->json([
                'message' => 'The provided credentials are incorrect.',
                'code' => 'AUTH_INVALID_CREDENTIALS',
            ], 422);
        }

        if ($user->status !== 'active') {
            return response()->json([
                'message' => $user->status === 'pending' ? 'Your account is awaiting administrator approval.' : 'This account is not active.',
                'code' => 'AUTH_ACCOUNT_INACTIVE',
            ], 403);
        }
        [$user, $token, $refreshToken] = DatabaseTransaction::run(function () use ($user) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === 'active', 403, 'This account is not active.');
            [$accessToken, $newRefreshToken] = $this->issueSessionTokens($locked);
            return [$locked, $accessToken, $newRefreshToken];
        });

        $response = response()->json([
            'user' => $user,
            'token' => $token,
            ...(($data['transport'] ?? 'bearer') === 'cookie' ? [] : ['refresh_token' => $refreshToken]),
        ]);
        return $this->withRefreshCookie($response, $refreshToken);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        $user = User::where('email', $data['email'])->first();

        if ($user) {
            $plainToken = Str::random(64);
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => hash('sha256', $plainToken), 'created_at' => now()],
            );
            try {
                Mail::raw('Use this MedLine password reset token within 60 minutes: ' . $plainToken, function ($message) use ($user) {
                    $message->to($user->email)->subject('MedLine password reset');
                });
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return response()->json(['message' => 'If the account exists, password recovery instructions have been sent.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string', 'size:64'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);
        $user = DatabaseTransaction::run(function () use ($data) {
            $record = DB::table('password_reset_tokens')->where('email', $data['email'])->lockForUpdate()->first();
            abort_unless($record && $record->created_at && now()->diffInMinutes($record->created_at) <= 60 && hash_equals($record->token, hash('sha256', $data['token'])), 422, 'The password reset token is invalid or expired.');
            $lockedUser = User::where('email', $data['email'])->lockForUpdate()->firstOrFail();
            $lockedUser->update(['password' => $data['password']]);
            $lockedUser->tokens()->delete();
            RefreshToken::where('user_id', $lockedUser->id)->update(['revoked_at' => now(), 'updated_at' => now()]);
            DB::table('password_reset_tokens')->where('email', $data['email'])->delete();
            return $lockedUser->fresh();
        });

        return response()->json(['message' => 'Password reset successfully.']);
    }

    public function verifyEmail(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'token' => ['required', 'string', 'size:64']]);
        DatabaseTransaction::run(function () use ($data) {
            $record = DB::table('email_verification_tokens')->where('email', $data['email'])->lockForUpdate()->first();
            abort_unless($record && $record->created_at && now()->diffInHours($record->created_at) <= 24 && hash_equals($record->token, hash('sha256', $data['token'])), 422, 'The email verification token is invalid or expired.');
            $user = User::where('email', $data['email'])->lockForUpdate()->firstOrFail();
            $user->update(['email_verified_at' => now(), 'updated_at' => now()]);
            DB::table('email_verification_tokens')->where('email', $data['email'])->delete();
        });
        return response()->json(['message' => 'Email address verified successfully.']);
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->email_verified_at) $this->sendVerification($user);
        return response()->json(['message' => 'If the account needs verification, instructions have been sent.']);
    }

    private function sendVerification(User $user): void
    {
        if ($user->email_verified_at) return;
        $plainToken = Str::random(64);
        DB::table('email_verification_tokens')->updateOrInsert(['email' => $user->email], ['token' => hash('sha256', $plainToken), 'created_at' => now()]);
        $url = rtrim((string) config('app.url'), '/') . '/api/v1/auth/verify-email?email=' . urlencode($user->email) . '&token=' . urlencode($plainToken);
        try {
            Mail::raw('Verify your MedLine email address within 24 hours: ' . $url, function ($message) use ($user) {
                $message->to($user->email)->subject('Verify your MedLine email address');
            });
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['sometimes', 'string', 'min:2', 'max:120'], 'phone' => ['sometimes', 'nullable', 'string', 'max:32', 'unique:users,phone,' . $request->user()->id], 'locale' => ['sometimes', 'in:ar,en']]);
        $request->user()->update($data);
        return response()->json(['message' => 'Profile updated.', 'user' => $request->user()->fresh()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $data = $request->validate(['refresh_token' => ['sometimes', 'nullable', 'string', 'min:40', 'max:255']]);
        $refreshCredential = $data['refresh_token'] ?? $request->cookie(config('medline.refresh_cookie_name', 'medline_refresh'));
        $request->user()->currentAccessToken()?->delete();
        if (! empty($refreshCredential)) {
            RefreshToken::where('user_id', $request->user()->id)
                ->where('token_hash', hash('sha256', $refreshCredential))
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now(), 'updated_at' => now()]);
        }

        return response()->json(['message' => 'Logged out successfully.'])->withoutCookie(config('medline.refresh_cookie_name', 'medline_refresh'));
    }

    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate(['refresh_token' => ['sometimes', 'nullable', 'string', 'min:40', 'max:255']]);
        $refreshCredential = $data['refresh_token'] ?? $request->cookie(config('medline.refresh_cookie_name', 'medline_refresh'));
        abort_unless(is_string($refreshCredential) && $refreshCredential !== '', 401, 'A refresh token is required.');
        [$user, $token, $refreshToken] = DatabaseTransaction::run(function () use ($refreshCredential) {
            $hash = hash('sha256', $refreshCredential);
            $current = RefreshToken::where('token_hash', $hash)->lockForUpdate()->first();
            abort_unless($current && ! $current->revoked_at && $current->expires_at->isFuture(), 401, 'The refresh token is invalid or expired.');
            $locked = User::whereKey($current->user_id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === 'active', 403, 'This account is not active.');
            [$replacement, $newRefreshToken, $newRefreshHash] = $this->issueSessionTokens($locked, true);
            $current->update(['revoked_at' => now(), 'last_used_at' => now(), 'replaced_by_hash' => $newRefreshHash]);
            return [$locked->fresh(), $replacement, $newRefreshToken];
        });

        $response = response()->json([
            'user' => $user,
            'token' => $token,
            ...($request->filled('refresh_token') ? ['refresh_token' => $refreshToken] : []),
        ]);
        return $this->withRefreshCookie($response, $refreshToken);
    }

    private function withRefreshCookie(JsonResponse $response, string $refreshToken): JsonResponse
    {
        return $response->withCookie(cookie(
            config('medline.refresh_cookie_name', 'medline_refresh'),
            $refreshToken,
            (int) config('medline.refresh_token_expiration_days', 30) * 1440,
            '/',
            config('session.domain'),
            (bool) config('medline.enforce_https'),
            true,
            false,
            'lax',
        ));
    }

    /** @return array{0: string, 1: string, 2?: string} */
    private function issueSessionTokens(User $user, bool $includeHash = false): array
    {
        $plainRefreshToken = Str::random(80);
        $refreshHash = hash('sha256', $plainRefreshToken);
        $user->refreshTokens()->create([
            'token_hash' => $refreshHash,
            'expires_at' => now()->addDays((int) config('medline.refresh_token_expiration_days', 30)),
        ]);
        $accessToken = $user->createToken('medline-client', ['*'], now()->addMinutes((int) config('sanctum.expiration', 10080)))->plainTextToken;

        return $includeHash ? [$accessToken, $plainRefreshToken, $refreshHash] : [$accessToken, $plainRefreshToken];
    }

    public function twoFactorSetup(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        abort_if($request->user()->two_factor_enabled, 409, 'Disable existing two-factor authentication before generating a new secret.');
        $secret = $this->base32Encode(random_bytes(20));
        $request->user()->update(['two_factor_secret' => Crypt::encryptString($secret), 'two_factor_enabled' => false, 'two_factor_confirmed_at' => null]);
        $label = rawurlencode('MedLine:' . $request->user()->email);
        return response()->json(['secret' => $secret, 'otpauth_uri' => 'otpauth://totp/' . $label . '?secret=' . $secret . '&issuer=MedLine']);
    }

    public function twoFactorStatus(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        return response()->json(['enabled' => (bool) $request->user()->two_factor_enabled]);
    }

    public function twoFactorConfirm(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['code' => ['required', 'digits:6']]);
        $user = $request->user();
        abort_unless($user->two_factor_secret && $this->validTotp(Crypt::decryptString($user->two_factor_secret), $data['code']), 422, 'The two-factor code is invalid.');
        $user->update(['two_factor_enabled' => true, 'two_factor_confirmed_at' => now()]);
        return response()->json(['message' => 'Administrator two-factor authentication enabled.']);
    }

    public function twoFactorDisable(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['code' => ['required', 'digits:6']]);
        $user = $request->user();
        abort_unless($user->two_factor_enabled && $user->two_factor_secret && $this->validTotp(Crypt::decryptString($user->two_factor_secret), $data['code']), 422, 'The two-factor code is invalid.');
        $user->update(['two_factor_secret' => null, 'two_factor_enabled' => false, 'two_factor_confirmed_at' => null]);
        return response()->json(['message' => 'Administrator two-factor authentication disabled.']);
    }

    private function validTotp(string $secret, string $code): bool
    {
        $counter = intdiv(time(), 30);
        for ($offset = -1; $offset <= 1; $offset++) {
            $binaryCounter = pack('N2', ($counter + $offset) >> 32, ($counter + $offset) & 0xffffffff);
            $hash = hash_hmac('sha1', $binaryCounter, $this->base32Decode($secret), true);
            $position = ord($hash[19]) & 0x0f;
            $value = ((ord($hash[$position]) & 0x7f) << 24) | ((ord($hash[$position + 1]) & 0xff) << 16) | ((ord($hash[$position + 2]) & 0xff) << 8) | (ord($hash[$position + 3]) & 0xff);
            if (hash_equals(str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT), $code)) return true;
        }
        return false;
    }

    private function base32Encode(string $input): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $buffer = 0; $bits = 0; $output = '';
        foreach (unpack('C*', $input) as $byte) { $buffer = ($buffer << 8) | $byte; $bits += 8; while ($bits >= 5) { $bits -= 5; $output .= $alphabet[($buffer >> $bits) & 31]; } }
        if ($bits > 0) $output .= $alphabet[($buffer << (5 - $bits)) & 31];
        return $output;
    }

    private function base32Decode(string $input): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $buffer = 0; $bits = 0; $output = '';
        foreach (str_split(strtoupper(rtrim($input, '='))) as $character) { $value = strpos($alphabet, $character); if ($value === false) continue; $buffer = ($buffer << 5) | $value; $bits += 5; if ($bits >= 8) { $bits -= 8; $output .= chr(($buffer >> $bits) & 255); } }
        return $output;
    }
}
