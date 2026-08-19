<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Medicine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;
use Illuminate\Support\Facades\Validator;
use App\Contracts\FileScanner;

class MedicineController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim($request->string('search')->toString());
        $sort = $request->string('sort', 'name_en')->toString();
        $sortColumn = in_array($sort, ['name_en', 'created_at'], true) ? $sort : 'name_en';
        $partnerId = $request->integer('partner_id');
        $inventoryType = in_array($request->string('inventory_type')->toString(), ['pharmacy', 'warehouse'], true) ? $request->string('inventory_type')->toString() : 'pharmacy';

        $medicines = Medicine::query()
            ->where('is_active', true)
            ->when($request->filled('category_id'), fn ($query) => $query->where('category_id', $request->integer('category_id')))
            ->when($request->has('prescription_required'), fn ($query) => $query->where('prescription_required', $request->boolean('prescription_required')))
            ->when($request->boolean('available_only') || $partnerId > 0, function ($query) use ($partnerId, $inventoryType) {
                $query->whereExists(function ($inventory) use ($partnerId, $inventoryType) {
                    $inventory->selectRaw('1')->from('inventories')->whereColumn('inventories.medicine_id', 'medicines.id')->where('inventories.owner_type', $inventoryType)->whereColumn('inventories.quantity', '>', 'inventories.reserved_quantity')->when($partnerId > 0, fn ($nested) => $nested->where('inventories.owner_id', $partnerId));
                });
            })
            ->when($search !== '', function ($query) use ($search) {
                $like = "%{$search}%";
                $query->where(function ($q) use ($like) {
                    $q->where('name_en', 'like', $like)
                        ->orWhere('name_ar', 'like', $like)
                        ->orWhere('manufacturer', 'like', $like)
                        ->orWhere('code', 'like', $like);
                });
            })
            ->orderBy($sortColumn)
            ->paginate(min($request->integer('per_page', 15), 50));

        $payload = $medicines->toArray();
        if ($search !== '' && count($medicines->items()) === 0) {
            $prefix = mb_substr($search, 0, 1);
            $prefixLike = $prefix . '%';
            $payload['suggested_queries'] = Medicine::query()->where('is_active', true)->where(fn ($query) => $query->where('name_en', 'like', $prefixLike)->orWhere('name_ar', 'like', $prefixLike))->orderBy('name_en')->limit(3)->pluck('name_en')->values()->all();
        }
        return response()->json($payload);
    }

    public function suggestions(Request $request): JsonResponse
    {
        $search = trim($request->string('search')->toString());
        if (mb_strlen($search) < 2) return response()->json(['data' => []]);
        $term = mb_strtolower($search);
        $like = '%' . $search . '%';
        $data = Cache::remember('medline:medicine-suggestions:' . sha1(mb_strtolower($search)), now()->addSeconds(30), function () use ($term, $like) {
            $fields = ['name_en', 'name_ar', 'manufacturer', 'code'];
            $score = static function (Medicine $medicine) use ($term, $fields): float {
                $best = 0.0;
                foreach ($fields as $field) {
                    $value = mb_strtolower(trim((string) $medicine->{$field}));
                    if ($value === '') continue;
                    if (mb_stripos($value, $term) !== false) { $best = 1.0; continue; }
                    foreach (preg_split('/[\s\-_]+/u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
                        similar_text($term, $word, $percent);
                        $best = max($best, $percent / 100);
                    }
                }
                return $best;
            };
            $columns = ['id', 'name_en', 'name_ar', 'manufacturer', 'code', 'prescription_required'];
            $rows = Medicine::query()->where('is_active', true)->where(function ($query) use ($like) { $query->where('name_en', 'like', $like)->orWhere('name_ar', 'like', $like)->orWhere('manufacturer', 'like', $like)->orWhere('code', 'like', $like); })->orderBy('name_en')->limit(12)->get($columns);
            if ($rows->count() < 12) {
                $known = $rows->keyBy('id');
                Medicine::query()->where('is_active', true)->orderBy('name_en')->limit(250)->get($columns)->each(function (Medicine $medicine) use ($known, $score): void { if ($score($medicine) >= 0.45) $known->put($medicine->id, $medicine); });
                $rows = $known->values();
            }
            return $rows->map(function (Medicine $medicine) use ($term, $fields, $score) {
                $matched = collect($fields)->filter(fn (string $field) => mb_stripos(mb_strtolower((string) $medicine->{$field}), $term) !== false)->values()->all();
                return ['id' => $medicine->id, 'name_en' => $medicine->name_en, 'name_ar' => $medicine->name_ar, 'manufacturer' => $medicine->manufacturer, 'code' => $medicine->code, 'prescription_required' => (bool) $medicine->prescription_required, 'matched_fields' => $matched, 'match_score' => round($score($medicine), 3)];
            })->sortByDesc('match_score')->take(12)->values()->all();
        });
        return response()->json(['data' => $data]);
    }

    public function store(Request $request, FileScanner $scanner): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $this->validated($request);
        $storedPath = null;
        try {
            if ($request->hasFile('image')) { $scanner->scan($request->file('image')); $storedPath = $request->file('image')->store('public/medicines'); $data['image_path'] = $storedPath; }
            $medicine = Medicine::create($data);
        } catch (\Throwable $exception) {
            if ($storedPath) Storage::delete($storedPath);
            throw $exception;
        }
        AuditService::record($request, 'medicine.created', Medicine::class, $medicine->id, ['code' => $medicine->code]);
        return response()->json(['message' => 'Medicine created.', 'medicine' => $medicine], 201);
    }

    public function update(Request $request, Medicine $medicine, FileScanner $scanner): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $this->validated($request, $medicine->id);
        $storedPath = null;
        $oldPath = $medicine->image_path;
        try {
            if ($request->hasFile('image')) {
                $scanner->scan($request->file('image'));
                $storedPath = $request->file('image')->store('public/medicines');
                $data['image_path'] = $storedPath;
            }
            $medicine->update($data);
        } catch (\Throwable $exception) {
            if ($storedPath) Storage::delete($storedPath);
            throw $exception;
        }
        if ($storedPath && $oldPath && $oldPath !== $storedPath) Storage::delete($oldPath);
        AuditService::record($request, 'medicine.updated', Medicine::class, $medicine->id, ['is_active' => $medicine->is_active]);
        return response()->json(['message' => 'Medicine updated.', 'medicine' => $medicine->fresh()]);
    }

    public function destroy(Request $request, Medicine $medicine): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $medicine->update(['is_active' => false]);
        AuditService::record($request, 'medicine.deactivated', Medicine::class, $medicine->id);
        return response()->json(['message' => 'Medicine deactivated.']);
    }

    public function import(Request $request, FileScanner $scanner): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['file' => ['required', 'file', 'mimes:csv,txt', 'max:5120']]);
        $scanner->scan($data['file']);
        $handle = fopen($data['file']->getRealPath(), 'rb');
        $headers = array_map(fn ($value) => trim((string) $value), fgetcsv($handle) ?: []);
        $required = ['name_en', 'name_ar'];
        abort_unless($headers !== [] && count(array_diff($required, $headers)) === 0, 422, 'CSV must contain name_en and name_ar columns.');
        $rows = []; $line = 1; $errors = [];
        while (($values = fgetcsv($handle)) !== false) {
            $line++;
            if (count(array_filter($values, fn ($value) => trim((string) $value) !== '')) === 0) continue;
            $row = array_combine($headers, array_pad($values, count($headers), null));
            $validator = Validator::make($row, ['name_en' => ['required', 'string', 'max:180'], 'name_ar' => ['required', 'string', 'max:180'], 'manufacturer' => ['nullable', 'string', 'max:180'], 'form' => ['nullable', 'string', 'max:80'], 'dosage' => ['nullable', 'string', 'max:80'], 'code' => ['nullable', 'string', 'max:100'], 'category_id' => ['nullable', 'integer', 'exists:medicine_categories,id'], 'prescription_required' => ['nullable', 'boolean']]);
            if ($validator->fails()) { $errors[$line] = $validator->errors()->toArray(); continue; }
            $rows[] = $validator->validated();
        }
        fclose($handle);
        abort_unless($errors === [], 422, 'CSV validation failed: ' . json_encode($errors, JSON_THROW_ON_ERROR));
        DatabaseTransaction::run(function () use ($rows) {
            foreach ($rows as $row) {
                $code = trim((string) ($row['code'] ?? ''));
                if ($code !== '') Medicine::updateOrCreate(['code' => $code], array_merge($row, ['is_active' => true]));
                else Medicine::create(array_merge($row, ['is_active' => true]));
            }
        });
        AuditService::record($request, 'medicine.imported', 'medicine_catalog', null, ['rows' => count($rows)]);
        return response()->json(['message' => 'Medicine catalog imported.', 'rows' => count($rows)]);
    }

    public function export(Request $request)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $rows = Medicine::query()->when($request->boolean('include_inactive') === false, fn ($query) => $query->where('is_active', true))->orderBy('id')->get(['code', 'name_en', 'name_ar', 'manufacturer', 'form', 'dosage', 'category_id', 'prescription_required', 'is_active']);
        AuditService::record($request, 'medicine.exported', 'medicine_catalog', null, ['rows' => $rows->count()]);
        return response()->streamDownload(function () use ($rows) { $output = fopen('php://output', 'wb'); fputcsv($output, ['code', 'name_en', 'name_ar', 'manufacturer', 'form', 'dosage', 'category_id', 'prescription_required', 'is_active']); foreach ($rows as $row) fputcsv($output, (array) $row); fclose($output); }, 'medline-medicines.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function validated(Request $request, ?int $medicineId = null): array
    {
        return $request->validate([
            'category_id' => ['nullable', 'integer', 'exists:medicine_categories,id'],
            'name_en' => ['required', 'string', 'max:180'],
            'name_ar' => ['required', 'string', 'max:180'],
            'manufacturer' => ['nullable', 'string', 'max:180'],
            'form' => ['nullable', 'string', 'max:80'],
            'dosage' => ['nullable', 'string', 'max:80'],
            'code' => ['nullable', 'string', 'max:100', 'unique:medicines,code,' . ($medicineId ?? 'NULL') . ',id'],
            'prescription_required' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);
    }
}
