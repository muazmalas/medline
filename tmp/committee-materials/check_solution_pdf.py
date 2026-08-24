from pathlib import Path

import pdfplumber

p = Path(r"C:\Users\Muaz\Downloads\Pharmacy\output\pdf\MedLine_Committee_Solution_Guide.pdf")
with pdfplumber.open(p) as pdf:
    texts = [(page.extract_text() or "") for page in pdf.pages]

joined = "\n".join(texts)
print("pages", len(texts))
print("minimum_page_text_chars", min(len(t.strip()) for t in texts))
print("empty_pages", [i + 1 for i, t in enumerate(texts) if len(t.strip()) < 40])
print("replacement_characters", joined.count("\ufffd"))
print("picked_up_occurrences", joined.count("picked_up"))
print("in_transit_occurrences", joined.count("in_transit"))
print("start_delivery_explanation_occurrences", joined.lower().count("start-delivery"))
print("contains_all_speakers", all(f"Speaker {i}" in joined for i in range(1, 5)))
print("contains_30_minute_schedule", all(v in joined for v in ("00:00-07:00", "07:00-14:00", "14:00-21:30", "21:30-30:00")))
print("contains_status_tables", all(v in joined for v in ("prescription_required", "pending_warehouse_review", "pickup_started", "arrived", "delivered")))
