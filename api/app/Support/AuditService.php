<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuditService
{
    public static function record(Request $request, string $action, string $auditableType, int|string|null $auditableId = null, array $metadata = []): void
    {
        $metadata = ['request_id' => $request->attributes->get('request_id'), ...$metadata];
        DB::table('audit_logs')->insert([
            'actor_id' => $request->user()?->id,
            'action' => $action,
            'auditable_type' => $auditableType,
            'auditable_id' => $auditableId,
            'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR),
            'ip_address' => $request->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
