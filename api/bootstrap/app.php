<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\AttachRequestId;
use App\Http\Middleware\ValidateIdempotencyKey;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\EnforceHttps;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Contracts\Debug\ShouldntReport;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(AttachRequestId::class);
        $middleware->append(EnforceHttps::class);
        $middleware->append(SecurityHeaders::class);
        $middleware->alias(['idempotency' => ValidateIdempotencyKey::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (Throwable $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($exception instanceof ValidationException) {
                return response()->json([
                    'message' => 'The submitted data is invalid.',
                    'code' => 'VALIDATION_FAILED',
                    'errors' => $exception->errors(),
                    'request_id' => $request->attributes->get('request_id'),
                ], 422);
            }

            if ($exception instanceof AuthenticationException) {
                return response()->json(['message' => 'Authentication is required.', 'code' => 'AUTHENTICATION_REQUIRED', 'request_id' => $request->attributes->get('request_id')], 401);
            }

            if ($exception instanceof AuthorizationException) {
                return response()->json(['message' => 'You are not authorized for this action.', 'code' => 'AUTHORIZATION_FAILED', 'request_id' => $request->attributes->get('request_id')], 403);
            }

            $status = $exception instanceof HttpExceptionInterface ? $exception->getStatusCode() : 500;
            $safeMessage = app()->environment('production') ? 'An unexpected server error occurred.' : $exception->getMessage();

            if (! $exception instanceof ShouldntReport) {
                report($exception);
            }

            return response()->json(['message' => $safeMessage, 'code' => $status >= 500 ? 'API_INTERNAL_ERROR' : 'API_REQUEST_FAILED', 'request_id' => $request->attributes->get('request_id')], $status);
        });
    })->create();
