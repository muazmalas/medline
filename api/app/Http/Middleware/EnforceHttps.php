<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceHttps
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('medline.enforce_https', false) || $request->isSecure()) return $next($request);

        if ($request->is('api/*') || $request->expectsJson()) {
            return response()->json([
                'message' => 'HTTPS is required for this environment.',
                'code' => 'HTTPS_REQUIRED',
                'request_id' => $request->attributes->get('request_id'),
            ], 426, ['Upgrade' => 'TLS/1.2']);
        }

        return redirect()->secure($request->getRequestUri(), 308);
    }
}
