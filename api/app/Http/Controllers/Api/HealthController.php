<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

class HealthController extends Controller
{
    public function ready(): JsonResponse
    {
        $checks = ['database' => false, 'storage' => false, 'queue' => false, 'upload_scanner' => true];

        $queueConnection = (string) config('queue.default');
        $configuredQueues = config('queue.connections', []);
        $checks['queue'] = isset($configuredQueues[$queueConnection]) && (app()->environment('local', 'testing') || $queueConnection !== 'sync');

        try {
            DB::select('select 1');
            $checks['database'] = true;
        } catch (Throwable) {
            // The response intentionally contains no connection details.
        }

        try {
            $disk = Storage::disk(config('filesystems.default'));
            $disk->getDriver();
            $root = $disk->getConfig()['root'] ?? null;
            $checks['storage'] = $root === null || (is_dir($root) && is_writable($root));
        } catch (Throwable) {
            // The response intentionally contains no filesystem details.
        }

        if (config('medline.uploads.scan_enabled')) {
            $command = trim((string) config('medline.uploads.scanner_command'));
            if ($command === '' || ! function_exists('exec')) {
                $checks['upload_scanner'] = false;
            } else {
                $output = [];
                $exitCode = 1;
                @exec($command . ' --version', $output, $exitCode);
                $checks['upload_scanner'] = $exitCode === 0;
            }
        }

        $ready = ! in_array(false, $checks, true);
        $response = response()->json([
            'status' => $ready ? 'ready' : 'not_ready',
            'service' => 'medline-api',
            'checks' => $checks,
            'timestamp' => now()->toIso8601String(),
        ], $ready ? 200 : 503);
        if (! $ready) $response->header('Retry-After', '30');
        return $response;
    }
}
