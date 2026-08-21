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
use Illuminate\Support\Facades\URL;
use App\Services\MedicineSpreadsheetReader;

class MedicineController extends Controller
{
    public function show(Request $request, Medicine $medicine): JsonResponse
    {
        abort_unless($medicine->is_active || $request->user()?->role === 'admin', 404);
        $medicine->category = $medicine->category_id
            ? DB::table('medicine_categories')->where('id', $medicine->category_id)->first(['id', 'name_en', 'name_ar', 'slug'])
            : null;
        $medicine->image_url = $medicine->image_path
            ? (str_starts_with($medicine->image_path, 'public/')
                ? URL::to(Storage::url($medicine->image_path))
                : Storage::disk('public')->url($medicine->image_path))
            : null;
        $medicine->available_at = DB::table('inventories')
            ->join('partners', function ($join) { $join->on('partners.id', '=', 'inventories.owner_id')->where('inventories.owner_type', 'pharmacy'); })
            ->where('inventories.medicine_id', $medicine->id)
            ->where('inventories.is_active', true)
            ->where(fn ($query) => $query->whereNull('inventories.expires_at')->orWhereDate('inventories.expires_at', '>', today()))
            ->whereColumn('inventories.quantity', '>', 'inventories.reserved_quantity')
            ->where('partners.approval_status', 'approved')
            ->where('partners.subscription_status', 'active')
            ->select('partners.id', 'partners.business_name', 'partners.address', DB::raw('(inventories.quantity - inventories.reserved_quantity) as available_quantity'), 'inventories.unit_price')
            ->orderBy('partners.business_name')
            ->get();

        return response()->json(['medicine' => $medicine]);
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim($request->string('search')->toString());
        $sort = $request->string('sort_by', $request->string('sort', 'name_en')->toString())->toString();
        $sortColumn = in_array($sort, ['name_en', 'name_ar', 'manufacturer', 'form', 'dosage', 'code', 'prescription_required', 'is_active', 'created_at'], true) ? $sort : 'name_en';
        $sortDirection = $request->string('sort_direction')->lower()->toString() === 'desc' ? 'desc' : 'asc';
        $partnerId = $request->integer('partner_id');
        $inventoryType = in_array($request->string('inventory_type')->toString(), ['pharmacy', 'warehouse'], true) ? $request->string('inventory_type')->toString() : 'pharmacy';
        $mayViewInactive = $request->user()?->role === 'admin' && $request->boolean('include_inactive');

        $medicines = Medicine::query()
            ->select('medicines.*')
            ->when(! $mayViewInactive, fn ($query) => $query->where('is_active', true))
            ->when($mayViewInactive && $request->string('status')->toString() === 'active', fn ($query) => $query->where('is_active', true))
            ->when($mayViewInactive && $request->string('status')->toString() === 'inactive', fn ($query) => $query->where('is_active', false))
            ->when($request->filled('category_id'), fn ($query) => $query->where('category_id', $request->integer('category_id')))
            ->when($request->has('prescription_required'), fn ($query) => $query->where('prescription_required', $request->boolean('prescription_required')))
            ->when($request->boolean('available_only') || $partnerId > 0, function ($query) use ($partnerId, $inventoryType) {
                $query->whereExists(function ($inventory) use ($partnerId, $inventoryType) {
                    $inventory->selectRaw('1')->from('inventories')->whereColumn('inventories.medicine_id', 'medicines.id')->where('inventories.owner_type', $inventoryType)->where('inventories.is_active', true)->where(fn ($nested) => $nested->whereNull('inventories.expires_at')->orWhereDate('inventories.expires_at', '>', today()))->whereColumn('inventories.quantity', '>', 'inventories.reserved_quantity')->when($partnerId > 0, fn ($nested) => $nested->where('inventories.owner_id', $partnerId));
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
            ->orderBy($sortColumn, $sortDirection)
            ->orderBy('id')
            ->when($partnerId > 0, function ($query) use ($partnerId, $inventoryType) {
                $inventory = fn () => DB::table('inventories')
                    ->whereColumn('inventories.medicine_id', 'medicines.id')
                    ->where('inventories.owner_type', $inventoryType)
                    ->where('inventories.owner_id', $partnerId)
                    ->where('inventories.is_active', true)
                    ->where(fn ($nested) => $nested->whereNull('inventories.expires_at')->orWhereDate('inventories.expires_at', '>', today()));
                $query->addSelect([
                    'unit_price' => $inventory()->selectRaw('MIN(inventories.unit_price)'),
                    'available_quantity' => $inventory()->selectRaw('SUM(inventories.quantity - inventories.reserved_quantity)'),
                ]);
            })
            ->paginate(min($request->integer('per_page', 15), 50));

        if ($partnerId > 0) {
            $medicines->getCollection()->transform(function ($medicine) {
                $medicine->available_quantity = $medicine->available_quantity === null ? null : (int) $medicine->available_quantity;
                return $medicine;
            });
        }

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
            if ($request->hasFile('image')) { $scanner->scan($request->file('image')); $storedPath = $request->file('image')->store('medicines', 'public'); $data['image_path'] = $storedPath; }
            $medicine = Medicine::create($data);
        } catch (\Throwable $exception) {
            if ($storedPath) Storage::disk('public')->delete($storedPath);
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
                $storedPath = $request->file('image')->store('medicines', 'public');
                $data['image_path'] = $storedPath;
            }
            $medicine->update($data);
        } catch (\Throwable $exception) {
            if ($storedPath) Storage::disk('public')->delete($storedPath);
            throw $exception;
        }
        if ($storedPath && $oldPath && $oldPath !== $storedPath) {
            str_starts_with($oldPath, 'public/') ? Storage::delete($oldPath) : Storage::disk('public')->delete($oldPath);
        }
        AuditService::record($request, 'medicine.updated', Medicine::class, $medicine->id, ['is_active' => $medicine->is_active]);
        return response()->json(['message' => 'Medicine updated.', 'medicine' => $medicine->fresh()]);
    }

    public function updateStatus(Request $request, Medicine $medicine): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        $medicine->update(['is_active' => $data['is_active']]);
        AuditService::record($request, $data['is_active'] ? 'medicine.activated' : 'medicine.deactivated', Medicine::class, $medicine->id);
        return response()->json(['message' => $data['is_active'] ? 'Medicine activated.' : 'Medicine deactivated.', 'medicine' => $medicine->fresh()]);
    }

    public function import(Request $request, FileScanner $scanner, MedicineSpreadsheetReader $reader): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['file' => ['required', 'file', 'mimes:csv,txt,xlsx', 'max:5120']]);
        $scanner->scan($data['file']);
        $spreadsheet = $reader->read($data['file']);
        $headers = array_map(fn ($value) => mb_strtolower(trim((string) $value)), $spreadsheet['headers']);
        $required = ['name_en', 'name_ar'];
        abort_unless($headers !== [] && count(array_diff($required, $headers)) === 0, 422, 'The spreadsheet must contain name_en and name_ar columns.');
        $rows = []; $errors = [];
        foreach ($spreadsheet['rows'] as $line => $values) {
            if (count(array_filter($values, fn ($value) => trim((string) $value) !== '')) === 0) continue;
            $row = array_combine($headers, array_slice(array_pad($values, count($headers), null), 0, count($headers)));
            foreach (['prescription_required', 'is_active'] as $booleanField) {
                if (! array_key_exists($booleanField, $row) || $row[$booleanField] === null || $row[$booleanField] === '') continue;
                $normalized = mb_strtolower(trim((string) $row[$booleanField]));
                $row[$booleanField] = in_array($normalized, ['1', 'true', 'yes', 'y'], true) ? 1 : (in_array($normalized, ['0', 'false', 'no', 'n'], true) ? 0 : $row[$booleanField]);
            }
            $validator = Validator::make($row, ['name_en' => ['required', 'string', 'max:180'], 'name_ar' => ['required', 'string', 'max:180'], 'manufacturer' => ['nullable', 'string', 'max:180'], 'active_ingredient' => ['nullable', 'string', 'max:255'], 'form' => ['nullable', 'string', 'max:80'], 'dosage' => ['nullable', 'string', 'max:80'], 'pack_size' => ['nullable', 'string', 'max:100'], 'administration_route' => ['nullable', 'string', 'max:80'], 'code' => ['nullable', 'string', 'max:100'], 'category_id' => ['nullable', 'integer', 'exists:medicine_categories,id'], 'prescription_required' => ['nullable', 'boolean'], 'is_active' => ['nullable', 'boolean']]);
            if ($validator->fails()) { $errors[$line] = $validator->errors()->toArray(); continue; }
            $rows[] = $validator->validated();
        }
        abort_unless($errors === [], 422, 'Spreadsheet validation failed: ' . json_encode($errors, JSON_THROW_ON_ERROR));
        abort_unless($rows !== [], 422, 'The spreadsheet does not contain any medicine records.');
        DatabaseTransaction::run(function () use ($rows) {
            foreach ($rows as $row) {
                $code = trim((string) ($row['code'] ?? ''));
                if ($code !== '') Medicine::updateOrCreate(['code' => $code], array_merge(['is_active' => true], $row));
                else Medicine::create(array_merge(['is_active' => true], $row));
            }
        });
        AuditService::record($request, 'medicine.imported', 'medicine_catalog', null, ['rows' => count($rows)]);
        return response()->json(['message' => count($rows) . ' medicines imported successfully.', 'rows' => count($rows)]);
    }

    public function importTemplate(Request $request)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $headers = ['code', 'name_en', 'name_ar', 'manufacturer', 'active_ingredient', 'form', 'dosage', 'pack_size', 'administration_route', 'category_id', 'prescription_required', 'is_active'];
        return response()->streamDownload(function () use ($headers) { $output = fopen('php://output', 'wb'); fputcsv($output, $headers); fputcsv($output, ['MED-EXAMPLE-100', 'Example medicine 100mg', 'دواء تجريبي 100 ملغ', 'Example Labs', 'Example ingredient', 'Tablets', '100mg', '20 tablets', 'Oral', '', 'no', 'yes']); fclose($output); }, 'medline-medicine-import-template.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
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
            'active_ingredient' => ['nullable', 'string', 'max:255'],
            'form' => ['nullable', 'string', 'max:80'],
            'dosage' => ['nullable', 'string', 'max:80'],
            'pack_size' => ['nullable', 'string', 'max:100'],
            'administration_route' => ['nullable', 'string', 'max:80'],
            'code' => ['nullable', 'string', 'max:100', 'unique:medicines,code,' . ($medicineId ?? 'NULL') . ',id'],
            'description' => ['nullable', 'string', 'max:5000'],
            'indications' => ['nullable', 'string', 'max:5000'],
            'directions' => ['nullable', 'string', 'max:5000'],
            'side_effects' => ['nullable', 'string', 'max:5000'],
            'warnings' => ['nullable', 'string', 'max:5000'],
            'contraindications' => ['nullable', 'string', 'max:5000'],
            'drug_interactions' => ['nullable', 'string', 'max:5000'],
            'storage_instructions' => ['nullable', 'string', 'max:2000'],
            'prescription_required' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);
    }
}
