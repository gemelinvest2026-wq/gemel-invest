"""
filler.py
---------
ממלא את טופס הצעת ביטוח בריאות של כלל בהתבסס על נתונים מחולצים.

מיפוי שדות:
  Gender          -> /False = זכר, /True = נקבה
  IsSmoking       -> /False = לא מעשן, /True = מעשן
  HealthDecMainQN -> /1 = כן, /2 = לא
"""
import json
from pathlib import Path
import pypdf


# ─────────────────────────────────────────────
# Field mapping: extracted data key → Clal PDF field_id
# ─────────────────────────────────────────────

MAIN_TEXT_FIELDS = {
    "id_number":    "Shaban",
    "birth_date":   "BirthDate",
    "hmo":          "HMO",
    "phone":        "CellPhoneNumber",
    "email":        "EmailAddress",
    "city":         "City",
    "street":       "StreetName",
    "house_number": "HouseNumber",
    "zip_code":     "ZipCode",
}

SPOUSE_TEXT_FIELDS = {
    "id_number":  "ShabanSpouse",
    "birth_date": "BirthDateSpouse",
    "hmo":        "HMOSpouse",
    "first_name": "FirstNameSpouse",
    "last_name":  "LastNameSpouse",
    "phone":      "CellPhoneNumberSpouse",
    "email":      "EmailAddressSpouse",
}

CHILD_TEXT_FIELDS = {
    1: {"id_number": "ShabanChild1", "birth_date": "BirthDateChild1",
        "hmo": "HMOChild1", "first_name": "FirstNameChild1", "last_name": "LastNameChild1"},
    2: {"id_number": "ShabanChild2", "birth_date": "BirthDateChild2",
        "hmo": "HMOChild2", "first_name": "FirstNameChild2", "last_name": "LastNameChild2"},
    3: {"id_number": "ShabanChild3", "birth_date": "BirthDateChild3",
        "hmo": "HMOChild3", "first_name": "FirstNameChild3", "last_name": "LastNameChild3"},
    4: {"id_number": "ShabanChild4", "birth_date": "BirthDateChild4",
        "hmo": "HMOChild4", "first_name": "FirstNameChild4", "last_name": "LastNameChild4"},
}

# Health declaration questions mapping
# key = health_declaration dict key → HealthDecMainQN field number
# /1 = כן (yes), /2 = לא (no)
HEALTH_QUESTION_MAP = {
    "smoking":            1,
    "neurological":       1,   # shared Q1 covers neurological
    "mental_health":      2,
    "respiratory":        3,
    "skin":               4,
    "heart_disease":      5,
    "digestive":          6,
    "urinary":            7,   # Q7 - kidney/urinary
    "bones_joints":       8,
    "eyes_ears_nose":     9,
    "ent_system":         16,
    "reproductive_system": 17,
    "autoimmune":         18,
    "blood_disorder":     11,
    "cancer":             13,
    "genetic":            2,
    "hiv_aids":           12,
    "tumors":             13,
    "chronic_disease":    10,
    "diabetes":           10,
    "vision_system":      15,
    "regular_medication": 1,   # Q1 covers regular meds
    "pending_tests":      2,
    "surgery_last_5y":    3,
    "abnormal_findings":  3,
}

# The 28 health declaration questions (Main insured = HealthDecMainQ1..Q28)
# We default all to /2 (no) and override based on extracted data
HEALTH_DEC_QUESTIONS = list(range(1, 29))


def _get_gender_value(gender_str: str) -> str:
    """Convert gender string to PDF radio value."""
    if not gender_str:
        return "/False"
    return "/True" if "נקבה" in gender_str or "female" in gender_str.lower() else "/False"


def _bool_to_health(value: bool) -> str:
    """Convert boolean to health declaration radio value."""
    return "/1" if value else "/2"


def fill_clal_form(data: dict, template_pdf: Path, output_pdf: Path) -> None:
    """
    ממלא את טופס כלל בריאות.
    
    Args:
        data: נתונים מחולצים מהדוח התפעולי (מבנה מ-extractor.py)
        template_pdf: נתיב לטופס הריק של כלל
        output_pdf: נתיב לקובץ הפלט
    """
    reader = pypdf.PdfReader(str(template_pdf))
    writer = pypdf.PdfWriter()
    writer.append(reader)

    fields_to_fill = {}

    main = data.get("insured_main", {})
    spouse = data.get("insured_spouse", {})
    children = data.get("children", [])
    health = data.get("health_declaration", {})
    new_policy = data.get("new_policy", {})

    # ── Main insured text fields ──
    for data_key, field_id in MAIN_TEXT_FIELDS.items():
        val = main.get(data_key)
        if val:
            fields_to_fill[field_id] = str(val)

    # Height / Weight (page 3 fields)
    if main.get("height_cm"):
        fields_to_fill["Height"] = str(main["height_cm"])
    if main.get("weight_kg"):
        fields_to_fill["Weight"] = str(main["weight_kg"])

    # Policy start date
    if new_policy.get("start_date"):
        fields_to_fill["InsuranceBegin"] = new_policy["start_date"]

    # ── Gender radio ──
    fields_to_fill["Gender"] = _get_gender_value(main.get("gender", ""))

    # ── Smoking ──
    is_smoker = bool(health.get("smoking") or main.get("is_smoker"))
    fields_to_fill["IsSmoking"] = "/True" if is_smoker else "/False"
    if is_smoker:
        cigs = main.get("cigarettes_per_day")
        if cigs:
            fields_to_fill["SmokingStatus"] = "/True"

    # ── Email checkbox (prefer digital) ──
    fields_to_fill["Email"] = "/Yes"

    # ── Spouse ──
    if any(spouse.get(k) for k in ["id_number", "first_name", "last_name"]):
        for data_key, field_id in SPOUSE_TEXT_FIELDS.items():
            val = spouse.get(data_key)
            if val:
                fields_to_fill[field_id] = str(val)
        fields_to_fill["GenderSpouse"] = _get_gender_value(spouse.get("gender", ""))

    # ── Children ──
    for i, child in enumerate(children[:4], start=1):
        mapping = CHILD_TEXT_FIELDS.get(i, {})
        for data_key, field_id in mapping.items():
            val = child.get(data_key)
            if val:
                fields_to_fill[field_id] = str(val)
        fields_to_fill[f"GenderChild{i}"] = _get_gender_value(child.get("gender", ""))

    # ── Health declaration — all questions default to /2 (לא) ──
    for q in HEALTH_DEC_QUESTIONS:
        fields_to_fill[f"HealthDecMainQ{q}"] = "/2"

    # Override with actual yes answers
    for health_key, question_num in HEALTH_QUESTION_MAP.items():
        if health.get(health_key):
            fields_to_fill[f"HealthDecMainQ{question_num}"] = "/1"

    # ── Write all fields ──
    for page_num in range(len(writer.pages)):
        writer.update_page_form_field_values(
            writer.pages[page_num],
            fields_to_fill,
            auto_regenerate=False,
        )

    with open(output_pdf, "wb") as f:
        writer.write(f)

    print(f"[filler] Filled {len(fields_to_fill)} fields → {output_pdf}")
