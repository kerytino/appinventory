import sqlite3

def migrate():
    try:
        conn = sqlite3.connect('inventory.db')
        
        # Add hotel column to warehouse
        try:
            conn.execute('ALTER TABLE warehouse ADD COLUMN hotel VARCHAR(100)')
            print("Added hotel column to warehouse")
        except sqlite3.OperationalError as e:
            print(f"Warehouse alter error (maybe already exists): {e}")

        # Add dispatched_by column to device
        try:
            conn.execute('ALTER TABLE device ADD COLUMN dispatched_by VARCHAR(100)')
            print("Added dispatched_by column to device")
        except sqlite3.OperationalError as e:
            print(f"Device alter error (maybe already exists): {e}")
            
        conn.commit()
        conn.close()
        print("Migration complete")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == '__main__':
    migrate()
