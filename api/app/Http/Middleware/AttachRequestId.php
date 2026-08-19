<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AttachRequestId
{
    public function handle(Request $request, Closure $next)
    {
        $incoming = (string) $request->header('X-Request-ID', '');
        $requestId = preg_match('/^[A-Za-z0-9._:-]{1,100}$/', $incoming) ? $incoming : (string) Str::uuid();
        $request->attributes->set('request_id', $requestId);

        $response = $next($request);
        $response->headers->set('X-Request-ID', $requestId);

        return $response;
    }
}
