<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use App\Support\AuditService;
use App\Models\Partner;
use App\Models\Order;
use App\Models\User;
use App\Support\NotificationService;
use App\Support\DatabaseTransaction;
use App\Contracts\FileScanner;

class ComplaintController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DB::table('complaints')
            ->select('complaints.*')
            ->selectSub(fn ($subquery) => $subquery->from('complaint_attachments')->whereColumn('complaint_id', 'complaints.id')->selectRaw('count(*)'), 'attachment_count')
            ->latest();
        if ($request->user()->role !== 'admin') $query->where('created_by', $request->user()->id);
        return response()->json($query->paginate(20));
    }

    public function show(Request $request, int $complaint): JsonResponse
    {
        $record = $this->authorizedComplaint($request, $complaint);
        $attachments = DB::table('complaint_attachments')->where('complaint_id', $complaint)->latest()->get(['id', 'original_name', 'mime_type', 'file_size', 'created_at']);
        return response()->json(['complaint' => $record, 'attachments' => $attachments]);
    }

    public function store(Request $request, FileScanner $scanner): JsonResponse
    {
        $data = $request->validate([
            'order_id' => ['nullable', 'integer', 'exists:orders,id'],
            'category' => ['required', 'string', 'max:64'],
            'subject' => ['required', 'string', 'max:180'],
            'description' => ['required', 'string', 'max:4000'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'attachment' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:10240'],
        ]);
        if (! empty($data['order_id'])) {
            $order = Order::findOrFail($data['order_id']);
            $partnerUserId = (int) Partner::whereKey($order->pharmacy_id)->value('user_id');
            abort_unless(in_array($request->user()->id, [$order->patient_id, $partnerUserId], true), 403, 'You may report only an order you participated in.');
        }
        $attachment = $request->file('attachment');
        if ($attachment) $scanner->scan($attachment);
        $storedPath = $attachment ? $attachment->store('private/complaints') : null;
        try {
            $id = DatabaseTransaction::run(function () use ($request, $data, $attachment, $storedPath) {
                $id = DB::table('complaints')->insertGetId([
                    'created_by' => $request->user()->id,
                    'order_id' => $data['order_id'] ?? null,
                    'category' => $data['category'],
                    'priority' => $data['priority'] ?? 'normal',
                    'status' => 'open',
                    'subject' => $data['subject'],
                    'description' => $data['description'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                if ($attachment) {
                    DB::table('complaint_attachments')->insert([
                        'complaint_id' => $id,
                        'uploaded_by' => $request->user()->id,
                        'file_path' => $storedPath,
                        'original_name' => $attachment->getClientOriginalName(),
                        'mime_type' => $attachment->getClientMimeType(),
                        'file_size' => $attachment->getSize(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                return $id;
            });
        } catch (\Throwable $exception) {
            if ($storedPath) Storage::delete($storedPath);
            throw $exception;
        }
        AuditService::record($request, 'complaint.created', 'complaint', $id, ['order_id' => $data['order_id'] ?? null, 'priority' => $data['priority'] ?? 'normal']);
        User::query()->where('role', 'admin')->pluck('id')->each(fn ($adminId) => NotificationService::send($adminId, 'complaint.created', ['complaint_id' => $id, 'message' => 'A new support complaint requires review.']));
        return response()->json(['message' => 'Complaint submitted.', 'complaint_id' => $id, 'has_attachment' => (bool) $attachment], 201);
    }

    public function update(Request $request, int $complaint): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['status' => ['required', 'in:open,in_review,resolved,rejected'], 'resolution' => ['nullable', 'string', 'max:4000'], 'assigned_to' => ['nullable', 'integer', 'exists:users,id']]);
        if (! empty($data['assigned_to'])) abort_unless(User::whereKey($data['assigned_to'])->where('role', 'admin')->exists(), 422, 'Complaints may only be assigned to administrators.');
        $record = DatabaseTransaction::run(function () use ($complaint, $data) {
            $locked = DB::table('complaints')->where('id', $complaint)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($locked->status, ['open', 'in_review'], true), 409, 'This complaint has already been finalized.');
            DB::table('complaints')->where('id', $complaint)->update(['status' => $data['status'], 'resolution' => $data['resolution'] ?? null, 'assigned_to' => $data['assigned_to'] ?? null, 'resolved_at' => $data['status'] === 'resolved' ? now() : null, 'updated_at' => now()]);
            return $locked;
        });
        NotificationService::send($record->created_by, $data['status'] === 'resolved' ? 'complaint.resolved' : 'complaint.updated', ['complaint_id' => $complaint, 'status' => $data['status'], 'message' => 'Your MedLine complaint was updated.']);
        AuditService::record($request, 'complaint.' . $data['status'], 'complaint', $complaint, ['assigned_to' => $data['assigned_to'] ?? null]);
        return response()->json(['message' => 'Complaint updated.']);
    }

    public function download(Request $request, int $complaint, int $attachment): mixed
    {
        $this->authorizedComplaint($request, $complaint);
        $record = DB::table('complaint_attachments')->where('id', $attachment)->where('complaint_id', $complaint)->firstOrFail();
        abort_unless(Storage::exists($record->file_path), 404);
        AuditService::record($request, 'complaint.attachment_downloaded', 'complaint_attachment', $record->id, ['complaint_id' => $complaint]);
        return Storage::download($record->file_path, $record->original_name, ['Content-Type' => $record->mime_type]);
    }

    public function downloadUrl(Request $request, int $complaint, int $attachment): JsonResponse
    {
        $this->authorizedComplaint($request, $complaint);
        abort_unless(DB::table('complaint_attachments')->where('id', $attachment)->where('complaint_id', $complaint)->exists(), 404);
        return response()->json(['url' => URL::temporarySignedRoute('api.v1.complaint-attachment.download-signed', now()->addMinutes(5), ['complaint' => $complaint, 'attachment' => $attachment]), 'expires_at' => now()->addMinutes(5)->toIso8601String()]);
    }

    public function downloadSigned(Request $request, int $complaint, int $attachment): mixed
    {
        abort_unless($request->hasValidSignature(), 403);
        $record = DB::table('complaint_attachments')->where('id', $attachment)->where('complaint_id', $complaint)->firstOrFail();
        abort_unless(Storage::exists($record->file_path), 404);
        AuditService::record($request, 'complaint.signed_attachment_downloaded', 'complaint_attachment', $record->id, ['complaint_id' => $complaint]);
        return Storage::download($record->file_path, $record->original_name, ['Content-Type' => $record->mime_type]);
    }

    private function authorizedComplaint(Request $request, int $complaint): object
    {
        $record = DB::table('complaints')->where('id', $complaint)->firstOrFail();
        abort_unless($request->user()->role === 'admin' || (int) $record->created_by === (int) $request->user()->id, 403);
        return $record;
    }
}
