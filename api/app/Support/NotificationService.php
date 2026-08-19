<?php

namespace App\Support;

use App\Events\MedlineNotificationCreated;
use App\Jobs\DispatchExternalNotification;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NotificationService
{
    public static function send(User|int $user, string $type, array $data): void
    {
        $userId = $user instanceof User ? $user->id : $user;
        $notificationId = (string) Str::uuid();
        $persist = static function () use ($userId, $type, $data, $notificationId): void {
            $enabled = DB::table('notification_preferences')->where('user_id', $userId)->value('in_app_enabled');
            $locale = DB::table('users')->where('id', $userId)->value('locale') ?? 'en';
            $localized = self::localizedData($type, $data, $locale);
            if ($enabled !== false && $enabled !== 0) {
                DB::table('notifications')->insert([
                    'id' => $notificationId,
                    'type' => $type,
                    'notifiable_type' => User::class,
                    'notifiable_id' => $userId,
                    'data' => json_encode($localized, JSON_THROW_ON_ERROR),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                MedlineNotificationCreated::dispatch($userId, $notificationId, $type, $localized);
            }
            DispatchExternalNotification::dispatch($userId, $type, $localized, $notificationId);
        };
        if (DB::transactionLevel() > 0) {
            DB::afterCommit($persist);
            return;
        }
        $persist();
    }

    private static function localizedData(string $type, array $data, string $locale): array
    {
        if ($locale !== 'ar') return $data;
        $messages = [
            'registration.approve' => 'تمت الموافقة على طلب الشراكة الخاص بك.',
            'registration.reject' => 'تم رفض طلب الشراكة الخاص بك.',
            'registration.correction' => 'يحتاج طلب الشراكة الخاص بك إلى تصحيح.',
            'registration.submitted' => 'يوجد طلب شراكة أو سائق جديد بانتظار المراجعة.',
            'subscription.approve' => 'تمت الموافقة على إثبات اشتراكك.',
            'subscription.reject' => 'تم رفض إثبات اشتراكك.',
            'subscription.payment_submitted' => 'يوجد إثبات دفع اشتراك جديد بانتظار المراجعة.',
            'order.created' => 'يوجد طلب دواء جديد بانتظار المراجعة.',
            'order.created_patient' => 'تم إرسال طلبك بنجاح.',
            'order.cancelled' => 'تم إلغاء طلب الدواء.',
            'order.cancelled_patient' => 'تم إلغاء طلبك.',
            'order.decision' => 'تم تحديث قرار الصيدلية بشأن طلبك.',
            'delivery.created' => 'طلبك جاهز للتوصيل.',
            'delivery.available' => 'توجد مهمة توصيل جديدة متاحة.',
            'delivery.unavailable' => 'تم استلام مهمة التوصيل من سائق آخر.',
            'delivery.claimed' => 'استلم سائق طلب التوصيل الخاص بك.',
            'delivery.status' => 'تم تحديث حالة التوصيل.',
            'delivery.arrived' => 'وصل السائق إلى موقع التوصيل.',
            'delivery.failed' => 'تعذر إكمال التوصيل ويحتاج إلى متابعة.',
            'delivery.picked_up' => 'تم استلام طلبك من الصيدلية.',
            'delivery.in_transit' => 'طلبك في الطريق إليك.',
            'delivery.pin_available' => 'رمز التوصيل متاح في شاشة الطلب الآمنة.',
            'delivery.completed' => 'تم إكمال التوصيل بنجاح.',
            'payment.recorded' => 'تم تسجيل الدفع عند الاستلام.',
            'prescription.awaiting_review' => 'توجد وصفة طبية بانتظار مراجعة الصيدلي.',
            'prescription.approved' => 'تمت الموافقة على وصفتك الطبية.',
            'prescription.rejected' => 'تم رفض وصفتك الطبية.',
            'procurement.created' => 'يوجد طلب توريد جديد بانتظار المراجعة.',
            'procurement.decision' => 'تم تحديث قرار المستودع بشأن طلب التوريد.',
            'complaint.updated' => 'تم تحديث حالة شكواك.',
            'complaint.created' => 'تم تسجيل شكوى دعم جديدة للمراجعة.',
            'complaint.resolved' => 'تم حل شكواك.',
            'verification_document.approved' => 'تمت الموافقة على مستند التحقق.',
            'verification_document.rejected' => 'تم رفض مستند التحقق.',
            'verification_document.correction' => 'يحتاج مستند التحقق إلى تصحيح.',
        ];
        if (isset($messages[$type])) $data['message'] = self::normalizeArabicMessage($messages[$type]);
        return $data;
    }

    private static function normalizeArabicMessage(string $message): string
    {
        $legacyArabicMarker = chr(0xC3) . chr(0x98);
        $legacyArabicMarkerAlt = chr(0xC3) . chr(0x99);
        $doubleEncodedMarker = chr(0xC3) . chr(0x83);
        if (str_contains($message, $legacyArabicMarker) || str_contains($message, $legacyArabicMarkerAlt) || str_contains($message, $doubleEncodedMarker)) {
            $recovered = mb_convert_encoding($message, 'ISO-8859-1', 'UTF-8');
            if (str_contains($recovered, $legacyArabicMarker) || str_contains($recovered, $legacyArabicMarkerAlt)) {
                $recovered = mb_convert_encoding($recovered, 'ISO-8859-1', 'UTF-8');
            }
            return mb_check_encoding($recovered, 'UTF-8') ? $recovered : $message;
        }
        // Some legacy catalog entries were persisted as UTF-8 decoded as Latin-1
        // (for example, "ØªÙ…"). Normalize that representation before it reaches
        // the in-app record or an external provider template.
        if (str_contains($message, 'Ø') || str_contains($message, 'Ù')) {
            $latin = mb_convert_encoding($message, 'ISO-8859-1', 'UTF-8');
            return mb_convert_encoding($latin, 'UTF-8', 'ISO-8859-1');
        }
        if (str_contains($message, "\xD8") || str_contains($message, "\xD9")) {
            $latin = mb_convert_encoding($message, 'ISO-8859-1', 'UTF-8');
            return mb_convert_encoding($latin, 'UTF-8', 'ISO-8859-1');
        }
        if (! str_contains($message, 'Ø') && ! str_contains($message, 'Ù')) return $message;
        $latin = mb_convert_encoding($message, 'ISO-8859-1', 'UTF-8');
        return mb_convert_encoding($latin, 'UTF-8', 'ISO-8859-1');
    }
}
