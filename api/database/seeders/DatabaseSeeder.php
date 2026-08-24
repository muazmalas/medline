<?php

namespace Database\Seeders;

use App\Contracts\MapProvider;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use LogicException;

class DatabaseSeeder extends Seeder
{
    private const DEMO_VERIFICATION_CODE = '2468';

    /** @var array<string, array<string, mixed>> */
    private array $roadRoutes = [];

    public function run(): void
    {
        if (app()->environment('production')) {
            throw new LogicException('The destructive theater seed is disabled in production.');
        }

        if (! app()->environment(['local', 'testing']) && ! filter_var(env('MEDLINE_ALLOW_DESTRUCTIVE_SEED', false), FILTER_VALIDATE_BOOL)) {
            throw new LogicException('Set MEDLINE_ALLOW_DESTRUCTIVE_SEED=true to run the destructive theater seed outside local/testing.');
        }

        $seedPassword = env('MEDLINE_SEED_PASSWORD', app()->environment(['local', 'testing']) ? 'ChangeMe123!' : null);
        if (! is_string($seedPassword) || trim($seedPassword) === '') {
            throw new LogicException('MEDLINE_SEED_PASSWORD must be configured before seeding.');
        }

        $this->writeDemoDocuments();

        DB::transaction(function () use ($seedPassword): void {
            $this->deleteExistingData();
            $now = now()->startOfMinute();
            $identity = $this->seedIdentity(Hash::make($seedPassword), $now);
            $catalog = $this->seedCatalog($now);
            $inventory = $this->seedInventory($identity, $catalog, $now);
            $rateId = $this->seedDeliveryPricing($identity['admin_id'], $now);
            $orders = $this->seedOrders($identity, $catalog, $inventory, $rateId, $now);
            $procurements = $this->seedProcurements($identity, $catalog, $inventory, $rateId, $now);
            $this->seedSupportingScenarios($identity, $catalog, $orders, $procurements, $now);
            $this->assertTheaterInvariants();
        });

        $this->command?->info('MedLine destructive theater data is ready (100 medicines, 10 pharmacies, 2 warehouses, complete workflows).');
    }

    private function deleteExistingData(): void
    {
        $tables = [
            'notification_delivery_attempts', 'notification_delivery_claims', 'notifications',
            'complaint_attachments', 'complaints', 'ratings', 'delivery_events', 'deliveries',
            'procurement_item_batch_allocations', 'procurement_order_items', 'procurement_orders',
            'prescriptions', 'order_items', 'inventory_movements', 'orders', 'cart_items', 'carts',
            'payment_proofs', 'subscriptions', 'partner_working_hours', 'verification_documents',
            'device_tokens', 'refresh_tokens', 'personal_access_tokens', 'idempotency_keys',
            'notification_preferences', 'user_consents', 'addresses', 'inventories', 'medicines',
            'medicine_categories', 'drivers', 'partners', 'audit_logs', 'delivery_pricing_rates',
            'email_verification_tokens', 'password_reset_tokens', 'sessions', 'users',
            'failed_jobs', 'jobs', 'job_batches', 'cache_locks', 'cache',
        ];

        Schema::disableForeignKeyConstraints();
        try {
            foreach ($tables as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->delete();
                }
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }
    }

    private function writeDemoDocuments(): void
    {
        $pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
        Storage::put('private/demo/prescription.pdf', $pdf);
        Storage::put('private/demo/payment-proof.pdf', $pdf);
        Storage::put('private/demo/driver-license.pdf', $pdf);
    }

    private function seedIdentity(string $passwordHash, object $now): array
    {
        $allUserIds = [];
        $adminId = $this->createUser('MedLine Administrator', 'admin@medline.local', '+963911000000', 'admin', $passwordHash, $now);
        $allUserIds[] = $adminId;

        $patientDefinitions = [
            ['Demo Patient One', 'demo.patient@medline.local', '+963911000001', 'Al-Mazzeh Home', '12 Fayez Mansour Street', 'Al-Mazzeh', 33.5038000, 36.2479000],
            ['Demo Patient Two', 'patient.two@medline.local', '+963911000002', 'Bab Touma Home', '18 Bab Touma Street', 'Bab Touma', 33.5121000, 36.3151000],
        ];
        $patients = [];
        foreach ($patientDefinitions as $definition) {
            [$name, $email, $phone, $label, $line, $district, $latitude, $longitude] = $definition;
            $userId = $this->createUser($name, $email, $phone, 'patient', $passwordHash, $now);
            $addressId = DB::table('addresses')->insertGetId([
                'user_id' => $userId, 'label' => $label, 'address_line' => $line,
                'city' => 'Damascus', 'district' => $district, 'latitude' => $latitude,
                'longitude' => $longitude, 'is_default' => true,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            $patients[] = ['user_id' => $userId, 'address_id' => $addressId, 'address' => "$line, $district, Damascus", 'latitude' => $latitude, 'longitude' => $longitude];
            $allUserIds[] = $userId;
        }

        $pharmacyDefinitions = [
            ['Central Pharmacy', 'pharmacy@medline.local', 'MEDLINE-PH-001', '+963912345680', 'Damascus, Al-Hamra Street', 33.5196900, 36.2905000],
            ['Al-Shifa Pharmacy', 'pharmacy02@medline.local', 'MEDLINE-PH-002', '+963912345681', 'Damascus, Al-Mazzeh', 33.5039000, 36.2476000],
            ['Al-Amal Pharmacy', 'pharmacy03@medline.local', 'MEDLINE-PH-003', '+963912345682', 'Damascus, Abu Rummaneh', 33.5179000, 36.2779000],
            ['Qasioun Pharmacy', 'pharmacy04@medline.local', 'MEDLINE-PH-004', '+963912345683', 'Damascus, Al-Malki', 33.5227000, 36.2709000],
            ['Al-Razi Pharmacy', 'pharmacy05@medline.local', 'MEDLINE-PH-005', '+963912345684', 'Damascus, Shaalan', 33.5187000, 36.2840000],
            ['Bab Touma Pharmacy', 'pharmacy06@medline.local', 'MEDLINE-PH-006', '+963912345685', 'Damascus, Bab Touma', 33.5120000, 36.3154000],
            ['Baramkeh Pharmacy', 'pharmacy07@medline.local', 'MEDLINE-PH-007', '+963912345686', 'Damascus, Baramkeh', 33.5053000, 36.2918000],
            ['Kafr Souseh Pharmacy', 'pharmacy08@medline.local', 'MEDLINE-PH-008', '+963912345687', 'Damascus, Kafr Souseh', 33.4937000, 36.2775000],
            ['Al-Midan Pharmacy', 'pharmacy09@medline.local', 'MEDLINE-PH-009', '+963912345688', 'Damascus, Al-Midan', 33.4943000, 36.3021000],
            ['Al-Qassaa Pharmacy', 'pharmacy10@medline.local', 'MEDLINE-PH-010', '+963912345689', 'Damascus, Al-Qassaa', 33.5219000, 36.3202000],
        ];
        $pharmacies = [];
        foreach ($pharmacyDefinitions as $index => $definition) {
            [$name, $email, $license, $phone, $address, $latitude, $longitude] = $definition;
            $userId = $this->createUser($name.' Owner', $email, $phone, 'pharmacy', $passwordHash, $now);
            $partnerId = $this->createPartner($userId, 'pharmacy', $name, $license, $phone, $address, $latitude, $longitude, $adminId, $now);
            $pharmacies[] = ['id' => $partnerId, 'user_id' => $userId, 'name' => $name, 'latitude' => $latitude, 'longitude' => $longitude, 'address' => $address, 'index' => $index];
            $allUserIds[] = $userId;
        }

        $warehouseDefinitions = [
            ['United Medical Warehouse', 'warehouse@medline.local', 'MEDLINE-WH-001', '+963912345679', 'Aleppo, Sheikh Najjar Industrial City', 36.2727800, 37.2563900],
            ['Damascus Medical Distribution Center', 'warehouse.damascus@medline.local', 'MEDLINE-WH-002', '+963912345690', 'Damascus, Al-Qadam Industrial Area', 33.4749000, 36.3048000],
        ];
        $warehouses = [];
        foreach ($warehouseDefinitions as $index => $definition) {
            [$name, $email, $license, $phone, $address, $latitude, $longitude] = $definition;
            $userId = $this->createUser($name.' Manager', $email, $phone, 'warehouse', $passwordHash, $now);
            $partnerId = $this->createPartner($userId, 'warehouse', $name, $license, $phone, $address, $latitude, $longitude, $adminId, $now);
            $warehouses[] = ['id' => $partnerId, 'user_id' => $userId, 'name' => $name, 'latitude' => $latitude, 'longitude' => $longitude, 'address' => $address, 'index' => $index];
            $allUserIds[] = $userId;
        }

        $driverDefinitions = [
            ['Demo Driver One', 'demo.driver@medline.local', '+963911000003', 'DEMO-DRIVER-001', 'Motorcycle', 'ML-2026-01', 33.5172000, 36.2920000],
            ['Demo Driver Two', 'driver.two@medline.local', '+963911000004', 'DEMO-DRIVER-002', 'Car', 'ML-2026-02', 33.5059000, 36.2855000],
        ];
        $drivers = [];
        foreach ($driverDefinitions as $definition) {
            [$name, $email, $phone, $nationalId, $vehicleType, $plate, $latitude, $longitude] = $definition;
            $userId = $this->createUser($name, $email, $phone, 'driver', $passwordHash, $now);
            $driverId = DB::table('drivers')->insertGetId([
                'user_id' => $userId, 'national_id' => $nationalId, 'vehicle_type' => $vehicleType,
                'vehicle_plate' => $plate, 'approval_status' => 'approved', 'is_available' => true,
                'last_latitude' => $latitude, 'last_longitude' => $longitude, 'last_seen_at' => $now->copy()->subMinute(),
                'created_at' => $now->copy()->subDays(90), 'updated_at' => $now,
            ]);
            DB::table('verification_documents')->insert([
                'user_id' => $userId, 'driver_id' => $driverId, 'document_type' => 'driver_license',
                'file_path' => 'private/demo/driver-license.pdf', 'status' => 'approved',
                'reviewed_by' => $adminId, 'review_note' => 'Approved theater driver license.', 'reviewed_at' => $now->copy()->subDays(80),
                'created_at' => $now->copy()->subDays(85), 'updated_at' => $now,
            ]);
            $drivers[] = ['id' => $driverId, 'user_id' => $userId, 'name' => $name, 'latitude' => $latitude, 'longitude' => $longitude];
            $allUserIds[] = $userId;
        }

        $supportId = $this->createUser('MedLine Support', 'support@medline.local', '+963911000005', 'support', $passwordHash, $now);
        $allUserIds[] = $supportId;

        foreach ($allUserIds as $userId) {
            DB::table('notification_preferences')->insert([
                'user_id' => $userId, 'in_app_enabled' => true, 'push_enabled' => true,
                'email_enabled' => true, 'sms_enabled' => false, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        foreach ($patients as $patient) {
            foreach (['terms_of_service', 'privacy_policy'] as $consentType) {
                DB::table('user_consents')->insert([
                    'user_id' => $patient['user_id'], 'consent_type' => $consentType,
                    'policy_version' => (string) config('medline.privacy.policy_version', '2026-08'),
                    'consented_at' => $now->copy()->subDays(30), 'ip_address' => '127.0.0.1',
                    'user_agent' => 'MedLine theater seed', 'created_at' => $now->copy()->subDays(30), 'updated_at' => $now,
                ]);
            }
        }

        return [
            'admin_id' => $adminId, 'patients' => $patients, 'pharmacies' => $pharmacies,
            'warehouses' => $warehouses, 'drivers' => $drivers, 'support_id' => $supportId,
            'all_user_ids' => $allUserIds,
        ];
    }

    private function createUser(string $name, string $email, string $phone, string $role, string $passwordHash, object $now): int
    {
        return DB::table('users')->insertGetId([
            'name' => $name, 'email' => $email, 'phone' => $phone, 'role' => $role,
            'status' => 'active', 'locale' => 'en', 'email_verified_at' => $now->copy()->subDays(90),
            'password' => $passwordHash, 'created_at' => $now->copy()->subDays(90), 'updated_at' => $now,
        ]);
    }

    private function createPartner(int $userId, string $type, string $name, string $license, string $phone, string $address, float $latitude, float $longitude, int $adminId, object $now): int
    {
        $partnerId = DB::table('partners')->insertGetId([
            'user_id' => $userId, 'type' => $type, 'business_name' => $name, 'license_number' => $license,
            'phone' => $phone, 'address' => $address, 'latitude' => $latitude, 'longitude' => $longitude,
            'approval_status' => 'approved', 'subscription_status' => 'active',
            'created_at' => $now->copy()->subDays(120), 'updated_at' => $now,
        ]);
        $amount = $type === 'pharmacy' ? 12000 : 24000;
        $subscriptionId = DB::table('subscriptions')->insertGetId([
            'partner_id' => $partnerId, 'origin' => 'registration', 'plan_code' => 'annual_'.$type,
            'status' => 'active', 'amount' => $amount, 'duration_months' => 12,
            'starts_at' => $now->copy()->subDays(30)->toDateString(), 'ends_at' => $now->copy()->addDays(335)->toDateString(),
            'created_at' => $now->copy()->subDays(31), 'updated_at' => $now,
        ]);
        DB::table('payment_proofs')->insert([
            'subscription_id' => $subscriptionId, 'submitted_by' => $userId,
            'file_path' => 'private/demo/payment-proof.pdf', 'status' => 'approved',
            'reviewed_by' => $adminId, 'review_note' => 'Approved theater subscription payment.',
            'reviewed_at' => $now->copy()->subDays(30), 'created_at' => $now->copy()->subDays(31), 'updated_at' => $now,
        ]);
        foreach (range(0, 5) as $day) {
            DB::table('partner_working_hours')->insert([
                'partner_id' => $partnerId, 'day_of_week' => $day, 'opens_at' => '08:00:00',
                'closes_at' => $type === 'pharmacy' ? '22:00:00' : '17:00:00', 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        return $partnerId;
    }

    private function seedCatalog(object $now): array
    {
        $categories = [
            ['pain-relief', 'Pain Relief', 'مسكنات الألم', [
                ['MED-PARA-500', 'Paracetamol 500mg', 'باراسيتامول 500 ملغ', false, 'Tablet'],
                ['MED-IBU-400', 'Ibuprofen 400mg', 'إيبوبروفين 400 ملغ', false, 'Tablet'],
                ['MED-ASP-81', 'Aspirin 81mg', 'أسبرين 81 ملغ', false, 'Tablet'],
                ['MED-DIC-50', 'Diclofenac 50mg', 'ديكلوفيناك 50 ملغ', true, 'Tablet'],
                ['MED-NAP-250', 'Naproxen 250mg', 'نابروكسين 250 ملغ', true, 'Tablet'],
                ['MED-CEL-200', 'Celecoxib 200mg', 'سيليكوكسيب 200 ملغ', true, 'Capsule'],
                ['MED-TRA-50', 'Tramadol 50mg', 'ترامادول 50 ملغ', true, 'Capsule'],
                ['MED-PARA-SYP', 'Paracetamol Syrup 120mg/5ml', 'شراب باراسيتامول 120 ملغ/5 مل', false, 'Syrup'],
                ['MED-DIC-GEL', 'Diclofenac Gel 1%', 'جل ديكلوفيناك 1%', false, 'Gel'],
                ['MED-KET-10', 'Ketorolac 10mg', 'كيتورولاك 10 ملغ', true, 'Tablet'],
            ]],
            ['antibiotics', 'Antibiotics', 'المضادات الحيوية', [
                ['MED-AMOX-500', 'Amoxicillin 500mg', 'أموكسيسيلين 500 ملغ', true, 'Capsule'],
                ['MED-AZI-250', 'Azithromycin 250mg', 'أزيثروميسين 250 ملغ', true, 'Tablet'],
                ['MED-CEF-500', 'Cephalexin 500mg', 'سيفالكسين 500 ملغ', true, 'Capsule'],
                ['MED-DOX-100', 'Doxycycline 100mg', 'دوكسيسيكلين 100 ملغ', true, 'Capsule'],
                ['MED-CIP-500', 'Ciprofloxacin 500mg', 'سيبروفلوكساسين 500 ملغ', true, 'Tablet'],
                ['MED-AMC-625', 'Amoxicillin/Clavulanate 625mg', 'أموكسيسيلين وكلافولانات 625 ملغ', true, 'Tablet'],
                ['MED-MET-500', 'Metronidazole 500mg', 'ميترونيدازول 500 ملغ', true, 'Tablet'],
                ['MED-CLI-300', 'Clindamycin 300mg', 'كليندامايسين 300 ملغ', true, 'Capsule'],
                ['MED-NIT-100', 'Nitrofurantoin 100mg', 'نيتروفورانتوين 100 ملغ', true, 'Capsule'],
                ['MED-CFU-500', 'Cefuroxime 500mg', 'سيفوروكسيم 500 ملغ', true, 'Tablet'],
            ]],
            ['cardiovascular', 'Cardiovascular', 'أدوية القلب والأوعية', [
                ['MED-AML-5', 'Amlodipine 5mg', 'أملوديبين 5 ملغ', true, 'Tablet'],
                ['MED-LIS-10', 'Lisinopril 10mg', 'ليزينوبريل 10 ملغ', true, 'Tablet'],
                ['MED-LOS-50', 'Losartan 50mg', 'لوسارتان 50 ملغ', true, 'Tablet'],
                ['MED-BIS-5', 'Bisoprolol 5mg', 'بيسوبرولول 5 ملغ', true, 'Tablet'],
                ['MED-ATE-50', 'Atenolol 50mg', 'أتينولول 50 ملغ', true, 'Tablet'],
                ['MED-HCT-25', 'Hydrochlorothiazide 25mg', 'هيدروكلوروثيازيد 25 ملغ', true, 'Tablet'],
                ['MED-FUR-40', 'Furosemide 40mg', 'فوروسيميد 40 ملغ', true, 'Tablet'],
                ['MED-ATO-20', 'Atorvastatin 20mg', 'أتورفاستاتين 20 ملغ', true, 'Tablet'],
                ['MED-ROS-10', 'Rosuvastatin 10mg', 'روسوفاستاتين 10 ملغ', true, 'Tablet'],
                ['MED-CLO-75', 'Clopidogrel 75mg', 'كلوبيدوغريل 75 ملغ', true, 'Tablet'],
            ]],
            ['diabetes', 'Diabetes Care', 'أدوية السكري', [
                ['MED-MTF-500', 'Metformin 500mg', 'ميتفورمين 500 ملغ', true, 'Tablet'],
                ['MED-GLC-60', 'Gliclazide MR 60mg', 'غليكلازيد ممتد 60 ملغ', true, 'Tablet'],
                ['MED-GLM-2', 'Glimepiride 2mg', 'غليميبيريد 2 ملغ', true, 'Tablet'],
                ['MED-SIT-100', 'Sitagliptin 100mg', 'سيتاغلبتين 100 ملغ', true, 'Tablet'],
                ['MED-EMP-10', 'Empagliflozin 10mg', 'إمباغليفلوزين 10 ملغ', true, 'Tablet'],
                ['MED-IGL-100', 'Insulin Glargine 100 units/ml', 'إنسولين غلارجين 100 وحدة/مل', true, 'Injection'],
                ['MED-IRE-100', 'Regular Insulin 100 units/ml', 'إنسولين عادي 100 وحدة/مل', true, 'Injection'],
                ['MED-ACA-50', 'Acarbose 50mg', 'أكاربوز 50 ملغ', true, 'Tablet'],
                ['MED-LIN-5', 'Linagliptin 5mg', 'ليناغلبتين 5 ملغ', true, 'Tablet'],
                ['MED-MTS-50', 'Metformin/Sitagliptin 500/50mg', 'ميتفورمين وسيتاغلبتين 500/50 ملغ', true, 'Tablet'],
            ]],
            ['respiratory', 'Respiratory Care', 'أدوية الجهاز التنفسي', [
                ['MED-SAL-INH', 'Salbutamol Inhaler 100mcg', 'بخاخ سالبوتامول 100 مكغ', true, 'Inhaler'],
                ['MED-BUD-INH', 'Budesonide Inhaler 200mcg', 'بخاخ بوديزونيد 200 مكغ', true, 'Inhaler'],
                ['MED-FLU-SPR', 'Fluticasone Nasal Spray 50mcg', 'بخاخ أنفي فلوتيكازون 50 مكغ', true, 'Nasal spray'],
                ['MED-MON-10', 'Montelukast 10mg', 'مونتيلوكاست 10 ملغ', true, 'Tablet'],
                ['MED-THE-200', 'Theophylline SR 200mg', 'ثيوفيلين ممتد 200 ملغ', true, 'Tablet'],
                ['MED-IPR-INH', 'Ipratropium Inhaler 20mcg', 'بخاخ إبراتروبيوم 20 مكغ', true, 'Inhaler'],
                ['MED-ACE-600', 'Acetylcysteine 600mg', 'أسيتيل سيستئين 600 ملغ', false, 'Effervescent tablet'],
                ['MED-AMB-SYP', 'Ambroxol Syrup 30mg/5ml', 'شراب أمبروكسول 30 ملغ/5 مل', false, 'Syrup'],
                ['MED-DEX-SYP', 'Dextromethorphan Syrup 15mg/5ml', 'شراب ديكستروميثورفان 15 ملغ/5 مل', false, 'Syrup'],
                ['MED-GUA-SYP', 'Guaifenesin Syrup 100mg/5ml', 'شراب غايفينيسين 100 ملغ/5 مل', false, 'Syrup'],
            ]],
            ['gastrointestinal', 'Gastrointestinal', 'أدوية الجهاز الهضمي', [
                ['MED-OME-20', 'Omeprazole 20mg', 'أوميبرازول 20 ملغ', false, 'Capsule'],
                ['MED-PAN-40', 'Pantoprazole 40mg', 'بانتوبرازول 40 ملغ', true, 'Tablet'],
                ['MED-FAM-20', 'Famotidine 20mg', 'فاموتيدين 20 ملغ', false, 'Tablet'],
                ['MED-ANT-SUS', 'Antacid Suspension', 'معلق مضاد للحموضة', false, 'Suspension'],
                ['MED-DOM-10', 'Domperidone 10mg', 'دومبيريدون 10 ملغ', true, 'Tablet'],
                ['MED-OND-4', 'Ondansetron 4mg', 'أوندانسيترون 4 ملغ', true, 'Tablet'],
                ['MED-LOP-2', 'Loperamide 2mg', 'لوبيراميد 2 ملغ', false, 'Capsule'],
                ['MED-ORS-SAC', 'Oral Rehydration Salts', 'أملاح الإماهة الفموية', false, 'Sachet'],
                ['MED-LAC-SYP', 'Lactulose Syrup 667mg/ml', 'شراب لاكتولوز 667 ملغ/مل', false, 'Syrup'],
                ['MED-BIS-5L', 'Bisacodyl 5mg', 'بيساكوديل 5 ملغ', false, 'Tablet'],
            ]],
            ['allergy', 'Allergy Care', 'أدوية الحساسية', [
                ['MED-CET-10', 'Cetirizine 10mg', 'سيتريزين 10 ملغ', false, 'Tablet'],
                ['MED-LOR-10', 'Loratadine 10mg', 'لوراتادين 10 ملغ', false, 'Tablet'],
                ['MED-FEX-120', 'Fexofenadine 120mg', 'فيكسوفينادين 120 ملغ', false, 'Tablet'],
                ['MED-CHL-4', 'Chlorpheniramine 4mg', 'كلورفينيرامين 4 ملغ', false, 'Tablet'],
                ['MED-DES-5', 'Desloratadine 5mg', 'ديسلوراتادين 5 ملغ', false, 'Tablet'],
                ['MED-LEV-5', 'Levocetirizine 5mg', 'ليفوسيتريزين 5 ملغ', false, 'Tablet'],
                ['MED-DPH-25', 'Diphenhydramine 25mg', 'ديفينهيدرامين 25 ملغ', false, 'Capsule'],
                ['MED-EPI-PEN', 'Epinephrine Auto-Injector 0.3mg', 'حاقن إبينفرين ذاتي 0.3 ملغ', true, 'Auto-injector'],
                ['MED-AZE-SPR', 'Azelastine Nasal Spray', 'بخاخ أنفي أزيلاستين', true, 'Nasal spray'],
                ['MED-CAL-LOT', 'Calamine Lotion', 'لوشن كالامين', false, 'Lotion'],
            ]],
            ['dermatology', 'Dermatology', 'أدوية الجلدية', [
                ['MED-HYD-CRM', 'Hydrocortisone Cream 1%', 'كريم هيدروكورتيزون 1%', false, 'Cream'],
                ['MED-CLO-CRM', 'Clotrimazole Cream 1%', 'كريم كلوتريمازول 1%', false, 'Cream'],
                ['MED-MIC-CRM', 'Miconazole Cream 2%', 'كريم ميكونازول 2%', false, 'Cream'],
                ['MED-FUS-CRM', 'Fusidic Acid Cream 2%', 'كريم حمض الفيوسيديك 2%', true, 'Cream'],
                ['MED-MUP-OIN', 'Mupirocin Ointment 2%', 'مرهم موبيروسين 2%', true, 'Ointment'],
                ['MED-BEN-GEL', 'Benzoyl Peroxide Gel 5%', 'جل بنزويل بيروكسيد 5%', false, 'Gel'],
                ['MED-ADA-GEL', 'Adapalene Gel 0.1%', 'جل أدابالين 0.1%', true, 'Gel'],
                ['MED-PER-CRM', 'Permethrin Cream 5%', 'كريم بيرمثرين 5%', false, 'Cream'],
                ['MED-SIL-CRM', 'Silver Sulfadiazine Cream 1%', 'كريم سلفاديازين الفضة 1%', true, 'Cream'],
                ['MED-ZIN-OIN', 'Zinc Oxide Ointment 20%', 'مرهم أكسيد الزنك 20%', false, 'Ointment'],
            ]],
            ['vitamins', 'Vitamins and Minerals', 'الفيتامينات والمعادن', [
                ['MED-VD3-1000', 'Vitamin D3 1000 IU', 'فيتامين د3 1000 وحدة', false, 'Tablet'],
                ['MED-VC-500', 'Vitamin C 500mg', 'فيتامين ج 500 ملغ', false, 'Tablet'],
                ['MED-BCO-TAB', 'Vitamin B Complex', 'فيتامين ب المركب', false, 'Tablet'],
                ['MED-FOL-5', 'Folic Acid 5mg', 'حمض الفوليك 5 ملغ', false, 'Tablet'],
                ['MED-IRF-TAB', 'Iron with Folic Acid', 'حديد مع حمض الفوليك', false, 'Tablet'],
                ['MED-CAD-TAB', 'Calcium with Vitamin D', 'كالسيوم مع فيتامين د', false, 'Tablet'],
                ['MED-MAG-300', 'Magnesium 300mg', 'مغنيسيوم 300 ملغ', false, 'Tablet'],
                ['MED-ZNC-25', 'Zinc 25mg', 'زنك 25 ملغ', false, 'Tablet'],
                ['MED-MVI-TAB', 'Daily Multivitamin', 'متعدد الفيتامينات اليومي', false, 'Tablet'],
                ['MED-B12-1000', 'Vitamin B12 1000mcg', 'فيتامين ب12 1000 مكغ', false, 'Tablet'],
            ]],
            ['neurology', 'Neurology and Mental Health', 'أدوية الأعصاب والصحة النفسية', [
                ['MED-SER-50', 'Sertraline 50mg', 'سيرترالين 50 ملغ', true, 'Tablet'],
                ['MED-FLX-20', 'Fluoxetine 20mg', 'فلوكسيتين 20 ملغ', true, 'Capsule'],
                ['MED-ESC-10', 'Escitalopram 10mg', 'إسيتالوبرام 10 ملغ', true, 'Tablet'],
                ['MED-AMI-25', 'Amitriptyline 25mg', 'أميتريبتيلين 25 ملغ', true, 'Tablet'],
                ['MED-GAB-300', 'Gabapentin 300mg', 'غابابنتين 300 ملغ', true, 'Capsule'],
                ['MED-PRE-75', 'Pregabalin 75mg', 'بريغابالين 75 ملغ', true, 'Capsule'],
                ['MED-CAR-200', 'Carbamazepine 200mg', 'كاربامازيبين 200 ملغ', true, 'Tablet'],
                ['MED-VAL-500', 'Sodium Valproate 500mg', 'فالبروات الصوديوم 500 ملغ', true, 'Tablet'],
                ['MED-LEV-500', 'Levetiracetam 500mg', 'ليفيتيراسيتام 500 ملغ', true, 'Tablet'],
                ['MED-SUM-50', 'Sumatriptan 50mg', 'سوماتريبتان 50 ملغ', true, 'Tablet'],
            ]],
        ];

        $manufacturers = ['MedLine Labs', 'Damascus Pharma', 'Levant Therapeutics', 'Sham Healthcare', 'Aleppo Medical Industries'];
        $medicines = [];
        $byCode = [];
        $index = 0;
        foreach ($categories as [$slug, $nameEn, $nameAr, $items]) {
            $categoryId = DB::table('medicine_categories')->insertGetId([
                'slug' => $slug, 'name_en' => $nameEn, 'name_ar' => $nameAr,
                'created_at' => $now->copy()->subDays(120), 'updated_at' => $now,
            ]);
            foreach ($items as [$code, $medicineNameEn, $medicineNameAr, $rx, $form]) {
                preg_match('/([0-9]+(?:\/[0-9]+)?(?:mg|mcg|ml|%| IU| units\/ml))/i', $medicineNameEn, $dosageMatch);
                $dosage = $dosageMatch[1] ?? 'Standard';
                $ingredient = trim((string) preg_replace('/\s+(?:Syrup|Cream|Gel|Ointment|Inhaler|Nasal Spray|Suspension|Auto-Injector)?\s*[0-9].*$/i', '', $medicineNameEn));
                $route = in_array($form, ['Cream', 'Gel', 'Ointment', 'Lotion'], true) ? 'Topical' : ($form === 'Inhaler' ? 'Inhalation' : ($form === 'Nasal spray' ? 'Nasal' : ($form === 'Injection' || $form === 'Auto-injector' ? 'Injection' : 'Oral')));
                $pack = match ($form) {
                    'Syrup', 'Suspension', 'Lotion' => '100ml bottle',
                    'Cream', 'Gel', 'Ointment' => '30g tube',
                    'Inhaler', 'Nasal spray' => '120 doses',
                    'Injection', 'Auto-injector' => '1 unit',
                    'Sachet' => '10 sachets',
                    default => '30 units',
                };
                $price = 350 + (($index % 20) * 125);
                $medicineId = DB::table('medicines')->insertGetId([
                    'category_id' => $categoryId, 'name_en' => $medicineNameEn, 'name_ar' => $medicineNameAr,
                    'manufacturer' => $manufacturers[$index % count($manufacturers)], 'active_ingredient' => $ingredient,
                    'form' => $form, 'dosage' => $dosage, 'pack_size' => $pack, 'administration_route' => $route,
                    'code' => $code, 'description' => "$medicineNameEn catalog information for the MedLine theater dataset.",
                    'indications' => 'Use for approved indications after advice from a qualified healthcare professional.',
                    'directions' => 'Follow the product label and the instructions of the prescribing or dispensing professional.',
                    'side_effects' => 'Possible effects vary by patient and medicine; review the approved product information.',
                    'warnings' => $rx ? 'Prescription medicine. Use only under professional supervision.' : 'Read the label and seek professional advice when symptoms persist.',
                    'contraindications' => 'Do not use when a known contraindication or allergy applies.',
                    'drug_interactions' => 'Review current medicines with a pharmacist or prescriber before use.',
                    'storage_instructions' => 'Store in a cool, dry place away from direct sunlight and children.',
                    'prescription_required' => $rx, 'is_active' => true,
                    'created_at' => $now->copy()->subDays(120), 'updated_at' => $now,
                ]);
                $record = ['id' => $medicineId, 'code' => $code, 'name' => $medicineNameEn, 'rx' => $rx, 'price' => $price, 'index' => $index];
                $medicines[] = $record;
                $byCode[$code] = $record;
                $index++;
            }
        }

        if (count($medicines) !== 100) {
            throw new LogicException('The theater catalog must contain exactly 100 medicines.');
        }

        return compact('medicines', 'byCode');
    }

    private function seedInventory(array $identity, array $catalog, object $now): array
    {
        $pharmacyInventory = [];
        foreach ($identity['pharmacies'] as $pharmacyIndex => $pharmacy) {
            for ($offset = 0; $offset < 30; $offset++) {
                $medicine = $catalog['medicines'][($pharmacyIndex * 7 + $offset) % 100];
                $quantity = $offset === 0 ? 4 : 45 + (($pharmacyIndex * 13 + $offset * 7) % 90);
                $inventoryId = DB::table('inventories')->insertGetId([
                    'medicine_id' => $medicine['id'], 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy['id'],
                    'quantity' => $quantity, 'reserved_quantity' => 0, 'unit_price' => round($medicine['price'] * 1.2),
                    'low_stock_threshold' => 8, 'is_active' => true,
                    'batch_number' => sprintf('PH%02d-%03d', $pharmacyIndex + 1, $medicine['index'] + 1),
                    'manufactured_at' => $now->copy()->subMonths(6)->toDateString(),
                    'expires_at' => $now->copy()->addMonths(18)->toDateString(),
                    'received_at' => $now->copy()->subMonths(2)->toDateString(), 'storage_location' => 'Retail shelf '.($offset + 1),
                    'created_at' => $now->copy()->subMonths(2), 'updated_at' => $now,
                ]);
                $pharmacyInventory[$pharmacy['id']][$medicine['id']] = $inventoryId;
            }
        }

        $warehouseInventory = [];
        $legacyWarehouse = $identity['warehouses'][0];
        $legacyStock = [
            ['MED-PARA-500', 1000, 420, 50], ['MED-IBU-400', 700, 600, 50],
            ['MED-AMOX-500', 300, 1500, 25], ['MED-CET-10', 450, 550, 35], ['MED-AZI-250', 240, 1350, 20],
        ];
        foreach ($legacyStock as $stockIndex => [$code, $quantity, $price, $threshold]) {
            $medicine = $catalog['byCode'][$code];
            $inventoryId = DB::table('inventories')->insertGetId([
                'medicine_id' => $medicine['id'], 'owner_type' => 'warehouse', 'owner_id' => $legacyWarehouse['id'],
                'quantity' => $quantity, 'reserved_quantity' => 0, 'unit_price' => $price, 'low_stock_threshold' => $threshold,
                'is_active' => true, 'batch_number' => 'ALP-'.str_pad((string) ($stockIndex + 1), 3, '0', STR_PAD_LEFT),
                'manufactured_at' => $now->copy()->subMonths(8)->toDateString(), 'expires_at' => $now->copy()->addMonths(16)->toDateString(),
                'received_at' => $now->copy()->subMonths(3)->toDateString(), 'storage_location' => 'Aleppo zone A-'.($stockIndex + 1),
                'created_at' => $now->copy()->subMonths(3), 'updated_at' => $now,
            ]);
            $warehouseInventory[$legacyWarehouse['id']][$medicine['id']][] = $inventoryId;
        }

        $damascusWarehouse = $identity['warehouses'][1];
        foreach ($catalog['medicines'] as $medicine) {
            foreach ([1, 2] as $batch) {
                $inventoryId = DB::table('inventories')->insertGetId([
                    'medicine_id' => $medicine['id'], 'owner_type' => 'warehouse', 'owner_id' => $damascusWarehouse['id'],
                    'quantity' => 350 + (($medicine['index'] * 17 + $batch * 29) % 500), 'reserved_quantity' => 0,
                    'unit_price' => round($medicine['price'] * (0.72 + $batch * 0.03)), 'low_stock_threshold' => 60,
                    'is_active' => true, 'batch_number' => sprintf('DAM-%03d-%d', $medicine['index'] + 1, $batch),
                    'manufactured_at' => $now->copy()->subMonths(9 - $batch)->toDateString(),
                    'expires_at' => $now->copy()->addMonths(10 + $batch * 8)->toDateString(),
                    'received_at' => $now->copy()->subMonths(4 - $batch)->toDateString(),
                    'storage_location' => sprintf('Damascus rack %02d-%d', intdiv($medicine['index'], 10) + 1, $batch),
                    'created_at' => $now->copy()->subMonths(4 - $batch), 'updated_at' => $now,
                ]);
                $warehouseInventory[$damascusWarehouse['id']][$medicine['id']][] = $inventoryId;
            }
        }

        return compact('pharmacyInventory', 'warehouseInventory');
    }

    private function seedDeliveryPricing(int $adminId, object $now): int
    {
        $rates = ['bicycle' => 60, 'motorcycle' => 100, 'car' => 140, 'van' => 180];
        $motorcycleRateId = 0;
        foreach ($rates as $vehicleType => $rate) {
            $rateId = DB::table('delivery_pricing_rates')->insertGetId([
                'vehicle_type' => $vehicleType, 'rate_per_km' => $rate, 'changed_by' => $adminId,
                'reason' => 'Theater baseline '.$vehicleType.' delivery price', 'effective_at' => $now->copy()->subDays(120),
                'created_at' => $now->copy()->subDays(120), 'updated_at' => $now,
            ]);
            if ($vehicleType === 'motorcycle') {
                $motorcycleRateId = $rateId;
            }
        }

        return $motorcycleRateId;
    }

    private function seedOrders(array $identity, array $catalog, array $inventory, int $rateId, object $now): array
    {
        $specifications = [
            ['DEMO-ORDER-PENDING-001', 'pending_pharmacy_review', 0, 0, 0, 2, 0, null, null],
            ['DEMO-ORDER-RX-0000001', 'prescription_review', 0, 0, 10, 1, 0, null, null],
            ['DEMO-ORDER-TRANSIT-01', 'accepted', 0, 0, 1, 1, 1, 'in_transit', 0],
            ['DEMO-ORDER-DONE-00001', 'completed', 0, 0, 2, 1, 1, 'delivered', 0],
            ['DEMO-ORDER-CANCEL-001', 'cancelled', 0, 0, 3, 1, 1, 'cancelled', null],
            ['THR-ORD-RX-REQUIRED', 'prescription_required', 1, 0, 10, 1, 0, null, null],
            ['THR-ORD-PARTIAL-OFFER', 'partial_approval_required', 0, 1, 7, 4, 2, null, null],
            ['THR-ORD-PARTIAL-DECLINE', 'partial_offer_rejected', 1, 2, 14, 4, 2, null, null],
            ['THR-ORD-REJECTED', 'rejected', 0, 3, 21, 2, 0, null, null],
            ['THR-ORD-PARTIAL-ACCEPT', 'partially_accepted', 1, 4, 28, 3, 2, 'claimed', 1],
            ['THR-ORD-AVAILABLE', 'accepted', 0, 5, 35, 1, 1, 'available', null],
            ['THR-ORD-PICKUP-START', 'accepted', 1, 6, 42, 1, 1, 'pickup_started', 0],
            ['THR-ORD-IN-TRANSIT', 'accepted', 0, 7, 49, 1, 1, 'in_transit', 1],
            ['THR-ORD-ARRIVED', 'accepted', 1, 8, 56, 1, 1, 'arrived', 0],
            ['THR-ORD-FAILED', 'accepted', 0, 9, 63, 1, 1, 'failed', 1],
            ['THR-ORD-CANCEL-EARLY', 'cancelled', 1, 1, 8, 1, 0, null, null],
            ['THR-ORD-COMPLETE-D1', 'completed', 0, 2, 15, 1, 1, 'delivered', 0],
            ['THR-ORD-COMPLETE-D2', 'completed', 1, 3, 22, 1, 1, 'delivered', 1],
            ['THR-ORD-COMPLETE2-D2', 'completed', 0, 4, 29, 1, 1, 'delivered', 1],
        ];

        $records = [];
        $demoDeliveryNumber = 1;
        $theaterDeliveryNumber = 1;
        foreach ($specifications as $index => [$publicId, $status, $patientIndex, $pharmacyIndex, $medicineIndex, $quantity, $acceptedQuantity, $deliveryStatus, $driverIndex]) {
            $patient = $identity['patients'][$patientIndex];
            $pharmacy = $identity['pharmacies'][$pharmacyIndex];
            $medicine = $catalog['medicines'][$medicineIndex];
            $inventoryId = $inventory['pharmacyInventory'][$pharmacy['id']][$medicine['id']] ?? null;
            if (! $inventoryId) {
                throw new LogicException("Order medicine {$medicine['code']} is not stocked by {$pharmacy['name']}.");
            }
            $stock = DB::table('inventories')->where('id', $inventoryId)->first();
            $createdAt = $now->copy()->subDays(40 - $index);
            $pricing = $this->deliveryPrice($pharmacy['latitude'], $pharmacy['longitude'], $patient['latitude'], $patient['longitude']);
            $requestedSubtotal = $quantity * (float) $stock->unit_price;
            $usesAcceptedSubtotal = in_array($status, ['partial_approval_required', 'partial_offer_rejected', 'partially_accepted'], true);
            $subtotal = $usesAcceptedSubtotal ? $acceptedQuantity * (float) $stock->unit_price : $requestedSubtotal;
            $taxRate = 5.0;
            $taxAmount = round($subtotal * $taxRate / 100, 2);
            $orderId = DB::table('orders')->insertGetId([
                'public_id' => $publicId, 'patient_id' => $patient['user_id'], 'pharmacy_id' => $pharmacy['id'],
                'address_id' => $patient['address_id'], 'status' => $status, 'payment_method' => 'cash_on_delivery',
                'payment_status' => $status === 'completed' ? 'paid' : 'pending', 'subtotal' => $subtotal,
                'tax_rate' => $taxRate, 'tax_amount' => $taxAmount, 'delivery_fee' => $pricing['fee'],
                'delivery_pricing_rate_id' => $rateId, 'delivery_distance_km' => $pricing['distance'],
                'delivery_rate_per_km' => 100, 'delivery_latitude' => $patient['latitude'], 'delivery_longitude' => $patient['longitude'],
                'delivery_route_geometry' => json_encode($pricing['geometry'], JSON_THROW_ON_ERROR),
                'delivery_route_duration_seconds' => $pricing['duration_seconds'], 'delivery_route_provider' => $pricing['provider'],
                'total' => $subtotal + $taxAmount + $pricing['fee'], 'delivery_address_snapshot' => $patient['address'],
                'delivery_preference' => $index % 4 === 0 ? 'scheduled' : 'asap',
                'scheduled_delivery_at' => $index % 4 === 0 ? $createdAt->copy()->addDay() : null,
                'patient_note' => 'Deterministic theater order scenario: '.$status,
                'partial_offer_note' => str_contains($status, 'partial') ? 'Only part of the requested quantity is currently available.' : null,
                'partial_offered_at' => str_contains($status, 'partial') ? $createdAt->copy()->addHour() : null,
                'patient_decision_note' => in_array($status, ['partially_accepted', 'partial_offer_rejected'], true) ? ($status === 'partially_accepted' ? 'Please deliver the available quantity.' : 'The partial offer was declined.') : null,
                'patient_decided_at' => in_array($status, ['partially_accepted', 'partial_offer_rejected'], true) ? $createdAt->copy()->addHours(2) : null,
                'created_at' => $createdAt, 'updated_at' => $now,
            ]);
            $itemId = DB::table('order_items')->insertGetId([
                'order_id' => $orderId, 'medicine_id' => $medicine['id'], 'prescription_required_snapshot' => $medicine['rx'],
                'quantity' => $quantity, 'accepted_quantity' => $acceptedQuantity,
                'unit_price' => $stock->unit_price, 'line_total' => $requestedSubtotal,
                'created_at' => $createdAt, 'updated_at' => $now,
            ]);

            if ($status === 'prescription_review') {
                $this->createPrescription($orderId, $itemId, $patient['user_id'], null, 'pending_review', $createdAt, $now);
            } elseif ($medicine['rx'] && $status !== 'prescription_required') {
                $this->createPrescription($orderId, $itemId, $patient['user_id'], $pharmacy['user_id'], 'approved', $createdAt, $now);
            }

            $reservation = match ($status) {
                'prescription_required', 'prescription_review', 'pending_pharmacy_review' => $quantity,
                'partial_approval_required', 'accepted', 'partially_accepted' => $acceptedQuantity,
                default => 0,
            };
            if ($reservation > 0) {
                DB::table('inventories')->where('id', $inventoryId)->increment('reserved_quantity', $reservation, ['updated_at' => $now]);
            }
            if ($status === 'completed') {
                $after = (int) $stock->quantity - $acceptedQuantity;
                DB::table('inventories')->where('id', $inventoryId)->update(['quantity' => $after, 'updated_at' => $now]);
                DB::table('inventory_movements')->insert([
                    'medicine_id' => $medicine['id'], 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy['id'],
                    'order_id' => $orderId, 'type' => 'delivery_completed', 'quantity_delta' => -$acceptedQuantity,
                    'quantity_after' => $after, 'reason' => 'Patient delivery completed',
                    'created_by' => $identity['drivers'][$driverIndex]['user_id'], 'created_at' => $createdAt->copy()->addHours(2), 'updated_at' => $now,
                ]);
            }

            $deliveryId = null;
            if ($deliveryStatus) {
                $isLegacy = str_starts_with($publicId, 'DEMO-');
                $deliveryPublicId = $isLegacy
                    ? 'DEMO-DEL-'.str_pad((string) $demoDeliveryNumber++, 10, '0', STR_PAD_LEFT)
                    : 'THR-DEL-'.str_pad((string) $theaterDeliveryNumber++, 10, '0', STR_PAD_LEFT);
                $driver = $driverIndex === null ? null : $identity['drivers'][$driverIndex];
                $deliveryId = $this->createDelivery($deliveryPublicId, $orderId, null, $deliveryStatus, $driver, $createdAt->copy()->addMinutes(15), $now);
            }

            $records[$publicId] = ['id' => $orderId, 'item_id' => $itemId, 'patient_id' => $patient['user_id'], 'pharmacy_user_id' => $pharmacy['user_id'], 'delivery_id' => $deliveryId, 'driver_index' => $driverIndex, 'status' => $status];
        }

        $completedPublicIds = ['DEMO-ORDER-DONE-00001', 'THR-ORD-COMPLETE-D1', 'THR-ORD-COMPLETE-D2', 'THR-ORD-COMPLETE2-D2'];
        foreach ($completedPublicIds as $ratingIndex => $publicId) {
            $record = $records[$publicId];
            $scores = [[5, 4], [4, 5], [5, 5], [4, 3]][$ratingIndex];
            foreach ([[$record['patient_id'], $scores[0], 'Professional and careful delivery.'], [$record['pharmacy_user_id'], $scores[1], 'Reliable pickup and delivery coordination.']] as $authorIndex => [$authorId, $score, $comment]) {
                DB::table('ratings')->insert([
                    'order_id' => $record['id'], 'created_by' => $authorId, 'score' => $score, 'comment' => $comment,
                    'hidden_at' => $ratingIndex === 3 && $authorIndex === 1 ? $now->copy()->subDay() : null,
                    'moderated_by' => $ratingIndex === 3 && $authorIndex === 1 ? $identity['admin_id'] : null,
                    'moderation_reason' => $ratingIndex === 3 && $authorIndex === 1 ? 'Hidden theater moderation example.' : null,
                    'created_at' => $now->copy()->subDays(10 - $ratingIndex), 'updated_at' => $now,
                ]);
            }
        }

        return $records;
    }

    private function createPrescription(int $orderId, int $itemId, int $patientId, ?int $reviewerId, string $status, object $createdAt, object $now): void
    {
        DB::table('prescriptions')->insert([
            'order_id' => $orderId, 'order_item_id' => $itemId, 'patient_id' => $patientId,
            'file_path' => 'private/demo/prescription.pdf', 'status' => $status,
            'reviewed_by' => $reviewerId, 'review_note' => $status === 'approved' ? 'Approved theater prescription.' : null,
            'reviewed_at' => $status === 'approved' ? $createdAt->copy()->addMinutes(30) : null,
            'created_at' => $createdAt->copy()->addMinutes(10), 'updated_at' => $now,
        ]);
    }

    private function createDelivery(string $publicId, ?int $orderId, ?int $procurementId, string $status, ?array $driver, object $createdAt, object $now): int
    {
        $activeStatuses = ['claimed', 'pickup_started', 'in_transit', 'arrived'];
        $isActive = in_array($status, $activeStatuses, true);
        $isDelivered = $status === 'delivered';
        $pickupInitiated = in_array($status, ['pickup_started', 'in_transit', 'arrived', 'failed', 'delivered'], true);
        $pickupVerified = in_array($status, ['in_transit', 'arrived', 'failed', 'delivered'], true);
        $recipientInitiated = in_array($status, ['arrived', 'delivered'], true);
        $deliveryId = DB::table('deliveries')->insertGetId([
            'public_id' => $publicId, 'order_id' => $orderId, 'procurement_order_id' => $procurementId,
            'driver_id' => $driver['id'] ?? null, 'status' => $status, 'scheduled_for' => $createdAt->copy()->addHours(2),
            'pickup_code_hash' => $status === 'pickup_started' ? Hash::make(self::DEMO_VERIFICATION_CODE) : null,
            'pickup_code_sent_at' => $pickupInitiated ? $createdAt->copy()->addMinutes(10) : null,
            'pickup_code_expires_at' => $status === 'pickup_started' ? $now->copy()->addMinutes(config('medline.delivery_verification_ttl_minutes', 10)) : null,
            'pickup_code_verified_at' => $pickupVerified ? $createdAt->copy()->addMinutes(16) : null,
            'pickup_code_attempts' => 0,
            'recipient_code_hash' => $status === 'arrived' ? Hash::make(self::DEMO_VERIFICATION_CODE) : null,
            'recipient_code_sent_at' => $recipientInitiated ? ($isDelivered ? $createdAt->copy()->addMinutes(34) : $now->copy()->subMinute()) : null,
            'recipient_code_expires_at' => $status === 'arrived' ? $now->copy()->addMinutes(config('medline.delivery_verification_ttl_minutes', 10)) : null,
            'recipient_code_verified_at' => $isDelivered ? $createdAt->copy()->addMinutes(40) : null,
            'pin_used_at' => $isDelivered ? $createdAt->copy()->addMinutes(40) : null, 'pin_attempts' => 0,
            'claimed_at' => $driver ? $createdAt->copy()->addMinutes(5) : null,
            'completed_at' => $isDelivered ? $createdAt->copy()->addMinutes(40) : null,
            'last_latitude' => $isActive ? ($driver['latitude'] ?? 33.5138) : null,
            'last_longitude' => $isActive ? ($driver['longitude'] ?? 36.2765) : null,
            'location_accuracy_meters' => $isActive ? 8.5 : null,
            'location_updated_at' => $isActive ? $now->copy()->subMinute() : null,
            'failure_reason' => $status === 'failed' ? 'Recipient could not be reached after documented attempts.' : null,
            'created_at' => $createdAt, 'updated_at' => $now,
        ]);

        $paths = [
            'available' => [], 'claimed' => ['claimed'],
            'pickup_started' => ['claimed', 'pickup_started'],
            'in_transit' => ['claimed', 'pickup_started', 'in_transit'],
            'arrived' => ['claimed', 'pickup_started', 'in_transit', 'arrived'],
            'failed' => ['claimed', 'pickup_started', 'in_transit', 'failed'],
            'cancelled' => ['cancelled'],
            'delivered' => ['claimed', 'pickup_started', 'in_transit', 'arrived', 'delivered'],
        ];
        $pickupUserId = $orderId
            ? DB::table('orders')->join('partners', 'partners.id', '=', 'orders.pharmacy_id')->where('orders.id', $orderId)->value('partners.user_id')
            : DB::table('procurement_orders')->join('partners', 'partners.id', '=', 'procurement_orders.warehouse_id')->where('procurement_orders.id', $procurementId)->value('partners.user_id');
        $eventMinutes = ['cancelled' => 1, 'claimed' => 5, 'pickup_started' => 10, 'in_transit' => 16, 'arrived' => 34, 'failed' => 34, 'delivered' => 40];
        $from = 'available';
        foreach ($paths[$status] as $to) {
            $actorId = in_array($to, ['pickup_started', 'in_transit'], true) ? $pickupUserId : ($driver['user_id'] ?? null);
            $note = match ($to) {
                'pickup_started' => 'Pickup verification code sent to the assigned driver.',
                'in_transit' => 'Pickup partner verified the handoff; delivery entered transit automatically.',
                'arrived' => 'Driver arrived and initiated recipient handoff verification.',
                'delivered' => 'Recipient handoff verified and delivery completed.',
                'failed' => 'Delivery failed after the recipient could not be reached.',
                default => 'Theater delivery transition to '.$to.'.',
            };
            DB::table('delivery_events')->insert([
                'delivery_id' => $deliveryId, 'actor_id' => $actorId,
                'from_status' => $from, 'to_status' => $to,
                'note' => $note,
                'created_at' => $createdAt->copy()->addMinutes($eventMinutes[$to]), 'updated_at' => $now,
            ]);
            $from = $to;
        }

        return $deliveryId;
    }

    private function seedProcurements(array $identity, array $catalog, array $inventory, int $rateId, object $now): array
    {
        $specifications = [
            ['DEMO-PROC-0000001', 'pending_warehouse_review', 0, 0, 1, 10, 0, null, null],
            ['THR-PROC-PARTIAL-OFFER', 'partial_approval_required', 0, 1, 4, 10, 4, null, null],
            ['THR-PROC-PARTIAL-DECL', 'partial_offer_rejected', 0, 1, 5, 10, 4, null, null],
            ['THR-PROC-REJECTED', 'rejected', 0, 1, 6, 10, 0, null, null],
            ['THR-PROC-ACCEPTED', 'accepted', 0, 1, 7, 10, 10, 'available', null],
            ['THR-PROC-PART-ACCEPT', 'partially_accepted', 0, 1, 8, 10, 6, 'in_transit', 0],
            ['THR-PROC-COMPLETED', 'completed', 0, 1, 9, 8, 8, 'delivered', 1],
        ];

        $records = [];
        $deliveryNumber = 1;
        foreach ($specifications as $index => [$publicId, $status, $pharmacyIndex, $warehouseIndex, $medicineIndex, $quantity, $acceptedQuantity, $deliveryStatus, $driverIndex]) {
            $pharmacy = $identity['pharmacies'][$pharmacyIndex];
            $warehouse = $identity['warehouses'][$warehouseIndex];
            $medicine = $catalog['medicines'][$medicineIndex];
            $batchId = $inventory['warehouseInventory'][$warehouse['id']][$medicine['id']][0] ?? null;
            if (! $batchId) {
                throw new LogicException("Procurement medicine {$medicine['code']} is not stocked by {$warehouse['name']}.");
            }
            $batch = DB::table('inventories')->where('id', $batchId)->first();
            $createdAt = $now->copy()->subDays(18 - $index);
            $pricing = $this->deliveryPrice($warehouse['latitude'], $warehouse['longitude'], $pharmacy['latitude'], $pharmacy['longitude']);
            $pricedQuantity = match ($status) {
                'pending_warehouse_review' => $quantity,
                'rejected', 'partial_offer_rejected' => 0,
                default => $acceptedQuantity,
            };
            $subtotal = $pricedQuantity * (float) $batch->unit_price;
            $terminalWithoutDelivery = in_array($status, ['rejected', 'partial_offer_rejected'], true);
            $deliveryFee = $pricing['fee'];
            $procurementId = DB::table('procurement_orders')->insertGetId([
                'public_id' => $publicId, 'pharmacy_id' => $pharmacy['id'], 'warehouse_id' => $warehouse['id'],
                'status' => $status, 'subtotal' => $subtotal, 'delivery_fee' => $deliveryFee,
                'delivery_pricing_rate_id' => $rateId, 'delivery_distance_km' => $pricing['distance'], 'delivery_rate_per_km' => 100,
                'delivery_route_geometry' => json_encode($pricing['geometry'], JSON_THROW_ON_ERROR),
                'delivery_route_duration_seconds' => $pricing['duration_seconds'], 'delivery_route_provider' => $pricing['provider'],
                'total' => $terminalWithoutDelivery ? 0 : $subtotal + $deliveryFee,
                'delivery_address_snapshot' => $pharmacy['address'],
                'delivery_preference' => $index % 2 === 0 ? 'scheduled' : 'asap',
                'scheduled_delivery_at' => $index % 2 === 0 ? $createdAt->copy()->addDay() : null,
                'pharmacy_note' => 'Deterministic theater procurement scenario: '.$status,
                'warehouse_note' => $status === 'pending_warehouse_review' ? null : ($status === 'rejected' ? 'Requested items cannot be supplied.' : 'Warehouse review completed for theater data.'),
                'reviewed_by' => $status === 'pending_warehouse_review' ? null : $warehouse['user_id'],
                'reviewed_at' => $status === 'pending_warehouse_review' ? null : $createdAt->copy()->addHour(),
                'created_at' => $createdAt, 'updated_at' => $now,
            ]);
            $lineTotal = $status === 'pending_warehouse_review' ? $quantity * (float) $batch->unit_price : $acceptedQuantity * (float) $batch->unit_price;
            if ($status === 'rejected') {
                $lineTotal = 0;
            }
            $itemId = DB::table('procurement_order_items')->insertGetId([
                'procurement_order_id' => $procurementId, 'medicine_id' => $medicine['id'],
                'quantity' => $quantity, 'accepted_quantity' => $acceptedQuantity,
                'unit_price' => $batch->unit_price, 'line_total' => $lineTotal,
                'created_at' => $createdAt, 'updated_at' => $now,
            ]);

            $allocationStatus = match ($status) {
                'pending_warehouse_review', 'accepted', 'partially_accepted', 'partial_approval_required' => 'reserved',
                'completed' => 'consumed',
                default => 'released',
            };
            $allocationQuantity = match ($status) {
                'pending_warehouse_review', 'rejected' => $quantity,
                default => max(1, $acceptedQuantity),
            };
            DB::table('procurement_item_batch_allocations')->insert([
                'procurement_order_item_id' => $itemId, 'inventory_id' => $batchId,
                'quantity' => $allocationQuantity, 'status' => $allocationStatus,
                'released_at' => $allocationStatus === 'released' ? $createdAt->copy()->addHours(2) : null,
                'consumed_at' => $allocationStatus === 'consumed' ? $createdAt->copy()->addHours(4) : null,
                'created_at' => $createdAt->copy()->addMinutes(5), 'updated_at' => $now,
            ]);
            if ($allocationStatus === 'reserved') {
                DB::table('inventories')->where('id', $batchId)->increment('reserved_quantity', $allocationQuantity, ['updated_at' => $now]);
            }
            if ($allocationStatus === 'consumed') {
                $warehouseAfter = (int) $batch->quantity - $acceptedQuantity;
                DB::table('inventories')->where('id', $batchId)->update(['quantity' => $warehouseAfter, 'updated_at' => $now]);
                DB::table('inventory_movements')->insert([
                    'medicine_id' => $medicine['id'], 'owner_type' => 'warehouse', 'owner_id' => $warehouse['id'],
                    'type' => 'procurement_delivery_out', 'quantity_delta' => -$acceptedQuantity,
                    'quantity_after' => $warehouseAfter, 'reason' => 'Procurement delivery completed: '.$publicId,
                    'created_by' => $identity['drivers'][$driverIndex]['user_id'], 'created_at' => $createdAt->copy()->addHours(4), 'updated_at' => $now,
                ]);
                $destinationId = $inventory['pharmacyInventory'][$pharmacy['id']][$medicine['id']] ?? null;
                if (! $destinationId) {
                    throw new LogicException("Completed procurement destination lacks a stock row for {$medicine['code']}.");
                }
                $destination = DB::table('inventories')->where('id', $destinationId)->first();
                $destinationAfter = (int) $destination->quantity + $acceptedQuantity;
                DB::table('inventories')->where('id', $destinationId)->update(['quantity' => $destinationAfter, 'updated_at' => $now]);
                DB::table('inventory_movements')->insert([
                    'medicine_id' => $medicine['id'], 'owner_type' => 'pharmacy', 'owner_id' => $pharmacy['id'],
                    'type' => 'procurement_delivery_in', 'quantity_delta' => $acceptedQuantity,
                    'quantity_after' => $destinationAfter, 'reason' => 'Procurement delivery received: '.$publicId,
                    'created_by' => $identity['drivers'][$driverIndex]['user_id'], 'created_at' => $createdAt->copy()->addHours(4), 'updated_at' => $now,
                ]);
            }

            $deliveryId = null;
            if ($deliveryStatus) {
                $driver = $driverIndex === null ? null : $identity['drivers'][$driverIndex];
                $deliveryId = $this->createDelivery('THR-PDEL-'.str_pad((string) $deliveryNumber++, 9, '0', STR_PAD_LEFT), null, $procurementId, $deliveryStatus, $driver, $createdAt->copy()->addMinutes(15), $now);
            }
            $records[$publicId] = ['id' => $procurementId, 'item_id' => $itemId, 'delivery_id' => $deliveryId, 'status' => $status];
        }

        return $records;
    }

    private function seedSupportingScenarios(array $identity, array $catalog, array $orders, array $procurements, object $now): void
    {
        foreach ($identity['patients'] as $patientIndex => $patient) {
            $cartId = DB::table('carts')->insertGetId(['user_id' => $patient['user_id'], 'created_at' => $now, 'updated_at' => $now]);
            foreach ([0, 1] as $offset) {
                DB::table('cart_items')->insert([
                    'cart_id' => $cartId, 'medicine_id' => $catalog['medicines'][$patientIndex * 2 + $offset]['id'],
                    'quantity' => $offset + 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        $complaintId = DB::table('complaints')->insertGetId([
            'created_by' => $identity['patients'][0]['user_id'], 'order_id' => $orders['DEMO-ORDER-DONE-00001']['id'],
            'category' => 'delivery', 'priority' => 'normal', 'status' => 'in_review',
            'subject' => 'Demo delivery feedback', 'description' => 'Theater complaint showing an active support review.',
            'assigned_to' => $identity['support_id'], 'created_at' => $now->copy()->subDays(3), 'updated_at' => $now,
        ]);

        $notifications = [
            ['00000000-0000-4000-8000-000000000001', $identity['patients'][0]['user_id'], 'order.decision', ['order_id' => 'DEMO-ORDER-TRANSIT-01', 'status' => 'accepted']],
            ['00000000-0000-4000-8000-000000000002', $identity['pharmacies'][0]['user_id'], 'procurement.created', ['procurement_id' => 'DEMO-PROC-0000001']],
            ['00000000-0000-4000-8000-000000000003', $identity['drivers'][0]['user_id'], 'delivery.available', ['delivery_id' => $orders['DEMO-ORDER-TRANSIT-01']['delivery_id']]],
        ];
        foreach ($notifications as $index => [$id, $userId, $type, $data]) {
            DB::table('notifications')->insert([
                'id' => $id, 'type' => $type, 'notifiable_type' => 'App\\Models\\User', 'notifiable_id' => $userId,
                'data' => json_encode($data + ['message' => 'Deterministic theater notification.'], JSON_THROW_ON_ERROR),
                'read_at' => $index === 0 ? $now->copy()->subDay() : null,
                'created_at' => $now->copy()->subDays(3 - $index), 'updated_at' => $now,
            ]);
        }

        $auditTargets = [
            ['order.created', 'order', $orders['DEMO-ORDER-PENDING-001']['id']],
            ['order.accepted', 'order', $orders['DEMO-ORDER-TRANSIT-01']['id']],
            ['delivery.completed', 'delivery', $orders['DEMO-ORDER-DONE-00001']['delivery_id']],
            ['procurement.created', 'procurement_order', $procurements['DEMO-PROC-0000001']['id']],
            ['complaint.reviewed', 'complaint', $complaintId],
        ];
        foreach ($auditTargets as $index => [$scenario, $type, $id]) {
            DB::table('audit_logs')->insert([
                'actor_id' => $identity['admin_id'], 'action' => 'demo.scenario',
                'auditable_type' => $type, 'auditable_id' => $id,
                'metadata' => json_encode(['scenario' => $scenario, 'seed_index' => $index + 1], JSON_THROW_ON_ERROR),
                'ip_address' => '127.0.0.1', 'created_at' => $now->copy()->subDays(5 - $index), 'updated_at' => $now,
            ]);
        }
    }

    private function assertTheaterInvariants(): void
    {
        $failures = [];
        $expect = static function (bool $condition, string $message) use (&$failures): void {
            if (! $condition) {
                $failures[] = $message;
            }
        };

        $expect(DB::table('partners')->where('type', 'pharmacy')->count() === 10, 'Expected exactly 10 pharmacies.');
        $expect(DB::table('partners')->where('type', 'warehouse')->count() === 2, 'Expected exactly 2 warehouses.');
        $expect(DB::table('users')->where('role', 'patient')->count() === 2, 'Expected exactly 2 patients.');
        $expect(DB::table('drivers')->count() === 2, 'Expected exactly 2 drivers.');
        $expect(DB::table('medicines')->count() === 100, 'Expected exactly 100 medicines.');
        $expect(! DB::table('partners')->join('users', 'users.id', '=', 'partners.user_id')->where('users.role', 'admin')->exists(), 'The admin must not own a partner account.');
        $expect(
            DB::table('partners')->where('type', 'pharmacy')->where('business_name', 'Central Pharmacy')
                ->where('address', 'Damascus, Al-Hamra Street')->whereNotNull('latitude')->whereNotNull('longitude')->exists(),
            'Central Pharmacy must be geolocated on Al-Hamra Street in Damascus.'
        );

        foreach (DB::table('partners')->get(['id', 'type', 'business_name']) as $partner) {
            $expect(
                DB::table('subscriptions')->where('partner_id', $partner->id)->where('status', 'active')->exists(),
                "{$partner->business_name} must have an active subscription."
            );
            $expect(
                DB::table('inventories')->where('owner_type', $partner->type)->where('owner_id', $partner->id)
                    ->where('is_active', true)->where('quantity', '>', 0)->exists(),
                "{$partner->business_name} must have positive active stock."
            );
        }

        $statusFamilies = [
            'orders' => ['accepted', 'cancelled', 'completed', 'partial_approval_required', 'partial_offer_rejected', 'partially_accepted', 'pending_pharmacy_review', 'prescription_required', 'prescription_review', 'rejected'],
            'deliveries' => ['arrived', 'available', 'cancelled', 'claimed', 'delivered', 'failed', 'in_transit', 'pickup_started'],
            'procurement_orders' => ['accepted', 'completed', 'partial_approval_required', 'partial_offer_rejected', 'partially_accepted', 'pending_warehouse_review', 'rejected'],
        ];
        foreach ($statusFamilies as $table => $expectedStatuses) {
            $actualStatuses = DB::table($table)->distinct()->orderBy('status')->pluck('status')->all();
            $expect($actualStatuses === $expectedStatuses, "{$table} does not cover every current workflow status.");
        }

        $deliveryPaths = [
            'available' => [],
            'claimed' => ['claimed'],
            'pickup_started' => ['claimed', 'pickup_started'],
            'in_transit' => ['claimed', 'pickup_started', 'in_transit'],
            'arrived' => ['claimed', 'pickup_started', 'in_transit', 'arrived'],
            'failed' => ['claimed', 'pickup_started', 'in_transit', 'failed'],
            'cancelled' => ['cancelled'],
            'delivered' => ['claimed', 'pickup_started', 'in_transit', 'arrived', 'delivered'],
        ];
        foreach (DB::table('deliveries')->get() as $delivery) {
            $hasExactlyOneParent = ($delivery->order_id !== null) !== ($delivery->procurement_order_id !== null);
            $expect($hasExactlyOneParent, "Delivery {$delivery->public_id} must have exactly one parent.");
            $events = DB::table('delivery_events')->where('delivery_id', $delivery->id)->orderBy('id')->pluck('to_status')->all();
            $expect($events === $deliveryPaths[$delivery->status], "Delivery {$delivery->public_id} has an incomplete transition history.");
            if ($delivery->status === 'delivered' && $delivery->order_id !== null) {
                $expect(DB::table('orders')->where('id', $delivery->order_id)->where('status', 'completed')->exists(), "Delivered job {$delivery->public_id} must have a completed order.");
            }
            if ($delivery->status === 'delivered' && $delivery->procurement_order_id !== null) {
                $expect(DB::table('procurement_orders')->where('id', $delivery->procurement_order_id)->where('status', 'completed')->exists(), "Delivered job {$delivery->public_id} must have a completed procurement.");
            }
            if ($delivery->status === 'pickup_started') {
                $expect($delivery->pickup_code_hash !== null && $delivery->pickup_code_verified_at === null, "Pickup-started job {$delivery->public_id} must await the 4-digit driver code.");
            }
            if (in_array($delivery->status, ['in_transit', 'arrived', 'failed', 'delivered'], true)) {
                $expect($delivery->pickup_code_verified_at !== null, "Progressed job {$delivery->public_id} must have verified pickup.");
            }
            if ($delivery->status === 'arrived') {
                $expect($delivery->recipient_code_hash !== null && $delivery->recipient_code_verified_at === null, "Arrived job {$delivery->public_id} must await recipient verification.");
            }
            if ($delivery->status === 'delivered') {
                $expect($delivery->recipient_code_verified_at !== null, "Delivered job {$delivery->public_id} must have a verified recipient handoff.");
            }
        }
        foreach (DB::table('orders')->where('status', 'completed')->get(['id', 'public_id']) as $order) {
            $expect(DB::table('deliveries')->where('order_id', $order->id)->where('status', 'delivered')->exists(), "Completed order {$order->public_id} must have a delivered job.");
            $expect(DB::table('inventory_movements')->where('order_id', $order->id)->where('type', 'delivery_completed')->exists(), "Completed order {$order->public_id} must have a stock movement.");
        }
        foreach (DB::table('procurement_orders')->where('status', 'completed')->get(['id', 'public_id']) as $procurement) {
            $expect(DB::table('deliveries')->where('procurement_order_id', $procurement->id)->where('status', 'delivered')->exists(), "Completed procurement {$procurement->public_id} must have a delivered job.");
            $expect(
                DB::table('procurement_order_items')->join('procurement_item_batch_allocations', 'procurement_item_batch_allocations.procurement_order_item_id', '=', 'procurement_order_items.id')
                    ->where('procurement_order_items.procurement_order_id', $procurement->id)->where('procurement_item_batch_allocations.status', 'consumed')->exists(),
                "Completed procurement {$procurement->public_id} must consume its batch allocation."
            );
        }

        $expectedPharmacyReservations = [];
        $reservationItems = DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->get(['orders.pharmacy_id', 'orders.status', 'order_items.medicine_id', 'order_items.quantity', 'order_items.accepted_quantity']);
        foreach ($reservationItems as $item) {
            $reserved = match ($item->status) {
                'prescription_required', 'prescription_review', 'pending_pharmacy_review' => (int) $item->quantity,
                'partial_approval_required', 'accepted', 'partially_accepted' => (int) $item->accepted_quantity,
                default => 0,
            };
            $key = "{$item->pharmacy_id}:{$item->medicine_id}";
            $expectedPharmacyReservations[$key] = ($expectedPharmacyReservations[$key] ?? 0) + $reserved;
        }
        foreach (DB::table('inventories')->where('owner_type', 'pharmacy')->get(['owner_id', 'medicine_id', 'reserved_quantity']) as $stock) {
            $key = "{$stock->owner_id}:{$stock->medicine_id}";
            $expect((int) $stock->reserved_quantity === ($expectedPharmacyReservations[$key] ?? 0), "Pharmacy reservation total is inconsistent for stock {$key}.");
        }
        $warehouseReservations = DB::table('procurement_item_batch_allocations')->where('status', 'reserved')
            ->select('inventory_id', DB::raw('SUM(quantity) as quantity'))->groupBy('inventory_id')->pluck('quantity', 'inventory_id');
        foreach (DB::table('inventories')->where('owner_type', 'warehouse')->get(['id', 'reserved_quantity']) as $stock) {
            $expect((int) $stock->reserved_quantity === (int) ($warehouseReservations[$stock->id] ?? 0), "Warehouse reservation total is inconsistent for batch {$stock->id}.");
        }

        foreach (DB::table('orders')->get(['public_id', 'subtotal', 'tax_amount', 'delivery_fee', 'total']) as $order) {
            $expectedTotal = (float) $order->subtotal + (float) $order->tax_amount + (float) $order->delivery_fee;
            $expect(abs((float) $order->total - $expectedTotal) < 0.01, "Order {$order->public_id} has inconsistent totals.");
        }
        foreach (DB::table('procurement_orders')->get(['public_id', 'status', 'subtotal', 'delivery_fee', 'total']) as $procurement) {
            $expectedTotal = in_array($procurement->status, ['rejected', 'partial_offer_rejected'], true)
                ? 0.0
                : (float) $procurement->subtotal + (float) $procurement->delivery_fee;
            $expect(abs((float) $procurement->total - $expectedTotal) < 0.01, "Procurement {$procurement->public_id} has inconsistent totals.");
        }

        foreach (DB::table('drivers')->get(['id']) as $driver) {
            $ratingCount = DB::table('ratings')->join('deliveries', 'deliveries.order_id', '=', 'ratings.order_id')
                ->where('deliveries.driver_id', $driver->id)->count();
            $expect($ratingCount >= 2, "Driver {$driver->id} must have ratings from completed deliveries.");
        }

        if ($failures !== []) {
            throw new LogicException("The theater seed failed its consistency checks:\n- ".implode("\n- ", $failures));
        }
    }

    private function deliveryPrice(float $fromLatitude, float $fromLongitude, float $toLatitude, float $toLongitude): array
    {
        $key = implode('|', [$fromLatitude, $fromLongitude, $toLatitude, $toLongitude]);
        if (! isset($this->roadRoutes[$key])) {
            $route = app(MapProvider::class)->route($fromLatitude, $fromLongitude, $toLatitude, $toLongitude);
            $distance = round((float) $route['distance_meters'] / 1000, 2);
            $this->roadRoutes[$key] = [
                'distance' => $distance,
                'fee' => (float) round($distance * 100),
                'geometry' => $route['geometry'],
                'duration_seconds' => (int) $route['duration_seconds'],
                'provider' => (string) $route['provider'],
            ];
        }

        return $this->roadRoutes[$key];
    }
}
