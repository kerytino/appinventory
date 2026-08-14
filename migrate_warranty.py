import sqlite3

def migrate():
    try:
        conn = sqlite3.connect('inventory.db')
        
        try:
            conn.execute('ALTER TABLE device ADD COLUMN warranty_sent_date DATETIME')
            print("Added warranty_sent_date")
        except sqlite3.OperationalError as e:
            print(f"Error (maybe already exists): {e}")

        try:
            conn.execute('ALTER TABLE device ADD COLUMN warranty_received_date DATETIME')
            print("Added warranty_received_date")
        except sqlite3.OperationalError as e:
            print(f"Error (maybe already exists): {e}")
            
        conn.commit()
        conn.close()
        print("Migration complete")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == '__main__':
    migrate()
