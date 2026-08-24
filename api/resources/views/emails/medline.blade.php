<!doctype html>
<html lang="{{ $locale }}" dir="{{ $direction }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>{{ $subject }}</title>
    <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0; mso-table-rspace: 0; }
        table { border-collapse: collapse !important; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        body { width: 100% !important; min-width: 100%; height: 100% !important; margin: 0 !important; padding: 0 !important; background: #EDF4F7; }
        a { color: #086B91; }
        @media screen and (max-width: 640px) {
            .email-shell { width: 100% !important; border-radius: 0 !important; }
            .mobile-pad { padding-right: 24px !important; padding-left: 24px !important; }
            .hero-title { font-size: 30px !important; line-height: 38px !important; }
            .fact-column { display: block !important; width: 100% !important; padding: 0 0 12px !important; }
            .cta-button { display: block !important; width: auto !important; text-align: center !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#EDF4F7;color:#17384E;font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">{{ $preheader }}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#EDF4F7;">
    <tr>
        <td align="center" style="padding:36px 12px;">
            <table role="presentation" class="email-shell" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;overflow:hidden;background:#FFFFFF;border:1px solid #D7E6ED;border-radius:24px;box-shadow:0 18px 55px rgba(8,47,73,.12);">
                <tr>
                    <td style="height:6px;background:#43B5E7;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                    <td class="mobile-pad" style="padding:28px 42px;background-color:#082F49;background-image:linear-gradient(135deg,#082F49 0%,#0A5774 100%);">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td width="52" valign="middle">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="44" height="44" style="width:44px;height:44px;border-radius:14px;background:#1689B8;color:#FFFFFF;font-size:22px;font-weight:800;line-height:44px;box-shadow:0 8px 20px rgba(0,0,0,.18);">M</td></tr></table>
                                </td>
                                <td valign="middle" style="padding-{{ $direction === 'rtl' ? 'right' : 'left' }}:12px;">
                                    <div style="color:#FFFFFF;font-size:20px;font-weight:800;line-height:26px;letter-spacing:-.2px;">MedLine</div>
                                    <div style="padding-top:2px;color:#A9D9EA;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.7px;text-transform:uppercase;">{{ $locale === 'ar' ? 'الخدمات اللوجستية للرعاية الصحية' : 'Healthcare logistics' }}</div>
                                </td>
                                <td align="{{ $direction === 'rtl' ? 'left' : 'right' }}" valign="middle">
                                    <span style="display:inline-block;padding:7px 10px;border:1px solid rgba(255,255,255,.2);border-radius:999px;color:#D8F1F8;font-size:10px;font-weight:700;line-height:12px;letter-spacing:.5px;text-transform:uppercase;">{{ $locale === 'ar' ? 'تحديث آمن' : 'Secure update' }}</span>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                @if($demoMode)
                <tr>
                    <td class="mobile-pad" style="padding:11px 42px;background:#E8F5FA;border-bottom:1px solid #CBE4EE;color:#165A74;font-size:11px;font-weight:700;line-height:18px;letter-spacing:.35px;text-align:{{ $direction === 'rtl' ? 'right' : 'left' }};text-transform:uppercase;">
                        <span style="display:inline-block;width:7px;height:7px;margin-{{ $direction === 'rtl' ? 'left' : 'right' }}:7px;border-radius:50%;background:#159168;"></span>
                        {{ $locale === 'ar' ? 'وضع العرض التجريبي نشط · تم التوجيه إلى صندوق اختبار MedLine' : 'Demo routing active · Delivered to the MedLine test inbox' }}
                    </td>
                </tr>
                @endif
                <tr>
                    <td class="mobile-pad" style="padding:46px 48px 18px;text-align:{{ $direction === 'rtl' ? 'right' : 'left' }};">
                        <div style="margin-bottom:18px;">
                            <span style="display:inline-block;padding:8px 12px;border:1px solid {{ $badgeForeground }}22;border-radius:999px;background:{{ $badgeBackground }};color:{{ $badgeForeground }};font-size:11px;font-weight:800;line-height:14px;letter-spacing:.35px;text-transform:uppercase;">{{ $badgeLabel }}</span>
                        </div>
                        <div style="margin-bottom:10px;color:#1689B8;font-size:11px;font-weight:800;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;">{{ $eyebrow }}</div>
                        <h1 class="hero-title" style="margin:0 0 18px;color:#102F46;font-size:38px;font-weight:800;line-height:46px;letter-spacing:-1.1px;">{{ $title }}</h1>
                        <p style="margin:0 0 12px;color:#294D62;font-size:16px;font-weight:700;line-height:26px;">{{ $greeting }}</p>
                        <p style="margin:0;color:#526F80;font-size:16px;font-weight:400;line-height:27px;">{{ $body }}</p>
                    </td>
                </tr>
                @if(filled($verificationCode ?? null))
                <tr>
                    <td class="mobile-pad" style="padding:6px 48px 24px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
                            <td align="center" style="padding:22px 18px;border:2px solid #B9DDEB;border-radius:16px;background:#F1F9FC;">
                                <div style="margin-bottom:8px;color:#526F80;font-size:11px;font-weight:800;line-height:16px;letter-spacing:1px;text-transform:uppercase;">{{ $locale === 'ar' ? 'رمز التحقق المكوّن من 4 أرقام' : 'Your 4-digit verification code' }}</div>
                                <div style="color:#082F49;font-family:Consolas,'Courier New',monospace;font-size:42px;font-weight:800;line-height:50px;letter-spacing:12px;direction:ltr;unicode-bidi:bidi-override;">{{ $verificationCode }}</div>
                            </td>
                        </tr></table>
                    </td>
                </tr>
                @endif
                @if(count($facts))
                <tr>
                    <td class="mobile-pad" style="padding:18px 48px 8px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            @foreach(array_chunk($facts, 2) as $factRow)
                            <tr>
                                @foreach($factRow as $fact)
                                <td class="fact-column" width="50%" valign="top" style="width:50%;padding:0 {{ $loop->first ? '6px' : '0' }} 12px {{ $loop->first ? '0' : '6px' }};">
                                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="padding:15px 16px;border:1px solid #DCE9EF;border-radius:12px;background:#F7FAFC;text-align:{{ $direction === 'rtl' ? 'right' : 'left' }};">
                                        <div style="margin-bottom:5px;color:#7892A1;font-size:10px;font-weight:800;line-height:14px;letter-spacing:.8px;text-transform:uppercase;">{{ $fact['label'] }}</div>
                                        <div style="color:#17384E;font-size:14px;font-weight:800;line-height:21px;word-break:break-word;">{{ $fact['value'] }}</div>
                                    </td></tr></table>
                                </td>
                                @endforeach
                                @if(count($factRow) === 1)<td class="fact-column" width="50%" style="width:50%;">&nbsp;</td>@endif
                            </tr>
                            @endforeach
                        </table>
                    </td>
                </tr>
                @endif
                @if(filled($actionUrl ?? null) && filled($actionLabel ?? null))
                <tr>
                    <td class="mobile-pad" style="padding:18px 48px 16px;text-align:{{ $direction === 'rtl' ? 'right' : 'left' }};">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#086B91" style="border-radius:12px;background:#086B91;box-shadow:0 10px 24px rgba(8,107,145,.22);">
                            <a class="cta-button" href="{{ $actionUrl }}" target="_blank" style="display:inline-block;min-width:190px;padding:15px 22px;border:1px solid #086B91;border-radius:12px;background:#086B91;color:#FFFFFF;font-size:15px;font-weight:800;line-height:20px;text-align:center;text-decoration:none;">{{ $actionLabel }} &nbsp;{{ $direction === 'rtl' ? '←' : '→' }}</a>
                        </td></tr></table>
                    </td>
                </tr>
                <tr>
                    <td class="mobile-pad" style="padding:0 48px 26px;color:#7892A1;font-size:11px;line-height:18px;text-align:{{ $direction === 'rtl' ? 'right' : 'left' }};">
                        {{ $locale === 'ar' ? 'إذا لم يعمل الزر، افتح الرابط التالي:' : 'If the button does not work, open this secure link:' }}<br>
                        <a href="{{ $actionUrl }}" style="color:#086B91;text-decoration:underline;word-break:break-all;">{{ $actionUrl }}</a>
                    </td>
                </tr>
                @endif
                @if(filled($notice ?? null))
                <tr>
                    <td class="mobile-pad" style="padding:0 48px 38px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
                            <td width="5" style="width:5px;border-radius:8px 0 0 8px;background:{{ $accentColor }};font-size:0;line-height:0;">&nbsp;</td>
                            <td style="padding:16px 18px;border:1px solid #D9E8EE;border-{{ $direction === 'rtl' ? 'right' : 'left' }}:0;border-radius:0 10px 10px 0;background:#F7FAFC;text-align:{{ $direction === 'rtl' ? 'right' : 'left' }};">
                                <div style="margin-bottom:5px;color:#17384E;font-size:13px;font-weight:800;line-height:19px;">{{ $noticeTitle ?? ($locale === 'ar' ? 'ملاحظة مهمة' : 'Important note') }}</div>
                                <div style="color:#5D7988;font-size:13px;font-weight:400;line-height:21px;">{{ $notice }}</div>
                            </td>
                        </tr></table>
                    </td>
                </tr>
                @endif
                <tr>
                    <td class="mobile-pad" style="padding:25px 48px 30px;border-top:1px solid #E3EDF2;background:#F8FBFC;text-align:center;">
                        <div style="margin-bottom:8px;color:#17384E;font-size:12px;font-weight:800;line-height:18px;">MedLine · {{ $locale === 'ar' ? 'الخدمات اللوجستية للرعاية الصحية' : 'Healthcare logistics' }}</div>
                        <div style="color:#7892A1;font-size:11px;font-weight:400;line-height:18px;">{{ filled($verificationCode ?? null) ? ($locale === 'ar' ? 'رسالة تشغيلية تلقائية · شارك رمز التحقق فقط مع الشخص المحدد في التعليمات أعلاه.' : 'Automated operational message · Share this verification code only with the person identified in the instructions above.') : ($locale === 'ar' ? 'رسالة تشغيلية تلقائية · لا تشارك الروابط الآمنة أو بيانات اعتماد التسليم.' : 'Automated operational message · Please do not share secure links or delivery credentials.') }}</div>
                        <div style="margin-top:12px;color:#97AAB4;font-size:10px;line-height:16px;">© {{ $year }} MedLine. {{ $locale === 'ar' ? 'مصمم لعمليات رعاية صحية أكثر أماناً ووضوحاً.' : 'Built for safer, clearer healthcare operations.' }}</div>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
