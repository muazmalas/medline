<?php

namespace Database\Seeders;

use App\Models\Medicine;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use LogicException;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new LogicException('DatabaseSeeder is disabled in production. Use an approved anonymized release seed procedure.');
        }

        $seedPassword = env('MEDLINE_SEED_PASSWORD', app()->environment(['local', 'testing']) ? 'ChangeMe123!' : null);
        if (! is_string($seedPassword) || trim($seedPassword) === '') {
            throw new LogicException('MEDLINE_SEED_PASSWORD must be explicitly configured outside local/testing environments.');
        }

        $arabicPainRelief = "\u{0645}\u{0633}\u{0643}\u{0646}\u{0627}\u{062a} \u{0627}\u{0644}\u{0623}\u{0644}\u{0645}";
        $arabicParacetamol = "\u{0628}\u{0627}\u{0631}\u{0627}\u{0633}\u{064a}\u{062a}\u{0627}\u{0645}\u{0648}\u{0644} 500 \u{0645}\u{0644}\u{063a}";
        $arabicIbuprofen = "\u{0625}\u{064a}\u{0628}\u{0648}\u{0628}\u{0631}\u{0648}\u{0641}\u{064a}\u{0646} 400 \u{0645}\u{0644}\u{063a}";

        $pharmacyUser = User::updateOrCreate(
            ['email' => 'admin@medline.local'],
            [
                'name' => 'MedLine Administrator',
                'role' => 'admin',
                'status' => 'active',
                'locale' => 'en',
                'password' => Hash::make($seedPassword),
            ],
        );

        $pharmacy = Partner::updateOrCreate(
            ['user_id' => $pharmacyUser->id],
            [
                'type' => 'pharmacy',
                'business_name' => 'Central Pharmacy',
                'license_number' => 'MEDLINE-PH-001',
                'phone' => '+963912345678',
                'address' => 'Damascus, Al-Hamra',
                'approval_status' => 'approved',
                'subscription_status' => 'active',
            ],
        );

        $warehouseUser = User::updateOrCreate(
            ['email' => 'warehouse@medline.local'],
            [
                'name' => 'United Medical Warehouse',
                'role' => 'warehouse',
                'status' => 'active',
                'locale' => 'en',
                'password' => Hash::make($seedPassword),
            ],
        );
        $warehouse = Partner::updateOrCreate(
            ['user_id' => $warehouseUser->id],
            [
                'type' => 'warehouse',
                'business_name' => 'United Medical Warehouse',
                'license_number' => 'MEDLINE-WH-001',
                'phone' => '+963912345679',
                'address' => 'Damascus, Industrial Zone',
                'approval_status' => 'approved',
                'subscription_status' => 'active',
            ],
        );

        User::updateOrCreate(
            ['email' => 'pharmacy@medline.local'],
            [
                'name' => 'Central Pharmacy',
                'role' => 'pharmacy',
                'status' => 'active',
                'locale' => 'en',
                'password' => Hash::make($seedPassword),
            ],
        );

        DB::table('medicine_categories')->updateOrInsert(
            ['slug' => 'pain-relief'],
            [
                'name_en' => 'Pain Relief',
                'name_ar' => 'مسكنات الألم',
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
        DB::table('medicine_categories')->where('slug', 'pain-relief')->update(['name_ar' => $arabicPainRelief]);

        $categoryId = DB::table('medicine_categories')->where('slug', 'pain-relief')->value('id');

        $paracetamol = Medicine::updateOrCreate(
            ['code' => 'MED-PARA-500'],
            [
                'category_id' => $categoryId,
                'name_en' => 'Paracetamol 500mg',
                'name_ar' => 'باراسيتامول 500 ملغ',
                'manufacturer' => 'MedLine Labs',
                'form' => 'Tablets',
                'dosage' => '500mg',
                'prescription_required' => false,
                'is_active' => true,
            ],
        );
        DB::table('medicines')->where('id', $paracetamol->id)->update(['name_ar' => $arabicParacetamol]);

        $ibuprofen = Medicine::updateOrCreate(
            ['code' => 'MED-IBU-400'],
            [
                'category_id' => $categoryId,
                'name_en' => 'Ibuprofen 400mg',
                'name_ar' => 'إيبوبروفين 400 ملغ',
                'manufacturer' => 'MedLine Labs',
                'form' => 'Tablets',
                'dosage' => '400mg',
                'prescription_required' => false,
                'is_active' => true,
            ],
        );
        DB::table('medicines')->where('id', $ibuprofen->id)->update(['name_ar' => $arabicIbuprofen]);

        DB::table('inventories')->updateOrInsert(
            ['medicine_id' => $paracetamol->id, 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy->id],
            ['quantity' => 120, 'reserved_quantity' => 0, 'unit_price' => 500, 'low_stock_threshold' => 10, 'updated_at' => now(), 'created_at' => now()],
        );
        DB::table('inventories')->updateOrInsert(
            ['medicine_id' => $ibuprofen->id, 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy->id],
            ['quantity' => 80, 'reserved_quantity' => 0, 'unit_price' => 750, 'low_stock_threshold' => 10, 'updated_at' => now(), 'created_at' => now()],
        );
        DB::table('inventories')->updateOrInsert(
            ['medicine_id' => $paracetamol->id, 'owner_type' => 'warehouse', 'owner_id' => $warehouse->id],
            ['quantity' => 1000, 'reserved_quantity' => 0, 'unit_price' => 420, 'low_stock_threshold' => 50, 'updated_at' => now(), 'created_at' => now()],
        );
        DB::table('inventories')->updateOrInsert(
            ['medicine_id' => $ibuprofen->id, 'owner_type' => 'warehouse', 'owner_id' => $warehouse->id],
            ['quantity' => 700, 'reserved_quantity' => 0, 'unit_price' => 600, 'low_stock_threshold' => 50, 'updated_at' => now(), 'created_at' => now()],
        );
    }
}
