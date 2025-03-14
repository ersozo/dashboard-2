from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base

# ✅ Daha sağlam bir bağlantı URL’si
DATABASE_URL = (
    "mssql+pyodbc://usrvbeap:Mv.A42-n@10.3.25.126:1433/VBE_BZD_DBC"
    "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes&Encrypt=no"
)

# ✅ Engine oluşturma
engine = create_engine(
    DATABASE_URL, pool_pre_ping=True
)  # Bağlantı kesilirse tekrar bağlanır

# ✅ Session tanımlama
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ✅ DB bağlantısını yöneten fonksiyon
def get_db():
    db = SessionLocal()
    try:
        yield db  # Kullanıcıya açık bir bağlantı ver
    finally:
        db.close()  # İş bitince bağlantıyı kapat


# ✅ Veritabanı tablolarını oluşturma fonksiyonu
def create_tables():
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Veritabanı tabloları başarıyla oluşturuldu.")
    except Exception as e:
        print(f"❌ Veritabanı tabloları oluşturulurken hata oluştu: {e}")


# ✅ Doğrudan çalıştırıldığında tablo oluşturmasın (Modül olarak kullanılabilir)
if __name__ == "__main__":
    create_tables()
