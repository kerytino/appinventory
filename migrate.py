import sqlite3

def migrate():
    conn = sqlite3.connect('C:\\Users\\kfrias\\.gemini\\antigravity\\scratch\\network-inventory-app\\inventory.db')
    columns = [
        ('brand', 'VARCHAR(100)'),
        ('model', 'VARCHAR(100)'),
        ('serial_number', 'VARCHAR(100)'),
        ('mac_address', 'VARCHAR(50)'),
        ('repair_count', 'INTEGER DEFAULT 0'),
        ('location', "VARCHAR(200) DEFAULT ''"),
        ('warehouse', "VARCHAR(100) DEFAULT ''")
    ]
    for col_name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE device ADD COLUMN {col_name} {col_type} DEFAULT ''")
        except sqlite3.OperationalError as e:
            if 'duplicate column name' in str(e).lower():
                pass
            else:
                print(e)
    conn.commit()
    conn.close()

if __name__ == '__main__':
    migrate()
