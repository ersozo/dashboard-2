import asyncio
import json

from fastapi import WebSocket
from sqlalchemy import text
from sqlalchemy.orm import Session


async def send_production_data(websocket: WebSocket, db: Session):
    await websocket.accept()

    while True:
        try:
            query = text("""
                SELECT 
                    UnitName,
                    DATEPART(HOUR, KayitTarihi) AS Hour,
                    COUNT(*) AS TotalCount,
                    SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
                    SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount
                FROM dbo.ProductRecordLog
                WHERE KayitTarihi >= DATEADD(HOUR, -1, GETDATE())  
                GROUP BY UnitName, DATEPART(HOUR, KayitTarihi)
                ORDER BY UnitName, Hour
            """)
            result = db.execute(query).fetchall()

            # Verileri unitName bazında gruplama
            grouped_data = {}
            for row in result:
                unit_name = row[0]
                entry = {
                    "hour": row[1],
                    "total": row[2],
                    "success": row[3],
                    "fail": row[4],
                }

                if unit_name not in grouped_data:
                    grouped_data[unit_name] = []
                grouped_data[unit_name].append(entry)

            # Her üretim hattı için ayrı mesaj gönder
            for unit, data in grouped_data.items():
                await websocket.send_text(json.dumps({"unit": unit, "data": data}))

            await asyncio.sleep(10)

        except Exception:
            await websocket.send_text(json.dumps({"error": "Veri çekme hatası"}))
            break

    await websocket.close()
