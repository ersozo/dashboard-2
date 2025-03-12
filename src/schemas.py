from datetime import datetime

from pydantic import BaseModel


class ProductionDataBase(BaseModel):
    timestamp: datetime
    count: int


class ProductionDataCreate(ProductionDataBase):
    pass


class ProductionDataResponse(ProductionDataBase):
    id: int

    class Config:
        orm_mode = True
