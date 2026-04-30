# מערכת אוטומציה לטפסי ביטוח

מערכת שמחלצת נתונים מדוח תפעולי (PDF) וממלאת אוטומטית טפסי הצעה לחברות ביטוח.

## חברות נתמכות

| חברה | מוצר | סטטוס |
|------|------|--------|
| כלל ביטוח | בריאות | ✅ פעיל |

## דרישות מוקדמות

- Python 3.10+
- מפתח API של Anthropic

## התקנה

```bash
# 1. שכפל את הריפו
git clone https://github.com/YOUR_USERNAME/insurance-automation.git
cd insurance-automation

# 2. צור סביבה וירטואלית
python -m venv venv
source venv/bin/activate  # Mac/Linux
# או: venv\Scripts\activate  # Windows

# 3. התקן תלויות
pip install -r requirements.txt

# 4. הגדר מפתח API
cp .env.example .env
# ערוך את .env והכנס את מפתח ה-API שלך

# 5. הרץ את השרת
python main.py
```

## שימוש

פתח דפדפן בכתובת: **http://localhost:8000**

1. בחר חברת ביטוח (כרגע: כלל בריאות)
2. העלה דוח תפעולי (PDF) מ-GEMEL INVEST
3. לחץ "מלא טופס אוטומטית"
4. הורד את ה-PDF הממולא

## מה מתמלא אוטומטית

### פרטי מבוטח
- שם מלא, ת"ז, תאריך לידה, מין
- טלפון, אימייל, כתובת מלאה, מיקוד
- קופת חולים, גובה, משקל

### הצהרת בריאות
- כל 28 שאלות הצהרת הבריאות
- סטטוס עישון

### מה נשאר ידני
- חתימות המבוטח
- פרטי תשלום / הרשאת בנק

## מבנה הפרויקט

```
insurance-automation/
├── main.py              # שרת FastAPI + ממשק ווב
├── src/
│   ├── extractor.py     # חילוץ נתונים עם Claude Vision
│   └── filler.py        # מילוי טופס כלל
├── forms/
│   └── clal_health.pdf  # טופס הצעה ריק של כלל
├── outputs/             # טפסים ממולאים (נוצר אוטומטית)
├── requirements.txt
└── .env.example
```

## הוספת חברת ביטוח חדשה

1. הוסף את הטופס הריק לתיקיית `forms/`
2. צור קובץ `src/filler_COMPANY.py` על בסיס `filler.py`
3. עדכן את `main.py` להוסיף את האפשרות החדשה

## רישיון

לשימוש פנימי בלבד.
