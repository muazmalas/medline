<?php

namespace App\Services;

use App\Contracts\FileScanner;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

class ClamAvFileScanner implements FileScanner
{
    public function scan(UploadedFile $file): void
    {
        if (! config('medline.uploads.scan_enabled')) return;
        $command = trim((string) config('medline.uploads.scanner_command'));
        if ($command === '') throw ValidationException::withMessages(['file' => 'Secure file scanning is enabled but no scanner command is configured.']);
        if (! function_exists('exec')) throw ValidationException::withMessages(['file' => 'Secure file scanning is unavailable on this server.']);
        $output = [];
        $exitCode = 0;
        exec($command . ' --no-summary ' . escapeshellarg($file->getRealPath()), $output, $exitCode);
        if ($exitCode !== 0) throw ValidationException::withMessages(['file' => 'The uploaded file did not pass malware scanning.']);
    }
}
