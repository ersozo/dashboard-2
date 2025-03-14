from sqlalchemy.orm import Session
from sqlalchemy.sql import text


def fetch_production_data(db: Session):
    query = text("""
        SELECT
            UnitName,  
            DATEPART(HOUR, KayitTarihi) AS Hour,
            COUNT(*) AS TotalCount,
            SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
            SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount
        FROM dbo.ProductRecordLog
        GROUP BY UnitName, DATEPART(HOUR, KayitTarihi)
        ORDER BY UnitName, Hour
    """)

    result = db.execute(query).fetchall()

    # ✅ Verileri dict formatında döndür
    return [
        {
            "unit": row.UnitName,  # ✅ row[0] yerine daha okunur hali
            "data": {
                "hour": row.Hour,
                "total": row.TotalCount,
                "success": row.SuccessCount,
                "fail": row.FailCount,
            },
        }
        for row in result
    ]
