from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import sessionmaker

from models import Base

DATABASE_URL = (
    "mssql+pyodbc://usrvbeap:Mv.A42-n@10.3.25.126:1433/VBE_BZD_DBC"
    "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes&Encrypt=no"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
metadata = MetaData()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Veritabanı tablolarını oluştur
def create_tables():
    Base.metadata.create_all(bind=engine)


# Eğer çalıştırılacaksa
if __name__ == "__main__":
    create_tables()
    print("Veritabanı tabloları oluşturuldu!")
