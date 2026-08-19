<?php

namespace App\Contracts;

use Illuminate\Http\UploadedFile;

interface FileScanner
{
    public function scan(UploadedFile $file): void;
}
