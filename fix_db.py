import sqlite3

def fix_db():
    try:
        conn = sqlite3.connect('inventory.db')
        cursor = conn.cursor()
        
        cursor.execute("UPDATE device SET status = 'En Reparación / Garantía' WHERE status = 'Reparación / Garantía'")
        rows = cursor.rowcount
        
        conn.commit()
        conn.close()
        print(f"Fixed {rows} rows.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    fix_db()
