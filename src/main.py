import logging
import os

from fastapi import Depends, FastAPI, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Gerekirse belirli domainleri yaz
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Templates ve Static dosyaları bağla
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/production", response_model=list[schemas.ProductionDataResponse])
def get_production_data(db: Session = Depends(get_db)):
    return crud.get_production_data(db)


@app.get("/product-records")
def get_product_records(db: Session = Depends(get_db)):
    query = text("SELECT TOP 5 * FROM dbo.ProductRecordLog")
    result = db.execute(query).fetchall()
    return {"data": [dict(row._mapping) for row in result]}


# 'static' klasörünü FastAPI'ye bağla

@app.get("/test-db")
def test_db(db: Session = Depends(get_db)):
    try:
        query = text("SELECT TOP 5 * FROM production")
        result = db.execute(query).fetchall()
        print(f"SQLAlchemy Çıktısı: {result}")
        return {"data": [dict(row._mapping) for row in result]}
    except Exception as e:
        return {"error": str(e)}


@app.get("/tables")
def list_tables(db: Session = Depends(get_db)):
    inspector = inspect(db.bind)
    return {"tables": inspector.get_table_names()}


@app.get("/hourly-production")
def get_hourly_production(
    start_date: str = Query(..., description="Başlangıç tarihi"),
    end_date: str = Query(..., description="Bitiş tarihi"),
    unit_name: str = Query(..., description="Üretim hattı adı"),
    db: Session = Depends(get_db),
):
    try:
        start_date = start_date.replace("T", " ")
        end_date = end_date.replace("T", " ")

        logging.info(f"API çağrısı alındı: {start_date} - {end_date}, Unit: {unit_name}")

        query = text("""
            SELECT 
                DATEPART(HOUR, KayitTarihi) AS Hour,
                COUNT(*) AS TotalCount,
                SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
                SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount
            FROM dbo.ProductRecordLog
            WHERE
                KayitTarihi BETWEEN :start_date AND :end_date
                AND UnitName = :unit_name
            GROUP BY DATEPART(HOUR, KayitTarihi)
            ORDER BY Hour
        """)

        result = db.execute(query, {"start_date": start_date, "end_date": end_date, "unit_name": unit_name}).fetchall()

        total_production = sum(row[1] for row in result)  # Tüm saatlerin toplam üretim adedi

        data = [
            {"hour": row[0], "total": row[1], "success": row[2], "fail": row[3]}
            for row in result
        ]

        return {"total_production": total_production, "data": data}

    except Exception as e:
        logging.error(f"Hata oluştu: {e}")
        return {"error": "Bir hata oluştu, lütfen logları kontrol edin."}