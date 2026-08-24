<?php

namespace Tests\Feature;

use App\Models\Medicine;
use App\Models\Partner;
use App\Models\User;
use App\Support\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use ZipArchive;

class CatalogAndWorkingHoursTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_import_native_excel_and_manage_medicine_lifecycle(): void
    {
        $administrator = User::factory()->create(['role' => 'admin']);
        $path = $this->createMedicineWorkbook();
        $file = new UploadedFile($path, 'medicine-catalog.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);

        $this->actingAs($administrator)
            ->post('/api/v1/medicines/import', ['file' => $file], ['Idempotency-Key' => 'xlsx-medicine-import'])
            ->assertOk()
            ->assertJsonPath('rows', 1);

        $medicine = Medicine::where('code', 'XLSX-100')->firstOrFail();
        $this->assertSame('Excel Medicine 100mg', $medicine->name_en);
        $this->assertTrue($medicine->prescription_required);

        $this->actingAs($administrator)
            ->patchJson('/api/v1/medicines/'.$medicine->id.'/status', ['is_active' => false], ['Idempotency-Key' => 'deactivate-xlsx-medicine'])
            ->assertOk()
            ->assertJsonPath('medicine.is_active', false);

        $this->actingAs($administrator)
            ->getJson('/api/v1/medicines?include_inactive=1&status=inactive&sort_by=created_at&sort_direction=desc')
            ->assertOk()
            ->assertJsonPath('data.0.id', $medicine->id);

        $this->actingAs($administrator)
            ->deleteJson('/api/v1/medicines/'.$medicine->id, [], ['Idempotency-Key' => 'delete-xlsx-medicine'])
            ->assertMethodNotAllowed();

        $this->assertDatabaseHas('medicines', ['id' => $medicine->id, 'is_active' => false]);
        @unlink($path);
    }

    public function test_pharmacy_can_save_multiple_non_overlapping_shifts_per_day(): void
    {
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $patient = User::factory()->create(['role' => 'patient']);
        $partner = Partner::create([
            'user_id' => $pharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Split Shift Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        $shifts = [
            ['day_of_week' => 1, 'opens_at' => '08:00', 'closes_at' => '12:00'],
            ['day_of_week' => 1, 'opens_at' => '16:00', 'closes_at' => '21:00'],
            ['day_of_week' => 2, 'opens_at' => '09:00', 'closes_at' => '17:00'],
        ];

        $this->actingAs($pharmacyUser)
            ->putJson('/api/v1/partner/working-hours', ['shifts' => $shifts], ['Idempotency-Key' => 'save-split-shifts'])
            ->assertOk()
            ->assertJsonCount(3, 'shifts');

        $this->assertDatabaseCount('partner_working_hours', 3);
        $this->assertDatabaseHas('partner_working_hours', ['partner_id' => $partner->id, 'day_of_week' => 1, 'opens_at' => '16:00']);
        $this->actingAs($pharmacyUser)->getJson('/api/v1/partner/working-hours')->assertOk()->assertJsonCount(3, 'data');

        $this->actingAs($pharmacyUser)
            ->putJson('/api/v1/partner/working-hours', ['shifts' => [
                ['day_of_week' => 1, 'opens_at' => '08:00', 'closes_at' => '13:00'],
                ['day_of_week' => 1, 'opens_at' => '12:00', 'closes_at' => '17:00'],
            ]], ['Idempotency-Key' => 'reject-overlap'])
            ->assertUnprocessable();

        $this->actingAs($patient)->getJson('/api/v1/partner/working-hours')->assertForbidden();
    }

    public function test_admin_partner_profile_includes_registered_working_hours(): void
    {
        $administrator = User::factory()->create(['role' => 'admin']);
        $pharmacyUser = User::factory()->create(['role' => 'pharmacy']);
        $partner = Partner::create([
            'user_id' => $pharmacyUser->id,
            'type' => 'pharmacy',
            'business_name' => 'Profile Hours Pharmacy',
            'approval_status' => 'approved',
            'subscription_status' => 'active',
        ]);
        DB::table('partner_working_hours')->insert([
            ['partner_id' => $partner->id, 'day_of_week' => 1, 'opens_at' => '08:00', 'closes_at' => '12:00', 'created_at' => now(), 'updated_at' => now()],
            ['partner_id' => $partner->id, 'day_of_week' => 1, 'opens_at' => '16:00', 'closes_at' => '21:00', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->actingAs($administrator)
            ->getJson('/api/v1/admin/partners/'.$partner->id)
            ->assertOk()
            ->assertJsonCount(2, 'partner.working_hours')
            ->assertJsonPath('partner.working_hours.0.day_of_week', 1)
            ->assertJsonPath('partner.working_hours.0.opens_at', '08:00:00')
            ->assertJsonPath('partner.working_hours.1.opens_at', '16:00:00');
    }

    public function test_notifications_support_search_status_sorting_and_pagination(): void
    {
        $user = User::factory()->create(['role' => 'patient']);
        NotificationService::send($user, 'order.created_patient', ['message' => 'Order Alpha submitted.']);
        NotificationService::send($user, 'delivery.completed', ['message' => 'Delivery Beta completed.']);
        DB::table('notifications')->where('notifiable_id', $user->id)->where('type', 'delivery.completed')->update(['read_at' => now()]);
        $this->actingAs($user)
            ->getJson('/api/v1/notifications?search=created&status=unread&sort_by=type&sort_direction=asc&per_page=5')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'order.created_patient')
            ->assertJsonPath('unread_count', 1);

        $this->actingAs($user)
            ->getJson('/api/v1/notifications?status=read&per_page=5')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'delivery.completed');
    }

    private function createMedicineWorkbook(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'medline-xlsx-');
        $xlsxPath = $path.'.xlsx';
        rename($path, $xlsxPath);
        $strings = ['code', 'name_en', 'name_ar', 'manufacturer', 'dosage', 'prescription_required', 'XLSX-100', 'Excel Medicine 100mg', 'دواء إكسل 100 ملغ', 'Workbook Labs', '100mg', 'yes'];
        $shared = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="12" uniqueCount="12">'.implode('', array_map(fn (string $value) => '<si><t>'.htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8').'</t></si>', $strings)).'</sst>';
        $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row><row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2" t="s"><v>8</v></c><c r="D2" t="s"><v>9</v></c><c r="E2" t="s"><v>10</v></c><c r="F2" t="s"><v>11</v></c></row></sheetData></worksheet>';
        $zip = new ZipArchive();
        $zip->open($xlsxPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
        $zip->addFromString('xl/sharedStrings.xml', $shared);
        $zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
        $zip->close();
        return $xlsxPath;
    }
}
