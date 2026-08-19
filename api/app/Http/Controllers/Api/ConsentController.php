<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\DatabaseTransaction;

class ConsentController extends Controller
{
    private const TYPES = ['terms_of_service', 'privacy_policy', 'marketing'];

    public function index(Request $request): JsonResponse
    {
        return response()->json(['current_policy_version' => config('medline.privacy.policy_version'), 'data' => DB::table('user_consents')->where('user_id', $request->user()->id)->whereNull('revoked_at')->orderBy('consent_type')->get(['consent_type', 'policy_version', 'consented_at'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['consent_type' => ['required', 'string', 'in:' . implode(',', self::TYPES)], 'policy_version' => ['required', 'string', 'max:32'], 'consented' => ['required', 'accepted']]);
        $id = DatabaseTransaction::run(function () use ($request, $data) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            DB::table('user_consents')->where('user_id', $request->user()->id)->where('consent_type', $data['consent_type'])->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
            return DB::table('user_consents')->insertGetId(['user_id' => $request->user()->id, 'consent_type' => $data['consent_type'], 'policy_version' => config('medline.privacy.policy_version'), 'consented_at' => now(), 'ip_address' => $request->ip(), 'user_agent' => substr((string) $request->userAgent(), 0, 65535), 'created_at' => now(), 'updated_at' => now()]);
        });
        AuditService::record($request, 'privacy.consent_granted', 'user_consent', $id, ['consent_type' => $data['consent_type'], 'policy_version' => $data['policy_version']]);
        return response()->json(['message' => 'Consent recorded.', 'consent_type' => $data['consent_type'], 'policy_version' => config('medline.privacy.policy_version')], 201);
    }

    public function revoke(Request $request, string $consentType): JsonResponse
    {
        abort_unless(in_array($consentType, self::TYPES, true), 404);
        $updated = DatabaseTransaction::run(function () use ($request, $consentType) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            return DB::table('user_consents')->where('user_id', $request->user()->id)->where('consent_type', $consentType)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
        });
        AuditService::record($request, 'privacy.consent_revoked', 'user_consent', null, ['consent_type' => $consentType]);
        return response()->json(['message' => $updated ? 'Consent revoked.' : 'No active consent was found.']);
    }
}
