<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MedicineCategory;
use App\Support\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MedicineCategoryController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => MedicineCategory::query()->orderBy('name_en')->get(['id', 'name_en', 'name_ar', 'slug'])]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $this->validated($request);
        $category = MedicineCategory::create($data);
        AuditService::record($request, 'medicine_category.created', MedicineCategory::class, $category->id, ['slug' => $category->slug]);
        return response()->json(['message' => 'Medicine category created.', 'category' => $category], 201);
    }

    public function update(Request $request, MedicineCategory $category): JsonResponse
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $this->validated($request, $category->id);
        $category->update($data);
        AuditService::record($request, 'medicine_category.updated', MedicineCategory::class, $category->id, ['slug' => $category->slug]);
        return response()->json(['message' => 'Medicine category updated.', 'category' => $category->fresh()]);
    }

    private function validated(Request $request, ?int $categoryId = null): array
    {
        return $request->validate([
            'name_en' => ['required', 'string', 'max:120'],
            'name_ar' => ['required', 'string', 'max:120'],
            'slug' => ['required', 'string', 'alpha_dash', 'max:140', Rule::unique('medicine_categories', 'slug')->ignore($categoryId)],
        ]);
    }
}
