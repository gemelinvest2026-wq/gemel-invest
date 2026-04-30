"""
extractor.py
------------
שולח את הדוח התפעולי ל-Claude Vision ומחלץ נתונים מובנים.
"""
import base64
import json
import anthropic
from pathlib import Path


EXTRACTION_PROMPT = """
אתה מומחה לחילוץ נתונים מדוחות תפעוליים של סוכני ביטוח ישראלים.

קרא את הדוח התפעולי המצורף (PDF של חברת GEMEL INVEST או דומה) וחלץ את כל הנתונים הבאים.
החזר JSON בלבד — ללא טקסט נוסף.

{
  "insured_main": {
    "first_name": "",
    "last_name": "",
    "id_number": "",
    "birth_date": "DD/MM/YYYY",
    "gender": "זכר" or "נקבה",
    "phone": "",
    "email": "",
    "city": "",
    "street": "",
    "house_number": "",
    "zip_code": "",
    "hmo": "",
    "marital_status": "",
    "occupation": "",
    "height_cm": null,
    "weight_kg": null,
    "bmi": null,
    "is_smoker": false,
    "cigarettes_per_day": null
  },
  "insured_spouse": {
    "first_name": "",
    "last_name": "",
    "id_number": "",
    "birth_date": "",
    "gender": "",
    "hmo": ""
  },
  "children": [],
  "existing_policies": [
    {
      "company": "",
      "policy_number": "",
      "type": "",
      "premium": null
    }
  ],
  "new_policy": {
    "start_date": "",
    "sum_insured": null,
    "premium": null
  },
  "health_declaration": {
    "smoking": false,
    "drugs": false,
    "alcohol": false,
    "chronic_disease": false,
    "heart_disease": false,
    "cancer": false,
    "diabetes": false,
    "mental_health": false,
    "respiratory": false,
    "orthopedic": false,
    "neurological": false,
    "digestive": false,
    "urinary": false,
    "skin": false,
    "eyes_ears_nose": false,
    "pregnancy_related": false,
    "autoimmune": false,
    "blood_disorder": false,
    "genetic": false,
    "hiv_aids": false,
    "tumors": false,
    "bones_joints": false,
    "vision_system": false,
    "ent_system": false,
    "reproductive_system": false,
    "regular_medication": false,
    "medication_names": "",
    "pending_tests": false,
    "hospitalized_last_5y": false,
    "surgery_last_5y": false,
    "abnormal_findings": false
  },
  "agent": {
    "name": "",
    "license_number": ""
  },
  "report_date": ""
}

הוראות:
- אם שדה לא קיים בדוח — השאר ריק ("") או null
- תאריכים בפורמט DD/MM/YYYY
- מין: "זכר" או "נקבה" בלבד
- עישון: true/false בהתאם לנתון בדוח
- כל שאלות הצהרת הבריאות: אם לא מצוין אחרת — false
- החזר JSON תקני בלבד
"""


async def extract_from_report(pdf_path: Path) -> dict:
    """
    מקבל נתיב ל-PDF, שולח ל-Claude Vision, מחזיר dict עם הנתונים.
    """
    # Read and encode PDF as base64
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")

    client = anthropic.Anthropic()

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": pdf_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": EXTRACTION_PROMPT
                    }
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()

    # Clean up markdown code blocks if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Claude החזיר JSON לא תקני: {e}\n\nתגובה גולמית:\n{raw[:500]}")

    return data
