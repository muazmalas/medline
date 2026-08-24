<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class MedlineMail
{
    public static function passwordReset(User $user, string $token): void
    {
        $locale = self::locale($user);
        $copy = $locale === 'ar'
            ? [
                'subject' => 'إعادة تعيين كلمة مرور MedLine',
                'eyebrow' => 'أمان الحساب',
                'title' => 'لنُعِد دخولك بأمان',
                'message' => 'تلقّينا طلباً لإعادة تعيين كلمة مرور حسابك. استخدم الزر أدناه لإنشاء كلمة مرور جديدة؛ الرابط صالح لمدة 60 دقيقة ويُستخدم مرة واحدة فقط.',
                'badge' => 'إجراء آمن مطلوب',
                'action' => 'إعادة تعيين كلمة المرور',
                'notice_title' => 'لم تطلب هذا التغيير؟',
                'notice' => 'يمكنك تجاهل هذه الرسالة بأمان. ستبقى كلمة مرورك الحالية دون تغيير.',
                'expires' => 'مدة الصلاحية',
                'expires_value' => '60 دقيقة',
                'security' => 'الحماية',
                'security_value' => 'استخدام لمرة واحدة',
            ]
            : [
                'subject' => 'Reset your MedLine password',
                'eyebrow' => 'Account security',
                'title' => 'Let’s get you securely signed in',
                'message' => 'We received a request to reset your account password. Use the button below to create a new one. This secure link expires in 60 minutes and can only be used once.',
                'badge' => 'Secure action required',
                'action' => 'Reset password',
                'notice_title' => 'Didn’t request this?',
                'notice' => 'You can safely ignore this email. Your current password will remain unchanged.',
                'expires' => 'Expires in',
                'expires_value' => '60 minutes',
                'security' => 'Security',
                'security_value' => 'Single-use link',
            ];

        $url = self::webUrl() . '/?recovery=password&email=' . rawurlencode($user->email) . '&token=' . rawurlencode($token);

        self::send($user->email, $copy['subject'], [
            'locale' => $locale,
            'recipientName' => $user->name,
            'eyebrow' => $copy['eyebrow'],
            'title' => $copy['title'],
            'body' => $copy['message'],
            'badgeLabel' => $copy['badge'],
            'badgeTone' => 'warning',
            'actionLabel' => $copy['action'],
            'actionUrl' => $url,
            'facts' => [
                ['label' => $copy['expires'], 'value' => $copy['expires_value']],
                ['label' => $copy['security'], 'value' => $copy['security_value']],
            ],
            'noticeTitle' => $copy['notice_title'],
            'notice' => $copy['notice'],
        ]);
    }

    public static function emailVerification(User $user, string $token): void
    {
        $locale = self::locale($user);
        $copy = $locale === 'ar'
            ? [
                'subject' => 'تأكيد بريدك الإلكتروني في MedLine',
                'eyebrow' => 'تأكيد الهوية',
                'title' => 'خطوة أخيرة لتأمين حسابك',
                'message' => 'أكد عنوان بريدك الإلكتروني لإكمال إعداد حساب MedLine والحفاظ على أمان الإشعارات وتحديثات الطلبات.',
                'badge' => 'بانتظار التأكيد',
                'action' => 'تأكيد البريد الإلكتروني',
                'expires' => 'مدة الصلاحية',
                'expires_value' => '24 ساعة',
                'account' => 'الحساب',
                'notice_title' => 'لم تنشئ هذا الحساب؟',
                'notice' => 'لا تضغط على زر التأكيد. يمكنك تجاهل الرسالة وسيبقى العنوان غير مؤكد.',
            ]
            : [
                'subject' => 'Verify your MedLine email address',
                'eyebrow' => 'Identity verification',
                'title' => 'One last step to secure your account',
                'message' => 'Verify your email address to finish setting up MedLine and keep order updates, delivery alerts, and account notices secure.',
                'badge' => 'Verification pending',
                'action' => 'Verify email address',
                'expires' => 'Link expires in',
                'expires_value' => '24 hours',
                'account' => 'Account',
                'notice_title' => 'Didn’t create this account?',
                'notice' => 'Do not select the verification button. You can ignore this message and the address will remain unverified.',
            ];

        $url = rtrim((string) config('app.url'), '/') . '/api/v1/auth/verify-email?email=' . rawurlencode($user->email) . '&token=' . rawurlencode($token);

        self::send($user->email, $copy['subject'], [
            'locale' => $locale,
            'recipientName' => $user->name,
            'eyebrow' => $copy['eyebrow'],
            'title' => $copy['title'],
            'body' => $copy['message'],
            'badgeLabel' => $copy['badge'],
            'badgeTone' => 'info',
            'actionLabel' => $copy['action'],
            'actionUrl' => $url,
            'facts' => [
                ['label' => $copy['expires'], 'value' => $copy['expires_value']],
                ['label' => $copy['account'], 'value' => $user->email],
            ],
            'noticeTitle' => $copy['notice_title'],
            'notice' => $copy['notice'],
        ]);
    }

    public static function notification(User $user, string $type, array $data): void
    {
        $locale = self::locale($user);
        $presentation = self::notificationPresentation($type, $data, $locale, $user->role);

        self::send($user->email, $presentation['subject'], [
            'locale' => $locale,
            'recipientName' => $user->name,
            'eyebrow' => $presentation['eyebrow'],
            'title' => $presentation['title'],
            'body' => (string) ($data['message'] ?? $presentation['fallbackMessage']),
            'badgeLabel' => $presentation['badgeLabel'],
            'badgeTone' => $presentation['badgeTone'],
            'actionLabel' => $presentation['actionLabel'],
            'actionUrl' => self::webUrl() . $presentation['path'],
            'facts' => self::notificationFacts($type, $data, $locale),
            'noticeTitle' => $presentation['noticeTitle'],
            'notice' => isset($data['note']) && filled($data['note'])
                ? (string) $data['note']
                : $presentation['notice'],
        ]);
    }

    public static function deliveryVerificationCode(
        User $recipient,
        string $purpose,
        string $code,
        string $deliveryReference,
        string $counterpartyName
    ): void {
        $locale = self::locale($recipient);
        $minutes = (int) config('medline.delivery_verification_ttl_minutes', 10);
        $isPickup = $purpose === 'pickup';
        $copy = $locale === 'ar'
            ? ($isPickup
                ? [
                    'subject' => 'رمز استلام طلب MedLine',
                    'eyebrow' => 'التحقق من الاستلام · الخطوة 1 من 2',
                    'title' => 'رمز الاستلام جاهز',
                    'body' => "اعرض هذا الرمز على فريق {$counterpartyName}. سيُدخله الصيدلي أو موظف المستودع لتأكيد استلامك للأدوية قبل تسليمها لك.",
                    'badge' => 'تحقق آمن مطلوب',
                    'action' => 'عرض التوصيل',
                    'notice_title' => 'حافظ على أمان الطلب',
                    'notice' => 'لا تشارك الرمز إلا مع فريق نقطة الاستلام الظاهرة في طلبك. لن يطلب منك MedLine هذا الرمز عبر الهاتف.',
                    'step' => 'مرحلة التحقق',
                    'step_value' => 'استلام السائق من نقطة التجهيز',
                    'expires' => 'تنتهي الصلاحية خلال',
                    'minutes' => "{$minutes} دقائق",
                ]
                : [
                    'subject' => 'رمز استلام توصيل MedLine',
                    'eyebrow' => 'التحقق من التسليم · الخطوة 2 من 2',
                    'title' => 'استخدم هذا الرمز لاستلام أدويتك',
                    'body' => "أعطِ هذا الرمز للسائق {$counterpartyName} عند وصوله فقط. سيدخله السائق في MedLine قبل أن يسلّمك الأدوية.",
                    'badge' => 'السائق عند موقع التسليم',
                    'action' => 'متابعة التوصيل',
                    'notice_title' => 'سلّم الرمز في الوقت الصحيح',
                    'notice' => 'لا تعطِ الرمز للسائق قبل وصوله إليك ومعاينتك للطلب. هذا الرمز مخصص لهذا التوصيل فقط.',
                    'step' => 'مرحلة التحقق',
                    'step_value' => 'تسليم السائق إلى المستلم',
                    'expires' => 'تنتهي الصلاحية خلال',
                    'minutes' => "{$minutes} دقائق",
                ])
            : ($isPickup
                ? [
                    'subject' => 'Your MedLine pickup verification code',
                    'eyebrow' => 'Pickup verification · Step 1 of 2',
                    'title' => 'Your pickup code is ready',
                    'body' => "Show this code to the team at {$counterpartyName}. The pharmacist or warehouse staff member enters it to confirm the medicines were handed to you.",
                    'badge' => 'Secure verification required',
                    'action' => 'View delivery',
                    'notice_title' => 'Keep the order secure',
                    'notice' => 'Only share this code with staff at the pickup location shown in your delivery. MedLine will never ask for it by phone.',
                    'step' => 'Verification stage',
                    'step_value' => 'Driver pickup from fulfilment partner',
                    'expires' => 'Expires in',
                    'minutes' => "{$minutes} minutes",
                ]
                : [
                    'subject' => 'Your MedLine delivery handoff code',
                    'eyebrow' => 'Recipient verification · Step 2 of 2',
                    'title' => 'Use this code to receive your medicines',
                    'body' => "Give this code to driver {$counterpartyName} only after the driver reaches you. The driver enters it in MedLine before handing over the medicines.",
                    'badge' => 'Driver at delivery location',
                    'action' => 'Track delivery',
                    'notice_title' => 'Share it at the right moment',
                    'notice' => 'Do not give the code to the driver before arrival and before you inspect the order. This code works only for this delivery.',
                    'step' => 'Verification stage',
                    'step_value' => 'Driver handoff to recipient',
                    'expires' => 'Expires in',
                    'minutes' => "{$minutes} minutes",
                ]);

        self::send($recipient->email, $copy['subject'], [
            'locale' => $locale,
            'recipientName' => $recipient->name,
            'eyebrow' => $copy['eyebrow'],
            'title' => $copy['title'],
            'body' => $copy['body'],
            'badgeLabel' => $copy['badge'],
            'badgeTone' => 'warning',
            'verificationCode' => $code,
            'actionLabel' => $copy['action'],
            'actionUrl' => self::webUrl() . '/deliveries',
            'facts' => [
                ['label' => $locale === 'ar' ? 'رقم التوصيل' : 'Delivery', 'value' => $deliveryReference],
                ['label' => $copy['expires'], 'value' => $copy['minutes']],
                ['label' => $copy['step'], 'value' => $copy['step_value']],
            ],
            'noticeTitle' => $copy['notice_title'],
            'notice' => $copy['notice'],
        ]);
    }

    public static function showcase(string $to): void
    {
        self::send($to, 'MedLine email experience', [
            'locale' => 'en',
            'recipientName' => 'MedLine demo team',
            'eyebrow' => 'Communication center',
            'title' => 'Every important update, beautifully delivered',
            'body' => 'Your new MedLine email system is active. Account security, orders, prescriptions, procurement, deliveries, subscriptions, and support updates now share this polished, responsive experience.',
            'badgeLabel' => 'Email system active',
            'badgeTone' => 'success',
            'actionLabel' => 'Open MedLine workspace',
            'actionUrl' => self::webUrl(),
            'facts' => [
                ['label' => 'Delivery mode', 'value' => 'Demo inbox'],
                ['label' => 'Template coverage', 'value' => 'All email types'],
            ],
            'noticeTitle' => 'One consistent experience',
            'notice' => 'Every message now includes a clear status, useful context, and the next best action while retaining a plain-text fallback for accessibility.',
        ]);
    }

    private static function send(string $to, string $subject, array $content): void
    {
        $locale = in_array($content['locale'] ?? 'en', ['en', 'ar'], true) ? $content['locale'] : 'en';
        $tone = in_array($content['badgeTone'] ?? 'info', ['info', 'success', 'warning', 'danger'], true) ? $content['badgeTone'] : 'info';
        $palette = [
            'info' => ['background' => '#DDF3FB', 'foreground' => '#075E82', 'accent' => '#1689B8'],
            'success' => ['background' => '#DCF5E9', 'foreground' => '#0E6247', 'accent' => '#159168'],
            'warning' => ['background' => '#FFF1CC', 'foreground' => '#704500', 'accent' => '#D39422'],
            'danger' => ['background' => '#FDE8EC', 'foreground' => '#8F3040', 'accent' => '#C65867'],
        ][$tone];
        $viewData = [
            ...$content,
            'subject' => $subject,
            'locale' => $locale,
            'direction' => $locale === 'ar' ? 'rtl' : 'ltr',
            'preheader' => Str::limit(strip_tags((string) ($content['body'] ?? $subject)), 140),
            'greeting' => $locale === 'ar'
                ? 'مرحباً ' . ($content['recipientName'] ?? '') . '،'
                : 'Hello ' . ($content['recipientName'] ?? 'there') . ',',
            'facts' => array_values(array_filter($content['facts'] ?? [], fn ($fact) => filled($fact['value'] ?? null))),
            'badgeBackground' => $palette['background'],
            'badgeForeground' => $palette['foreground'],
            'accentColor' => $palette['accent'],
            'demoMode' => filled(config('mail.to.address')),
            'year' => now()->year,
        ];

        Mail::send(['html' => 'emails.medline', 'text' => 'emails.medline-text'], $viewData, function ($mail) use ($to, $subject) {
            $mail->to($to)->subject($subject);
        });
    }

    private static function notificationPresentation(string $type, array $data, string $locale, string $role): array
    {
        $group = Str::before($type, '.');
        $groups = $locale === 'ar'
            ? [
                'registration' => ['eyebrow' => 'الحساب والشركاء', 'title' => 'تحديث مراجعة الحساب', 'action' => 'عرض المراجعات'],
                'subscription' => ['eyebrow' => 'الاشتراك', 'title' => 'تحديث حالة الاشتراك', 'action' => 'عرض الاشتراك'],
                'order' => ['eyebrow' => 'طلبات الأدوية', 'title' => 'تحديث على الطلب', 'action' => 'عرض الطلبات'],
                'delivery' => ['eyebrow' => 'التوصيل', 'title' => 'تحديث على التوصيل', 'action' => 'عرض التوصيلات'],
                'payment' => ['eyebrow' => 'الدفع', 'title' => 'تأكيد عملية الدفع', 'action' => 'عرض الطلب'],
                'prescription' => ['eyebrow' => 'الوصفات الطبية', 'title' => 'تحديث مراجعة الوصفة', 'action' => 'عرض الطلبات'],
                'procurement' => ['eyebrow' => 'المشتريات', 'title' => 'تحديث على طلب التوريد', 'action' => 'عرض المشتريات'],
                'complaint' => ['eyebrow' => 'الدعم', 'title' => 'تحديث على حالة الدعم', 'action' => 'عرض الحالة'],
                'verification_document' => ['eyebrow' => 'التحقق', 'title' => 'تحديث مراجعة المستند', 'action' => 'عرض التحقق'],
            ]
            : [
                'registration' => ['eyebrow' => 'Account & partners', 'title' => 'Account review update', 'action' => 'View reviews'],
                'subscription' => ['eyebrow' => 'Subscription', 'title' => 'Subscription status update', 'action' => 'View subscription'],
                'order' => ['eyebrow' => 'Medicine orders', 'title' => 'Your order has an update', 'action' => 'View orders'],
                'delivery' => ['eyebrow' => 'Delivery', 'title' => 'Delivery progress update', 'action' => 'View deliveries'],
                'payment' => ['eyebrow' => 'Payment', 'title' => 'Payment confirmation', 'action' => 'View order'],
                'prescription' => ['eyebrow' => 'Prescription', 'title' => 'Prescription review update', 'action' => 'View orders'],
                'procurement' => ['eyebrow' => 'Procurement', 'title' => 'Procurement request update', 'action' => 'View procurement'],
                'complaint' => ['eyebrow' => 'Support', 'title' => 'Support case update', 'action' => 'View case'],
                'verification_document' => ['eyebrow' => 'Verification', 'title' => 'Document review update', 'action' => 'View verification'],
            ];
        $copy = $groups[$group] ?? ($locale === 'ar'
            ? ['eyebrow' => 'MedLine', 'title' => 'لديك تحديث جديد', 'action' => 'فتح MedLine']
            : ['eyebrow' => 'MedLine operations', 'title' => 'You have a new update', 'action' => 'Open MedLine']);
        [$badgeLabel, $badgeTone] = self::badge($type, $data, $locale);
        $path = match ($group) {
            'registration', 'subscription', 'verification_document' => '/subscriptions',
            'order', 'payment', 'prescription' => '/orders',
            'delivery' => '/deliveries',
            'procurement' => '/procurement',
            'complaint' => $role === 'admin' ? '/complaints' : '/orders',
            default => '/',
        };

        return [
            ...$copy,
            'subject' => 'MedLine · ' . $copy['title'],
            'badgeLabel' => $badgeLabel,
            'badgeTone' => $badgeTone,
            'actionLabel' => $copy['action'],
            'path' => $path,
            'fallbackMessage' => $locale === 'ar' ? 'لديك تحديث جديد في مساحة عمل MedLine.' : 'You have a new update in your MedLine workspace.',
            'noticeTitle' => $locale === 'ar' ? 'ما الخطوة التالية؟' : 'What happens next?',
            'notice' => $locale === 'ar' ? 'افتح مساحة العمل لمراجعة التفاصيل الكاملة وأي إجراء متاح لك.' : 'Open your workspace to review the complete details and any action available to you.',
        ];
    }

    private static function badge(string $type, array $data, string $locale): array
    {
        $status = strtolower((string) ($data['status'] ?? Str::afterLast($type, '.')));
        $humanStatus = Str::headline($status);
        if (preg_match('/accept|accepted|approve|approved|complete|completed|delivered|resolved|recorded/', $status)) {
            return [$locale === 'ar' ? 'مكتمل بنجاح' : ($humanStatus ?: 'Completed'), 'success'];
        }
        if (preg_match('/reject|rejected|failed|cancel|cancelled|declin|unavailable/', $status)) {
            return [$locale === 'ar' ? 'يتطلب الانتباه' : ($humanStatus ?: 'Attention needed'), 'danger'];
        }
        if (preg_match('/correction|awaiting|pending|submitted|review/', $status)) {
            return [$locale === 'ar' ? 'بانتظار الإجراء' : ($humanStatus ?: 'Action required'), 'warning'];
        }
        if (preg_match('/available|claimed|picked|transit|arrived|created|status|decision|updated/', $status)) {
            return [$locale === 'ar' ? 'تحديث جديد' : ($humanStatus ?: 'New update'), 'info'];
        }

        return [$locale === 'ar' ? 'تم التحديث' : ($humanStatus ?: 'Updated'), 'info'];
    }

    private static function notificationFacts(string $type, array $data, string $locale): array
    {
        $referenceKeys = ['order_id', 'procurement_id', 'delivery_id', 'subscription_id', 'complaint_id', 'document_id', 'prescription_id', 'partner_id', 'user_id'];
        $reference = null;
        foreach ($referenceKeys as $key) {
            if (filled($data[$key] ?? null)) {
                $reference = ['label' => Str::headline(str_replace('_id', '', $key)), 'value' => (string) $data[$key]];
                break;
            }
        }
        $status = filled($data['status'] ?? null)
            ? ['label' => $locale === 'ar' ? 'الحالة' : 'Status', 'value' => Str::headline((string) $data['status'])]
            : ['label' => $locale === 'ar' ? 'نوع التحديث' : 'Update type', 'value' => Str::headline(str_replace('.', ' ', $type))];

        return array_values(array_filter([$reference, $status]));
    }

    private static function locale(User $user): string
    {
        return $user->locale === 'ar' ? 'ar' : 'en';
    }

    private static function webUrl(): string
    {
        return rtrim((string) config('medline.web_url', 'http://127.0.0.1:3001'), '/');
    }
}
