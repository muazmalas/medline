from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(r"C:\Users\Muaz\Downloads\Pharmacy")
OUT = ROOT / "output" / "pdf" / "MedLine_Committee_Solution_Guide.pdf"
ASSETS = ROOT / "tmp" / "committee-materials" / "assets"
OUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#082F49")
BLUE = colors.HexColor("#1689B8")
CYAN = colors.HexColor("#43B5E7")
PALE = colors.HexColor("#E8F5FA")
PAGE = colors.HexColor("#F4F7FB")
INK = colors.HexColor("#17384E")
MUTED = colors.HexColor("#527386")
RULE = colors.HexColor("#D6E3EB")
GREEN = colors.HexColor("#139A6A")
GREEN_PALE = colors.HexColor("#EAF8F2")
ORANGE = colors.HexColor("#B65E2E")
ORANGE_PALE = colors.HexColor("#FFF1E8")
VIOLET = colors.HexColor("#7551B3")
VIOLET_PALE = colors.HexColor("#F2ECFC")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverEyebrow", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=CYAN, spaceAfter=12, tracking=1.5))
styles.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=34, leading=38, textColor=WHITE, spaceAfter=16))
styles.add(ParagraphStyle(name="CoverSub", fontName="Helvetica", fontSize=14, leading=21, textColor=colors.HexColor("#D8EEF7"), spaceAfter=18))
styles.add(ParagraphStyle(name="SectionEyebrow", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=BLUE, spaceAfter=5))
styles.add(ParagraphStyle(name="SectionTitle", fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=NAVY, spaceAfter=7))
styles.add(ParagraphStyle(name="SectionLead", fontName="Helvetica", fontSize=10.5, leading=15.5, textColor=MUTED, spaceAfter=12))
styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK, spaceBefore=8, spaceAfter=6))
styles.add(ParagraphStyle(name="H3x", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=5, spaceAfter=4))
styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=9.2, leading=13.2, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", fontName="Helvetica", fontSize=7.8, leading=10.8, textColor=MUTED, spaceAfter=3))
styles.add(ParagraphStyle(name="Bulletx", fontName="Helvetica", fontSize=9, leading=12.8, textColor=INK, leftIndent=11, firstLineIndent=-8, spaceAfter=3))
styles.add(ParagraphStyle(name="TableHead", fontName="Helvetica-Bold", fontSize=7.6, leading=9.5, textColor=WHITE))
styles.add(ParagraphStyle(name="TableBody", fontName="Helvetica", fontSize=7.4, leading=9.6, textColor=INK))
styles.add(ParagraphStyle(name="TableBodyBold", fontName="Helvetica-Bold", fontSize=7.4, leading=9.6, textColor=INK))
styles.add(ParagraphStyle(name="Callout", fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=NAVY, alignment=TA_LEFT))
styles.add(ParagraphStyle(name="Codex", fontName="Courier", fontSize=7.6, leading=10.2, textColor=INK, leftIndent=6, rightIndent=6, spaceAfter=3))
styles.add(ParagraphStyle(name="CenterSmall", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED, alignment=TA_CENTER))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return P("- " + text, "Bulletx")


def section(number, title, lead):
    return [
        Spacer(1, 5 * mm),
        P(title, "SectionTitle"),
        P(lead, "SectionLead"),
        HRFlowable(width="100%", thickness=1, color=RULE, spaceAfter=10),
    ]


def callout(title, body, tone="blue"):
    palette = {
        "blue": (PALE, BLUE),
        "green": (GREEN_PALE, GREEN),
        "orange": (ORANGE_PALE, ORANGE),
        "violet": (VIOLET_PALE, VIOLET),
    }
    bg, stripe = palette[tone]
    box = Table([[P(title, "Callout")], [P(body, "Bodyx")]], colWidths=[172 * mm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 4, stripe),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8E8EF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return box


def matrix(headers, rows, widths=None, font=7.4):
    data = [[P(str(h), "TableHead") for h in headers]]
    for row in rows:
        data.append([P(str(cell), "TableBodyBold" if i == 0 else "TableBody") for i, cell in enumerate(row)])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F7FAFC")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def metrics(items):
    cells = []
    for value, label in items:
        cells.append([P(value, "SectionTitle"), P(label, "Smallx")])
    table = Table([cells], colWidths=[43 * mm] * len(cells))
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def screenshot(path, width=172 * mm):
    image = Image(str(path))
    image._restrictSize(width, 105 * mm)
    frame = Table([[image]], colWidths=[width])
    frame.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return frame


def code_block(lines):
    table = Table([[P(line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), "Codex")] for line in lines], colWidths=[172 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F8")),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table


def page_header_footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFillColor(NAVY)
        canvas.rect(0, A4[1] - 12 * mm, A4[0], 12 * mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(18 * mm, A4[1] - 7.8 * mm, "MEDLINE - COMMITTEE SOLUTION GUIDE")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(18 * mm, 9 * mm, "University presentation edition - 24 August 2026")
        canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Page {doc.page}")
        canvas.setStrokeColor(RULE)
        canvas.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
    canvas.restoreState()


class HeaderFooterCanvas(Canvas):
    """Draw body-page framing after content so automatic page splits stay consistent."""

    def showPage(self):
        if self._pageNumber > 1:
            self.saveState()
            self.resetTransforms()
            self.setFillColor(MUTED)
            self.setFont("Helvetica", 7.5)
            self.drawString(18 * mm, 9 * mm, "University presentation edition - 24 August 2026")
            self.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Page {self._pageNumber}")
            self.setStrokeColor(RULE)
            self.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
            self.restoreState()
        super().showPage()


doc = SimpleDocTemplate(
    str(OUT),
    pagesize=A4,
    rightMargin=19 * mm,
    leftMargin=19 * mm,
    topMargin=19 * mm,
    bottomMargin=18 * mm,
    title="MedLine Committee Solution Guide",
    author="MedLine Team - Speakers 1, 2, 3 and 4",
    subject="Functional, technical and demonstration documentation for the MedLine platform",
)

story = []

# Cover
story.extend([
    Spacer(1, 20 * mm),
    P("UNIVERSITY COMMITTEE EDITION", "CoverEyebrow"),
    P("MedLine", "CoverTitle"),
    P("Medication delivery and medical logistics across patients, pharmacies, warehouses, drivers and administrators.", "CoverSub"),
    Spacer(1, 6 * mm),
    Table([
        [P("30 minutes", "Callout"), P("4 speakers", "Callout"), P("5 operational roles", "Callout")],
        [P("Focused committee presentation", "Smallx"), P("Speaker 1, 2, 3 and 4", "Smallx"), P("One server-controlled workflow", "Smallx")],
    ], colWidths=[57 * mm] * 3, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#8EC9E2")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C7E4EF")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ])),
    Spacer(1, 16 * mm),
    P("Prepared for live demonstration and technical discussion", "CoverSub"),
    P("Current solution baseline: 24 August 2026", "CoverEyebrow"),
    PageBreak(),
])

# Executive summary
story += section("01", "Executive summary", "MedLine connects the complete medicine journey through role-specific interfaces and a single authoritative workflow engine.")
story.append(metrics([("100", "seeded medicines"), ("10", "Damascus pharmacies"), ("2", "warehouses"), ("2", "rated drivers")]))
story += [Spacer(1, 7 * mm), P("What the solution demonstrates", "H2x")]
for item in [
    "A patient can discover an approved pharmacy, select medicines, attach item-specific prescriptions, choose a road-routed delivery, and follow the result.",
    "A pharmacy can review prescriptions and quantities, manage inventory and working hours, replenish from warehouses, and control pickup handoff verification.",
    "A warehouse can maintain traceable batches, allocate exact quantities, approve full or partial procurement, and dispatch through the same delivery network.",
    "A driver can review vehicle-compatible jobs on a route map, accept an order, receive secure pickup, mark arrival, and complete recipient verification.",
    "An administrator governs organizations, subscriptions, users, catalog, pricing, complaints, ratings, audit records, delivery recovery and operational health.",
]: story.append(bullet(item))
story += [Spacer(1, 4 * mm), callout("Central design decision", "Laravel is the authority for permissions, status transitions, prices, reservations, handoff verification and ownership. React and Flutter render role-aware experiences but cannot invent business state.", "blue"), PageBreak()]

# Run of show
story += section("02", "The 30-minute committee run of show", "The presentation is divided evenly across four speakers and ends with a short synthesis and questions.")
story.append(matrix(
    ["Time", "Owner", "Presentation responsibility", "Primary live evidence"],
    [
        ["00:00-07:00", "Speaker 1", "Problem, solution thesis, stakeholder roles and architecture", "Opening slides and role map"],
        ["07:00-14:00", "Speaker 2", "Patient order, pharmacy review, inventory and warehouse procurement", "Order queue, inventory and partial offer"],
        ["14:00-21:30", "Speaker 3", "Driver map, road pricing, pickup verification, transit, arrival and recipient handoff", "Route map and delivery detail"],
        ["21:30-30:00", "Speaker 4", "Administration, assurance, theater data, release boundaries and closing", "Admin controls, audit and demo summary"],
    ], [27 * mm, 26 * mm, 78 * mm, 41 * mm]
))
story += [Spacer(1, 7 * mm), P("Handoff discipline", "H2x")]
for item in [
    "Each speaker ends by creating the question that the next speaker answers.",
    "Do not read status tables aloud. Explain one concrete scenario, then use the tables only when the committee asks for detail.",
    "Use the presentation screenshots if the network or emulator is slow; use the live portal only for the planned click path.",
    "Keep 60-90 seconds inside the final slide for committee questions without exceeding 30 minutes.",
]: story.append(bullet(item))
story += [Spacer(1, 5 * mm), callout("One sentence every speaker should repeat", "The client shows the workflow; the API enforces it.", "green"), PageBreak()]

# Scope and roles
story += section("03", "Solution scope and role model", "Five user roles see different dashboards and actions, while support remains a seeded operational account rather than a committee demo persona.")
story.append(matrix(
    ["Capability", "Patient", "Pharmacy", "Warehouse", "Driver", "Admin"],
    [
        ["Catalog", "Browse", "Browse", "Browse", "Manifest", "Manage"],
        ["Patient orders", "Create / decide", "Review / fulfil", "-", "Deliver", "Monitor"],
        ["Procurement", "-", "Create / decide", "Review / fulfil", "Deliver", "Monitor"],
        ["Inventory", "-", "Own stock", "Own batches", "-", "Oversight"],
        ["Delivery", "Track", "Pickup / monitor", "Pickup / monitor", "Accept / progress", "Reassign"],
        ["Subscription", "None", "Own plan", "Own plan", "None", "Review"],
        ["Governance", "Own support", "Own support", "Own support", "Own support", "Users / audit / policy"],
    ], [38 * mm, 27 * mm, 29 * mm, 29 * mm, 25 * mm, 24 * mm]
))
story += [Spacer(1, 7 * mm), P("Ownership rules", "H2x")]
for item in [
    "Patients see their orders, addresses, prescriptions, deliveries, complaints and ratings.",
    "Pharmacies and warehouses see only records connected to their approved partner profile and active subscription.",
    "Drivers see available jobs matching their approved vehicle type plus their own assignments.",
    "The administrator is deliberately not associated with any pharmacy or warehouse.",
    "Navigation visibility improves usability; server-side role middleware and ownership checks provide security.",
]: story.append(bullet(item))
story.append(PageBreak())

# Architecture
story += section("04", "Architecture and trust boundaries", "The system is a native Windows multi-client platform with replaceable provider integrations and transaction-safe MySQL persistence.")
story.append(matrix(
    ["Layer", "Implemented technology", "Responsibility"],
    [
        ["Web portal", "React + TypeScript + Vite", "Role dashboards, operational queues, forms, maps and administration"],
        ["Mobile", "Flutter with Android flavors", "Role-based mobile parity, secure session, maps, files and driver workflow"],
        ["API", "Laravel 12 + Sanctum", "Authorization, validation, workflows, pricing, transactions and signed file access"],
        ["Data", "MySQL 8 + private storage", "Accounts, stock, orders, events, audit and protected documents"],
        ["Realtime / jobs", "Laravel Reverb, queue worker and scheduler", "Live updates, external notification dispatch and maintenance"],
        ["Providers", "OpenStreetMap/routing, SMTP, FCM and optional SMS", "Road routes, email, push and replaceable external channels"],
    ], [34 * mm, 52 * mm, 86 * mm]
))
story += [Spacer(1, 6 * mm), callout("Consistency boundary", "Critical stock reservations, delivery claims, pickup verification, recipient completion, payment settlement and inventory movements run inside bounded database transactions with row locks and retry-safe idempotency.", "violet")]
story += [Spacer(1, 6 * mm), P("Deployment model", "H2x"), bullet("No Docker. Laravel, React, MySQL, Reverb, workers, scheduler and Flutter run as native services or processes."), bullet("Production secrets, TLS, provider accounts and signing keys remain outside source control."), PageBreak()]

# Pharmacy live evidence
story += section("05", "Role-aware workspaces make priorities visible", "Dashboards adapt to the signed-in role and lead directly to the work that user can perform.")
story.append(screenshot(ASSETS / "pharmacy-dashboard.png"))
story += [Spacer(1, 3 * mm), P("Live local pharmacy workspace: order volume, review queue, deliveries, low stock, bilingual catalog and operational priorities.", "CenterSmall"), Spacer(1, 5 * mm)]
for item in [
    "Patient dashboards emphasize discovery, orders and active delivery.",
    "Pharmacy dashboards emphasize incoming orders, low stock, procurement and pickup readiness.",
    "Warehouse dashboards emphasize fulfilment, batch inventory and dispatch.",
    "Driver dashboards emphasize available route-compatible work and active assignments.",
    "Administrator dashboards emphasize system-wide health, approvals and intervention queues.",
]: story.append(bullet(item))
story.append(PageBreak())

# Patient
story += section("06", "Patient experience", "The patient journey combines catalog discovery, controlled prescriptions, transparent pricing and secure fulfilment.")
for heading, items in [
    ("Discovery and account", ["English/Arabic medicine search by name, code, manufacturer and form.", "Approved pharmacy discovery with address, map pin and working hours.", "Saved map-pinned addresses, profile, locale, password recovery, consents and notification preferences."]),
    ("Order creation", ["Multiple medicines and quantities in one order.", "One private prescription per prescription-required medicine.", "ASAP or scheduled delivery, vehicle choice and readable destination snapshot.", "Road distance, rate per kilometre, delivery fee, tax and total shown before submission."]),
    ("After submission", ["Prescription and pharmacy review timeline.", "Accept or reject a pharmacy partial offer.", "Follow the related delivery without duplicating delivery state in the order.", "Submit a 1-5 rating and open a complaint with optional private evidence."]),
]:
    story.append(P(heading, "H2x"))
    for item in items: story.append(bullet(item))
story += [Spacer(1, 4 * mm), callout("Important distinction", "An accepted order is not automatically completed. The order becomes completed only when the final recipient handoff is verified and inventory/payment settlement succeeds.", "orange"), PageBreak()]

# Pharmacy
story += section("07", "Pharmacy operations", "A pharmacy is both a clinical review point and a logistics participant.")
story.append(screenshot(ASSETS / "pharmacy-orders.png"))
story += [Spacer(1, 3 * mm), P("The queue exposes customer, pharmacy, driver, medicines, destination, total, status and creation time without losing record-level detail.", "CenterSmall"), Spacer(1, 5 * mm)]
for item in [
    "Open and review each medicine and its prescription independently.",
    "Approve or reject a prescription; rejection requires a patient-facing note.",
    "Accept the full order, reject it, or reduce quantities and submit a partial offer.",
    "A partial offer cannot be submitted unless at least one requested quantity is actually reduced.",
    "Manage own inventory, low-stock thresholds, working hours, procurement, subscription and related deliveries.",
    "After a driver claims a delivery, send the four-digit pickup PIN and verify the code shown by the driver.",
]: story.append(bullet(item))
story.append(PageBreak())

# Warehouse and inventory
story += section("08", "Warehouse, inventory and procurement", "The stock model preserves batch traceability and prevents fulfilment decisions from exceeding real inventory.")
story.append(screenshot(ASSETS / "pharmacy-inventory.png"))
story += [Spacer(1, 3 * mm), P("Inventory records expose available and reserved quantities, price, batch/expiry data and stock health.", "CenterSmall"), Spacer(1, 5 * mm)]
for item in [
    "Only administrators create global medicine catalog records; warehouses stock active catalog medicines as separate batches.",
    "A batch records lot number, manufacture date, expiry, received date, location, quantity, reserved quantity, unit price and active state.",
    "Pharmacies build multi-item replenishment requests against eligible warehouse stock.",
    "Warehouses allocate every fulfilled unit across one or more eligible batches.",
    "Full acceptance requires complete allocation. Partial or rejected decisions require explanation.",
    "Completion consumes warehouse reservations and adds inventory to the destination pharmacy in one settlement.",
]: story.append(bullet(item))
story.append(PageBreak())

# Order status dictionary
story += section("09", "Patient order status dictionary", "Order status describes clinical/commercial acceptance. Physical delivery progress stays on the related delivery record.")
story.append(matrix(["Status", "Meaning", "Next normal outcome"], [
    ["prescription_required", "At least one required prescription is missing or rejected.", "Upload or replace item evidence"],
    ["prescription_review", "All required files exist and await pharmacy review.", "Review each prescription"],
    ["pending_pharmacy_review", "Evidence is resolved and the pharmacy must decide quantities.", "Accept, partial offer or reject"],
    ["partial_approval_required", "The pharmacy offered fewer units and needs patient consent.", "Patient approves or rejects"],
    ["partially_accepted", "The patient accepted the reduced fulfilment.", "Create/continue delivery"],
    ["partial_offer_rejected", "The patient declined reduced quantities.", "Terminal"],
    ["accepted", "The full pharmacy offer is approved; a delivery may exist.", "Delivery settlement"],
    ["rejected", "The pharmacy declined the order.", "Terminal"],
    ["cancelled", "The patient/admin cancelled before disallowed dispatch states.", "Terminal"],
    ["completed", "Recipient verification, inventory movement and payment settlement succeeded.", "Rating/support"],
], [42 * mm, 89 * mm, 41 * mm]))
story += [Spacer(1, 5 * mm), callout("Presentation shortcut", "Use one partial-offer example: requested 3 units, pharmacy can supply 2, patient approves, delivery is created for 2. This single scenario demonstrates quantity bounds, consent and preserved history.", "blue"), PageBreak()]

# Procurement statuses
story += section("10", "Procurement workflow and status dictionary", "Procurement mirrors patient ordering but adds exact warehouse batch allocation and pharmacy acceptance of partial fulfilment.")
story.append(matrix(["Status", "Meaning", "Inventory consequence"], [
    ["pending_warehouse_review", "The warehouse must review requested medicines and quantities.", "Requested stock remains reservation-controlled"],
    ["partial_approval_required", "The warehouse offered fewer units and awaits pharmacy consent.", "Accepted quantity remains reserved"],
    ["partially_accepted", "The pharmacy accepted the reduced warehouse offer.", "Delivery can proceed for accepted units"],
    ["partial_offer_rejected", "The pharmacy declined the reduced offer.", "Reservations are released"],
    ["accepted", "The warehouse fully accepted and allocated the request.", "Exact batches remain reserved"],
    ["rejected", "The warehouse cannot fulfil the request.", "Reservations are released"],
    ["completed", "The delivery handoff completed successfully.", "Warehouse decremented; pharmacy incremented"],
], [46 * mm, 78 * mm, 48 * mm]))
story += [Spacer(1, 7 * mm), P("Procurement integrity rules", "H2x")]
for item in [
    "Accepted quantity is always between zero and the requested quantity.",
    "A full acceptance is invalid unless every requested unit is allocated.",
    "A partial acceptance is invalid unless at least one quantity is reduced and a note is supplied.",
    "An inactive or expired batch cannot be selected for a new request.",
    "Pricing, schedule, route and destination are permanently captured for the request.",
]: story.append(bullet(item))
story.append(PageBreak())

# Driver route
story += section("11", "Driver job discovery is based on the road route", "Drivers inspect the real stored route, vehicle requirement, medicine manifest, schedule and route-based fee before accepting an order.")
driver_map = Path(r"C:\Users\Muaz\AppData\Local\Temp\codex-clipboard-3O8zkT.png")
if driver_map.exists(): story.append(screenshot(driver_map))
story += [Spacer(1, 4 * mm)]
for item in [
    "Available work is filtered to the driver's approved vehicle type.",
    "The distance and fee use the stored driving route, not straight-line distance.",
    "Every order snapshots the applicable rate so later administrator changes do not rewrite history.",
    "The driver opens full detail before acceptance: pickup, destination, recipient, contact, manifest, quantities and event timeline.",
    "Acceptance is serialized under a database lock so two drivers cannot claim the same job.",
]: story.append(bullet(item))
story.append(PageBreak())

# Route detail
story += section("12", "Road routing, pricing and recipient context", "One delivery detail brings together the route evidence and the information the assigned driver needs to complete the task.")
story.append(screenshot(ASSETS / "order-detail.png"))
story += [Spacer(1, 3 * mm), P("Stored OpenStreetMap road route between pickup and drop-off; the captured distance is used for the driver fee.", "CenterSmall"), Spacer(1, 5 * mm)]
recipient = Path(r"C:\Users\Muaz\AppData\Local\Temp\codex-clipboard-cmrFG3.png")
if recipient.exists():
    image = Image(str(recipient)); image._restrictSize(172 * mm, 68 * mm); story.append(image)
    story.append(P("Driver detail includes the medicine manifest, price snapshot, recipient name, email, phone and delivery destination.", "CenterSmall"))
story.append(PageBreak())

# Delivery secure flow
story += section("13", "Secure delivery workflow", "Two independent four-digit checks protect the pharmacy/warehouse pickup and the final recipient handoff.")
story.append(matrix(["Step", "Actor", "System action", "Result"], [
    ["1. Accept", "Driver", "Accepts one eligible available order under a lock.", "claimed"],
    ["2. Send pickup PIN", "Pharmacy or warehouse", "Emails a fresh four-digit code to the assigned driver.", "pickup_started"],
    ["3. Verify pickup", "Pickup partner", "Enters the code shown by the driver after physical handoff.", "in_transit automatically"],
    ["4. Mark arrival", "Driver", "Confirms arrival at the destination.", "arrived"],
    ["5. Send recipient PIN", "Driver", "Emails a separate code to the patient or destination pharmacy.", "arrived, awaiting proof"],
    ["6. Verify recipient", "Driver", "Enters the recipient's code after in-person confirmation.", "delivered and settled"],
], [28 * mm, 39 * mm, 73 * mm, 32 * mm]))
story += [Spacer(1, 7 * mm), callout("Current workflow change", "There is no separate driver 'Start delivery' step. Successful pickup verification immediately changes the delivery from pickup_started to in_transit. The driver's next progress action is Mark arrived.", "green")]
story += [Spacer(1, 5 * mm), P("PIN controls", "H2x")]
for item in [
    "Codes are stored only as password hashes and are never returned by an API.",
    "Codes expire, have a resend cooldown and lock after bounded incorrect attempts.",
    "Codes are purpose-specific: a pickup code cannot complete recipient handoff.",
    "The demo mail redirect sends all outgoing messages to one controlled inbox without changing account-owned addresses.",
]: story.append(bullet(item))
story.append(PageBreak())

# Delivery statuses
story += section("14", "Delivery status dictionary", "The main path is sequential; failure and cancellation are explicit exception paths.")
story.append(matrix(["Status / event", "Meaning", "Permitted next action"], [
    ["available", "No driver owns the job.", "Eligible driver accepts; or cancellation"],
    ["claimed", "An approved driver owns the delivery.", "Pickup partner sends driver PIN"],
    ["pickup_started", "Pickup PIN was sent; physical pickup is awaiting verification.", "Pickup partner verifies PIN"],
    ["in_transit", "Pickup was verified and transport began automatically.", "Driver marks arrived"],
    ["arrived", "Driver reached the destination.", "Send and verify recipient PIN"],
    ["delivered", "Recipient verification and settlement completed.", "Terminal"],
    ["failed", "Driver reported an unsuccessful active delivery with a reason.", "Administrator may reassign"],
    ["cancelled", "An unclaimed/eligible delivery was cancelled.", "Terminal"],
    ["reassigned event", "Admin returned a failed job to the queue and cleared driver/PIN/location state.", "Stored delivery status becomes available"],
], [44 * mm, 86 * mm, 42 * mm]))
story += [Spacer(1, 6 * mm), callout("Location privacy", "Only the latest driver coordinate is retained for an authorized active delivery. It becomes unavailable when stale and is cleared when the job fails, is cancelled, is reassigned or is delivered.", "violet"), PageBreak()]

# Supporting statuses
story += section("15", "Supporting review and operational statuses", "The rest of the platform uses short, explainable review states with administrator correction loops.")
story.append(matrix(["Object", "Statuses", "Meaning"], [
    ["Prescription", "pending_review, approved, rejected", "A medicine-specific document awaits clinical review, passes, or must be replaced."],
    ["Organization", "pending, correction_required, approved, rejected, suspended", "Application review and ongoing access state for a pharmacy or warehouse."],
    ["Subscription", "payment_under_review, correction_required, active, expiring_soon, grace, expired, rejected", "Payment review and time-based operating access."],
    ["Payment proof", "under_review, correction_required, approved, rejected", "Private receipt evidence and its decision."],
    ["Verification document", "under_review, correction_required, approved, rejected", "Identity/license evidence and its decision."],
    ["Complaint", "open, in_review, resolved, rejected", "Support intake, active handling and terminal outcome."],
    ["User", "active, suspended", "Authentication and platform access state."],
    ["Rating", "visible, hidden", "Submitted feedback; moderation is reversible and audited."],
    ["Inventory health", "healthy, low_stock, expired, inactive", "Calculated presentation of quantity, threshold, expiry and active state."],
    ["Batch allocation", "reserved, released, consumed", "Warehouse units held, returned or finalized by procurement."],
], [38 * mm, 63 * mm, 71 * mm]))
story.append(PageBreak())

# Notifications
story += section("16", "Notifications and professional email", "Business mutations commit first; user-facing notification records and external delivery follow without risking the transaction.")
story.append(matrix(["Channel", "Behavior", "Demo / production boundary"], [
    ["In-app", "Persisted notification inbox with preferences, read and delete actions.", "Always available when enabled"],
    ["Email", "Laravel mail transport with branded, purpose-specific messages and action buttons.", "Demo redirect can force all recipients to one inbox"],
    ["Push", "FCM adapter uses active encrypted device tokens and records attempts.", "Requires provider credentials"],
    ["SMS", "Optional generic HTTP adapter.", "Requires an approved provider"],
    ["Realtime", "Reverb supports live client updates while normal reads remain available.", "Defaults to port 8090 locally"],
], [29 * mm, 75 * mm, 68 * mm]))
story += [Spacer(1, 7 * mm), P("Notification safety rules", "H2x")]
for item in [
    "No PIN, password, access token, prescription content, storage path or payment evidence enters a notification payload.",
    "External provider failures do not roll back a successful order, procurement, review or delivery transaction.",
    "Delivery attempts are retried at the queue/provider boundary and invalid push tokens are revoked.",
    "For the committee demo, configure MAIL_DEMO_TO_ADDRESS to one controlled test inbox and keep QUEUE_CONNECTION=sync for the simplest email demonstration.",
]: story.append(bullet(item))
story.append(PageBreak())

# Security
story += section("17", "Security, privacy and audit", "MedLine protects workflow authority and sensitive documents at the server boundary.")
story.append(matrix(["Control", "Implemented behavior"], [
    ["Authentication", "Sanctum access tokens, rotated single-use refresh tokens, secure browser cookie transport and native body transport."],
    ["Administrator 2FA", "Six-digit TOTP is required at sign-in when authenticator protection is enabled."],
    ["Authorization", "Role middleware plus record ownership checks on every protected route."],
    ["Private files", "Prescriptions, proofs, identity documents and complaint evidence stay outside public storage and use short-lived signed access."],
    ["Upload safety", "Type/size validation and a fail-closed scanner integration when enabled."],
    ["Mutation safety", "Named throttles, idempotency keys, database transactions, row locks and bounded deadlock retries."],
    ["Auditability", "Administrator decisions, downloads, pricing changes, delivery recovery and critical workflow actions are recorded."],
    ["Privacy", "Latest-location model, no sensitive analytics/log payloads, consent records and owner-defined retention gates."],
], [43 * mm, 129 * mm]))
story += [Spacer(1, 6 * mm), callout("Production release gate", "The implementation is security-conscious, but real deployment still requires owner-approved prescription policy, privacy terms, retention periods, HTTPS, provider secrets, private-storage ACLs and pilot validation.", "orange"), PageBreak()]

# Reliability
story += section("18", "Consistency and failure recovery", "The solution is designed so visible states agree with stock, delivery events, payment status and authorization.")
for heading, items in [
    ("Database guarantees", ["Stock and batch rows are locked before reservation or consumption.", "Critical operations are transactional and use bounded retry on deadlocks.", "Idempotency keys replay the same response for a retried identical request and reject key reuse with different input."]),
    ("Delivery consistency", ["A delivered patient order must be completed and paid.", "A delivered procurement must be completed with consumed batch allocation and destination inventory movement.", "A failed delivery clears location and may only be returned to available through the audited admin reassignment action."]),
    ("Operational recovery", ["Health and readiness endpoints separate process liveness from dependency readiness.", "Queues and notification delivery attempts are observable.", "Backups are native, encrypted and intended for isolated restore validation."]),
]:
    story.append(P(heading, "H2x"))
    for item in items: story.append(bullet(item))
story += [Spacer(1, 5 * mm), callout("Why the status dictionary matters", "A status is not cosmetic text. It determines who may act, what must already be true, which records move together and whether an operation is recoverable.", "blue"), PageBreak()]

# UX
story += section("19", "Web, mobile, localization and accessibility", "The two clients share the same server contract while adapting interaction patterns to desktop operations and mobile field work.")
story.append(matrix(["Area", "Web portal", "Flutter mobile"], [
    ["Navigation", "Responsive role sidebar, searchable queues and whole-row record access.", "Role-gated shell, Material 3 navigation and touch-first actions."],
    ["Data lists", "Search, status filters, sorting, pagination and wide-table scroll regions.", "Reusable searchable/filterable/sortable/paginated record lists and pull-to-refresh."],
    ["Maps", "OpenStreetMap pharmacy availability, pickup/drop-off and driver routes.", "Map pins, route views, addresses and driver location permission."],
    ["Files", "Authorized upload/download controls and signed private links.", "Styled file selection for prescription, proof, verification and complaint evidence."],
    ["Localization", "English/Arabic with LTR/RTL layout and persisted profile choice.", "Persisted locale and localized role/workflow labels."],
    ["Accessibility", "Semantic buttons, labels, live regions, focus states and keyboard use.", "Semantic containers, tooltips, touch targets and consistent status mapping."],
], [31 * mm, 72 * mm, 69 * mm]))
story += [Spacer(1, 7 * mm), callout("Parity principle", "Clients may differ visually, but neither client may expose a transition that the API does not permit.", "green"), PageBreak()]

# Seed
story += section("20", "Deterministic theater dataset", "The destructive non-production seeder creates a complete, internally consistent demonstration world and verifies its invariants before finishing.")
story.append(metrics([("18", "seeded user accounts"), ("19", "patient-order scenarios"), ("7", "procurement scenarios"), ("8", "driver ratings")]))
story += [Spacer(1, 7 * mm)]
for item in [
    "Exactly 100 bilingual medicines across multiple categories, manufacturers, forms and prescription rules.",
    "Ten approved and subscribed pharmacies across Damascus, including Central Pharmacy on Al-Hamra Street.",
    "Two approved and subscribed warehouses with traceable stock; one warehouse is in Damascus.",
    "Two approved available drivers: a motorcycle driver and a car driver, each with ratings from completed jobs.",
    "Two patients with Damascus addresses, plus one administrator who is not associated with any partner.",
    "Orders, procurements and deliveries cover every current status, including full, partial, rejected, cancelled, failed and completed outcomes.",
    "Subscriptions, working hours, notifications, consents, prescriptions, complaints, ratings, inventory movements and audit records are pre-populated.",
]: story.append(bullet(item))
story += [Spacer(1, 5 * mm), callout("Destructive by design", "The seeder deletes existing application data and is blocked in production. Use it only to reset a local or explicitly authorized non-production demo environment.", "orange"), PageBreak()]

# Demo accounts
story += section("21", "Committee demo accounts", "All seeded accounts use MEDLINE_SEED_PASSWORD. The default local-only password is shown here for rehearsal convenience and must never be used outside the demo environment.")
story.append(matrix(["Role", "Email", "Recommended demonstration"], [
    ["Administrator", "admin@medline.local", "Dashboard, approvals, audit, pricing and recovery"],
    ["Patient", "demo.patient@medline.local", "Catalog, order, addresses, tracking and support"],
    ["Pharmacy", "pharmacy@medline.local", "Central Pharmacy order/inventory/pickup workflow"],
    ["Warehouse", "warehouse.damascus@medline.local", "Batch stock and procurement fulfilment"],
    ["Driver", "demo.driver@medline.local", "Motorcycle-compatible map, acceptance and delivery"],
], [33 * mm, 70 * mm, 69 * mm]))
story += [Spacer(1, 6 * mm), code_block(["Local default password: ChangeMe123!", "Pre-staged verification code only: 2468"]), Spacer(1, 5 * mm)]
for item in [
    "Freshly initiated pickup and recipient verifications generate a new four-digit code and email it.",
    "The value 2468 applies only to pre-staged pickup_started and arrived seed scenarios.",
    "Use the demo inbox redirect to avoid sending committee rehearsal messages to the account-owned addresses.",
]: story.append(bullet(item))
story.append(PageBreak())

# Startup
story += section("22", "Setup and runtime commands", "One PowerShell launcher detects whether initialization is required, starts the native services and supports explicit ports.")
story.append(P("Normal daily startup", "H2x"))
story.append(code_block([r".\scripts\medline.ps1"]))
story.append(P("Reset and load the complete theater dataset", "H2x"))
story.append(code_block([r".\scripts\medline.ps1 --force-install --fresh-seed"]))
story.append(P("Backend and web only", "H2x"))
story.append(code_block([r".\scripts\medline.ps1 --skip-mobile"]))
story.append(P("Choose ports non-interactively", "H2x"))
story.append(code_block([r".\scripts\medline.ps1 --api-port 8100 --reverb-port 8190 --web-port 3100"]))
story.append(P("Target a specific Android emulator/device", "H2x"))
story.append(code_block([r".\scripts\medline.ps1 --mobile-device emulator-5554"]))
story += [Spacer(1, 6 * mm)]
for item in [
    "Defaults: API 8000, Reverb 8090, web 3001. Port 8080 is avoided on this workstation.",
    "The launcher starts MySQL, Laravel, Reverb, queue worker, scheduler, Vite and Flutter in separate windows when needed.",
    "Use --install-only for setup/migrations without runtime processes and --select-ports for interactive port selection.",
]: story.append(bullet(item))
story.append(PageBreak())

# Live demo runbook
story += section("23", "Recommended live demonstration", "This route shows end-to-end capability without creating too many records during the committee session.")
story.append(matrix(["Minute", "Speaker", "Live action", "Fallback"], [
    ["00-07", "1", "Use slides; briefly point to the live role-aware pharmacy dashboard.", "Slide 5 screenshot"],
    ["07-10", "2", "Open the patient order and explain item-level prescription and partial quantity handling.", "Slides 5-6"],
    ["10-14", "2", "Open pharmacy inventory, then show a procurement record with batch allocation.", "Slides 7-8"],
    ["14-17", "3", "Open the driver route map and one delivery detail before acceptance.", "Slide 9 screenshot"],
    ["17-21:30", "3", "Explain pickup PIN -> in transit -> mark arrived -> recipient PIN -> delivered.", "Slides 10-12"],
    ["21:30-26", "4", "Open admin dashboard, one subscription review and one audit record.", "Slides 13-14"],
    ["26-30", "4", "Show seed coverage, summarize assurance boundaries and invite questions.", "Slides 15-16"],
], [22 * mm, 21 * mm, 91 * mm, 38 * mm]))
story += [Spacer(1, 6 * mm), callout("Rehearsal rule", "Do not reset the database during the live presentation. Reset and verify the dataset beforehand, keep all services running, and keep one signed-in tab per role if possible.", "orange"), PageBreak()]

# Speaker 1
story += section("24", "Speaker 1 detailed brief", "Goal: establish the problem, the value proposition and the architecture without drowning the committee in implementation detail.")
for item in [
    "Opening: 'Medicine delivery is not only transport. It coordinates prescriptions, real stock, partner approval, pricing, identity and two physical handoffs.'",
    "Explain why five role-specific views are required but one API must remain authoritative.",
    "Use the pharmacy dashboard as proof that the interface changes according to operational responsibility.",
    "Describe React, Flutter, Laravel, MySQL, Reverb, queues and replaceable providers at one sentence each.",
    "Close: 'Now that the platform boundary is clear, Speaker 2 will show how a medicine request becomes a controlled order and stock commitment.'",
]: story.append(bullet(item))
story += [Spacer(1, 5 * mm), P("Likely questions for Speaker 1", "H2x"), bullet("Why not one generic dashboard? Because each role owns different actions and data; server authorization mirrors that separation."), bullet("Why Laravel as authority? Because multiple clients must agree on the same stock, status and permissions under concurrency."), PageBreak()]

# Speaker 2
story += section("25", "Speaker 2 detailed brief", "Goal: prove that MedLine handles clinical evidence, partial fulfilment and stock movement as one coherent business process.")
for item in [
    "Start with the patient: pharmacy, medicines, item-specific prescription, address, schedule, vehicle and price review.",
    "Show the pharmacy queue and explain full acceptance, rejection and partial offer with bounded quantities.",
    "Emphasize that delivery progress is not copied into the order status; completion occurs only after delivery settlement.",
    "Move to procurement: the pharmacy replenishes from a warehouse and the warehouse allocates exact batches.",
    "Close: 'The order is approved and the stock is reserved. Speaker 3 will show how the physical medicine changes hands securely.'",
]: story.append(bullet(item))
story += [Spacer(1, 5 * mm), P("Likely questions for Speaker 2", "H2x"), bullet("Can accepted quantity exceed requested quantity? No; the API bounds every line."), bullet("What prevents overselling? Reservations and quantity updates execute under database locks."), PageBreak()]

# Speaker 3
story += section("26", "Speaker 3 detailed brief", "Goal: demonstrate that driver work is route-aware and that both handoffs have independent proof.")
for item in [
    "Open with the route map: the route is a stored road path, and the driver fee reflects kilometres travelled rather than straight-line distance.",
    "Explain vehicle matching and locked acceptance so the same job cannot be claimed twice.",
    "Pickup: partner sends the code to the driver; partner enters the code shown in person; the delivery becomes in transit immediately.",
    "Arrival: driver marks arrived, sends a separate code to the recipient and enters it after in-person confirmation.",
    "Failure: driver records a reason; admin can return only a failed delivery to available and resets sensitive state.",
    "Close: 'The delivery now has a complete event history. Speaker 4 will show how administrators govern and audit the whole platform.'",
]: story.append(bullet(item))
story += [Spacer(1, 5 * mm), P("Likely questions for Speaker 3", "H2x"), bullet("Why two codes? Pickup and recipient delivery are different trust boundaries and must not share proof."), bullet("Where is the start-delivery step? It was removed; verified pickup now enters in_transit automatically."), PageBreak()]

# Speaker 4
story += section("27", "Speaker 4 detailed brief", "Goal: connect administration, security and deterministic demo coverage to an honest statement of readiness.")
for item in [
    "Show role-aware admin queues: partners, subscriptions, documents, users, inventory, deliveries, complaints, ratings and audit.",
    "Explain correction_required as a recoverable review loop, not a rejection.",
    "Explain transaction safety, signed private files, hashed PINs, throttles, idempotency and auditable intervention.",
    "Use the theater dataset counts to prove scenario coverage and consistency checks.",
    "State production boundaries honestly: providers, legal policy, TLS, retention, signing and pilot acceptance still require owners.",
    "Close: 'MedLine demonstrates a complete medication logistics workflow whose screens, statuses and data remain consistent because one server-controlled model connects them.'",
]: story.append(bullet(item))
story += [Spacer(1, 5 * mm), P("Likely questions for Speaker 4", "H2x"), bullet("Is it production-certified? No claim is made; the application is implemented, while legal/provider/security release gates remain explicit."), bullet("Can admin access everything? Admin has operational scope, but private download endpoints remain authorized and audited."), PageBreak()]

# Q&A
story += section("28", "Committee question bank", "Use these short answers to keep the final discussion precise and consistent across all four speakers.")
story.append(matrix(["Question", "Concise answer"], [
    ["How do you prevent two drivers accepting one order?", "The API locks the delivery and driver records before changing ownership."],
    ["Why use road distance?", "It better represents real travel effort and permanently snapshots a reproducible fee."],
    ["Are verification codes visible in the database or API?", "Only hashes are stored; values never enter API responses, logs or notification payloads."],
    ["How is stock consistency maintained?", "Reservations, batch allocation and completion movements occur in transactions with row locks."],
    ["Can a pharmacy work without approval/payment?", "No. Operational access requires an approved partner and active subscription."],
    ["What happens if email fails after an order succeeds?", "The business transaction remains committed; provider delivery is retried separately."],
    ["Does admin belong to a pharmacy?", "No. The seed and domain explicitly keep administrator accounts unassociated."],
    ["Is Arabic supported?", "Yes. Web and mobile support English/Arabic, LTR/RTL and persisted locale preference."],
    ["What is not finished for production?", "Legal policy, provider credentials, HTTPS/domain configuration, signing, retention approval and pilot acceptance."],
], [72 * mm, 100 * mm]))
story.append(PageBreak())

# Release boundaries
story += section("29", "Readiness and future production gates", "The committee should distinguish implemented capability from owner-controlled deployment decisions.")
story.append(matrix(["Implemented now", "Owner / production gate"], [
    ["Role-secured Laravel API and both clients", "Production domains, HTTPS certificates and protected environment values"],
    ["Order, procurement, delivery and stock workflows", "Approved legal policy for prescriptions and medicine delivery"],
    ["Road routes and versioned vehicle rates", "Delivery zones, commercial rates, taxes and provider terms"],
    ["Private files, signed URLs and scanner adapter", "Storage ACLs, backup policy and production scanner"],
    ["In-app/email/push/SMS abstraction", "SMTP, FCM and SMS credentials plus owner provider testing"],
    ["Flutter flavors and Android build handoff", "Release signing, store accounts and physical-device pilot"],
    ["Privacy controls and retention commands", "Approved retention periods, consent text and deletion/legal-hold process"],
], [86 * mm, 86 * mm]))
story += [Spacer(1, 7 * mm), callout("Recommended next step", "Run a five-role acceptance rehearsal on the exact committee hardware, verify the demo inbox, pre-open the map routes, and record a screen-capture fallback before presentation day.", "green"), PageBreak()]

# Closing
story += section("30", "Closing synthesis", "MedLine is strongest when presented as one connected control system for medicine logistics, not as separate applications.")
story.append(metrics([("5", "role-specific experiences"), ("2", "secure handoffs"), ("1", "authoritative API"), ("0", "manual start-delivery steps")]))
story += [Spacer(1, 8 * mm), P("What the committee should remember", "H2x")]
for item in [
    "The patient sees clarity: real pharmacies, prescriptions, pricing and tracked fulfilment.",
    "Partners see control: bounded decisions, traceable inventory and subscription-based access.",
    "Drivers see actionable work: real routes, compatible jobs, recipient context and secure proof.",
    "Administrators see accountability: approvals, recovery, pricing history, complaints, moderation and audit.",
    "The system preserves consistency because every important transition is validated and recorded by the API.",
]: story.append(bullet(item))
story += [Spacer(1, 7 * mm), callout("Final sentence", "MedLine turns a complex medication journey into a visible, secure and auditable workflow from inventory to recipient.", "blue"), Spacer(1, 10 * mm), P("Prepared for Speaker 1, Speaker 2, Speaker 3 and Speaker 4", "CenterSmall")]


def first_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.rect(A4[0] - 55 * mm, 0, 55 * mm, A4[1], fill=1, stroke=0)
    canvas.setFillColor(CYAN)
    canvas.circle(A4[0] - 28 * mm, A4[1] - 35 * mm, 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawCentredString(A4[0] - 28 * mm, A4[1] - 38 * mm, "M")
    canvas.setFillColor(colors.HexColor("#BEE7F7"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(19 * mm, 14 * mm, "Functional handbook, status reference and four-speaker presentation runbook")
    canvas.restoreState()


doc.build(story, onFirstPage=first_page, onLaterPages=lambda canvas, doc: None, canvasmaker=HeaderFooterCanvas)
print(str(OUT))
