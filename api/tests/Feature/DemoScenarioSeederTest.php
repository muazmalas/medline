<?php

namespace Tests\Feature;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DemoScenarioSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_seed_is_repeatable_and_covers_the_operational_stages(): void
    {
        Artisan::call('db:seed', ['--class' => DatabaseSeeder::class]);
        $firstCounts = $this->demoCounts();

        Artisan::call('db:seed', ['--class' => DatabaseSeeder::class]);
        $secondCounts = $this->demoCounts();

        $this->assertSame($firstCounts, $secondCounts);
        $this->assertSame(5, $secondCounts['orders']);
        $this->assertSame(5, $secondCounts['deliveries']);
        $this->assertSame(3, $secondCounts['notifications']);
        $this->assertSame(5, $secondCounts['audit_logs']);
        $this->assertDatabaseHas('orders', ['public_id' => 'DEMO-ORDER-RX-0000001', 'status' => 'prescription_review']);
        $this->assertDatabaseHas('deliveries', ['status' => 'in_transit']);
        $this->assertDatabaseHas('procurement_orders', ['public_id' => 'DEMO-PROC-0000001', 'status' => 'pending_warehouse_review']);
        $this->assertDatabaseHas('complaints', ['subject' => 'Demo delivery feedback', 'status' => 'in_review']);
    }

    private function demoCounts(): array
    {
        return [
            'orders' => DB::table('orders')->where('public_id', 'like', 'DEMO-ORDER-%')->count(),
            'deliveries' => DB::table('deliveries')->where('public_id', 'like', 'DEMO-DEL-%')->count(),
            'notifications' => DB::table('notifications')->where('id', 'like', '00000000-0000-4000-8000-00000000000%')->count(),
            'audit_logs' => DB::table('audit_logs')->where('action', 'demo.scenario')->count(),
        ];
    }
}
