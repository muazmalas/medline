MedLine — {{ $locale === 'ar' ? 'الخدمات اللوجستية للرعاية الصحية' : 'Healthcare logistics' }}
{{ $eyebrow }}

{{ $title }}
[{{ $badgeLabel }}]

{{ $greeting }}

{{ $body }}

@if(filled($verificationCode ?? null))
{{ $locale === 'ar' ? 'رمز التحقق المكوّن من 4 أرقام' : 'YOUR 4-DIGIT VERIFICATION CODE' }}
{{ $verificationCode }}
@endif

@foreach($facts as $fact)
{{ $fact['label'] }}: {{ $fact['value'] }}
@endforeach

@if(filled($actionUrl ?? null) && filled($actionLabel ?? null))
{{ $actionLabel }}:
{{ $actionUrl }}
@endif

@if(filled($notice ?? null))
{{ $noticeTitle ?? 'Important note' }}
{{ $notice }}
@endif

@if($demoMode)
{{ $locale === 'ar' ? 'وضع العرض التجريبي نشط — تم التوجيه إلى صندوق اختبار MedLine.' : 'DEMO ROUTING ACTIVE — Delivered to the configured MedLine test inbox.' }}
@endif

{{ filled($verificationCode ?? null) ? ($locale === 'ar' ? 'رسالة تشغيلية تلقائية. شارك رمز التحقق فقط مع الشخص المحدد في التعليمات أعلاه.' : 'Automated operational message. Share this verification code only with the person identified in the instructions above.') : ($locale === 'ar' ? 'رسالة تشغيلية تلقائية. لا تشارك الروابط الآمنة أو بيانات اعتماد التسليم.' : 'Automated operational message. Do not share secure links or delivery credentials.') }}
© {{ $year }} MedLine
