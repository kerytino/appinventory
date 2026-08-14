from app import app, db, User

with app.app_context():
    # Las tablas ya se crean en app.py con db.create_all()
    # Solo agregamos el usuario admin si no existe
    admin = User.query.filter_by(username='admin').first()
    if not admin:
        admin = User(username='admin', role='Admin')
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print("Usuario admin creado: admin / admin123")
    else:
        print("El usuario admin ya existe.")
