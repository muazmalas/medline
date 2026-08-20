<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use App\Contracts\FileScanner;
use App\Support\AuditService;
use App\Support\NotificationService;
use App\Support\DatabaseTransaction;

class PrescriptionController extends Controller
{
    public function pharmacyIndex(Request $request): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $rows = DB::table('prescriptions')
            ->join('orders', 'orders.id', '=', 'prescriptions.order_id')
            ->leftJoin('order_items', 'order_items.id', '=', 'prescriptions.order_item_id')
            ->leftJoin('medicines', 'medicines.id', '=', 'order_items.medicine_id')
            ->where('orders.pharmacy_id', $partner->id)
            ->whereIn('prescriptions.status', ['pending_review', 'approved', 'rejected'])
            ->select('prescriptions.id', 'prescriptions.order_id', 'prescriptions.order_item_id', 'prescriptions.status', 'prescriptions.review_note', 'prescriptions.created_at', 'prescriptions.reviewed_at', 'orders.public_id as order_public_id', 'orders.status as order_status', 'order_items.quantity', 'medicines.id as medicine_id', 'medicines.name_en', 'medicines.name_ar', 'medicines.dosage', 'medicines.form')
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('prescriptions.status', $request->string('status')->toString()))
            ->latest('prescriptions.created_at')
            ->paginate(min($request->integer('per_page', 30), 100));
        return response()->json($rows);
    }

    public function store(Request $request, Order $order, FileScanner $scanner): JsonResponse
    {
        $requiredItems = DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.order_id', $order->id)->where(fn ($query) => $query->where('order_items.prescription_required_snapshot', true)->orWhere('medicines.prescription_required', true))->pluck('order_items.id');
        abort_unless($requiredItems->count() === 1, 422, 'Choose the specific prescription-required medicine for this upload.');
        return $this->storeForItem($request, $order, (int) $requiredItems->first(), $scanner);
    }

    public function storeForItem(Request $request, Order $order, int $item, FileScanner $scanner): JsonResponse
    {
        abort_unless($order->patient_id === $request->user()->id, 403);
        $data = $request->validate(['prescription' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240']]);
        $scanner->scan($data['prescription']);
        $path = $data['prescription']->store('private/prescriptions');
        try {
            $result = DatabaseTransaction::run(function () use ($order, $item, $request, $path) {
                $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
                abort_unless($lockedOrder->patient_id === $request->user()->id, 403);
                abort_unless(in_array($lockedOrder->status, ['prescription_required', 'prescription_review'], true), 409, 'This order is not awaiting prescription evidence.');
                $orderItem = DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.order_id', $lockedOrder->id)->where('order_items.id', $item)->select('order_items.*', 'medicines.name_en', 'medicines.prescription_required')->lockForUpdate()->firstOrFail();
                abort_unless((bool) $orderItem->prescription_required_snapshot || (bool) $orderItem->prescription_required, 422, 'This medicine does not require prescription evidence.');
                abort_if(DB::table('prescriptions')->where('order_item_id', $orderItem->id)->whereIn('status', ['pending_review', 'approved'])->exists(), 409, 'A current prescription is already on file for this medicine.');
                $id = DB::table('prescriptions')->insertGetId([
                    'order_id' => $lockedOrder->id,
                    'order_item_id' => $orderItem->id,
                    'patient_id' => $request->user()->id,
                    'file_path' => $path,
                    'status' => 'pending_review',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $lockedOrder->update(['status' => $this->prescriptionOrderStatus($lockedOrder->id)]);
                return ['id' => $id, 'medicine_name' => $orderItem->name_en];
            });
        } catch (\Throwable $exception) {
            if ($path) Storage::delete($path);
            throw $exception;
        }
        $pharmacyUserId = Partner::whereKey($order->pharmacy_id)->value('user_id');
        if ($pharmacyUserId) NotificationService::send($pharmacyUserId, 'prescription.awaiting_review', ['prescription_id' => $result['id'], 'order_id' => $order->public_id, 'order_item_id' => $item, 'message' => 'A prescription for ' . $result['medicine_name'] . ' is awaiting pharmacist review.']);
        AuditService::record($request, 'prescription.uploaded', 'prescription', $result['id'], ['order_id' => $order->id, 'order_item_id' => $item]);
        return response()->json(['message' => 'Prescription uploaded for ' . $result['medicine_name'] . '.', 'prescription_id' => $result['id'], 'order_item_id' => $item], 201);
    }

    public function review(Request $request, int $prescription): JsonResponse
    {
        $data = $request->validate(['decision' => ['required', 'in:approve,reject'], 'note' => ['nullable', 'required_if:decision,reject', 'string', 'max:1000']]);
        $record = DB::table('prescriptions')->where('id', $prescription)->firstOrFail();
        $partner = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $order = Order::findOrFail($record->order_id);
        abort_unless($order->pharmacy_id === $partner->id, 403);
        $status = $data['decision'] === 'approve' ? 'approved' : 'rejected';
        DatabaseTransaction::run(function () use ($record, $status, $data, $request, $order) {
            $partner = Partner::whereKey($order->pharmacy_id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            abort_unless($partner, 403, 'Pharmacy account is not currently eligible to review prescriptions.');
            $lockedRecord = DB::table('prescriptions')->where('id', $record->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedRecord->status === 'pending_review', 409, 'This prescription has already been reviewed.');
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            DB::table('prescriptions')->where('id', $lockedRecord->id)->update(['status' => $status, 'reviewed_by' => $request->user()->id, 'review_note' => $data['note'] ?? null, 'reviewed_at' => now(), 'updated_at' => now()]);
            $lockedOrder->update(['status' => $this->prescriptionOrderStatus($lockedOrder->id)]);
        });
        $medicineName = $record->order_item_id ? DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.id', $record->order_item_id)->value('medicines.name_en') : 'medicine';
        NotificationService::send($order->patient_id, 'prescription.' . $status, ['prescription_id' => $prescription, 'order_id' => $order->public_id, 'order_item_id' => $record->order_item_id, 'message' => 'Your prescription for ' . $medicineName . ' was ' . $status . '.']);
        AuditService::record($request, 'prescription.' . $status, 'prescription', $prescription, ['order_id' => $order->id]);
        return response()->json(['message' => 'Prescription review saved.', 'status' => $status]);
    }

    private function prescriptionOrderStatus(int $orderId): string
    {
        $requiredItems = DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.order_id', $orderId)->where(fn ($query) => $query->where('order_items.prescription_required_snapshot', true)->orWhere('medicines.prescription_required', true))->pluck('order_items.id');
        if ($requiredItems->isEmpty()) return 'pending_pharmacy_review';
        $statuses = $requiredItems->map(fn ($itemId) => DB::table('prescriptions')->where('order_item_id', $itemId)->latest('created_at')->value('status'));
        if ($statuses->every(fn ($status) => $status === 'approved')) return 'pending_pharmacy_review';
        if ($statuses->every(fn ($status) => in_array($status, ['pending_review', 'approved'], true))) return 'prescription_review';
        return 'prescription_required';
    }

    public function download(Request $request, int $prescription)
    {
        $record = DB::table('prescriptions')->where('id', $prescription)->firstOrFail();
        $order = Order::findOrFail($record->order_id);
        $isPharmacy = Partner::where('user_id', $request->user()->id)->where('id', $order->pharmacy_id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->exists();
        abort_unless($order->patient_id === $request->user()->id || $isPharmacy || $request->user()->role === 'admin', 403);
        abort_unless(Storage::exists($record->file_path), 404);
        return Storage::download($record->file_path);
    }

    public function downloadUrl(Request $request, int $prescription): JsonResponse
    {
        $record = DB::table('prescriptions')->where('id', $prescription)->firstOrFail();
        $order = Order::findOrFail($record->order_id);
        $isPharmacy = Partner::where('user_id', $request->user()->id)->where('id', $order->pharmacy_id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->exists();
        abort_unless($order->patient_id === $request->user()->id || $isPharmacy || $request->user()->role === 'admin', 403);
        return response()->json(['url' => URL::temporarySignedRoute('api.v1.prescription.download-signed', now()->addMinutes(5), ['prescription' => $prescription]), 'expires_at' => now()->addMinutes(5)->toIso8601String()]);
    }

    public function downloadSigned(Request $request, int $prescription)
    {
        abort_unless($request->hasValidSignature(), 403);
        $record = DB::table('prescriptions')->where('id', $prescription)->firstOrFail();
        abort_unless(Storage::exists($record->file_path), 404);
        AuditService::record($request, 'prescription.signed_downloaded', 'prescription', $prescription);
        return Storage::download($record->file_path);
    }
}
