from app import app, db, Warehouse, Hotel
from sqlalchemy import text

def migrate():
    with app.app_context():
        # First, ensure all models are created in the DB
        db.create_all()
        
        # Now populate them using data from the existing tables
        db.session.execute(text("INSERT OR IGNORE INTO warehouse (name) SELECT DISTINCT warehouse FROM device WHERE warehouse IS NOT NULL AND warehouse != ''"))
        db.session.execute(text("INSERT OR IGNORE INTO hotel (name) SELECT DISTINCT hotel FROM decommission WHERE hotel IS NOT NULL AND hotel != ''"))
        
        db.session.commit()
        print("Migration complete")

if __name__ == '__main__':
    migrate()
