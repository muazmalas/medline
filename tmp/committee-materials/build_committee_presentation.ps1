$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$Root = 'C:\Users\Muaz\Downloads\Pharmacy'
$Out = Join-Path $Root 'output\presentations\MedLine_Committee_Presentation.pptx'
$Assets = Join-Path $Root 'tmp\committee-materials\assets'
$TempAssets = 'C:\Users\Muaz\AppData\Local\Temp'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null

$W = 960.0
$H = 540.0
$C = @{
    Navy      = '#082F49'
    Navy2     = '#0B3D59'
    Blue      = '#1689B8'
    Cyan      = '#43B5E7'
    Sky       = '#DFF3FB'
    Pale      = '#EEF7FB'
    Page      = '#F4F7FB'
    Ink       = '#12344A'
    Muted     = '#5B7789'
    Rule      = '#D6E3EB'
    Green     = '#139A6A'
    GreenPale = '#EAF8F2'
    Orange    = '#B65E2E'
    OrangePale= '#FFF1E8'
    Violet    = '#7551B3'
    VioletPale= '#F2ECFC'
    White     = '#FFFFFF'
    Dark      = '#06263A'
}

function RGB([string]$Hex) {
    $v = $Hex.TrimStart('#')
    if ($v.Length -ne 6) { throw "Invalid hex color '$Hex'`n$((Get-PSCallStack | Out-String))" }
    $r = [Convert]::ToInt32($v.Substring(0,2),16)
    $g = [Convert]::ToInt32($v.Substring(2,2),16)
    $b = [Convert]::ToInt32($v.Substring(4,2),16)
    return $r + 256*$g + 65536*$b
}

function Add-Rect($Slide, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Fill, [string]$Line = $null, [double]$Radius = 0, [double]$Transparency = 0) {
    $shapeType = if ($Radius -gt 0) { 5 } else { 1 }
    $s = $Slide.Shapes.AddShape($shapeType, $X, $Y, $Width, $Height)
    $s.Fill.Visible = -1
    $s.Fill.Solid()
    $s.Fill.ForeColor.RGB = RGB $Fill
    $s.Fill.Transparency = $Transparency
    if ($Line) {
        $s.Line.Visible = -1
        $s.Line.ForeColor.RGB = RGB $Line
        $s.Line.Weight = 1
    } else {
        $s.Line.Visible = 0
    }
    return $s
}

function Add-Line($Slide, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2, [string]$Color, [double]$Weight = 1.5, [bool]$Arrow = $false, [bool]$Dashed = $false) {
    $s = $Slide.Shapes.AddLine($X1, $Y1, $X2, $Y2)
    $s.Line.ForeColor.RGB = RGB $Color
    $s.Line.Weight = $Weight
    if ($Arrow) { $s.Line.EndArrowheadStyle = 3 }
    if ($Dashed) { $s.Line.DashStyle = 4 }
    return $s
}

function Add-Text($Slide, [string]$Text, [double]$X, [double]$Y, [double]$Width, [double]$Height, [double]$Size, [string]$Color, [bool]$Bold = $false, [int]$Align = 1, [string]$Font = 'Aptos', [double]$Margin = 0) {
    $s = $Slide.Shapes.AddTextbox(1, $X, $Y, $Width, $Height)
    $s.TextFrame.MarginLeft = $Margin
    $s.TextFrame.MarginRight = $Margin
    $s.TextFrame.MarginTop = $Margin
    $s.TextFrame.MarginBottom = $Margin
    $s.TextFrame.WordWrap = -1
    $s.TextFrame.AutoSize = 0
    $t = $s.TextFrame.TextRange
    $t.Text = $Text
    $t.Font.Name = $Font
    $t.Font.Size = $Size
    $t.Font.Bold = if ($Bold) { -1 } else { 0 }
    $t.Font.Color.RGB = RGB $Color
    $t.ParagraphFormat.Alignment = $Align
    return $s
}

function Add-Pill($Slide, [string]$Text, [double]$X, [double]$Y, [double]$Width, [string]$Fill, [string]$Color) {
    Add-Rect $Slide $X $Y $Width 24 $Fill $null 8 | Out-Null
    Add-Text $Slide $Text $X ($Y+4) $Width 16 10 $Color $true 2 | Out-Null
}

function Add-ImageContain($Slide, [string]$Path, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Background = '#FFFFFF') {
    Add-Rect $Slide $X $Y $Width $Height $Background $C.Rule 8 | Out-Null
    $img = [System.Drawing.Image]::FromFile($Path)
    try {
        $ratio = $img.Width / $img.Height
    } finally {
        $img.Dispose()
    }
    $target = $Width / $Height
    if ($ratio -gt $target) {
        $iw = $Width - 8
        $ih = $iw / $ratio
    } else {
        $ih = $Height - 8
        $iw = $ih * $ratio
    }
    $ix = $X + ($Width - $iw) / 2
    $iy = $Y + ($Height - $ih) / 2
    return $Slide.Shapes.AddPicture($Path, 0, -1, $ix, $iy, $iw, $ih)
}

function Add-Base($Slide, [string]$Speaker, [string]$Clock, [string]$Title, [string]$Subtitle, [int]$Number) {
    Add-Rect $Slide 0 0 $W $H $C.Page | Out-Null
    Add-Text $Slide 'MEDLINE  /  UNIVERSITY COMMITTEE EDITION' 38 18 470 18 9 $C.Blue $true | Out-Null
    Add-Pill $Slide ("$Speaker  |  $Clock") 712 14 210 $C.Sky $C.Navy
    Add-Text $Slide $Title 38 54 884 44 29 $C.Navy $true | Out-Null
    Add-Text $Slide $Subtitle 38 101 884 28 13 $C.Muted $false | Out-Null
    Add-Line $Slide 38 132 922 132 $C.Rule 1 | Out-Null
    Add-Text $Slide ("{0:D2}" -f $Number) 889 510 33 16 9 $C.Muted $true 3 | Out-Null
}

function Add-Notes($Slide, [string]$Text) {
    $notesPage = $Slide.NotesPage
    $target = $null
    foreach ($ph in @($notesPage.Shapes.Placeholders)) {
        try {
            if ($ph.PlaceholderFormat.Type -eq 2) { $target = $ph; break }
        } catch {}
    }
    if (-not $target -and $notesPage.Shapes.Placeholders.Count -ge 2) {
        $target = $notesPage.Shapes.Placeholders.Item(2)
    }
    if ($target) { $target.TextFrame.TextRange.Text = $Text }
}

function Add-Metric($Slide, [string]$Value, [string]$Label, [double]$X, [double]$Y, [double]$Width, [string]$Tone = '#E8F5FA') {
    Add-Rect $Slide $X $Y $Width 82 $Tone $C.Rule 8 | Out-Null
    Add-Text $Slide $Value ($X+14) ($Y+10) ($Width-28) 32 25 $C.Navy $true | Out-Null
    Add-Text $Slide $Label ($X+14) ($Y+50) ($Width-28) 20 10 $C.Muted | Out-Null
}

function Add-Step($Slide, [string]$Number, [string]$Title, [string]$Body, [double]$X, [double]$Y, [double]$Width, [string]$Tone = '#1689B8') {
    Add-Rect $Slide $X $Y $Width 94 $C.White $C.Rule 8 | Out-Null
    Add-Rect $Slide ($X+14) ($Y+14) 34 34 $Tone $null 8 | Out-Null
    Add-Text $Slide $Number ($X+14) ($Y+20) 34 20 12 $C.White $true 2 | Out-Null
    Add-Text $Slide $Title ($X+58) ($Y+13) ($Width-72) 22 13 $C.Navy $true | Out-Null
    Add-Text $Slide $Body ($X+58) ($Y+39) ($Width-72) 43 10 $C.Muted | Out-Null
}

$ppt = New-Object -ComObject PowerPoint.Application
$ppt.Visible = -1
$pres = $ppt.Presentations.Add()
$pres.PageSetup.SlideWidth = $W
$pres.PageSetup.SlideHeight = $H

try {
    # 01 Cover
    $s = $pres.Slides.Add(1, 12)
    Add-Rect $s 0 0 $W $H $C.Dark | Out-Null
    Add-Rect $s 614 0 346 $H $C.Blue | Out-Null
    $dash = Join-Path $Assets 'pharmacy-dashboard.png'
    Add-ImageContain $s $dash 592 64 330 356 $C.White | Out-Null
    Add-Text $s 'UNIVERSITY COMMITTEE PRESENTATION' 54 71 500 22 11 $C.Cyan $true | Out-Null
    Add-Text $s 'MedLine' 54 112 500 60 42 $C.White $true | Out-Null
    Add-Text $s 'Secure medication delivery and medical logistics from inventory to recipient.' 54 182 474 72 21 '#D8EEF7' $false | Out-Null
    Add-Pill $s '30 MINUTES' 54 285 132 $C.Cyan $C.Dark
    Add-Pill $s '4 SPEAKERS' 196 285 132 '#DFF3FB' $C.Navy
    Add-Pill $s '5 ROLES' 338 285 112 $C.GreenPale $C.Green
    Add-Text $s 'A live, role-aware system | Demonstration baseline: 24 August 2026' 54 344 470 38 13 '#BEE7F7' | Out-Null
    Add-Text $s 'Speaker 1 opens | Speaker 4 closes with Q&A' 54 465 470 20 10 '#86CBE7' $true | Out-Null
    Add-Notes $s @"
Speaker 1 - 00:00-00:30 (30 seconds)

Good morning. We are presenting MedLine, a role-aware medication delivery and medical logistics system. It connects patients, pharmacies, warehouses, drivers and administrators through one controlled workflow. In the next thirty minutes, four speakers will show the user experience, the operational workflows, the secure delivery handoffs and the controls that keep every status consistent.

Do not begin with technical detail. Establish the one-sentence thesis: MedLine makes a complex medication journey visible, secure and auditable from inventory to recipient.

[Sources]
- MedLine repository: README.md and docs/DOMAIN_SPECIFICATION.md (reviewed 24 August 2026)
- Local portal capture: tmp/committee-materials/assets/pharmacy-dashboard.png (captured 24 August 2026)
"@

    # 02 Run of show
    $s = $pres.Slides.Add(2, 12)
    Add-Base $s 'SPEAKER 1' '00:30-01:30' 'Thirty minutes, one connected story' 'Each speaker answers the question created by the previous section.' 2
    $agenda = @(
        @('1','00:00-07:00','Why MedLine exists','Problem, roles and architecture',$C.Blue),
        @('2','07:00-14:00','How partners fulfil','Patient, pharmacy, stock and procurement',$C.Violet),
        @('3','14:00-21:30','How delivery is proven','Road route, pickup, arrival and recipient PIN',$C.Orange),
        @('4','21:30-30:00','How the system is governed','Admin, assurance, theater data and Q&A',$C.Green)
    )
    $y=164
    foreach($a in $agenda){
        Add-Rect $s 56 $y 848 68 $C.White $C.Rule 8 | Out-Null
        Add-Rect $s 56 $y 82 68 $a[4] $null 8 | Out-Null
        Add-Text $s $a[0] 56 ($y+13) 82 36 22 $C.White $true 2 | Out-Null
        Add-Text $s $a[1] 157 ($y+12) 150 20 12 $C.Navy $true | Out-Null
        Add-Text $s $a[2] 317 ($y+10) 230 24 15 $C.Navy $true | Out-Null
        Add-Text $s $a[3] 560 ($y+12) 320 34 11 $C.Muted | Out-Null
        $y += 78
    }
    Add-Notes $s @"
Speaker 1 - 00:30-01:30 (1 minute)

Explain the division of responsibility. Speaker 1 introduces the problem, users and architecture. Speaker 2 follows the patient order into pharmacy and warehouse fulfilment. Speaker 3 takes over when a driver sees a route and proves the two physical handoffs. Speaker 4 shows administration, security, deterministic data and the production boundary, then leaves time for questions.

The handoff discipline matters: do not repeat the previous section. End each section with the question the next speaker answers. We have reserved the last sixty to ninety seconds inside the final slide for committee questions, so the full run remains within thirty minutes.

[Sources]
- MedLine committee narrative: tmp/committee-materials/narrative.txt (prepared 24 August 2026)
- MedLine repository: docs/REQUIREMENTS_TRACEABILITY.md (reviewed 24 August 2026)
"@

    # 03 Problem and solution
    $s = $pres.Slides.Add(3, 12)
    Add-Base $s 'SPEAKER 1' '01:30-03:30' 'The problem is coordination, not one isolated screen' 'Medication fulfilment crosses clinical, commercial and physical trust boundaries.' 3
    $cols = @(
        @('FRAGMENTED DECISIONS','Prescriptions, stock, prices and approvals are often separated.',$C.Orange,$C.OrangePale),
        @('INVISIBLE HANDOFFS','A successful dispatch does not prove pickup or recipient delivery.',$C.Violet,$C.VioletPale),
        @('INCONSISTENT STATUS','Different clients can drift unless one server controls every transition.',$C.Blue,$C.Sky)
    )
    $x=45
    foreach($col in $cols){
        Add-Rect $s $x 165 270 138 $col[3] $C.Rule 8 | Out-Null
        Add-Rect $s ($x+18) 183 42 8 $col[2] | Out-Null
        Add-Text $s $col[0] ($x+18) 207 234 24 13 $C.Navy $true | Out-Null
        Add-Text $s $col[1] ($x+18) 242 234 46 11 $C.Muted | Out-Null
        $x+=300
    }
    Add-Rect $s 92 345 776 98 $C.Navy | Out-Null
    Add-Text $s 'MEDLINE RESPONSE' 118 365 170 18 10 $C.Cyan $true | Out-Null
    Add-Text $s 'One API controls roles, prices, stock, status, verification and history.' 118 392 710 32 20 $C.White $true | Out-Null
    Add-Notes $s @"
Speaker 1 - 01:30-03:30 (2 minutes)

Frame the problem as coordination. A patient order is not simply a shopping cart: some medicines require item-specific prescription evidence; a pharmacy must decide what can be supplied; stock may need replenishment from a warehouse; a driver needs a real road route and recipient context; and two physical handoffs must be verified.

The main design risk is inconsistent truth. If web, mobile and backend each invent their own status, the same order could look accepted in one place and completed in another. MedLine addresses that by making Laravel the authority. The user interfaces explain the workflow, but the API validates every role, ownership rule, quantity boundary and state change.

Transition: who sees which part of this system, and how are those parts connected?

[Sources]
- MedLine repository: docs/DOMAIN_SPECIFICATION.md and docs/ARCHITECTURE_DECISIONS.md (reviewed 24 August 2026)
"@

    # 04 Roles architecture
    $s = $pres.Slides.Add(4, 12)
    Add-Base $s 'SPEAKER 1' '03:30-07:00' 'Five experiences, one authoritative workflow engine' 'Role-specific interfaces reduce noise; server-side policy provides security.' 4
    $roles=@('PATIENT','PHARMACY','WAREHOUSE','DRIVER','ADMIN')
    $ry=156
    foreach($r in $roles){ Add-Pill $s $r 48 $ry 152 $C.White $C.Navy; $ry+=55 }
    Add-Line $s 214 268 340 268 $C.Blue 3 $true | Out-Null
    Add-Rect $s 340 165 285 210 $C.Navy $null 8 | Out-Null
    Add-Text $s 'LARAVEL 12 API' 370 190 225 28 20 $C.White $true 2 | Out-Null
    Add-Text $s 'Authentication + authorization' 370 235 225 20 11 '#CDEAF5' $false 2 | Out-Null
    Add-Text $s 'Workflow transitions + pricing' 370 265 225 20 11 '#CDEAF5' $false 2 | Out-Null
    Add-Text $s 'Transactions + row locks' 370 295 225 20 11 '#CDEAF5' $false 2 | Out-Null
    Add-Text $s 'Audit + private files' 370 325 225 20 11 '#CDEAF5' $false 2 | Out-Null
    Add-Line $s 625 268 735 268 $C.Blue 3 $true | Out-Null
    $systems=@(
        @('MYSQL','orders, stock, events',$C.Sky,$C.Blue),
        @('REVERB + JOBS','live updates, queues',$C.GreenPale,$C.Green),
        @('PROVIDERS','routing, email, push',$C.OrangePale,$C.Orange)
    )
    $sy=165
    foreach($p in $systems){
        Add-Rect $s 735 $sy 180 62 $p[2] $C.Rule 8 | Out-Null
        Add-Text $s $p[0] 749 ($sy+10) 152 18 12 $C.Navy $true | Out-Null
        Add-Text $s $p[1] 749 ($sy+33) 152 17 9 $C.Muted | Out-Null
        $sy+=74
    }
    Add-Text $s 'React web + Flutter mobile consume the same contract.' 340 410 575 28 13 $C.Blue $true 2 | Out-Null
    Add-Notes $s @"
Speaker 1 - 03:30-07:00 (3 minutes 30 seconds)

Walk from left to right. Patients discover pharmacies, create orders, attach prescriptions, track delivery and submit ratings or complaints. Pharmacies review prescriptions and quantities, manage their own inventory and working hours, request warehouse replenishment and control pickup verification. Warehouses manage traceable batches and exact procurement allocations. Drivers see only compatible work plus their own assignments, road routes, recipient contact and progress actions. Administrators remain deliberately unassociated with a pharmacy or warehouse; they govern system-wide approval, pricing, recovery, moderation and audit.

At the center, Laravel 12 with Sanctum is the trust boundary. It enforces ownership, status transitions, rate snapshots, reservations, PIN verification and idempotency. MySQL stores authoritative state. Reverb, queues and the scheduler carry realtime and asynchronous work. OpenStreetMap routing, SMTP, FCM and optional SMS are replaceable provider adapters.

The key sentence is: the client shows the workflow; the API enforces it.

Handoff to Speaker 2: now that we know who owns each responsibility, what does an order look like from discovery through fulfilment?

[Sources]
- MedLine repository: README.md, docs/ARCHITECTURE_DECISIONS.md and backend/routes/api.php (reviewed 24 August 2026)
"@

    # 05 Patient journey
    $s = $pres.Slides.Add(5, 12)
    Add-Base $s 'SPEAKER 2' '07:00-09:00' 'The patient sees one understandable journey' 'Discovery, evidence, pricing, consent and tracking remain connected.' 5
    $steps=@(
      @('1','DISCOVER','Approved, open pharmacy + catalog'),
      @('2','BUILD','Medicines, quantities and item evidence'),
      @('3','PRICE','Road distance, vehicle rate, fee and total'),
      @('4','DECIDE','Accept a full or reduced offer'),
      @('5','TRACK','Follow the related delivery to completion')
    )
    $x=46
    foreach($st in $steps){
        Add-Rect $s $x 175 160 180 $C.White $C.Rule 8 | Out-Null
        Add-Rect $s ($x+15) 191 40 40 $C.Blue $null 8 | Out-Null
        Add-Text $s $st[0] ($x+15) 199 40 22 14 $C.White $true 2 | Out-Null
        Add-Text $s $st[1] ($x+15) 248 130 22 13 $C.Navy $true | Out-Null
        Add-Text $s $st[2] ($x+15) 282 130 56 10 $C.Muted | Out-Null
        if($x -lt 700){ Add-Line $s ($x+160) 265 ($x+178) 265 $C.Cyan 2 $true | Out-Null }
        $x+=178
    }
    Add-Rect $s 46 382 872 62 $C.OrangePale $C.Rule 8 | Out-Null
    Add-Text $s 'Important: an accepted order is not completed until recipient verification and settlement succeed.' 65 402 834 26 13 $C.Orange $true 2 | Out-Null
    Add-Notes $s @"
Speaker 2 - 07:00-09:00 (2 minutes)

Describe the patient experience without reading every control. The patient first searches the bilingual medicine catalog and selects an approved pharmacy that is open according to stored working hours. The cart can contain several medicines and quantities. Every prescription-required line has its own private evidence, so one document cannot accidentally approve unrelated items.

Before submission, the patient chooses ASAP or scheduled delivery and a permitted vehicle. The application displays the stored road distance, the rate per kilometre, the delivery fee, tax and total. After pharmacy review, the patient may receive a partial offer - for example, two units instead of three - and must explicitly accept or reject it.

Finally, the patient tracks the related delivery and can rate or complain. Emphasize the distinction at the bottom: order acceptance is commercial/clinical approval; completion occurs only after final delivery verification and settlement.

[Sources]
- MedLine repository: docs/API_WORKFLOWS.md and docs/DOMAIN_SPECIFICATION.md (reviewed 24 August 2026)
"@

    # 06 Pharmacy review
    $s = $pres.Slides.Add(6, 12)
    Add-Base $s 'SPEAKER 2' '09:00-11:00' 'Pharmacy review is item-specific and quantity-bounded' 'The queue keeps patient, medicine, destination, price and status together.' 6
    Add-ImageContain $s (Join-Path $Assets 'pharmacy-orders.png') 40 151 560 280 $C.White | Out-Null
    $items=@(
        @('1','Review evidence','Approve/reject each required prescription.'),
        @('2','Decide quantity','Never exceed the requested amount.'),
        @('3','Resolve order','Accept, reject or send a reduced offer.')
    )
    $y=155
    foreach($it in $items){ Add-Step $s $it[0] $it[1] $it[2] 625 $y 292 $C.Blue; $y+=103 }
    Add-Rect $s 625 455 292 42 $C.OrangePale $C.Rule 8 | Out-Null
    Add-Text $s 'Reduced offers need a note and at least one real quantity reduction.' 638 465 266 24 9.5 $C.Orange $true 2 | Out-Null
    Add-Notes $s @"
Speaker 2 - 09:00-11:00 (2 minutes)

Use the order queue as evidence that the pharmacy can work from one operational view. Open records include the patient, pharmacy, medicine summary, delivery destination, total, status and creation time. The pharmacy then opens the record and reviews every medicine independently.

If a prescription is required, the pharmacist must decide that item before the order can move to quantity review. A rejection requires a patient-facing reason. Accepted quantity is always bounded between zero and the quantity requested. A full acceptance is valid only when all requested quantities are available. A partial offer is valid only when at least one line is truly reduced and a note explains why. The patient then owns the consent decision.

This protects both clinical evidence and commercial consent while preserving one audit trail.

[Sources]
- MedLine repository: backend/app/Http/Controllers/Api and docs/API_WORKFLOWS.md (reviewed 24 August 2026)
- Local portal capture: tmp/committee-materials/assets/pharmacy-orders.png (captured 24 August 2026)
"@

    # 07 Inventory procurement
    $s = $pres.Slides.Add(7, 12)
    Add-Base $s 'SPEAKER 2' '11:00-13:00' 'Stock is traceable from warehouse batch to pharmacy shelf' 'Procurement mirrors order consent while adding exact batch allocation.' 7
    Add-ImageContain $s (Join-Path $Assets 'pharmacy-inventory.png') 40 150 520 292 $C.White | Out-Null
    $chain=@(
        @('PHARMACY','requests quantities',$C.Sky),
        @('WAREHOUSE','allocates batches',$C.VioletPale),
        @('PHARMACY','accepts partial offer',$C.OrangePale),
        @('DELIVERY','moves accepted stock',$C.GreenPale)
    )
    $y=154
    foreach($c1 in $chain){
        Add-Rect $s 600 $y 310 56 $c1[2] $C.Rule 8 | Out-Null
        Add-Text $s $c1[0] 616 ($y+9) 92 18 11 $C.Navy $true | Out-Null
        Add-Text $s $c1[1] 710 ($y+9) 180 30 11 $C.Muted | Out-Null
        if($y -lt 360){ Add-Line $s 755 ($y+56) 755 ($y+67) $C.Blue 2 $true | Out-Null }
        $y+=72
    }
    Add-Text $s 'Completion consumes reserved warehouse units and adds pharmacy inventory in one settlement.' 600 451 310 42 11 $C.Green $true | Out-Null
    Add-Notes $s @"
Speaker 2 - 11:00-13:00 (2 minutes)

Show that inventory is not a single number. Pharmacy inventory exposes available and reserved quantity, price, batch/expiry information and a stock-health label. Warehouse stock is held as batches with lot number, manufacture date, expiry date, received date, storage location, quantity, reserved quantity, unit price and active state.

When a pharmacy needs replenishment, it creates a multi-item procurement request against eligible warehouse stock. The warehouse allocates exact requested units across one or more batches. Full acceptance requires complete allocation. Partial fulfilment follows the same consent principle as patient orders: the pharmacy chooses whether to accept the reduced offer.

When the related delivery is verified, the system consumes the warehouse reservations and creates or updates the destination pharmacy inventory inside one transaction. This makes the movement traceable rather than simply changing two totals independently.

[Sources]
- MedLine repository: docs/API_WORKFLOWS.md and docs/ERD.md (reviewed 24 August 2026)
- Local portal capture: tmp/committee-materials/assets/pharmacy-inventory.png (captured 24 August 2026)
"@

    # 08 Status dictionary
    $s = $pres.Slides.Add(8, 12)
    Add-Base $s 'SPEAKER 2' '13:00-14:00' 'Statuses define who may act - and when' 'The PDF contains the complete dictionary; this slide shows the logic.' 8
    $rows=@(
      @('PATIENT ORDER','evidence -> review -> consent -> accepted','rejected / cancelled / completed',$C.Sky),
      @('PROCUREMENT','warehouse review -> allocation -> consent','rejected / completed',$C.VioletPale),
      @('DELIVERY','available -> claimed -> pickup -> transit -> arrived -> delivered','failed / cancelled / reassigned event',$C.GreenPale)
    )
    $y=165
    foreach($r in $rows){
      Add-Rect $s 52 $y 856 82 $r[3] $C.Rule 8 | Out-Null
      Add-Text $s $r[0] 70 ($y+14) 160 20 13 $C.Navy $true | Out-Null
      Add-Text $s $r[1] 240 ($y+13) 420 22 13 $C.Ink $true | Out-Null
      Add-Text $s ('Exceptions: '+$r[2]) 240 ($y+45) 630 18 10 $C.Muted | Out-Null
      $y+=96
    }
    Add-Rect $s 52 458 856 40 $C.Navy | Out-Null
    Add-Text $s 'A status is not cosmetic text: it is a permission boundary and a consistency rule.' 70 468 820 20 12 $C.White $true 2 | Out-Null
    Add-Notes $s @"
Speaker 2 - 13:00-14:00 (1 minute)

Do not read the full status dictionary aloud; the companion PDF contains every status and meaning. Explain the pattern instead. Patient-order state represents prescription evidence, pharmacy decision and patient consent. Procurement state represents warehouse decision, batch allocation and pharmacy consent. Delivery state represents physical possession and handoff progress.

Terminal outcomes remain explicit, and recovery is never hidden. A rejected or cancelled record stays terminal. A failed delivery can return to available only through the administrator's audited reassignment action. The status determines which role may act, what prerequisites are already satisfied and which records must move together.

Handoff to Speaker 3: after an order or procurement request is accepted, how does the driver see, price and securely complete the physical delivery?

[Sources]
- MedLine repository: docs/DOMAIN_SPECIFICATION.md and backend delivery/order/procurement controllers (reviewed 24 August 2026)
"@

    # 09 Driver route
    $s = $pres.Slides.Add(9, 12)
    Add-Base $s 'SPEAKER 3' '14:00-16:00' 'Drivers choose orders from the real road route' 'Vehicle compatibility, stored route distance and fee are visible before acceptance.' 9
    $driverMap = Join-Path $TempAssets 'codex-clipboard-3O8zkT.png'
    Add-ImageContain $s $driverMap 40 150 628 335 $C.White | Out-Null
    Add-Metric $s '6.32 km' 'stored driving distance' 696 164 220 $C.Sky
    Add-Metric $s 'SYP 632' 'route-based fee example' 696 260 220 $C.OrangePale
    Add-Rect $s 696 356 220 100 $C.Navy $null 8 | Out-Null
    Add-Text $s 'ONE WINNER' 712 372 188 18 10 $C.Cyan $true | Out-Null
    Add-Text $s 'Acceptance is serialized under a database lock.' 712 402 188 38 12 $C.White $true | Out-Null
    Add-Notes $s @"
Speaker 3 - 14:00-16:00 (2 minutes)

The driver map does not use straight-line or 'air' distance. Available jobs show a stored road route between pickup and drop-off, filtered to the driver's approved vehicle type. Before accepting, the driver can inspect the medicine manifest, schedule, pickup partner, destination, recipient contact, distance, rate per kilometre and route-based fee.

The route distance and applicable rate are snapshotted on the order. If an administrator changes prices later, historical deliveries keep the original calculation. When a driver accepts, the API locks the delivery and driver records. Only one eligible driver can win the same available order, and that driver becomes unavailable for another simultaneous job.

The map is therefore both a decision tool and evidence for how the fee was calculated.

[Sources]
- MedLine repository: backend routing/pricing services and delivery controllers (reviewed 24 August 2026)
- Local portal reference: codex-clipboard-3O8zkT.png (captured during MedLine development)
"@

    # 10 Pickup PIN
    $s = $pres.Slides.Add(10, 12)
    Add-Base $s 'SPEAKER 3' '16:00-17:45' 'Pickup verification proves the driver received the medicines' 'The pharmacy or warehouse initiates a purpose-specific four-digit check.' 10
    Add-Rect $s 54 166 372 250 $C.White $C.Rule 8 | Out-Null
    Add-Pill $s 'PHARMACY / WAREHOUSE' 78 188 220 $C.Sky $C.Navy
    Add-Text $s '1  Send pickup PIN' 78 238 280 28 18 $C.Navy $true | Out-Null
    Add-Text $s 'A branded email is sent to the assigned driver. In demo mode, delivery is redirected to one controlled inbox.' 78 280 310 74 12 $C.Muted | Out-Null
    Add-Text $s '3  Verify code after physical handoff' 78 365 310 32 13 $C.Green $true | Out-Null
    Add-Line $s 426 290 534 290 $C.Blue 4 $true | Out-Null
    Add-Rect $s 534 166 372 250 $C.Navy $null 8 | Out-Null
    Add-Pill $s 'DRIVER' 558 188 105 $C.Cyan $C.Dark
    Add-Text $s '2  Receives a fresh code' 558 238 310 28 18 $C.White $true | Out-Null
    Add-Text $s 'The driver shows the code in person. The API stores only a password hash, with expiry, resend cooldown and bounded attempts.' 558 280 310 78 12 '#CDEAF5' | Out-Null
    Add-Text $s 'RESULT  ->  in_transit automatically' 558 370 310 28 13 $C.Cyan $true | Out-Null
    Add-Notes $s @"
Speaker 3 - 16:00-17:45 (1 minute 45 seconds)

Explain the first trust boundary. After a driver claims the order, the pharmacy or warehouse controls pickup. The partner clicks Send pickup PIN. The system generates a new four-digit code, stores only its password hash, records an expiry and sends the value to the assigned driver through the notification system. Demo email redirection can send the message to one controlled inbox without changing the driver's account email.

Outside the system, the partner hands over the medicines. The driver shows the received code, and the partner enters it. Attempts are bounded; codes expire and have a resend cooldown. A pickup code cannot be reused for recipient delivery.

Most importantly, successful verification moves the delivery directly from pickup_started to in_transit. There is no separate driver Start delivery action.

[Sources]
- MedLine repository: delivery verification controller, notification classes and docs/NOTIFICATION_OPERATIONS.md (reviewed 24 August 2026)
"@

    # 11 Transit recipient
    $s = $pres.Slides.Add(11, 12)
    Add-Base $s 'SPEAKER 3' '17:45-19:45' 'In transit, the driver sees exactly who and where to serve' 'Recipient context and the road route stay connected to the active assignment.' 11
    $detail = Join-Path $TempAssets 'codex-clipboard-cmrFG3.png'
    Add-ImageContain $s $detail 38 150 620 330 $C.White | Out-Null
    $actions=@(
      @('IN TRANSIT','Pickup already verified',$C.Sky),
      @('MARK ARRIVED','Driver confirms destination arrival',$C.OrangePale),
      @('RECIPIENT PIN','Separate code proves final handoff',$C.GreenPale)
    )
    $y=160
    foreach($a in $actions){
      Add-Rect $s 690 $y 228 82 $a[2] $C.Rule 8 | Out-Null
      Add-Text $s $a[0] 706 ($y+13) 196 18 12 $C.Navy $true | Out-Null
      Add-Text $s $a[1] 706 ($y+41) 196 28 10 $C.Muted | Out-Null
      $y+=98
    }
    Add-Text $s 'Name | email | phone | delivery destination' 690 464 228 20 10 $C.Blue $true 2 | Out-Null
    Add-Notes $s @"
Speaker 3 - 17:45-19:45 (2 minutes)

Once pickup is verified, the delivery is already in transit. The driver's detail view keeps the manifest, the pickup partner, route snapshot, road distance, rate and delivery fee together with the recipient name, email, phone number and delivery destination. This prevents the driver from switching between unrelated screens and gives enough context to complete the assignment.

The driver's next progress action is Mark arrived. Arrival does not complete the delivery; it only records that the driver reached the destination. The driver then initiates a second, independent recipient PIN. That code is sent to the patient or destination pharmacy, redirected to the demo inbox during the presentation. After in-person confirmation, the driver enters the recipient's code. Successful verification settles the delivery and its parent order or procurement record consistently.

[Sources]
- MedLine repository: delivery detail endpoints and verification workflow (reviewed 24 August 2026)
- Local portal reference: codex-clipboard-cmrFG3.png (captured during MedLine development)
"@

    # 12 Delivery state timeline
    $s = $pres.Slides.Add(12, 12)
    Add-Base $s 'SPEAKER 3' '19:45-21:30' 'The main delivery path is sequential; recovery is explicit' 'Every transition identifies an actor, prerequisite and recorded result.' 12
    $states=@('available','claimed','pickup_started','in_transit','arrived','delivered')
    $x=66
    for($i=0;$i -lt $states.Count;$i++){
      $tone = if($i -eq 5){$C.Green}else{$C.Blue}
      Add-Rect $s $x 205 112 64 $tone $null 8 | Out-Null
      Add-Text $s $states[$i] ($x+5) 224 102 22 10 $C.White $true 2 | Out-Null
      if($i -lt 5){ Add-Line $s ($x+112) 237 ($x+137) 237 $C.Cyan 3 $true | Out-Null }
      $x+=145
    }
    Add-Text $s 'verified pickup starts transport automatically' 355 285 250 20 10 $C.Blue $true 2 | Out-Null
    Add-Line $s 410 270 410 283 $C.Blue 1.5 $true | Out-Null
    Add-Rect $s 116 358 300 90 $C.OrangePale $C.Rule 8 | Out-Null
    Add-Text $s 'FAILED' 135 375 80 20 13 $C.Orange $true | Out-Null
    Add-Text $s 'Driver records a reason. Location is cleared.' 135 405 250 28 11 $C.Muted | Out-Null
    Add-Line $s 416 402 532 402 $C.Orange 2 $true | Out-Null
    Add-Rect $s 532 358 312 90 $C.VioletPale $C.Rule 8 | Out-Null
    Add-Text $s 'ADMIN REASSIGNMENT EVENT' 551 375 260 20 13 $C.Violet $true | Out-Null
    Add-Text $s 'Ownership/PIN state resets; stored status returns to available.' 551 405 260 30 11 $C.Muted | Out-Null
    Add-Notes $s @"
Speaker 3 - 19:45-21:30 (1 minute 45 seconds)

Read the main path once: available, claimed, pickup_started, in_transit, arrived and delivered. Available means no driver owns the job. Claimed means an eligible approved driver owns it. Pickup_started means a pickup code was sent and physical handoff is awaiting verification. In_transit begins automatically when pickup succeeds. Arrived means the driver reached the destination. Delivered means recipient verification and settlement completed.

Exception paths remain visible. An eligible unclaimed delivery can be cancelled. A driver can mark an active job failed only with a reason; location is cleared. Reassignment is an administrator event, not a permanent status: it returns only a failed delivery to available while clearing ownership and sensitive verification state. That makes recovery deliberate and auditable.

Handoff to Speaker 4: with all five roles acting on one workflow, how does administration govern the platform and how do we demonstrate every scenario safely?

[Sources]
- MedLine repository: current delivery controller and docs/DOMAIN_SPECIFICATION.md (reviewed 24 August 2026)
"@

    # 13 Admin
    $s = $pres.Slides.Add(13, 12)
    Add-Base $s 'SPEAKER 4' '21:30-23:30' 'Administration combines approval, intervention and accountability' 'The administrator is system-wide and is not associated with any pharmacy or warehouse.' 13
    $cards=@(
      @('PARTNERS','applications, corrections, suspension',$C.Sky),
      @('SUBSCRIPTIONS','payment review and access windows',$C.GreenPale),
      @('CATALOG + PRICING','medicines and versioned vehicle rates',$C.VioletPale),
      @('USERS','roles, activation and suspension',$C.OrangePale),
      @('DELIVERY RECOVERY','failed-job reassignment',$C.Sky),
      @('AUDIT + SUPPORT','complaints, ratings and critical actions',$C.GreenPale)
    )
    $x=52;$y=160
    foreach($c1 in $cards){
      Add-Rect $s $x $y 270 126 $c1[2] $C.Rule 8 | Out-Null
      Add-Text $s $c1[0] ($x+18) ($y+18) 234 22 13 $C.Navy $true | Out-Null
      Add-Text $s $c1[1] ($x+18) ($y+55) 234 44 11 $C.Muted | Out-Null
      $x+=293
      if($x -gt 700){$x=52;$y+=145}
    }
    Add-Text $s 'correction_required = recoverable review loop, not rejection' 52 464 856 24 12 $C.Violet $true 2 | Out-Null
    Add-Notes $s @"
Speaker 4 - 21:30-23:30 (2 minutes)

The administrator sees system-wide queues and health rather than a pharmacy's own workload. Partner applications and verification documents can be approved, rejected or returned for correction. Subscription access combines payment review with an activation period, grace and expiry. The administrator manages the global medicine catalog, versioned vehicle rates, user activation, complaints, rating visibility and auditable delivery recovery.

Correction_required is an important review state. It preserves the application or payment proof and tells the partner what must be fixed without forcing a new record. Suspension is separate from rejection and can be used when an already approved organization or user must temporarily lose access.

The seeded administrator intentionally has no pharmacy or warehouse association. This avoids ownership ambiguity and demonstrates that governance scope comes from the admin role, not from pretending to be a partner.

[Sources]
- MedLine repository: backend admin routes/controllers and docs/DOMAIN_SPECIFICATION.md (reviewed 24 August 2026)
"@

    # 14 Assurance
    $s = $pres.Slides.Add(14, 12)
    Add-Base $s 'SPEAKER 4' '23:30-25:30' 'Safety comes from layered controls and consistent transactions' 'Security protects access; consistency protects the truth users see.' 14
    $layers=@(
      @('ACCESS','Sanctum | role middleware | ownership checks',$C.Navy,$C.White),
      @('MUTATION','transactions | row locks | idempotency | throttles',$C.Blue,$C.White),
      @('EVIDENCE','private storage | signed links | validation | scanner gate',$C.Cyan,$C.Dark),
      @('HANDOFF','hashed PINs | expiry | cooldown | bounded attempts',$C.Green,$C.White),
      @('ACCOUNTABILITY','events | audit | notifications after commit',$C.Violet,$C.White)
    )
    $y=158
    foreach($l in $layers){
      Add-Rect $s 76 $y (808-($y-158)*0.45) 54 $l[2] $null 8 | Out-Null
      Add-Text $s $l[0] 98 ($y+9) 160 18 12 $l[3] $true | Out-Null
      Add-Text $s $l[1] 270 ($y+9) 560 24 11 $l[3] | Out-Null
      $y+=63
    }
    Add-Rect $s 76 472 808 30 $C.OrangePale $C.Rule 8 | Out-Null
    Add-Text $s 'Production still requires approved policy, HTTPS, provider secrets, retention decisions and pilot validation.' 88 480 784 16 10 $C.Orange $true 2 | Out-Null
    Add-Notes $s @"
Speaker 4 - 23:30-25:30 (2 minutes)

Explain the layers from top to bottom. Sanctum authenticates users; role middleware and ownership checks decide which records they may access. Critical mutations use database transactions, row locks, idempotency keys, named throttles and bounded retries. Prescriptions, payment proofs, identity documents and complaint evidence stay outside public storage and use short-lived authorized access. Upload validation and a fail-closed scanner adapter provide a production integration point.

The two handoff PINs are purpose-specific, stored only as hashes, expire, cool down between resends and lock after bounded failed attempts. Critical administrator decisions, downloads, pricing changes, recovery and workflow actions are audited. Notifications are dispatched after the business transaction, so provider failure cannot roll back a successful stock or order change.

Be explicit about the production boundary: the implementation is security-conscious, but legal policy, approved providers, HTTPS, secrets, retention approval, release signing and pilot validation still require owners.

[Sources]
- MedLine repository: docs/SECURITY_OPERATIONS.md, docs/PRIVACY_AND_RETENTION.md and docs/NOTIFICATION_OPERATIONS.md (reviewed 24 August 2026)
"@

    # 15 Theater data
    $s = $pres.Slides.Add(15, 12)
    Add-Base $s 'SPEAKER 4' '25:30-27:30' 'Deterministic theater data covers every scenario' 'The non-production reset is destructive by design and validates its own invariants.' 15
    Add-Metric $s '100' 'bilingual medicines' 48 158 196 $C.Sky
    Add-Metric $s '10' 'Damascus pharmacies' 258 158 196 $C.GreenPale
    Add-Metric $s '2 + 2' 'warehouses + rated drivers' 468 158 196 $C.VioletPale
    Add-Metric $s '19 + 7' 'orders + procurement scenarios' 678 158 234 $C.OrangePale
    Add-Text $s 'Recommended live path' 48 273 360 26 17 $C.Navy $true | Out-Null
    $run=@(
      @('00-07','Speaker 1','role-aware dashboard'),
      @('07-14','Speaker 2','order -> inventory -> procurement'),
      @('14-21:30','Speaker 3','route -> pickup -> arrival -> recipient'),
      @('21:30-30','Speaker 4','admin -> audit -> seed coverage -> Q&A')
    )
    $y=314
    foreach($r in $run){
      Add-Pill $s $r[0] 48 $y 104 $C.Navy $C.White
      Add-Text $s $r[1] 171 ($y+3) 98 18 11 $C.Blue $true | Out-Null
      Add-Text $s $r[2] 274 ($y+3) 560 20 11 $C.Ink | Out-Null
      $y+=42
    }
    Add-Rect $s 610 296 302 178 $C.White $C.Rule 8 | Out-Null
    Add-Text $s 'REHEARSAL RULES' 632 316 258 20 12 $C.Navy $true | Out-Null
    Add-Text $s "- Reset before the session, never during it.`n- Keep services and demo inbox ready.`n- Pre-open one role tab per speaker.`n- Use slide screenshots if the network slows." 632 350 250 106 11 $C.Muted | Out-Null
    Add-Notes $s @"
Speaker 4 - 25:30-27:30 (2 minutes)

The theater seeder is intentionally deterministic and destructive in non-production. It deletes existing application data, creates a complete demo world and verifies consistency before finishing. The current dataset includes exactly one hundred bilingual medicines, ten approved/subscribed Damascus pharmacies - including Central Pharmacy on Al-Hamra Street - two warehouses with batch stock, two approved drivers with ratings, two patients and an administrator who is not associated with any partner.

It includes nineteen patient-order scenarios and seven procurement scenarios spanning all current statuses, plus deliveries, subscriptions, working hours, prescriptions, notifications, complaints, ratings, inventory movements and audit records. Two pre-staged verification scenarios use code 2468; newly initiated codes are freshly generated and emailed.

Reset and verify before the committee session, never during it. Keep the services and demo inbox ready, pre-open one signed-in tab per role and use the slide screenshots if the network or emulator becomes slow.

[Sources]
- MedLine repository: backend/database/seeders/DatabaseSeeder.php and scripts/medline.ps1 (reviewed 24 August 2026)
"@

    # 16 Close
    $s = $pres.Slides.Add(16, 12)
    Add-Base $s 'SPEAKER 4' '27:30-30:00' 'MedLine turns a complex journey into one controlled workflow' 'Close with the synthesis, then invite questions without exceeding thirty minutes.' 16
    Add-Metric $s '5' 'role-specific experiences' 58 166 196 $C.Sky
    Add-Metric $s '2' 'secure physical handoffs' 272 166 196 $C.GreenPale
    Add-Metric $s '1' 'authoritative API' 486 166 196 $C.VioletPale
    Add-Metric $s '0' 'manual start-delivery steps' 700 166 204 $C.OrangePale
    Add-Rect $s 78 292 804 114 $C.Navy $null 8 | Out-Null
    Add-Text $s 'The interface explains. The API enforces. The event history proves.' 108 320 744 36 22 $C.White $true 2 | Out-Null
    Add-Text $s 'Secure | auditable | bilingual | route-aware | consistent' 108 371 744 20 12 $C.Cyan $true 2 | Out-Null
    Add-Text $s 'Questions?' 58 448 220 36 24 $C.Navy $true | Out-Null
    Add-Text $s 'Speaker 1: problem / architecture   |   Speaker 2: fulfilment   |   Speaker 3: delivery   |   Speaker 4: governance' 58 488 824 18 9 $C.Muted $true | Out-Null
    Add-Notes $s @"
Speaker 4 - 27:30-30:00 (2 minutes 30 seconds, including questions)

Close in four sentences. First: the patient sees real pharmacies, prescription-aware ordering, transparent route pricing and tracked fulfilment. Second: pharmacies and warehouses see bounded decisions, traceable stock and subscription-controlled access. Third: drivers see compatible jobs, real road routes, recipient context and two secure proofs of physical handoff. Fourth: administrators see approvals, recovery, pricing history, complaints, moderation and audit.

Then state the synthesis: MedLine is not a collection of disconnected screens. It is one server-controlled workflow whose web and mobile experiences remain consistent because every important transition is validated and recorded by the API. Verified pickup starts in-transit automatically, so the driver's next action is simply Mark arrived.

Invite questions. Direct architecture questions to Speaker 1, patient/pharmacy/warehouse questions to Speaker 2, route and PIN questions to Speaker 3, and administration/security/readiness questions to Speaker 4. Keep the total session at thirty minutes.

[Sources]
- MedLine repository and local implementation baseline reviewed 24 August 2026
- MedLine Committee Solution Guide, sections 1-30
"@

    $pres.SaveAs($Out, 24)
} finally {
    if ($pres) { $pres.Close() }
    $ppt.Quit()
    if ($pres) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output $Out
