<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Creates a small, repeatable presentation dataset for the university demo.
 *
 * Every business record is addressed by a stable demo key/public id. Running
 * `php artisan db:seed` repeatedly updates the same records and never creates
 * duplicate demo orders, notifications, or workflow history.
 */
class DemoScenarioSeeder extends Seeder
{
    public function run(): void
    {
        $password = (string) env('MEDLINE_SEED_PASSWORD', 'ChangeMe123!');
        $admin = User::where('email', 'admin@medline.local')->firstOrFail();
        $pharmacyUser = User::where('email', 'pharmacy@medline.local')->firstOrFail();
        $warehouseUser = User::where('email', 'warehouse@medline.local')->firstOrFail();

        $patient = $this->user('demo.patient@medline.local', 'Demo Patient', 'patient', $password, '+963911000001');
        $driver = $this->user('demo.driver@medline.local', 'Demo Driver', 'driver', $password, '+963911000002');
        $support = $this->user('support@medline.local', 'MedLine Support', 'support', $password, '+963911000003');

        DB::table('partners')->updateOrInsert(['user_id' => $pharmacyUser->id], [
            'type' => 'pharmacy', 'business_name' => 'Demo Central Pharmacy', 'license_number' => 'MEDLINE-DEMO-PH-001',
            'phone' => '+963912345680', 'address' => 'Damascus, University District', 'latitude' => 33.5150, 'longitude' => 36.2780, 'approval_status' => 'approved',
            'subscription_status' => 'active', 'updated_at' => now(), 'created_at' => now(),
        ]);
        $pharmacyId = (int) DB::table('partners')->where('user_id', $pharmacyUser->id)->value('id');
        $warehouseId = (int) DB::table('partners')->where('user_id', $warehouseUser->id)->value('id');
        $driverId = $this->driver($driver->id);
        $addressId = $this->address($patient->id);
        $categoryId = $this->category();
        $paracetamolId = $this->medicine('MED-PARA-500', $categoryId, 'Paracetamol 500mg', false);
        $ibuprofenId = $this->medicine('MED-IBU-400', $categoryId, 'Ibuprofen 400mg', false);
        $antibioticId = $this->medicine('MED-AMOX-500', $categoryId, 'Amoxicillin 500mg', true);

        $this->inventory($pharmacyId, $paracetamolId, 'pharmacy', 120, 500, 10);
        $this->inventory($pharmacyId, $ibuprofenId, 'pharmacy', 80, 750, 10);
        $this->inventory($pharmacyId, $antibioticId, 'pharmacy', 35, 1800, 5);
        $this->inventory($warehouseId, $paracetamolId, 'warehouse', 1000, 420, 50);
        $this->inventory($warehouseId, $ibuprofenId, 'warehouse', 700, 600, 50);
        $this->inventory($warehouseId, $antibioticId, 'warehouse', 300, 1500, 25);

        $this->preferences([$admin->id, $pharmacyUser->id, $warehouseUser->id, $patient->id, $driver->id, $support->id]);
        $this->consents($patient->id);
        $this->cart($patient->id, $ibuprofenId);
        $this->verificationDocument($driver->id, $driverId, $admin->id);
        $this->subscription($pharmacyId, $pharmacyUser->id, $admin->id);

        $orders = [];
        $orders['pending'] = $this->order('DEMO-ORDER-PENDING-001', $patient->id, $pharmacyId, $addressId, 'pending_pharmacy_review', $paracetamolId, 2, 500);
        $orders['prescription'] = $this->order('DEMO-ORDER-RX-0000001', $patient->id, $pharmacyId, $addressId, 'prescription_review', $antibioticId, 1, 1800);
        $orders['transit'] = $this->order('DEMO-ORDER-TRANSIT-01', $patient->id, $pharmacyId, $addressId, 'accepted', $ibuprofenId, 1, 750);
        $orders['completed'] = $this->order('DEMO-ORDER-DONE-00001', $patient->id, $pharmacyId, $addressId, 'completed', $paracetamolId, 1, 500);
        $orders['cancelled'] = $this->order('DEMO-ORDER-CANCEL-001', $patient->id, $pharmacyId, $addressId, 'cancelled', $ibuprofenId, 1, 750);

        $this->prescription($orders['prescription'], $patient->id, $admin->id, 'pending_review');
        $this->delivery($orders['pending'], null, 'available', null, null);
        $this->delivery($orders['prescription'], null, 'available', null, null);
        $this->delivery($orders['transit'], $driverId, 'in_transit', '34.8020750', '38.9968150');
        $completedDeliveryId = $this->delivery($orders['completed'], $driverId, 'delivered', '34.8020750', '38.9968150');
        $this->delivery($orders['cancelled'], null, 'failed', null, null);
        $this->deliveryEvents($orders['transit'], $driver->id);
        $this->rating($orders['completed'], $patient->id);

        $procurementId = $this->procurement($pharmacyId, $warehouseId, $ibuprofenId);
        $this->procurementItem($procurementId, $ibuprofenId);
        $this->complaint($patient->id, $orders['completed'], $support->id);
        $this->seedNotifications($patient->id, $pharmacyUser->id, $driver->id, $orders['transit'], $completedDeliveryId);
        $this->seedDeliveryAttempt($patient->id);
        $this->seedAuditLogs($admin->id, $orders);

        $this->command?->info('MedLine demo scenarios are ready (idempotent).');
    }

    private function user(string $email, string $name, string $role, string $password, string $phone): User
    {
        return User::updateOrCreate(['email' => $email], [
            'name' => $name, 'phone' => $phone, 'role' => $role, 'status' => 'active', 'locale' => 'en',
            'password' => Hash::make($password), 'email_verified_at' => now(),
        ]);
    }

    private function category(): int
    {
        DB::table('medicine_categories')->updateOrInsert(['slug' => 'demo-general'], ['name_en' => 'Demo General Medicines', 'name_ar' => 'أدوية عامة', 'updated_at' => now(), 'created_at' => now()]);
        return (int) DB::table('medicine_categories')->where('slug', 'demo-general')->value('id');
    }

    private function medicine(string $code, int $categoryId, string $name, bool $rx): int
    {
        DB::table('medicines')->updateOrInsert(['code' => $code], ['category_id' => $categoryId, 'name_en' => $name, 'name_ar' => $name, 'manufacturer' => 'MedLine Labs', 'form' => 'Tablets', 'dosage' => str_contains($name, 'Amoxicillin') ? '500mg' : 'Standard', 'prescription_required' => $rx, 'is_active' => true, 'updated_at' => now(), 'created_at' => now()]);
        return (int) DB::table('medicines')->where('code', $code)->value('id');
    }

    private function inventory(int $ownerId, int $medicineId, string $ownerType, int $quantity, int $price, int $threshold): void
    {
        DB::table('inventories')->updateOrInsert(['medicine_id' => $medicineId, 'owner_type' => $ownerType, 'owner_id' => $ownerId], ['quantity' => $quantity, 'reserved_quantity' => 0, 'unit_price' => $price, 'low_stock_threshold' => $threshold, 'updated_at' => now(), 'created_at' => now()]);
    }

    private function driver(int $userId): int
    {
        DB::table('drivers')->updateOrInsert(['user_id' => $userId], ['national_id' => 'DEMO-DRIVER-001', 'vehicle_type' => 'Motorcycle', 'vehicle_plate' => 'ML-2026', 'approval_status' => 'approved', 'is_available' => true, 'last_latitude' => 34.8020750, 'last_longitude' => 38.9968150, 'last_seen_at' => now(), 'updated_at' => now(), 'created_at' => now()]);
        return (int) DB::table('drivers')->where('user_id', $userId)->value('id');
    }

    private function address(int $userId): int
    {
        DB::table('addresses')->updateOrInsert(['user_id' => $userId, 'label' => 'University Demo Home'], ['address_line' => '12 Demo Street, near University Gate', 'city' => 'Damascus', 'district' => 'Al-Mazzeh', 'latitude' => 33.5138, 'longitude' => 36.2765, 'is_default' => true, 'updated_at' => now(), 'created_at' => now()]);
        return (int) DB::table('addresses')->where(['user_id' => $userId, 'label' => 'University Demo Home'])->value('id');
    }

    private function order(string $publicId, int $patientId, int $pharmacyId, int $addressId, string $status, int $medicineId, int $quantity, int $price): int
    {
        $subtotal = $quantity * $price;
        DB::table('orders')->updateOrInsert(['public_id' => $publicId], ['patient_id' => $patientId, 'pharmacy_id' => $pharmacyId, 'address_id' => $addressId, 'status' => $status, 'payment_method' => 'cash_on_delivery', 'payment_status' => $status === 'completed' ? 'paid' : 'pending', 'subtotal' => $subtotal, 'delivery_fee' => 2500, 'total' => $subtotal + 2500, 'delivery_address_snapshot' => '12 Demo Street, Damascus', 'patient_note' => 'University committee demonstration scenario', 'updated_at' => now(), 'created_at' => now()]);
        $id = (int) DB::table('orders')->where('public_id', $publicId)->value('id');
        DB::table('order_items')->updateOrInsert(['order_id' => $id, 'medicine_id' => $medicineId], ['quantity' => $quantity, 'accepted_quantity' => in_array($status, ['accepted', 'completed'], true) ? $quantity : 0, 'unit_price' => $price, 'line_total' => $subtotal, 'updated_at' => now(), 'created_at' => now()]);
        return $id;
    }

    private function prescription(int $orderId, int $patientId, int $reviewerId, string $status): void
    {
        DB::table('prescriptions')->updateOrInsert(['order_id' => $orderId], ['patient_id' => $patientId, 'file_path' => 'demo/prescriptions/demo-prescription.pdf', 'status' => $status, 'reviewed_by' => $status === 'approved' ? $reviewerId : null, 'review_note' => 'Demo prescription awaiting pharmacist review.', 'reviewed_at' => null, 'updated_at' => now(), 'created_at' => now()]);
    }

    private function delivery(int $orderId, ?int $driverId, string $status, ?string $lat, ?string $lng): int
    {
        $publicId = 'DEMO-DEL-' . str_pad((string) $orderId, 10, '0', STR_PAD_LEFT);
        DB::table('deliveries')->updateOrInsert(['order_id' => $orderId], ['public_id' => $publicId, 'driver_id' => $driverId, 'status' => $status, 'pin_hash' => Hash::make('2468'), 'pin_encrypted' => Crypt::encryptString('2468'), 'claimed_at' => $driverId ? now()->subMinutes(12) : null, 'completed_at' => $status === 'delivered' ? now()->subMinutes(4) : null, 'last_latitude' => $lat, 'last_longitude' => $lng, 'location_accuracy_meters' => $lat ? 8.5 : null, 'location_updated_at' => $lat ? now()->subMinutes(1) : null, 'updated_at' => now(), 'created_at' => now()]);
        return (int) DB::table('deliveries')->where('order_id', $orderId)->value('id');
    }

    private function deliveryEvents(int $orderId, int $actorId): void
    {
        $deliveryId = (int) DB::table('deliveries')->where('order_id', $orderId)->value('id');
        foreach ([['available', 'claimed'], ['claimed', 'pickup_started'], ['pickup_started', 'picked_up'], ['picked_up', 'in_transit']] as $index => [$from, $to]) {
            DB::table('delivery_events')->updateOrInsert(['delivery_id' => $deliveryId, 'from_status' => $from, 'to_status' => $to], ['actor_id' => $actorId, 'note' => 'Demo tracking event ' . ($index + 1), 'updated_at' => now(), 'created_at' => now()->subMinutes(15 - $index * 3)]);
        }
    }

    private function procurement(int $pharmacyId, int $warehouseId, int $medicineId): int
    {
        DB::table('procurement_orders')->updateOrInsert(['public_id' => 'DEMO-PROC-0000001'], ['pharmacy_id' => $pharmacyId, 'warehouse_id' => $warehouseId, 'status' => 'pending_warehouse_review', 'subtotal' => 6000, 'delivery_fee' => 2500, 'total' => 8500, 'delivery_address_snapshot' => 'Central Pharmacy, Damascus', 'pharmacy_note' => 'Demo replenishment request', 'updated_at' => now(), 'created_at' => now()]);
        return (int) DB::table('procurement_orders')->where('public_id', 'DEMO-PROC-0000001')->value('id');
    }

    private function procurementItem(int $procurementId, int $medicineId): void
    {
        DB::table('procurement_order_items')->updateOrInsert(['procurement_order_id' => $procurementId, 'medicine_id' => $medicineId], ['quantity' => 10, 'accepted_quantity' => 0, 'unit_price' => 600, 'line_total' => 6000, 'updated_at' => now(), 'created_at' => now()]);
    }

    private function subscription(int $partnerId, int $submittedBy, int $reviewedBy): void
    {
        DB::table('subscriptions')->updateOrInsert(['partner_id' => $partnerId, 'plan_code' => 'annual_pharmacy'], ['status' => 'active', 'amount' => 120000, 'duration_months' => 12, 'starts_at' => now()->toDateString(), 'ends_at' => now()->addYear()->toDateString(), 'updated_at' => now(), 'created_at' => now()]);
        $subscriptionId = (int) DB::table('subscriptions')->where(['partner_id' => $partnerId, 'plan_code' => 'annual_pharmacy'])->value('id');
        DB::table('payment_proofs')->updateOrInsert(['subscription_id' => $subscriptionId, 'file_path' => 'demo/payments/annual-pharmacy-proof.pdf'], ['submitted_by' => $submittedBy, 'status' => 'approved', 'reviewed_by' => $reviewedBy, 'review_note' => 'Demo payment proof approved.', 'reviewed_at' => now(), 'updated_at' => now(), 'created_at' => now()]);
    }

    private function complaint(int $patientId, int $orderId, int $assignedTo): void
    {
        DB::table('complaints')->updateOrInsert(['created_by' => $patientId, 'order_id' => $orderId, 'subject' => 'Demo delivery feedback'], ['category' => 'delivery', 'priority' => 'normal', 'status' => 'in_review', 'description' => 'Demo complaint showing support review workflow.', 'assigned_to' => $assignedTo, 'updated_at' => now(), 'created_at' => now()]);
    }

    private function rating(int $orderId, int $patientId): void
    {
        DB::table('ratings')->updateOrInsert(['order_id' => $orderId, 'created_by' => $patientId], ['score' => 5, 'comment' => 'Fast and professional demo delivery.', 'hidden_at' => null, 'updated_at' => now(), 'created_at' => now()]);
    }

    private function preferences(array $userIds): void
    {
        foreach ($userIds as $userId) DB::table('notification_preferences')->updateOrInsert(['user_id' => $userId], ['in_app_enabled' => true, 'push_enabled' => true, 'email_enabled' => true, 'sms_enabled' => false, 'updated_at' => now(), 'created_at' => now()]);
    }

    private function consents(int $userId): void
    {
        foreach (['privacy', 'terms', 'health_data'] as $type) DB::table('user_consents')->updateOrInsert(['user_id' => $userId, 'consent_type' => $type, 'revoked_at' => null], ['policy_version' => config('medline.privacy.policy_version'), 'consented_at' => now(), 'ip_address' => '127.0.0.1', 'user_agent' => 'MedLine university demo', 'updated_at' => now(), 'created_at' => now()]);
    }

    private function cart(int $userId, int $medicineId): void
    {
        DB::table('carts')->updateOrInsert(['user_id' => $userId], ['updated_at' => now(), 'created_at' => now()]);
        $cartId = (int) DB::table('carts')->where('user_id', $userId)->value('id');
        DB::table('cart_items')->updateOrInsert(['cart_id' => $cartId, 'medicine_id' => $medicineId], ['quantity' => 2, 'updated_at' => now(), 'created_at' => now()]);
    }

    private function verificationDocument(int $userId, int $driverId, int $reviewedBy): void
    {
        DB::table('verification_documents')->updateOrInsert(['user_id' => $userId, 'driver_id' => $driverId, 'document_type' => 'driver_license'], ['file_path' => 'demo/verification/demo-driver-license.pdf', 'status' => 'approved', 'reviewed_by' => $reviewedBy, 'review_note' => 'Demo document approved.', 'reviewed_at' => now(), 'updated_at' => now(), 'created_at' => now()]);
    }

    private function seedNotifications(int $patientId, int $pharmacyUserId, int $driverUserId, int $orderId, int $deliveryId): void
    {
        $rows = [
            ['id' => '00000000-0000-4000-8000-000000000001', 'user_id' => $patientId, 'type' => 'order.created_patient', 'data' => ['order_id' => $orderId, 'message' => 'Your demo order was submitted successfully.']],
            ['id' => '00000000-0000-4000-8000-000000000002', 'user_id' => $pharmacyUserId, 'type' => 'order.created', 'data' => ['order_id' => $orderId, 'message' => 'A demo order is awaiting pharmacy review.']],
            ['id' => '00000000-0000-4000-8000-000000000003', 'user_id' => $driverUserId, 'type' => 'delivery.available', 'data' => ['delivery_id' => $deliveryId, 'message' => 'A demo delivery job is available.']],
        ];
        foreach ($rows as $row) DB::table('notifications')->updateOrInsert(['id' => $row['id']], ['type' => $row['type'], 'notifiable_type' => User::class, 'notifiable_id' => $row['user_id'], 'data' => json_encode($row['data'], JSON_THROW_ON_ERROR), 'read_at' => null, 'updated_at' => now(), 'created_at' => now()]);
        foreach ($rows as $row) DB::table('notification_delivery_claims')->updateOrInsert(['notification_id' => $row['id'], 'channel' => 'email', 'target_key' => 'demo-email'], ['user_id' => $row['user_id'], 'status' => 'queued', 'updated_at' => now(), 'created_at' => now()]);
    }

    private function seedDeliveryAttempt(int $userId): void
    {
        $exists = DB::table('notification_delivery_attempts')->where('user_id', $userId)->where('notification_type', 'demo.seed')->where('target_key', 'demo-email')->exists();
        if (! $exists) DB::table('notification_delivery_attempts')->insert(['user_id' => $userId, 'notification_id' => '00000000-0000-4000-8000-000000000001', 'notification_type' => 'demo.seed', 'channel' => 'email', 'target_key' => 'demo-email', 'provider' => 'log', 'status' => 'sent', 'http_status' => 200, 'response_excerpt' => 'Local log mailer accepted demo message.', 'attempted_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }

    private function seedAuditLogs(int $adminId, array $orders): void
    {
        foreach ($orders as $stage => $orderId) {
            $key = 'demo-seed-' . $stage;
            if (! DB::table('audit_logs')->where('action', 'demo.scenario')->where('metadata', 'like', '%' . $key . '%')->exists()) DB::table('audit_logs')->insert(['actor_id' => $adminId, 'action' => 'demo.scenario', 'auditable_type' => 'order', 'auditable_id' => $orderId, 'metadata' => json_encode(['demo_key' => $key, 'stage' => $stage], JSON_THROW_ON_ERROR), 'ip_address' => '127.0.0.1', 'created_at' => now(), 'updated_at' => now()]);
        }
    }
}
