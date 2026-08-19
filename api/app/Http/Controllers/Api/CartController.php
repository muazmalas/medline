<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\DatabaseTransaction;

class CartController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $cart = DB::table('carts')->where('user_id', $request->user()->id)->first();
        $items = $cart ? DB::table('cart_items')->join('medicines', 'medicines.id', '=', 'cart_items.medicine_id')->where('cart_items.cart_id', $cart->id)->select('cart_items.*', 'medicines.name_en', 'medicines.name_ar', 'medicines.manufacturer', 'medicines.prescription_required')->orderBy('cart_items.id')->get() : collect();
        return response()->json(['cart' => $cart, 'items' => $items]);
    }

    public function update(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'patient', 403);
        $data = $request->validate(['medicine_id' => ['required', 'integer', 'exists:medicines,id'], 'quantity' => ['required', 'integer', 'min:0', 'max:100']]);
        DatabaseTransaction::run(function () use ($request, $data) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            $cart = DB::table('carts')->where('user_id', $request->user()->id)->lockForUpdate()->first();
            $cartId = $cart?->id ?? DB::table('carts')->insertGetId(['user_id' => $request->user()->id, 'created_at' => now(), 'updated_at' => now()]);
            if ($data['quantity'] === 0) DB::table('cart_items')->where('cart_id', $cartId)->where('medicine_id', $data['medicine_id'])->delete();
            else DB::table('cart_items')->updateOrInsert(['cart_id' => $cartId, 'medicine_id' => $data['medicine_id']], ['quantity' => $data['quantity'], 'updated_at' => now(), 'created_at' => now()]);
            DB::table('carts')->where('id', $cartId)->update(['updated_at' => now()]);
        });
        return $this->show($request);
    }

    public function clear(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'patient', 403);
        DatabaseTransaction::run(function () use ($request) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->firstOrFail();
            $cart = DB::table('carts')->where('user_id', $request->user()->id)->lockForUpdate()->first();
            if ($cart) DB::table('cart_items')->where('cart_id', $cart->id)->delete();
        });
        return response()->json(['message' => 'Cart cleared.', 'items' => []]);
    }
}
