import sqlite3

def migrate():
    try:
        conn = sqlite3.connect('inventory.db')
        
        try:
            conn.execute('ALTER TABLE device ADD COLUMN warranty_sent_by VARCHAR(100)')
            print("Added warranty_sent_by")
        except sqlite3.OperationalError as e:
            print(f"Error (maybe already exists): {e}")
            
        conn.commit()
        conn.close()
        print("Migration complete")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == '__main__':
    migrate()
