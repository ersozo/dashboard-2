from pydantic import BaseModel


# ✅ Üretim verisi için şema (READ)
class ProductionDataResponse(BaseModel):
    unit: str  # Birim adı (Makine ismi)
    hour: int
    total: int
    success: int
    fail: int

    class Config:
        from_attributes = True  # ✅ Pydantic V2 ile uyumlu
