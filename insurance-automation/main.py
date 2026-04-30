"""
Insurance Form Automation - Main Server
מערכת אוטומציה למילוי טפסי ביטוח
"""
import os
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import tempfile
import shutil
from pathlib import Path

from src.extractor import extract_from_report
from src.filler import fill_clal_form

app = FastAPI(title="Insurance Form Automation", version="1.0.0")

FORMS_DIR = Path("forms")
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)


@app.get("/", response_class=HTMLResponse)
async def home():
    return """
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
        <meta charset="UTF-8">
        <title>מילוי טפסי ביטוח אוטומטי</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 700px; margin: 60px auto; padding: 20px; background: #f5f5f5; }
            h1 { color: #1a1a2e; }
            .card { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
            .btn { background: #1a1a2e; color: white; border: none; padding: 12px 28px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 16px; }
            .btn:hover { background: #16213e; }
            select { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd; font-size: 15px; margin-top: 8px; }
            label { font-weight: bold; color: #555; }
            input[type=file] { margin-top: 8px; width: 100%; }
            #status { margin-top: 20px; padding: 14px; border-radius: 8px; display: none; }
            .loading { background: #e8f4fd; color: #1565c0; }
            .success { background: #e8f5e9; color: #2e7d32; }
            .error { background: #fce4ec; color: #c62828; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>מילוי טפסי ביטוח אוטומטי</h1>
            <p>העלה דוח תפעולי — המערכת תמלא את טופס ההצעה אוטומטית.</p>
            
            <div style="margin-bottom: 20px;">
                <label>חברת ביטוח</label>
                <select id="company">
                    <option value="clal">כלל ביטוח — בריאות</option>
                </select>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label>דוח תפעולי (PDF)</label><br>
                <input type="file" id="report" accept=".pdf">
            </div>
            
            <button class="btn" onclick="submit()">מלא טופס אוטומטית</button>
            
            <div id="status"></div>
        </div>
        
        <script>
        async function submit() {
            const file = document.getElementById('report').files[0];
            const company = document.getElementById('company').value;
            if (!file) { alert('יש לבחור קובץ PDF'); return; }
            
            const status = document.getElementById('status');
            status.className = 'loading';
            status.style.display = 'block';
            status.innerHTML = 'מחלץ נתונים מהדוח... (עשוי לקחת 20-30 שניות)';
            
            const fd = new FormData();
            fd.append('report', file);
            fd.append('company', company);
            
            try {
                const res = await fetch('/fill', { method: 'POST', body: fd });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'שגיאה לא ידועה');
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'טופס_ממולא_כלל.pdf';
                a.click();
                status.className = 'success';
                status.innerHTML = 'הטופס מולא בהצלחה! הקובץ מתחיל להוריד.';
            } catch(e) {
                status.className = 'error';
                status.innerHTML = 'שגיאה: ' + e.message;
            }
        }
        </script>
    </body>
    </html>
    """


@app.post("/fill")
async def fill_form(report: UploadFile = File(...), company: str = "clal"):
    if not report.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="יש להעלות קובץ PDF בלבד")

    with tempfile.TemporaryDirectory() as tmpdir:
        report_path = Path(tmpdir) / "report.pdf"
        with open(report_path, "wb") as f:
            shutil.copyfileobj(report.file, f)

        # Step 1: Extract data from report using Claude Vision
        try:
            data = await extract_from_report(report_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"שגיאה בחילוץ נתונים: {str(e)}")

        # Step 2: Fill the form
        try:
            if company == "clal":
                output_path = OUTPUT_DIR / "filled_clal.pdf"
                fill_clal_form(data, FORMS_DIR / "clal_health.pdf", output_path)
            else:
                raise HTTPException(status_code=400, detail="חברת ביטוח לא נתמכת")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"שגיאה במילוי הטופס: {str(e)}")

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename="טופס_ממולא_כלל.pdf"
    )


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
