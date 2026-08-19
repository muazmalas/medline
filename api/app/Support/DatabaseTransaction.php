<?php

namespace App\Support;

use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

final class DatabaseTransaction
{
    public static function run(Closure $callback, ?int $attempts = null): mixed
    {
        $attempts ??= (int) config('medline.database_transaction_attempts', 3);

        try {
            return DB::transaction($callback, max(1, min(5, $attempts)));
        } catch (Throwable $exception) {
            if (self::isDeadlock($exception)) {
                Log::error('medline.database.deadlock_exhausted', [
                    'attempts' => $attempts,
                    'exception' => $exception::class,
                    'sql_state' => $exception instanceof QueryException ? $exception->errorInfo[0] ?? null : null,
                ]);
            }

            throw $exception;
        }
    }

    private static function isDeadlock(Throwable $exception): bool
    {
        if (! $exception instanceof QueryException) return false;
        $sqlState = (string) ($exception->errorInfo[0] ?? $exception->getCode());
        $driverCode = (string) ($exception->errorInfo[1] ?? '');
        return in_array($sqlState, ['40001', '40P01'], true) || in_array($driverCode, ['1205', '1213'], true);
    }
}
