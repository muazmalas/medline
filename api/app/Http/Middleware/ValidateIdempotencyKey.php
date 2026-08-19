<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

class ValidateIdempotencyKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->header('Idempotency-Key');
        if ($key !== null && ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/', $key)) {
            return response()->json([
                'message' => 'The Idempotency-Key header must contain 1 to 128 safe characters.',
                'code' => 'INVALID_IDEMPOTENCY_KEY',
                'request_id' => $request->attributes->get('request_id'),
            ], 422);
        }

        if ($key === null || ! $request->user() || ! in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return $next($request);

        $userId = $request->user()->id;
        $requestHash = $this->requestHash($request);
        $existing = DB::table('idempotency_keys')->where('user_id', $userId)->where('key', $key)->first();
        if ($existing && $this->releaseStaleReservation($existing, $userId, $key)) $existing = null;
        if ($existing) return $this->resolveExisting($existing, $requestHash, $request);

        $inserted = DB::table('idempotency_keys')->insertOrIgnore([
            'user_id' => $userId,
            'key' => $key,
            'request_hash' => $requestHash,
            'response_status' => null,
            'response_body' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        if ($inserted === 0) {
            $existing = DB::table('idempotency_keys')->where('user_id', $userId)->where('key', $key)->first();
            if ($existing && $this->releaseStaleReservation($existing, $userId, $key)) $existing = null;
            if ($existing) return $this->resolveExisting($existing, $requestHash, $request);
        }

        $request->attributes->set('idempotency_reserved', true);
        $request->attributes->set('idempotency_request_hash', $requestHash);
        try {
            $response = $next($request);
        } catch (\Throwable $exception) {
            DB::table('idempotency_keys')->where('user_id', $userId)->where('key', $key)->whereNull('response_status')->delete();
            throw $exception;
        }
        $record = DB::table('idempotency_keys')->where('user_id', $userId)->where('key', $key)->first();
        if ($response->getStatusCode() >= 400) {
            DB::table('idempotency_keys')->where('user_id', $userId)->where('key', $key)->whereNull('response_status')->delete();
        } elseif ($record && $record->response_status === null) {
            $body = json_decode($response->getContent(), true);
            if (is_array($body)) DB::table('idempotency_keys')->where('user_id', $userId)->where('key', $key)->update(['request_hash' => $requestHash, 'response_status' => $response->getStatusCode(), 'response_body' => json_encode($body, JSON_THROW_ON_ERROR), 'updated_at' => now()]);
            else DB::table('idempotency_keys')->where('user_id', $userId)->where('key', $key)->delete();
        }
        return $response;
    }

    private function releaseStaleReservation(object $existing, int $userId, string $key): bool
    {
        if ($existing->response_status !== null) return false;
        $cutoff = now()->subSeconds((int) config('medline.idempotency_in_progress_timeout_seconds', 900));
        if ($existing->updated_at !== null && Carbon::parse($existing->updated_at)->greaterThanOrEqualTo($cutoff)) return false;
        return DB::table('idempotency_keys')->where('id', $existing->id)->where('user_id', $userId)->where('key', $key)->whereNull('response_status')->where('updated_at', '<', $cutoff)->delete() === 1;
    }

    private function requestHash(Request $request): string
    {
        if ($request->isJson()) return hash('sha256', $request->getContent());

        $payload = $request->except(array_keys($request->allFiles()));
        $files = [];
        foreach ($request->allFiles() as $field => $file) {
            $files[$field] = $this->fileFingerprint($file);
        }
        ksort($payload);
        ksort($files);
        return hash('sha256', json_encode(['fields' => $payload, 'files' => $files], JSON_THROW_ON_ERROR));
    }

    private function fileFingerprint(mixed $file): mixed
    {
        if (is_array($file)) return array_map(fn (mixed $item) => $this->fileFingerprint($item), $file);
        if (! $file instanceof \Illuminate\Http\UploadedFile) return (string) $file;
        $path = $file->getRealPath();
        return ['name' => $file->getClientOriginalName(), 'size' => $file->getSize(), 'hash' => $path && is_file($path) ? hash_file('sha256', $path) : null];
    }

    private function resolveExisting(object $existing, string $requestHash, Request $request): Response
    {
        if ($existing->request_hash !== $requestHash) {
            return response()->json(['message' => 'The idempotency key was already used with a different request.', 'code' => 'IDEMPOTENCY_KEY_REUSED', 'request_id' => $request->attributes->get('request_id')], 409);
        }
        if ($existing->response_status === null) {
            return response()->json(['message' => 'An identical request is already being processed.', 'code' => 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'request_id' => $request->attributes->get('request_id')], 409)->header('Retry-After', '2');
        }
        return response()->json(json_decode($existing->response_body, true), (int) $existing->response_status)->header('Idempotency-Replayed', 'true');
    }
}
