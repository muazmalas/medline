<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use App\Contracts\MapProvider;
use App\Services\OpenStreetMapProvider;
use App\Contracts\FileScanner;
use App\Services\ClamAvFileScanner;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(MapProvider::class, OpenStreetMapProvider::class);
        $this->app->bind(FileScanner::class, ClamAvFileScanner::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('api', function (Request $request) {
            $identity = $request->user()?->id ?? $request->ip();
            return Limit::perMinute($request->user() ? 120 : 60)->by($identity . '|' . $request->ip());
        });

        RateLimiter::for('auth', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));
        RateLimiter::for('uploads', function (Request $request) {
            $identity = $request->user()?->id ?? $request->ip();
            return Limit::perMinute(10)->by('upload|' . $identity . '|' . $request->ip());
        });
        RateLimiter::for('mutations', function (Request $request) {
            $identity = $request->user()?->id ?? $request->ip();
            return Limit::perMinute(60)->by('mutation|' . $identity . '|' . $request->ip());
        });
        RateLimiter::for('location', function (Request $request) {
            $identity = $request->user()?->id ?? $request->ip();
            return Limit::perMinute(30)->by('location|' . $identity . '|' . $request->ip());
        });
    }
}
