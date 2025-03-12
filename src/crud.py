from sqlalchemy.orm import Session

from models import ProductionData
from schemas import ProductionDataCreate


def get_production_data(db: Session, limit: int = 10):
   
    data = db.query(ProductionData).order_by(ProductionData.timestamp.desc()).limit(limit).all()
    print(f"Çekilen veri: {data}")  # Debug için
    return data


def add_production_data(db: Session, data: ProductionDataCreate):
    db_item = ProductionData(timestamp=data.timestamp, count=data.count)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item
