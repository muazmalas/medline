<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Support\AuditService;
use App\Support\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use App\Contracts\FileScanner;
use App\Support\DatabaseTransaction;

class VerificationDocumentController extends Controller
{
    public function mine(Request $request): JsonResponse
    {
        return response()->json(['data' => DB::table('verification_documents')->where('user_id', $request->user()->id)->select('id', 'document_type', 'status', 'review_note', 'reviewed_at', 'created_at')->latest()->get()]);
    }

    public function store(Request $request, FileScanner $scanner): JsonResponse
    {
        $user = $request->user();
        abort_unless(in_array($user->role, ['pharmacy', 'warehouse', 'driver'], true), 403);
        $partner = in_array($user->role, ['pharmacy', 'warehouse'], true) ? Partner::where('user_id', $user->id)->firstOrFail() : null;
        $driver = $user->role === 'driver' ? DB::table('drivers')->where('user_id', $user->id)->firstOrFail() : null;
        $data = $request->validate(['document_type' => ['required', 'string', 'max:64'], 'document' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240']]);
        $scanner->scan($data['document']);
        $path = $data['document']->store('private/verification-documents');
        try {
            $id = DatabaseTransaction::run(function () use ($data, $user, $partner, $driver, $path) {
                DB::table('users')->where('id', $user->id)->lockForUpdate()->firstOrFail();
                $duplicate = DB::table('verification_documents')->where('user_id', $user->id)->where('document_type', $data['document_type'])->where('status', 'under_review')->lockForUpdate()->exists();
                abort_unless(! $duplicate, 409, 'A document of this type is already awaiting review.');
                return DB::table('verification_documents')->insertGetId(['user_id' => $user->id, 'partner_id' => $partner?->id, 'driver_id' => $driver?->id, 'document_type' => $data['document_type'], 'file_path' => $path, 'status' => 'under_review', 'created_at' => now(), 'updated_at' => now()]);
            });
        } catch (\Throwable $exception) {
            if ($path) Storage::delete($path);
            throw $exception;
        }
        AuditService::record($request, 'verification_document.submitted', 'verification_document', $id, ['document_type' => $data['document_type']]);
        return response()->json(['message' => 'Verification document submitted for review.', 'document_id' => $id], 201);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $documents = DB::table('verification_documents')->join('users', 'users.id', '=', 'verification_documents.user_id')->select('verification_documents.id', 'verification_documents.document_type', 'verification_documents.status', 'verification_documents.review_note', 'verification_documents.created_at', 'users.name', 'users.email', 'users.role')->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('verification_documents.status', $request->string('status')->toString()))->latest('verification_documents.created_at')->paginate(min($request->integer('per_page', 30), 100));
        return response()->json($documents);
    }

    public function decide(Request $request, int $document): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['decision' => ['required', 'in:approve,reject,correction'], 'note' => ['nullable', 'string', 'max:1000']]);
        $status = match ($data['decision']) { 'approve' => 'approved', 'reject' => 'rejected', default => 'correction_required' };
        $record = DatabaseTransaction::run(function () use ($document, $status, $data, $request) {
            $locked = DB::table('verification_documents')->where('id', $document)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === 'under_review', 409, 'This verification document has already been reviewed.');
            DB::table('verification_documents')->where('id', $document)->update(['status' => $status, 'reviewed_by' => $request->user()->id, 'review_note' => $data['note'] ?? null, 'reviewed_at' => now(), 'updated_at' => now()]);
            return $locked;
        });
        NotificationService::send($record->user_id, 'verification_document.' . $status, ['document_id' => $document, 'message' => 'Your verification document review was updated.']);
        AuditService::record($request, 'verification_document.' . $data['decision'], 'verification_document', $document, ['note' => $data['note'] ?? null]);
        return response()->json(['message' => 'Verification document decision saved.']);
    }

    public function download(Request $request, int $document)
    {
        $record = DB::table('verification_documents')->where('id', $document)->firstOrFail();
        abort_unless($request->user()->role === 'admin' || $record->user_id === $request->user()->id, 403);
        abort_unless(Storage::exists($record->file_path), 404);
        AuditService::record($request, 'verification_document.downloaded', 'verification_document', $document);
        return Storage::download($record->file_path);
    }

    public function downloadUrl(Request $request, int $document): JsonResponse
    {
        $record = DB::table('verification_documents')->where('id', $document)->firstOrFail();
        abort_unless($request->user()->role === 'admin' || $record->user_id === $request->user()->id, 403);
        return response()->json(['url' => URL::temporarySignedRoute('api.v1.verification-document.download-signed', now()->addMinutes(5), ['document' => $document]), 'expires_at' => now()->addMinutes(5)->toIso8601String()]);
    }

    public function downloadSigned(Request $request, int $document)
    {
        abort_unless($request->hasValidSignature(), 403);
        $record = DB::table('verification_documents')->where('id', $document)->firstOrFail();
        abort_unless(Storage::exists($record->file_path), 404);
        AuditService::record($request, 'verification_document.signed_downloaded', 'verification_document', $document);
        return Storage::download($record->file_path);
    }
}
