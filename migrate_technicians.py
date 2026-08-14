import sqlite3

def migrate():
    try:
        conn = sqlite3.connect('inventory.db')
        
        # Add warranty_provider to Device
        try:
            conn.execute('ALTER TABLE device ADD COLUMN warranty_provider VARCHAR(150)')
            print("Added warranty_provider to device")
        except sqlite3.OperationalError as e:
            print(f"Error adding warranty_provider (maybe already exists): {e}")

        # Create Technician table
        try:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS technician (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) NOT NULL UNIQUE
                )
            ''')
            print("Created technician table")
        except sqlite3.OperationalError as e:
            print(f"Error creating technician table: {e}")

        conn.commit()
        conn.close()
        print("Migration complete")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == '__main__':
    migrate()
