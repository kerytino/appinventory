# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file, make_response
# pyrefly: ignore [missing-import]
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import os
import json
import base64
from io import BytesIO
from PIL import Image as PILImage
from dotenv import load_dotenv

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Cargar variables de entorno desde el archivo .env
load_dotenv()

app = Flask(__name__)
# Usar la variable de entorno, o un valor por defecto solo para desarrollo
app.secret_key = os.environ.get('SECRET_KEY', 'default-dev-key-change-me')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
# Usamos una ruta absoluta para asegurar que sqlite se cree en la carpeta correcta
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'inventory.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

@app.after_request
def add_header(response):
    # Prevent API caching by the browser so UI updates are immediately reflected
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

@app.errorhandler(Exception)
def handle_global_exception(e):
    import traceback
    from datetime import datetime
    os.makedirs('scratch', exist_ok=True)
    with open(os.path.join('scratch', 'flask_errors.log'), 'a', encoding='utf-8') as f:
        f.write(f"\n=== ERROR 500 CAPTURADO ({datetime.now()}) ===\n")
        traceback.print_exc(file=f)
    print(f"[FLASK CRITICAL ERROR]: {e}", flush=True)
    traceback.print_exc()
    return jsonify({'error': str(e)}), 500

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import threading
import atexit
from apscheduler.schedulers.background import BackgroundScheduler

EMAIL_SETTINGS_FILE = os.path.join(basedir, 'email_settings.json')
ALERT_STATE_FILE = os.path.join(basedir, 'alert_state.json')
CATALOG_FILE = os.path.join(basedir, 'equipment_catalog.json')

def ensure_catalog_entry(device_type, brand='', model=''):
    if not device_type or not device_type.strip():
        return
    try:
        catalog = []
        if os.path.exists(CATALOG_FILE):
            with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
        
        dtype = device_type.strip()
        dbrand = (brand or '').strip()
        dmodel = (model or '').strip()
        
        exists = any(
            item.get('type') == dtype and
            item.get('brand') == dbrand and
            item.get('model') == dmodel
            for item in catalog
        )
        if not exists:
            catalog.append({
                'type': dtype,
                'brand': dbrand,
                'model': dmodel
            })
            with open(CATALOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(catalog, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error updating catalog: {e}")


def load_email_settings():
    if os.path.exists(EMAIL_SETTINGS_FILE):
        try:
            with open(EMAIL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'enabled': False,
        'smtp_server': 'smtp.gmail.com',
        'smtp_port': 587,
        'smtp_user': '',
        'smtp_password': '',
        'sender_email': '',
        'notification_recipients': ''
    }

def send_email_alert(subject, body, recipients=None, ignore_enabled=False, override_settings=None):
    settings = override_settings or load_email_settings()
    if not ignore_enabled and not settings.get('enabled'):
        print(f"[EMAIL MOCK] Notification email disabled. Subject: {subject}")
        return False, "Notificaciones por correo desactivadas. Marca la casilla 'Activar notificaciones automáticas por correo'."
        
    target_recipients = recipients or settings.get('notification_recipients', '') or settings.get('smtp_user', '')
    if not target_recipients or not settings.get('smtp_server') or not settings.get('smtp_user'):
        return False, "Faltan datos de configuración (Servidor SMTP, Usuario o Destinatarios)."
        
    recipient_list = [r.strip() for r in target_recipients.replace(';', ',').split(',') if r.strip()]
    if not recipient_list:
        return False, "No hay correos destinatarios especificados."

    try:
        import email.utils
        msg = MIMEMultipart()
        msg['From'] = settings.get('sender_email') or settings.get('smtp_user')
        msg['To'] = ", ".join(recipient_list)
        msg['Subject'] = subject
        msg['Date'] = email.utils.formatdate(localtime=True)
        msg['Message-ID'] = email.utils.make_msgid()
        
        msg.attach(MIMEText(body, 'html'))

        port = int(settings.get('smtp_port', 587))
        server = smtplib.SMTP(settings.get('smtp_server'), port, timeout=12)
        server.starttls()
        server.login(settings.get('smtp_user'), settings.get('smtp_password'))
        server.sendmail(msg['From'], recipient_list, msg.as_string())
        server.quit()
        return True, "Correo enviado correctamente."
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send email: {e}")
        return False, f"Error al conectar con SMTP ({type(e).__name__}): {str(e)}"

class Device(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(50), nullable=True, default='')
    name = db.Column(db.String(100), nullable=False)
    device_type = db.Column(db.String(50), nullable=False)
    brand = db.Column(db.String(100), nullable=True, default='')
    model = db.Column(db.String(100), nullable=True, default='')
    serial_number = db.Column(db.String(100), nullable=True, default='')
    mac_address = db.Column(db.String(50), nullable=True, default='')
    status = db.Column(db.String(50), nullable=False, default='En Stock')
    repair_count = db.Column(db.Integer, default=0)
    location = db.Column(db.String(200), nullable=True, default='')
    warehouse = db.Column(db.String(100), nullable=True, default='')
    description = db.Column(db.Text, nullable=True)
    value = db.Column(db.Float, nullable=False, default=0.0)
    cost_price = db.Column(db.Float, nullable=False, default=0.0)
    profit_margin = db.Column(db.Float, nullable=False, default=0.0)
    sale_price_rd = db.Column(db.Float, nullable=False, default=0.0)
    sale_price_usd = db.Column(db.Float, nullable=False, default=0.0)
    sale_price_eur = db.Column(db.Float, nullable=False, default=0.0)
    min_stock = db.Column(db.Integer, nullable=False, default=0)
    provider = db.Column(db.String(150), nullable=True, default='')
    dispatched_by = db.Column(db.String(100), nullable=True)
    warranty_sent_by = db.Column(db.String(100), nullable=True)
    warranty_sent_date = db.Column(db.DateTime, nullable=True)
    warranty_received_date = db.Column(db.DateTime, nullable=True)
    warranty_provider = db.Column(db.String(150), nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    date_added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'sku': self.sku or f"EQ-{self.id:03d}",
            'name': self.name,
            'type': self.device_type,
            'brand': self.brand or '',
            'model': self.model or '',
            'serial_number': self.serial_number or '',
            'mac_address': self.mac_address or '',
            'status': self.status,
            'repair_count': self.repair_count,
            'location': self.location or '',
            'warehouse': self.warehouse or '',
            'description': self.description or '',
            'value': self.value,
            'cost_price': self.cost_price if self.cost_price else (self.value / (self.quantity or 1)),
            'profit_margin': self.profit_margin or 0.0,
            'sale_price_rd': self.sale_price_rd or 0.0,
            'sale_price_usd': self.sale_price_usd or 0.0,
            'sale_price_eur': self.sale_price_eur or 0.0,
            'min_stock': self.min_stock or 0,
            'provider': self.provider or self.warranty_provider or '',
            'quantity': self.quantity,
            'dispatched_by': self.dispatched_by or '',
            'warranty_sent_by': self.warranty_sent_by or '',
            'warranty_provider': self.warranty_provider or self.provider or '',
            'warranty_sent_date': self.warranty_sent_date.strftime('%Y-%m-%d') if self.warranty_sent_date else '',
            'warranty_received_date': self.warranty_received_date.strftime('%Y-%m-%d') if self.warranty_received_date else '',
            'date_added': self.date_added.strftime('%Y-%m-%d %H:%M:%S')
        }

class Decommission(db.Model):
    id                  = db.Column(db.Integer, primary_key=True)
    decommission_number = db.Column(db.String(30), nullable=True, unique=True, index=True)  # Ej: EXO-2026-08-001
    name                = db.Column(db.String(100), nullable=False)
    device_type         = db.Column(db.String(50), nullable=False)
    brand               = db.Column(db.String(100), nullable=True, default='')
    model               = db.Column(db.String(100), nullable=True, default='')
    serial_number       = db.Column(db.String(100), nullable=True, default='')
    hotel               = db.Column(db.String(100), nullable=True, default='')
    reason              = db.Column(db.Text, nullable=True)
    value               = db.Column(db.Float, nullable=False, default=0.0)
    quantity            = db.Column(db.Integer, nullable=False, default=1)
    date_added          = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'decommission_number': self.decommission_number or '',
            'name': self.name,
            'type': self.device_type,
            'brand': self.brand,
            'model': self.model,
            'serial_number': self.serial_number,
            'hotel': self.hotel,
            'reason': self.reason,
            'value': self.value,
            'quantity': self.quantity,
            'date_added': self.date_added.strftime('%Y-%m-%d %H:%M:%S')
        }

class DecommissionArchive(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    period = db.Column(db.String(50), nullable=False)
    date_archived = db.Column(db.DateTime, default=datetime.utcnow)
    total_value = db.Column(db.Float, nullable=False)
    data_dump = db.Column(db.Text, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'period': self.period,
            'date_archived': self.date_archived.strftime('%Y-%m-%d %H:%M:%S'),
            'total_value': self.total_value,
            'data_dump': json.loads(self.data_dump)
        }

class Warehouse(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    hotel = db.Column(db.String(100), nullable=True)
    
    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'hotel': self.hotel}

class Hotel(db.Model):
    id     = db.Column(db.Integer, primary_key=True)
    name   = db.Column(db.String(100), nullable=False, unique=True)
    sigla  = db.Column(db.String(20),  nullable=True,  unique=True)  # Sigla unica de la propiedad, ej: EXO
    logo   = db.Column(db.Text, nullable=True)                        # Base64 del logo de la propiedad
    
    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'sigla': self.sigla or '', 'logo': self.logo or ''}

class Technician(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    
    def to_dict(self):
        return {'id': self.id, 'name': self.name}

class Provider(db.Model):
    id             = db.Column(db.Integer, primary_key=True)
    name           = db.Column(db.String(100), nullable=False, unique=True)
    rnc            = db.Column(db.String(50), nullable=True, default='')
    contact_name   = db.Column(db.String(100), nullable=True, default='')
    phone          = db.Column(db.String(50), nullable=True, default='')
    email          = db.Column(db.String(120), nullable=True, default='')
    products_notes = db.Column(db.Text, nullable=True, default='[]')
    
    def to_dict(self):
        products_list = []
        try:
            if self.products_notes:
                products_list = json.loads(self.products_notes)
        except Exception:
            products_list = []
        return {
            'id': self.id,
            'name': self.name,
            'rnc': self.rnc or '',
            'contact_name': self.contact_name or '',
            'phone': self.phone or '',
            'email': self.email or '',
            'products': products_list
        }

def ensure_provider_table_columns():
    try:
        import sqlite3
        db_path = os.path.join(basedir, 'inventory.db')
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(provider)")
            cols = [info[1] for info in cursor.fetchall()]
            if cols:
                if 'rnc' not in cols:
                    cursor.execute("ALTER TABLE provider ADD COLUMN rnc VARCHAR(50) DEFAULT ''")
                if 'contact_name' not in cols:
                    cursor.execute("ALTER TABLE provider ADD COLUMN contact_name VARCHAR(100) DEFAULT ''")
                if 'phone' not in cols:
                    cursor.execute("ALTER TABLE provider ADD COLUMN phone VARCHAR(50) DEFAULT ''")
                if 'email' not in cols:
                    cursor.execute("ALTER TABLE provider ADD COLUMN email VARCHAR(120) DEFAULT ''")
                if 'products_notes' not in cols:
                    cursor.execute("ALTER TABLE provider ADD COLUMN products_notes TEXT DEFAULT '[]'")
                conn.commit()
            conn.close()
    except Exception as e:
        print(f"[DB MIGRATION] Error updating provider columns: {e}")

ensure_provider_table_columns()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='Viewer') # Admin, Tecnico, Viewer, Personalizado
    permissions = db.Column(db.Text, nullable=True, default='[]') # JSON con lista de módulos permitidos
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_permissions(self):
        raw_role = (self.role or '').strip().lower()
        ALL_PERMS = [
            'dashboard', 'inventario', 'pedidos', 'pedidos:crear', 'pedidos:aprobar', 'pedidos:cotizar', 'pedidos:comprar', 'pedidos:recibir',
            'decomiso', 'reparaciones', 'prestamos', 'herramientas', 'despacho', 'pendientes', 'radios', 'tec-radios', 'configuracion'
        ]
        if raw_role == 'admin':
            return ALL_PERMS
        try:
            if self.permissions:
                perms = json.loads(self.permissions)
                if isinstance(perms, list) and len(perms) > 0:
                    return perms
        except Exception:
            pass
        # Defaults si no tiene permissions explícito
        if raw_role in ['tecnico', 'técnico']:
            return ['dashboard', 'inventario', 'pedidos', 'pedidos:crear', 'pedidos:cotizar', 'pedidos:comprar', 'pedidos:recibir', 'decomiso', 'reparaciones', 'prestamos', 'herramientas', 'despacho', 'pendientes', 'radios', 'tec-radios']
        # Viewer default
        return ['dashboard', 'inventario', 'pedidos', 'decomiso', 'reparaciones', 'prestamos', 'herramientas', 'pendientes', 'radios', 'tec-radios']

    def to_dict(self):
        raw_role = (self.role or '').strip()
        r_lower = raw_role.lower()
        if r_lower == 'admin':
            normalized_role = 'Admin'
        elif r_lower in ['tecnico', 'técnico']:
            normalized_role = 'Tecnico'
        elif r_lower in ['viewer', 'visualizador']:
            normalized_role = 'Viewer'
        else:
            normalized_role = raw_role or 'Personalizado'

        return {
            'id': self.id,
            'username': self.username,
            'role': normalized_role,
            'permissions': self.get_permissions()
        }

# ==========================================
# MODELOS MÓDULO RADIOS
# ==========================================

class RadioUserPropertyAccess(db.Model):
    __tablename__ = 'radio_user_property_access'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    hotel_id = db.Column(db.Integer, db.ForeignKey('hotel.id'), nullable=False)
    can_view = db.Column(db.Boolean, default=True)
    can_manage = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('radio_property_access', cascade='all, delete-orphan'))
    hotel = db.relationship('Hotel', backref=db.backref('radio_user_access', cascade='all, delete-orphan'))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'hotel_id': self.hotel_id,
            'hotel_name': self.hotel.name if self.hotel else '',
            'hotel_sigla': self.hotel.sigla if self.hotel else '',
            'can_view': self.can_view,
            'can_manage': self.can_manage,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class RadioUserDepartmentAccess(db.Model):
    __tablename__ = 'radio_user_department_access'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    hotel_id = db.Column(db.Integer, db.ForeignKey('hotel.id'), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=False)
    subdepartment_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=True)
    access_level = db.Column(db.String(50), nullable=False, default='view') # 'view', 'department_manager', 'manage'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('radio_department_access', cascade='all, delete-orphan'))
    hotel = db.relationship('Hotel')
    department = db.relationship('RadioDepartment', foreign_keys=[department_id])
    subdepartment = db.relationship('RadioDepartment', foreign_keys=[subdepartment_id])

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'hotel_id': self.hotel_id,
            'hotel_name': self.hotel.name if self.hotel else '',
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else '',
            'subdepartment_id': self.subdepartment_id,
            'subdepartment_name': self.subdepartment.name if self.subdepartment else '',
            'access_level': self.access_level,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class RadioDepartment(db.Model):
    __tablename__ = 'radio_department'
    id = db.Column(db.Integer, primary_key=True)
    hotel_id = db.Column(db.Integer, db.ForeignKey('hotel.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    parent_department_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=True)
    id_range_start = db.Column(db.Integer, nullable=True)
    id_range_end = db.Column(db.Integer, nullable=True)

    parent = db.relationship('RadioDepartment', remote_side=[id], foreign_keys=[parent_department_id], backref=db.backref('subdepartments', cascade='all, delete-orphan'))
    hotel = db.relationship('Hotel', backref=db.backref('radio_departments', cascade='all, delete-orphan'))
    areas = db.relationship('RadioArea', backref='department', cascade='all, delete-orphan', lazy=True)

    def to_dict(self):
        parent_name = ''
        if self.parent_department_id:
            p = RadioDepartment.query.get(self.parent_department_id)
            if p:
                parent_name = p.name

        return {
            'id': self.id,
            'hotel_id': self.hotel_id,
            'hotel_name': self.hotel.name if self.hotel else '',
            'name': self.name,
            'parent_department_id': self.parent_department_id,
            'parent_name': parent_name,
            'id_range_start': self.id_range_start,
            'id_range_end': self.id_range_end,
            'areas': [a.to_dict() for a in self.areas]
        }

class RadioIdRange(db.Model):
    __tablename__ = 'radio_id_range'
    id = db.Column(db.Integer, primary_key=True)
    hotel_id = db.Column(db.Integer, db.ForeignKey('hotel.id'), nullable=False, index=True)
    department_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=False, index=True)
    subdepartment_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=True, index=True)
    range_start = db.Column(db.Integer, nullable=False)
    range_end = db.Column(db.Integer, nullable=False)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    hotel = db.relationship('Hotel')
    department = db.relationship('RadioDepartment', foreign_keys=[department_id])
    subdepartment = db.relationship('RadioDepartment', foreign_keys=[subdepartment_id])

    def to_dict(self):
        # Calcular asignados y disponibles
        used_count = 0
        used_codes = set()
        if self.range_start and self.range_end:
            items = RadioItem.query.filter_by(hotel_id=self.hotel_id).all()
            for it in items:
                if it.radio_code:
                    digits = ''.join(c for c in str(it.radio_code) if c.isdigit())
                    if digits:
                        try:
                            val = int(digits)
                            if self.range_start <= val <= self.range_end:
                                used_count += 1
                                used_codes.add(val)
                        except ValueError:
                            pass

        total_capacity = (self.range_end - self.range_start + 1) if (self.range_end and self.range_start) else 0
        available_count = max(0, total_capacity - used_count)
        occupancy_pct = round((used_count / total_capacity * 100), 1) if total_capacity > 0 else 0

        next_available_id = None
        if self.range_start and self.range_end:
            for cand in range(self.range_start, self.range_end + 1):
                if cand not in used_codes:
                    next_available_id = str(cand)
                    break

        return {
            'id': self.id,
            'hotel_id': self.hotel_id,
            'hotel_name': self.hotel.name if self.hotel else '',
            'hotel_sigla': self.hotel.sigla if self.hotel else '',
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else '',
            'subdepartment_id': self.subdepartment_id,
            'subdepartment_name': self.subdepartment.name if self.subdepartment else '',
            'range_start': self.range_start,
            'range_end': self.range_end,
            'active': self.active,
            'total_capacity': total_capacity,
            'used_count': used_count,
            'available_count': available_count,
            'occupancy_pct': occupancy_pct,
            'next_available_id': next_available_id,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class RadioArea(db.Model):
    __tablename__ = 'radio_area'
    id = db.Column(db.Integer, primary_key=True)
    department_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'department_id': self.department_id,
            'name': self.name
        }

class RadioItem(db.Model):
    __tablename__ = 'radio_item'
    id = db.Column(db.Integer, primary_key=True)
    radio_code = db.Column(db.String(50), nullable=True) # Ej: "1205"
    serial_number = db.Column(db.String(100), nullable=False, unique=True, index=True)
    brand = db.Column(db.String(100), nullable=False, default='Motorola')
    model = db.Column(db.String(100), nullable=False, default='')
    hotel_id = db.Column(db.Integer, db.ForeignKey('hotel.id'), nullable=False, index=True)
    department_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=True)
    subdepartment_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=True)
    area_id = db.Column(db.Integer, db.ForeignKey('radio_area.id'), nullable=True)
    status = db.Column(db.String(50), nullable=False, default='operativo') # operativo, requiere_revision, en_reparacion, danado, perdido, fuera_servicio, disponible, decomisado
    assigned_person_name = db.Column(db.String(100), nullable=True, default='')
    assigned_employee_id = db.Column(db.String(50), nullable=True, default='')
    assigned_position = db.Column(db.String(100), nullable=True, default='')
    assigned_date = db.Column(db.String(50), nullable=True, default='')
    assigned_by = db.Column(db.String(100), nullable=True, default='')
    last_inventory_date = db.Column(db.String(50), nullable=True, default='')
    last_inventory_by = db.Column(db.String(100), nullable=True, default='')
    decommission_reason = db.Column(db.Text, nullable=True, default='')
    decommission_date = db.Column(db.String(50), nullable=True, default='')
    decommission_user = db.Column(db.String(100), nullable=True, default='')
    notes = db.Column(db.Text, nullable=True, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    hotel = db.relationship('Hotel', backref=db.backref('radios', cascade='all, delete-orphan'))
    department = db.relationship('RadioDepartment', foreign_keys=[department_id])
    subdepartment = db.relationship('RadioDepartment', foreign_keys=[subdepartment_id])
    area = db.relationship('RadioArea')

    def to_dict(self):
        assigned_person = None
        if self.assigned_person_name or self.assigned_employee_id:
            assigned_person = {
                'name': self.assigned_person_name or '',
                'employeeId': self.assigned_employee_id or '',
                'position': self.assigned_position or '',
                'assignedDate': self.assigned_date or '',
                'assignedBy': self.assigned_by or ''
            }
        return {
            'id': str(self.id),
            'radio_code': self.radio_code or str(self.id),
            'serial_number': self.serial_number,
            'serialNumber': self.serial_number,
            'brand': self.brand or '',
            'model': self.model or '',
            'hotel_id': self.hotel_id,
            'propertyId': str(self.hotel_id),
            'property_name': self.hotel.name if self.hotel else '',
            'property_sigla': self.hotel.sigla if self.hotel else '',
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else '',
            'subdepartment_id': self.subdepartment_id,
            'subdepartment_name': self.subdepartment.name if self.subdepartment else '',
            'area_id': self.area_id,
            'area_name': self.area.name if self.area else '',
            'status': self.status,
            'assigned_person': assigned_person,
            'assignedPerson': assigned_person,
            'last_inventory_date': self.last_inventory_date or '',
            'lastInventoryDate': self.last_inventory_date or '',
            'last_inventory_by': self.last_inventory_by or '',
            'lastInventoryBy': self.last_inventory_by or '',
            'decommission_reason': self.decommission_reason or '',
            'decommission_date': self.decommission_date or '',
            'decommission_user': self.decommission_user or '',
            'notes': self.notes or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class RadioHistory(db.Model):
    __tablename__ = 'radio_history'
    id = db.Column(db.Integer, primary_key=True)
    radio_id = db.Column(db.Integer, db.ForeignKey('radio_item.id', ondelete='CASCADE'), nullable=False, index=True)
    hotel_id = db.Column(db.Integer, db.ForeignKey('hotel.id'), nullable=False, index=True)
    event_type = db.Column(db.String(50), nullable=False)
    detail = db.Column(db.Text, nullable=False)
    previous_info = db.Column(db.Text, nullable=True)
    new_info = db.Column(db.Text, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    user_name = db.Column(db.String(100), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    radio = db.relationship('RadioItem', backref=db.backref('history_events', cascade='all, delete-orphan', order_by='RadioHistory.timestamp.desc()'))

    def to_dict(self):
        return {
            'id': str(self.id),
            'radioId': str(self.radio_id),
            'radio_code': self.radio.radio_code if self.radio else str(self.radio_id),
            'hotel_id': self.hotel_id,
            'eventType': self.event_type,
            'event_type': self.event_type,
            'detail': self.detail,
            'previousInfo': self.previous_info or '',
            'newInfo': self.new_info or '',
            'userId': str(self.user_id) if self.user_id else '',
            'userName': self.user_name,
            'user_name': self.user_name,
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else ''
        }

class RadioFormalInventory(db.Model):
    __tablename__ = 'radio_formal_inventory'
    id = db.Column(db.Integer, primary_key=True)
    inventory_code = db.Column(db.String(50), nullable=True)
    hotel_id = db.Column(db.Integer, db.ForeignKey('hotel.id'), nullable=False, index=True)
    department_id = db.Column(db.Integer, db.ForeignKey('radio_department.id'), nullable=True)
    area_id = db.Column(db.Integer, db.ForeignKey('radio_area.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    assigned_to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    assigned_to_user_name = db.Column(db.String(100), nullable=True, default='')
    due_date = db.Column(db.String(50), nullable=True, default='')
    status = db.Column(db.String(50), nullable=False, default='pendiente')
    total_expected = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(100), nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    hotel = db.relationship('Hotel')
    department = db.relationship('RadioDepartment')
    area = db.relationship('RadioArea')
    items = db.relationship('RadioFormalInventoryItem', backref='inventory', cascade='all, delete-orphan', lazy=True)

    def to_dict(self):
        return {
            'id': str(self.id),
            'inventory_code': self.inventory_code or f"INV-{self.id}",
            'propertyId': str(self.hotel_id),
            'hotel_id': self.hotel_id,
            'property_name': self.hotel.name if self.hotel else '',
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else '',
            'area_id': self.area_id,
            'area_name': self.area.name if self.area else '',
            'title': self.title,
            'assignedToUser': str(self.assigned_to_user_id) if self.assigned_to_user_id else '',
            'assignedToUserName': self.assigned_to_user_name or '',
            'dueDate': self.due_date or '',
            'createdAt': self.created_at.strftime('%Y-%m-%d') if self.created_at else '',
            'createdBy': self.created_by,
            'status': self.status,
            'totalExpected': self.total_expected,
            'completedAt': self.completed_at.strftime('%Y-%m-%d %H:%M:%S') if self.completed_at else None,
            'items': [i.to_dict() for i in self.items]
        }

class RadioFormalInventoryItem(db.Model):
    __tablename__ = 'radio_formal_inventory_item'
    id = db.Column(db.Integer, primary_key=True)
    inventory_id = db.Column(db.Integer, db.ForeignKey('radio_formal_inventory.id', ondelete='CASCADE'), nullable=False)
    radio_id = db.Column(db.Integer, db.ForeignKey('radio_item.id'), nullable=False)
    serial_number = db.Column(db.String(100), nullable=False)
    verified_status = db.Column(db.String(50), nullable=False, default='operativo')
    previous_status = db.Column(db.String(50), nullable=False, default='operativo')
    notes = db.Column(db.Text, nullable=True, default='')
    confirmed = db.Column(db.Boolean, default=False)
    verified_at = db.Column(db.DateTime, nullable=True)
    verified_by = db.Column(db.String(100), nullable=True, default='')

    radio = db.relationship('RadioItem')

    def to_dict(self):
        return {
            'id': self.id,
            'inventory_id': self.inventory_id,
            'radioId': str(self.radio_id),
            'radio_code': self.radio.radio_code if self.radio else str(self.radio_id),
            'radio_brand': self.radio.brand if self.radio else '',
            'radio_model': self.radio.model if self.radio else '',
            'serialNumber': self.serial_number,
            'verifiedStatus': self.verified_status,
            'previousStatus': self.previous_status,
            'notes': self.notes or '',
            'confirmed': self.confirmed,
            'verifiedAt': self.verified_at.strftime('%Y-%m-%d %H:%M:%S') if self.verified_at else None,
            'verifiedBy': self.verified_by or ''
        }

def ensure_radio_tables():
    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            print(f"[DB MIGRATION] Error creando tablas de radios: {e}")

ensure_radio_tables()


class ActivityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    details = db.Column(db.Text, nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'action': self.action,
            'details': self.details,
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S')
        }

class OperationalTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), nullable=False, default='Pendiente') # 'Pendiente' o 'Proyecto'
    task_type = db.Column(db.String(100), nullable=True, default='General')
    hotel = db.Column(db.String(100), nullable=True, default='')
    technician_name = db.Column(db.String(100), nullable=True, default='')
    priority = db.Column(db.String(20), nullable=False, default='Media')
    status = db.Column(db.String(50), nullable=False, default='Pendiente')
    description = db.Column(db.Text, nullable=True, default='')
    start_date = db.Column(db.String(50), nullable=True, default='')
    end_date = db.Column(db.String(50), nullable=True, default='')
    due_date = db.Column(db.String(50), nullable=True, default='')
    created_by = db.Column(db.String(100), nullable=True, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_updated_by = db.Column(db.String(100), nullable=True, default='')
    inactivity_threshold_hours = db.Column(db.Integer, nullable=True, default=72)
    steps = db.relationship('OperationalTaskStep', backref='task', cascade='all, delete-orphan', lazy=True, order_by='OperationalTaskStep.step_order')

    def to_dict(self):
        steps_list = [s.to_dict() for s in self.steps]
        total_steps = len(steps_list)
        completed_steps = sum(1 for s in steps_list if s['status'] == 'Completado')
        progress_percentage = round((completed_steps / total_steps * 100), 1) if total_steps > 0 else (100.0 if self.status == 'Completado' else 0.0)
        
        # Calculate inactivity SLA
        last_active = self.updated_at or self.created_at
        hours_inactive = 0.0
        if last_active:
            diff = datetime.utcnow() - last_active
            hours_inactive = round(diff.total_seconds() / 3600.0, 1)
            
        default_thresholds = {'Urgente': 24, 'Alta': 48, 'Media': 72, 'Baja': 168}
        threshold = self.inactivity_threshold_hours or default_thresholds.get(self.priority, 72)
        is_stale = (self.status not in ['Completado', 'Cancelado']) and (hours_inactive >= threshold)

        return {
            'id': self.id,
            'title': self.title,
            'category': self.category or 'Pendiente',
            'task_type': self.task_type,
            'hotel': self.hotel,
            'technician_name': self.technician_name,
            'priority': self.priority,
            'status': self.status,
            'description': self.description,
            'start_date': self.start_date or '',
            'end_date': self.end_date or self.due_date or '',
            'due_date': self.due_date or self.end_date or '',
            'created_by': self.created_by,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else (self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''),
            'last_updated_by': self.last_updated_by or self.created_by or '',
            'inactivity_threshold_hours': threshold,
            'hours_inactive': hours_inactive,
            'is_stale': is_stale,
            'steps': steps_list,
            'total_steps': total_steps,
            'completed_steps': completed_steps,
            'progress_percentage': progress_percentage
        }

class OperationalTaskStep(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('operational_task.id'), nullable=False)
    step_order = db.Column(db.Integer, nullable=False, default=1)
    title = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(50), nullable=False, default='Pendiente')
    notes = db.Column(db.Text, nullable=True, default='')
    completed_at = db.Column(db.DateTime, nullable=True)
    completed_by = db.Column(db.String(100), nullable=True, default='')

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'step_order': self.step_order,
            'title': self.title,
            'status': self.status,
            'notes': self.notes,
            'completed_at': self.completed_at.strftime('%Y-%m-%d %H:%M:%S') if self.completed_at else '',
            'completed_by': self.completed_by
        }

class LoanDevice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    device_type = db.Column(db.String(50), nullable=False)
    brand = db.Column(db.String(100), nullable=True, default='')
    model = db.Column(db.String(100), nullable=True, default='')
    serial_number = db.Column(db.String(100), nullable=True, default='')
    mac_address = db.Column(db.String(50), nullable=True, default='')
    provider = db.Column(db.String(150), nullable=False, default='') # Proveedor del demo/préstamo
    status = db.Column(db.String(50), nullable=False, default='En Evaluación / Stock') # 'En Evaluación / Stock', 'En Pruebas / Instalado', 'Devuelto al Proveedor', 'Comprado / Adquirido', 'Averiado'
    warehouse = db.Column(db.String(100), nullable=True, default='')
    location = db.Column(db.String(200), nullable=True, default='')
    dispatched_by = db.Column(db.String(100), nullable=True, default='')
    received_date = db.Column(db.String(50), nullable=True, default='') # YYYY-MM-DD
    expected_return_date = db.Column(db.String(50), nullable=True, default='') # YYYY-MM-DD
    returned_date = db.Column(db.String(50), nullable=True, default='') # YYYY-MM-DD
    value = db.Column(db.Float, nullable=False, default=0.0)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    notes = db.Column(db.Text, nullable=True, default='')
    date_added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        days_remaining = None
        is_overdue = False
        is_near_expiry = False
        
        if self.expected_return_date and self.status in ['En Evaluación / Stock', 'En Pruebas / Instalado']:
            try:
                exp = datetime.strptime(self.expected_return_date, '%Y-%m-%d').date()
                today = datetime.utcnow().date()
                delta = (exp - today).days
                days_remaining = delta
                if delta < 0:
                    is_overdue = True
                elif delta <= 5:
                    is_near_expiry = True
            except Exception:
                pass

        return {
            'id': self.id,
            'name': self.name,
            'type': self.device_type,
            'brand': self.brand or '',
            'model': self.model or '',
            'serial_number': self.serial_number or '',
            'mac_address': self.mac_address or '',
            'provider': self.provider or '',
            'status': self.status,
            'warehouse': self.warehouse or '',
            'location': self.location or '',
            'dispatched_by': self.dispatched_by or '',
            'received_date': self.received_date or '',
            'expected_return_date': self.expected_return_date or '',
            'returned_date': self.returned_date or '',
            'value': self.value,
            'quantity': self.quantity,
            'notes': self.notes or '',
            'date_added': self.date_added.strftime('%Y-%m-%d %H:%M:%S') if self.date_added else '',
            'days_remaining': days_remaining,
            'is_overdue': is_overdue,
            'is_near_expiry': is_near_expiry
        }

class Tool(db.Model):
    id                   = db.Column(db.Integer, primary_key=True)
    code                 = db.Column(db.String(50), nullable=True, default='')  # Ej: HER-001
    name                 = db.Column(db.String(150), nullable=False)
    category             = db.Column(db.String(100), nullable=False, default='General')  # Fibra Óptica, Redes, Medición, Eléctrico, Manual
    brand                = db.Column(db.String(100), nullable=True, default='')
    model                = db.Column(db.String(100), nullable=True, default='')
    serial_number        = db.Column(db.String(100), nullable=True, default='')
    condition            = db.Column(db.String(50), nullable=False, default='Buena')  # Excelente, Buena, Regular, Desgastada
    status               = db.Column(db.String(50), nullable=False, default='Disponible')  # Disponible, En Uso / Asignada, En Mantenimiento, Dañada, Extraviada
    assigned_to          = db.Column(db.String(100), nullable=True, default='')  # Técnico que la tiene
    assigned_date        = db.Column(db.String(50), nullable=True, default='')   # YYYY-MM-DD
    location             = db.Column(db.String(100), nullable=True, default='')  # Hotel o Área de trabajo actual
    warehouse            = db.Column(db.String(100), nullable=True, default='Taller IT')  # Almacén o Taller de resguardo habitual
    value                = db.Column(db.Float, nullable=False, default=0.0)      # Costo de compra en USD
    quantity             = db.Column(db.Integer, nullable=False, default=1)
    last_maintenance_date = db.Column(db.String(50), nullable=True, default='')
    notes                = db.Column(db.Text, nullable=True, default='')
    date_added           = db.Column(db.DateTime, default=datetime.utcnow)
    logs                 = db.relationship('ToolLog', backref='tool', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        m_count = len(self.logs) if self.logs else 0
        return {
            'id': self.id,
            'code': self.code or f"HER-{self.id:03d}",
            'name': self.name,
            'category': self.category or 'General',
            'brand': self.brand or '',
            'model': self.model or '',
            'serial_number': self.serial_number or '',
            'condition': self.condition or 'Buena',
            'status': self.status or 'Disponible',
            'assigned_to': self.assigned_to or '',
            'assigned_date': self.assigned_date or '',
            'location': self.location or '',
            'warehouse': self.warehouse or 'Taller IT',
            'value': self.value,
            'quantity': self.quantity,
            'last_maintenance_date': self.last_maintenance_date or '',
            'notes': self.notes or '',
            'date_added': self.date_added.strftime('%Y-%m-%d %H:%M:%S') if self.date_added else '',
            'movements_count': m_count
        }

class ToolLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tool_id = db.Column(db.Integer, db.ForeignKey('tool.id', ondelete='CASCADE'), nullable=False)
    action = db.Column(db.String(50), nullable=False)  # Asignación, Devolución, Mantenimiento, Registro Inicial, Edición
    technician = db.Column(db.String(100), nullable=True, default='')
    location = db.Column(db.String(100), nullable=True, default='')
    warehouse = db.Column(db.String(100), nullable=True, default='')
    condition = db.Column(db.String(50), nullable=True, default='')
    notes = db.Column(db.Text, nullable=True, default='')
    performed_by = db.Column(db.String(100), nullable=True, default='')
    date = db.Column(db.String(50), nullable=True, default='')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'tool_id': self.tool_id,
            'action': self.action,
            'technician': self.technician or '',
            'location': self.location or '',
            'warehouse': self.warehouse or '',
            'condition': self.condition or '',
            'notes': self.notes or '',
            'performed_by': self.performed_by or '',
            'date': self.date or (self.timestamp.strftime('%Y-%m-%d') if self.timestamp else ''),
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else ''
        }

# ==============================================================================
# --- MODELOS PARA EL MÓDULO DE PEDIDOS Y SOLICITUDES DE COMPRA ---
# ==============================================================================

class PurchaseRequest(db.Model):
    __tablename__ = 'purchase_request'
    id = db.Column(db.Integer, primary_key=True)
    request_number = db.Column(db.String(30), unique=True, nullable=False, index=True) # Ej: SOL-2026-000001
    requester_name = db.Column(db.String(100), nullable=False)
    requester_user_id = db.Column(db.Integer, nullable=True)
    department = db.Column(db.String(100), nullable=False, default='IT')
    hotel = db.Column(db.String(100), nullable=False, default='')
    priority = db.Column(db.String(20), nullable=False, default='Normal') # Baja, Normal, Alta, Urgente
    general_notes = db.Column(db.Text, nullable=True, default='')
    status = db.Column(db.String(50), nullable=False, default='En Espera de Aprobación') 
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    items = db.relationship('PurchaseRequestItem', backref='purchase_request', lazy=True, cascade='all, delete-orphan')
    audit_logs = db.relationship('PurchaseRequestAuditLog', backref='purchase_request', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_details=False):
        items_list = [item.to_dict(include_subdetails=include_details) for item in self.items] if self.items else []
        total_items = len(items_list)
        total_qty_requested = sum(i['quantity_requested'] for i in items_list)
        total_qty_approved = sum(i['quantity_approved'] for i in items_list)
        total_qty_received = sum(i['quantity_received'] for i in items_list)

        # Resumen de proveedores y OCs
        providers = list(set(filter(None, [i.get('provider_quoted') or i.get('recommended_provider') for i in items_list])))
        pos = list(set(filter(None, [i.get('po_numbers_str') for i in items_list])))

        data = {
            'id': self.id,
            'request_number': self.request_number,
            'requester_name': self.requester_name,
            'requester_user_id': self.requester_user_id,
            'department': self.department,
            'hotel': self.hotel,
            'priority': self.priority,
            'general_notes': self.general_notes or '',
            'status': self.status,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'created_date': self.created_at.strftime('%Y-%m-%d') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else '',
            'total_items': total_items,
            'total_qty_requested': total_qty_requested,
            'total_qty_approved': total_qty_approved,
            'total_qty_received': total_qty_received,
            'providers_summary': ', '.join(providers) if providers else '',
            'pos_summary': ', '.join(pos) if pos else '',
            'items': items_list
        }
        if include_details:
            data['audit_logs'] = [l.to_dict() for l in self.audit_logs] if self.audit_logs else []
        return data

class PurchaseRequestItem(db.Model):
    __tablename__ = 'purchase_request_item'
    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey('purchase_request.id'), nullable=False, index=True)
    description = db.Column(db.String(250), nullable=False)
    reference = db.Column(db.String(150), nullable=True, default='')
    quantity_requested = db.Column(db.Integer, nullable=False, default=1)
    quantity_approved = db.Column(db.Integer, nullable=False, default=0)
    quantity_received = db.Column(db.Integer, nullable=False, default=0)
    unit = db.Column(db.String(30), nullable=False, default='Unidades')
    recommended_provider = db.Column(db.String(150), nullable=True, default='')
    notes = db.Column(db.Text, nullable=True, default='')
    status = db.Column(db.String(50), nullable=False, default='Solicitado') # Solicitado, Aprobado, Rechazado, En Cotización, Cotizado, En Compra, Pedido, Parcialmente Recibido, Recibido, Cancelado
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    approvals = db.relationship('PurchaseItemApproval', backref='request_item', lazy=True, cascade='all, delete-orphan')
    quotes = db.relationship('PurchaseItemQuote', backref='request_item', lazy=True, cascade='all, delete-orphan')
    receptions = db.relationship('PurchaseItemReception', backref='request_item', lazy=True, cascade='all, delete-orphan')
    po_links = db.relationship('PurchaseOrderItem', backref='request_item', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_subdetails=False):
        latest_quote = self.quotes[-1] if self.quotes else None
        latest_approval = self.approvals[-1] if self.approvals else None
        
        pos = [link.purchase_order.po_number for link in self.po_links if link.purchase_order] if self.po_links else []
        po_str = ', '.join(set(filter(None, pos)))

        data = {
            'id': self.id,
            'request_id': self.request_id,
            'description': self.description,
            'reference': self.reference or '',
            'quantity_requested': self.quantity_requested,
            'quantity_approved': self.quantity_approved,
            'quantity_received': self.quantity_received,
            'quantity_pending': max(0, (self.quantity_approved if self.quantity_approved > 0 else self.quantity_requested) - self.quantity_received),
            'unit': self.unit or 'Unidades',
            'recommended_provider': self.recommended_provider or '',
            'notes': self.notes or '',
            'status': self.status,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'provider_quoted': latest_quote.provider_name if latest_quote else '',
            'quoted_unit_price': latest_quote.unit_price if latest_quote else 0.0,
            'quoted_total_price': latest_quote.total_price if latest_quote else 0.0,
            'quoted_currency': latest_quote.currency if latest_quote else 'USD',
            'po_numbers_str': po_str,
            'approver_name': latest_approval.approver_name if latest_approval else '',
            'approval_date': latest_approval.approval_date if latest_approval else '',
            'approval_notes': latest_approval.notes if latest_approval else ''
        }

        if include_subdetails:
            data['approvals'] = [a.to_dict() for a in self.approvals] if self.approvals else []
            data['quotes'] = [q.to_dict() for q in self.quotes] if self.quotes else []
            data['receptions'] = [r.to_dict() for r in self.receptions] if self.receptions else []
            data['orders'] = [{
                'po_id': l.po_id,
                'po_number': l.purchase_order.po_number if l.purchase_order else '',
                'quantity_ordered': l.quantity_ordered,
                'unit_price': l.unit_price,
                'provider_name': l.purchase_order.provider_name if l.purchase_order else '',
                'order_date': l.purchase_order.order_date if l.purchase_order else '',
                'estimated_delivery_date': l.purchase_order.estimated_delivery_date if l.purchase_order else '',
                'status': l.purchase_order.status if l.purchase_order else ''
            } for l in self.po_links if l.purchase_order] if self.po_links else []
        return data

class PurchaseItemApproval(db.Model):
    __tablename__ = 'purchase_item_approval'
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('purchase_request_item.id'), nullable=False, index=True)
    request_id = db.Column(db.Integer, db.ForeignKey('purchase_request.id'), nullable=False, index=True)
    approver_name = db.Column(db.String(100), nullable=False)
    approval_date = db.Column(db.String(30), nullable=False)
    status = db.Column(db.String(30), nullable=False) # Aprobado, Rechazado, Modificado
    original_quantity = db.Column(db.Integer, nullable=False, default=0)
    approved_quantity = db.Column(db.Integer, nullable=False, default=0)
    notes = db.Column(db.Text, nullable=True, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'item_id': self.item_id,
            'request_id': self.request_id,
            'approver_name': self.approver_name,
            'approval_date': self.approval_date,
            'status': self.status,
            'original_quantity': self.original_quantity,
            'approved_quantity': self.approved_quantity,
            'notes': self.notes or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class PurchaseItemQuote(db.Model):
    __tablename__ = 'purchase_item_quote'
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('purchase_request_item.id'), nullable=False, index=True)
    request_id = db.Column(db.Integer, db.ForeignKey('purchase_request.id'), nullable=False, index=True)
    provider_name = db.Column(db.String(150), nullable=False)
    quote_number = db.Column(db.String(100), nullable=True, default='')
    quote_date = db.Column(db.String(30), nullable=True, default='')
    unit_price = db.Column(db.Float, nullable=False, default=0.0)
    total_price = db.Column(db.Float, nullable=False, default=0.0)
    currency = db.Column(db.String(10), nullable=False, default='USD')
    notes = db.Column(db.Text, nullable=True, default='')
    attachment_name = db.Column(db.String(200), nullable=True, default='')
    attachment_data = db.Column(db.Text, nullable=True, default='')
    created_by = db.Column(db.String(100), nullable=True, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'item_id': self.item_id,
            'request_id': self.request_id,
            'provider_name': self.provider_name,
            'quote_number': self.quote_number or '',
            'quote_date': self.quote_date or '',
            'unit_price': self.unit_price,
            'total_price': self.total_price,
            'currency': self.currency or 'USD',
            'notes': self.notes or '',
            'attachment_name': self.attachment_name or '',
            'has_attachment': bool(self.attachment_data),
            'created_by': self.created_by or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class PurchaseOrder(db.Model):
    __tablename__ = 'purchase_order'
    id = db.Column(db.Integer, primary_key=True)
    po_number = db.Column(db.String(50), unique=True, nullable=False, index=True) # Ej: OC-10025
    provider_name = db.Column(db.String(150), nullable=False)
    order_date = db.Column(db.String(30), nullable=False)
    estimated_delivery_date = db.Column(db.String(30), nullable=True, default='')
    buyer_name = db.Column(db.String(100), nullable=True, default='')
    status = db.Column(db.String(50), nullable=False, default='Emitida') # Emitida, En Proceso, Entregada, Cancelada
    total_amount = db.Column(db.Float, nullable=False, default=0.0)
    currency = db.Column(db.String(10), nullable=False, default='USD')
    notes = db.Column(db.Text, nullable=True, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    items = db.relationship('PurchaseOrderItem', backref='purchase_order', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'po_number': self.po_number,
            'provider_name': self.provider_name,
            'order_date': self.order_date,
            'estimated_delivery_date': self.estimated_delivery_date or '',
            'buyer_name': self.buyer_name or '',
            'status': self.status,
            'total_amount': self.total_amount,
            'currency': self.currency or 'USD',
            'notes': self.notes or '',
            'items_count': len(self.items) if self.items else 0,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class PurchaseOrderItem(db.Model):
    __tablename__ = 'purchase_order_item'
    id = db.Column(db.Integer, primary_key=True)
    po_id = db.Column(db.Integer, db.ForeignKey('purchase_order.id'), nullable=False, index=True)
    request_item_id = db.Column(db.Integer, db.ForeignKey('purchase_request_item.id'), nullable=False, index=True)
    quantity_ordered = db.Column(db.Integer, nullable=False, default=1)
    unit_price = db.Column(db.Float, nullable=False, default=0.0)

class PurchaseItemReception(db.Model):
    __tablename__ = 'purchase_item_reception'
    id = db.Column(db.Integer, primary_key=True)
    request_item_id = db.Column(db.Integer, db.ForeignKey('purchase_request_item.id'), nullable=False, index=True)
    request_id = db.Column(db.Integer, db.ForeignKey('purchase_request.id'), nullable=False, index=True)
    po_id = db.Column(db.Integer, db.ForeignKey('purchase_order.id'), nullable=True, index=True)
    quantity_received = db.Column(db.Integer, nullable=False, default=1)
    reception_date = db.Column(db.String(30), nullable=False)
    received_by = db.Column(db.String(100), nullable=False)
    provider_name = db.Column(db.String(150), nullable=True, default='')
    invoice_number = db.Column(db.String(100), nullable=True, default='')
    notes = db.Column(db.Text, nullable=True, default='')
    evidence_doc = db.Column(db.String(200), nullable=True, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        po_num = ''
        if self.po_id:
            po_obj = PurchaseOrder.query.get(self.po_id)
            if po_obj: po_num = po_obj.po_number

        return {
            'id': self.id,
            'request_item_id': self.request_item_id,
            'request_id': self.request_id,
            'po_id': self.po_id,
            'po_number': po_num,
            'quantity_received': self.quantity_received,
            'reception_date': self.reception_date,
            'received_by': self.received_by,
            'provider_name': self.provider_name or '',
            'invoice_number': self.invoice_number or '',
            'notes': self.notes or '',
            'evidence_doc': self.evidence_doc or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class PurchaseRequestAuditLog(db.Model):
    __tablename__ = 'purchase_request_audit_log'
    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey('purchase_request.id'), nullable=False, index=True)
    item_id = db.Column(db.Integer, nullable=True)
    username = db.Column(db.String(100), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    field_name = db.Column(db.String(100), nullable=True)
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)
    details = db.Column(db.Text, nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'request_id': self.request_id,
            'item_id': self.item_id,
            'username': self.username,
            'action': self.action,
            'field_name': self.field_name or '',
            'old_value': self.old_value or '',
            'new_value': self.new_value or '',
            'details': self.details or '',
            'date': self.timestamp.strftime('%Y-%m-%d') if self.timestamp else '',
            'time': self.timestamp.strftime('%H:%M:%S') if self.timestamp else '',
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else ''
        }

def log_order_audit(request_id, username, action, item_id=None, field_name=None, old_value=None, new_value=None, details=None):
    try:
        entry = PurchaseRequestAuditLog(
            request_id=request_id,
            item_id=item_id,
            username=username or 'Sistema',
            action=action,
            field_name=field_name,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            details=details
        )
        db.session.add(entry)
        db.session.commit()
    except Exception as e:
        print(f"[AUDIT LOG ERROR] {e}")

def generate_request_number():
    year = datetime.utcnow().strftime('%Y')
    count = PurchaseRequest.query.count() + 1
    return f"SOL-{year}-{count:06d}"

def update_request_general_status(request_id):
    req = PurchaseRequest.query.get(request_id)
    if not req or not req.items:
        return
    
    statuses = [item.status for item in req.items]
    
    if all(s == 'Recibido' for s in statuses):
        req.status = 'Recibido'
    elif any(s in ['Recibido', 'Parcialmente Recibido'] for s in statuses):
        req.status = 'Parcialmente Recibido'
    elif all(s == 'Rechazado' for s in statuses):
        req.status = 'Rechazado'
    elif all(s == 'Cancelado' for s in statuses):
        req.status = 'Cancelado'
    elif all(s in ['Pedido', 'En Compra'] for s in statuses):
        req.status = 'En Compra'
    elif any(s in ['Pedido', 'En Compra'] for s in statuses):
        req.status = 'En Compra'
    elif any(s in ['En Cotización', 'Cotizado'] for s in statuses):
        req.status = 'En Cotización'
    elif all(s == 'Aprobado' for s in statuses):
        req.status = 'Aprobado'
    elif any(s == 'Aprobado' for s in statuses):
        req.status = 'Aprobado Parcial'
    elif any(s == 'En Espera de Aprobación' for s in statuses) or any(s == 'Solicitado' for s in statuses):
        req.status = 'En Espera de Aprobación'
    
    db.session.commit()

with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        print(f"[DB INIT ERROR] {e}")

def log_activity(username, action, details=""):
    try:
        log = ActivityLog(username=username, action=action, details=details)
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        print(f"Failed to log activity: {e}")

def current_username():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            return user.username
    return 'Guest'

def merge_device_if_duplicate(device_id):
    """
    Checks if the device with device_id matches another device in the DB.
    If so, merges it into the existing device and deletes the current one.
    Returns the primary device if merged, or the original device if not merged.
    """
    device = Device.query.get(device_id)
    if not device:
        return None
        
    name_clean = (device.name or '').strip().upper()
    dtype_clean = (device.device_type or '').strip().upper()
    brand_clean = (device.brand or '').strip().upper()
    model_clean = (device.model or '').strip().upper()
    status_clean = (device.status or '').strip().upper()
    warehouse_clean = (device.warehouse or '').strip().upper()
    location_clean = (device.location or '').strip().upper()
    
    def clean_identifier(val):
        if not val:
            return ''
        val_clean = val.strip().replace(' ', '').upper()
        if val_clean in ['', '-', 'N/A', 'SIN', 'SINSERIAL', 'SINMAC']:
            return ''
        return val_clean

    sn_clean = clean_identifier(device.serial_number)
    mac_clean = clean_identifier(device.mac_address)
    
    candidates = Device.query.filter(Device.id != device.id).all()
    
    for c in candidates:
        c_name = (c.name or '').strip().upper()
        c_dtype = (c.device_type or '').strip().upper()
        c_brand = (c.brand or '').strip().upper()
        c_model = (c.model or '').strip().upper()
        c_status = (c.status or '').strip().upper()
        c_warehouse = (c.warehouse or '').strip().upper()
        c_location = (c.location or '').strip().upper()
        c_sn = clean_identifier(c.serial_number)
        c_mac = clean_identifier(c.mac_address)
        
        if (name_clean == c_name and
            dtype_clean == c_dtype and
            brand_clean == c_brand and
            model_clean == c_model and
            status_clean == c_status and
            warehouse_clean == c_warehouse and
            location_clean == c_location and
            sn_clean == c_sn and
            mac_clean == c_mac):
            
            c.quantity = (c.quantity or 0) + (device.quantity or 1)
            c.value = (c.value or 0.0) + (device.value or 0.0)
            
            if device.description and device.description.strip():
                if c.description:
                    if device.description.strip() not in c.description:
                        c.description += f" | {device.description.strip()}"
                else:
                    c.description = device.description.strip()
            
            db.session.delete(device)
            db.session.commit()
            return c
            
    return device

def consolidate_existing_inventory():
    try:
        devices = Device.query.all()
        unique_devices = {}
        to_delete = []
        
        def clean_identifier(val):
            if not val:
                return ''
            val_clean = val.strip().replace(' ', '').upper()
            if val_clean in ['', '-', 'N/A', 'SIN', 'SINSERIAL', 'SINMAC']:
                return ''
            return val_clean

        for d in devices:
            name = (d.name or '').strip().upper()
            dtype = (d.device_type or '').strip().upper()
            brand = (d.brand or '').strip().upper()
            model = (d.model or '').strip().upper()
            status = (d.status or '').strip().upper()
            warehouse = (d.warehouse or '').strip().upper()
            location = (d.location or '').strip().upper()
            sn = clean_identifier(d.serial_number)
            mac = clean_identifier(d.mac_address)
            
            key = (name, dtype, brand, model, status, warehouse, location, sn, mac)
            
            if key in unique_devices:
                primary = unique_devices[key]
                primary.quantity = (primary.quantity or 0) + (d.quantity or 1)
                primary.value = (primary.value or 0.0) + (d.value or 0.0)
                
                if d.description and d.description.strip():
                    if primary.description:
                        if d.description.strip() not in primary.description:
                            primary.description += f" | {d.description.strip()}"
                    else:
                        primary.description = d.description.strip()
                        
                to_delete.append(d)
            else:
                unique_devices[key] = d
                
        if to_delete:
            for d in to_delete:
                db.session.delete(d)
            db.session.commit()
            print(f"SUCCESS: Consolidated {len(to_delete)} duplicate devices on startup.")
    except Exception as e:
        print("Error during startup consolidation:", e)

with app.app_context():
    db.create_all()
    # Check if quantity column exists in device table, if not add it
    try:
        db.session.execute(db.text("ALTER TABLE device ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1"))
        db.session.commit()
    except Exception as e:
        pass
    
    # Check if quantity column exists in decommission table, if not add it
    try:
        db.session.execute(db.text("ALTER TABLE decommission ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1"))
        db.session.commit()
    except Exception as e:
        pass

    try:
        db.session.execute(db.text("ALTER TABLE operational_task ADD COLUMN updated_at DATETIME"))
        db.session.commit()
    except Exception as e:
        pass

    try:
        db.session.execute(db.text("ALTER TABLE operational_task ADD COLUMN last_updated_by VARCHAR(100)"))
        db.session.commit()
    except Exception as e:
        pass

    try:
        db.session.execute(db.text("ALTER TABLE operational_task ADD COLUMN inactivity_threshold_hours INTEGER DEFAULT 72"))
        db.session.commit()
    except Exception as e:
        pass

    try:
        db.session.execute(db.text("ALTER TABLE operational_task ADD COLUMN category VARCHAR(50) DEFAULT 'Pendiente'"))
        db.session.commit()
    except Exception as e:
        pass

    try:
        db.session.execute(db.text("ALTER TABLE operational_task ADD COLUMN start_date VARCHAR(50)"))
        db.session.commit()
    except Exception as e:
        pass

    try:
        db.session.execute(db.text("ALTER TABLE operational_task ADD COLUMN end_date VARCHAR(50)"))
        db.session.commit()
    except Exception as e:
        pass

    # Migración: decommission_number en tabla decommission
    try:
        db.session.execute(db.text("ALTER TABLE decommission ADD COLUMN decommission_number VARCHAR(30)"))
        db.session.commit()
    except Exception:
        pass

    # Migración: sigla y logo en tabla hotel
    try:
        db.session.execute(db.text("ALTER TABLE hotel ADD COLUMN sigla VARCHAR(20)"))
        db.session.commit()
    except Exception:
        pass
    try:
        db.session.execute(db.text("ALTER TABLE hotel ADD COLUMN logo TEXT"))
        db.session.commit()
    except Exception:
        pass

    # Migraciones: Columnas avanzadas en tabla device
    for col_def in [
        "ALTER TABLE device ADD COLUMN sku VARCHAR(50) DEFAULT ''",
        "ALTER TABLE device ADD COLUMN cost_price FLOAT NOT NULL DEFAULT 0.0",
        "ALTER TABLE device ADD COLUMN profit_margin FLOAT NOT NULL DEFAULT 0.0",
        "ALTER TABLE device ADD COLUMN sale_price_rd FLOAT NOT NULL DEFAULT 0.0",
        "ALTER TABLE device ADD COLUMN sale_price_usd FLOAT NOT NULL DEFAULT 0.0",
        "ALTER TABLE device ADD COLUMN sale_price_eur FLOAT NOT NULL DEFAULT 0.0",
        "ALTER TABLE device ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE device ADD COLUMN provider VARCHAR(150) DEFAULT ''"
    ]:
        try:
            db.session.execute(db.text(col_def))
            db.session.commit()
        except Exception:
            pass

    # Migración: permissions en tabla user
    try:
        db.session.execute(db.text("ALTER TABLE user ADD COLUMN permissions TEXT DEFAULT '[]'"))
        db.session.commit()
    except Exception:
        pass

    # Consolidar duplicados en el inicio del servidor
    consolidate_existing_inventory()


@app.route('/manifest.json')
def serve_manifest():
    from flask import send_from_directory
    return send_from_directory(os.path.join(basedir, 'static'), 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def serve_sw():
    from flask import send_from_directory
    response = send_from_directory(os.path.join(basedir, 'static'), 'sw.js', mimetype='application/javascript')
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/')
def index():
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/inventario')
def inventario():
    return render_template('inventario.html')

@app.route('/decomiso')
def decomiso():
    return render_template('decomiso.html')

@app.route('/despacho')
def despacho():
    return render_template('despacho.html')

@app.route('/pendientes')
def pendientes():
    return render_template('pendientes.html')

@app.route('/reparaciones')
def reparaciones():
    return render_template('reparaciones.html')

@app.route('/prestamos')
def prestamos():
    return render_template('prestamos.html')

@app.route('/herramientas')
def herramientas():
    return render_template('herramientas.html')

@app.route('/pedidos')
def pedidos():
    return render_template('pedidos.html')

@app.route('/configuracion')
def configuracion():
    return render_template('configuracion.html')

# ==============================================================================
# --- APIS PARA EL MÓDULO DE PEDIDOS Y SOLICITUDES DE COMPRA ---
# ==============================================================================

@app.route('/api/orders', methods=['GET'])
def get_orders():
    status = request.args.get('status')
    department = request.args.get('department')
    hotel = request.args.get('hotel')
    priority = request.args.get('priority')
    search = (request.args.get('search') or '').strip().lower()
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    provider = (request.args.get('provider') or '').strip().lower()
    po_number = (request.args.get('po_number') or '').strip().lower()

    query = PurchaseRequest.query

    if status and status != 'all':
        if status == 'pendientes_aprobacion':
            query = query.filter(PurchaseRequest.status.in_(['En Espera de Aprobación', 'Solicitado']))
        elif status == 'aprobadas':
            query = query.filter(PurchaseRequest.status.in_(['Aprobado', 'Aprobado Parcial']))
        elif status == 'en_compras':
            query = query.filter(PurchaseRequest.status.in_(['En Cotización', 'Cotizado', 'En Compra', 'Pedido']))
        elif status == 'pendientes_recepcion':
            query = query.filter(PurchaseRequest.status.in_(['En Compra', 'Pedido', 'Parcialmente Recibido']))
        elif status == 'recibidas':
            query = query.filter_by(status='Recibido')
        elif status == 'canceladas':
            query = query.filter(PurchaseRequest.status.in_(['Cancelado', 'Rechazado']))
        else:
            query = query.filter_by(status=status)

    if department and department != 'all':
        query = query.filter_by(department=department)
    if hotel and hotel != 'all':
        query = query.filter_by(hotel=hotel)
    if priority and priority != 'all':
        query = query.filter_by(priority=priority)
    if start_date:
        try:
            sd = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(PurchaseRequest.created_at >= sd)
        except Exception:
            pass
    if end_date:
        try:
            ed = datetime.strptime(end_date + ' 23:59:59', '%Y-%m-%d %H:%M:%S')
            query = query.filter(PurchaseRequest.created_at <= ed)
        except Exception:
            pass

    all_orders = query.order_by(PurchaseRequest.id.desc()).all()
    orders_list = []

    for o in all_orders:
        o_dict = o.to_dict(include_details=False)
        # Filtro de búsqueda en memoria para campos agregados o de items
        if search:
            match_req = search in (o_dict['request_number'] or '').lower() or \
                        search in (o_dict['requester_name'] or '').lower() or \
                        search in (o_dict['department'] or '').lower() or \
                        search in (o_dict['hotel'] or '').lower() or \
                        search in (o_dict['general_notes'] or '').lower()
            match_items = any(search in (i['description'] or '').lower() or search in (i['reference'] or '').lower() for i in o_dict['items'])
            match_prov = search in (o_dict['providers_summary'] or '').lower()
            match_po = search in (o_dict['pos_summary'] or '').lower()
            if not (match_req or match_items or match_prov or match_po):
                continue

        if provider and provider not in (o_dict['providers_summary'] or '').lower():
            continue
        if po_number and po_number not in (o_dict['pos_summary'] or '').lower():
            continue

        orders_list.append(o_dict)

    # Cálculo global de KPIs
    all_unfiltered = PurchaseRequest.query.all()
    kpis = {
        'total': len(all_unfiltered),
        'pendientes_aprobacion': sum(1 for o in all_unfiltered if o.status in ['En Espera de Aprobación', 'Solicitado']),
        'aprobadas': sum(1 for o in all_unfiltered if o.status in ['Aprobado', 'Aprobado Parcial']),
        'en_compras': sum(1 for o in all_unfiltered if o.status in ['En Cotización', 'Cotizado', 'En Compra', 'Pedido']),
        'pendientes_recepcion': sum(1 for o in all_unfiltered if o.status in ['En Compra', 'Pedido', 'Parcialmente Recibido']),
        'recibidas': sum(1 for o in all_unfiltered if o.status == 'Recibido'),
        'canceladas': sum(1 for o in all_unfiltered if o.status in ['Cancelado', 'Rechazado'])
    }

    return jsonify({'orders': orders_list, 'kpis': kpis})

def check_order_permission(perm_name):
    if session.get('role') == 'Admin':
        return True
    user_id = session.get('user_id')
    if not user_id:
        return True
    user = User.query.get(user_id)
    if not user:
        return False
    perms = user.get_permissions()
    return perm_name in perms or (user.role or '').lower() == 'admin'

@app.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order_detail(order_id):
    order = PurchaseRequest.query.get_or_404(order_id)
    return jsonify(order.to_dict(include_details=True))

@app.route('/api/orders', methods=['POST'])
def create_order():
    if not check_order_permission('pedidos:crear'):
        return jsonify({'error': 'No tienes permisos para crear solicitudes de compra'}), 403

    data = request.json or {}
    requester = (data.get('requester_name') or current_username()).strip()
    dept = (data.get('department') or 'IT').strip()
    hotel = (data.get('hotel') or '').strip()
    priority = (data.get('priority') or 'Normal').strip()
    notes = (data.get('general_notes') or '').strip()
    raw_items = data.get('items', [])

    if not raw_items or len(raw_items) == 0:
        return jsonify({'error': 'Debes agregar al menos un artículo a la solicitud'}), 400

    req_num = generate_request_number()
    u_id = session.get('user_id')

    new_request = PurchaseRequest(
        request_number=req_num,
        requester_name=requester,
        requester_user_id=u_id,
        department=dept,
        hotel=hotel,
        priority=priority,
        general_notes=notes,
        status='En Espera de Aprobación'
    )
    db.session.add(new_request)
    db.session.flush() # Para obtener new_request.id

    for idx, item in enumerate(raw_items, start=1):
        desc = (item.get('description') or '').strip()
        if not desc: continue
        qty = int(item.get('quantity_requested') or item.get('quantity') or 1)
        ref = (item.get('reference') or '').strip()
        rec_prov = (item.get('recommended_provider') or '').strip()
        item_obs = (item.get('notes') or item.get('observation') or '').strip()

        new_item = PurchaseRequestItem(
            request_id=new_request.id,
            description=desc,
            reference=ref,
            quantity_requested=max(1, qty),
            quantity_approved=0,
            quantity_received=0,
            unit=item.get('unit', 'Unidades'),
            recommended_provider=rec_prov,
            notes=item_obs,
            status='Solicitado'
        )
        db.session.add(new_item)

    db.session.commit()

    # Auditoría inicial
    log_order_audit(
        request_id=new_request.id,
        username=current_username(),
        action='Creación de Solicitud',
        details=f"Solicitud {new_request.request_number} creada por {requester} con {len(raw_items)} artículo(s)."
    )
    log_activity(current_username(), 'Nueva Solicitud de Compra', f'Solicitud {new_request.request_number} creada con {len(raw_items)} artículos.')

    return jsonify(new_request.to_dict(include_details=True)), 201

@app.route('/api/orders/<int:order_id>', methods=['PUT'])
def update_order(order_id):
    order = PurchaseRequest.query.get_or_404(order_id)
    data = request.json or {}

    if 'department' in data: order.department = data['department'].strip()
    if 'hotel' in data: order.hotel = data['hotel'].strip()
    if 'priority' in data: order.priority = data['priority'].strip()
    if 'general_notes' in data: order.general_notes = data['general_notes'].strip()
    if 'status' in data: order.status = data['status'].strip()

    db.session.commit()
    log_order_audit(order.id, current_username(), 'Actualización de Cabecera', details="Datos generales actualizados.")
    return jsonify(order.to_dict(include_details=True))

@app.route('/api/orders/<int:order_id>/approve', methods=['POST'])
def approve_order(order_id):
    if not check_order_permission('pedidos:aprobar'):
        return jsonify({'error': 'No tienes permisos para aprobar o rechazar pedidos'}), 403

    order = PurchaseRequest.query.get_or_404(order_id)
    data = request.json or {}
    action = data.get('action') # 'approve_all', 'reject_all', 'individual'
    approver = current_username()
    today_str = datetime.utcnow().strftime('%Y-%m-%d')
    global_notes = (data.get('notes') or '').strip()

    items_payload = data.get('items', []) # Para aprobación individual

    if action == 'approve_all':
        for item in order.items:
            old_status = item.status
            old_qty = item.quantity_approved
            item.status = 'Aprobado'
            item.quantity_approved = item.quantity_requested
            
            approval_entry = PurchaseItemApproval(
                item_id=item.id,
                request_id=order.id,
                approver_name=approver,
                approval_date=today_str,
                status='Aprobado',
                original_quantity=item.quantity_requested,
                approved_quantity=item.quantity_approved,
                notes=global_notes
            )
            db.session.add(approval_entry)
            log_order_audit(
                request_id=order.id,
                item_id=item.id,
                username=approver,
                action='Aprobación de Artículo',
                field_name='status',
                old_value=old_status,
                new_value='Aprobado',
                details=f"Aprobado por {approver}. Cantidad: {item.quantity_approved} unids. {global_notes}"
            )
        order.status = 'Aprobado'

    elif action == 'reject_all':
        for item in order.items:
            old_status = item.status
            item.status = 'Rechazado'
            item.quantity_approved = 0
            
            approval_entry = PurchaseItemApproval(
                item_id=item.id,
                request_id=order.id,
                approver_name=approver,
                approval_date=today_str,
                status='Rechazado',
                original_quantity=item.quantity_requested,
                approved_quantity=0,
                notes=global_notes
            )
            db.session.add(approval_entry)
            log_order_audit(
                request_id=order.id,
                item_id=item.id,
                username=approver,
                action='Rechazo de Artículo',
                field_name='status',
                old_value=old_status,
                new_value='Rechazado',
                details=f"Rechazado por {approver}. Motivo: {global_notes}"
            )
        order.status = 'Rechazado'

    elif action == 'individual':
        for item_data in items_payload:
            i_id = item_data.get('item_id')
            item = PurchaseRequestItem.query.filter_by(id=i_id, request_id=order.id).first()
            if not item: continue

            new_st = item_data.get('status', 'Aprobado')
            new_qty = int(item_data.get('approved_quantity') if item_data.get('approved_quantity') is not None else item.quantity_requested)
            item_notes = (item_data.get('notes') or '').strip()

            old_st = item.status
            old_qty = item.quantity_approved

            item.status = new_st
            item.quantity_approved = new_qty if new_st == 'Aprobado' else 0

            # Guardar registro de aprobación
            approval_entry = PurchaseItemApproval(
                item_id=item.id,
                request_id=order.id,
                approver_name=approver,
                approval_date=today_str,
                status=new_st,
                original_quantity=item.quantity_requested,
                approved_quantity=item.quantity_approved,
                notes=item_notes
            )
            db.session.add(approval_entry)

            # Auditoría
            log_order_audit(
                request_id=order.id,
                item_id=item.id,
                username=approver,
                action='Revisión de Aprobación',
                field_name='quantity_approved' if old_qty != item.quantity_approved else 'status',
                old_value=f"Cant: {old_qty}, Estado: {old_st}",
                new_value=f"Cant: {item.quantity_approved}, Estado: {new_st}",
                details=f"Revisado por {approver}. Solicitadas: {item.quantity_requested}, Aprobadas: {item.quantity_approved}. {item_notes}"
            )

        update_request_general_status(order.id)

    db.session.commit()
    log_activity(approver, 'Aprobación de Pedido', f'Solicitud {order.request_number} evaluada (Acción: {action}).')
    return jsonify(order.to_dict(include_details=True))

@app.route('/api/orders/<int:order_id>/quote', methods=['POST'])
def quote_order_items(order_id):
    if not check_order_permission('pedidos:cotizar'):
        return jsonify({'error': 'No tienes permisos para registrar cotizaciones'}), 403

    order = PurchaseRequest.query.get_or_404(order_id)
    data = request.json or {}
    item_ids = data.get('item_ids', [])
    provider_name = (data.get('provider_name') or '').strip()
    quote_num = (data.get('quote_number') or '').strip()
    quote_date = data.get('quote_date', datetime.utcnow().strftime('%Y-%m-%d'))
    unit_price = float(data.get('unit_price') or 0.0)
    currency = data.get('currency', 'USD')
    notes = (data.get('notes') or '').strip()
    att_name = (data.get('attachment_name') or '').strip()
    att_data = (data.get('attachment_data') or '').strip()

    if not provider_name:
        return jsonify({'error': 'El nombre del proveedor es requerido'}), 400
    if not item_ids:
        return jsonify({'error': 'Selecciona al menos un artículo para cotizar'}), 400

    # Auto-registrar proveedor si no existe
    existing_p = Provider.query.filter(db.func.lower(Provider.name) == provider_name.lower()).first()
    if not existing_p:
        db.session.add(Provider(name=provider_name))
        db.session.commit()

    buyer = current_username()

    for i_id in item_ids:
        item = PurchaseRequestItem.query.filter_by(id=i_id, request_id=order.id).first()
        if not item: continue

        effective_qty = item.quantity_approved if item.quantity_approved > 0 else item.quantity_requested
        tot_price = round(unit_price * effective_qty, 2)

        quote_entry = PurchaseItemQuote(
            item_id=item.id,
            request_id=order.id,
            provider_name=provider_name,
            quote_number=quote_num,
            quote_date=quote_date,
            unit_price=unit_price,
            total_price=tot_price,
            currency=currency,
            notes=notes,
            attachment_name=att_name,
            attachment_data=att_data,
            created_by=buyer
        )
        db.session.add(quote_entry)

        if item.status in ['Aprobado', 'Solicitado', 'En Cotización']:
            item.status = 'Cotizado'

        log_order_audit(
            request_id=order.id,
            item_id=item.id,
            username=buyer,
            action='Cotización Registrada',
            field_name='provider_quoted',
            old_value=None,
            new_value=f"{provider_name} ({currency} ${unit_price:.2f} c/u)",
            details=f"Cotización #{quote_num} registrada por {buyer}. Total: {currency} ${tot_price:.2f}."
        )

    update_request_general_status(order.id)
    db.session.commit()

    log_activity(buyer, 'Cotización de Pedido', f'Cotización para Solicitud {order.request_number} registrada (Proveedor: {provider_name}).')
    return jsonify(order.to_dict(include_details=True))

@app.route('/api/orders/<int:order_id>/purchase-order', methods=['POST'])
def create_purchase_order_for_request(order_id):
    if not check_order_permission('pedidos:comprar'):
        return jsonify({'error': 'No tienes permisos para generar órdenes de compra'}), 403

    order = PurchaseRequest.query.get_or_404(order_id)
    data = request.json or {}
    po_number = (data.get('po_number') or '').strip()
    provider_name = (data.get('provider_name') or '').strip()
    order_date = data.get('order_date', datetime.utcnow().strftime('%Y-%m-%d'))
    est_delivery = data.get('estimated_delivery_date', '')
    buyer = (data.get('buyer_name') or current_username()).strip()
    notes = (data.get('notes') or '').strip()
    currency = data.get('currency', 'USD')
    raw_items = data.get('items', []) # [{ item_id, quantity_ordered, unit_price }]

    if not po_number or not provider_name:
        return jsonify({'error': 'Número de Orden de Compra y Proveedor son obligatorios'}), 400
    if not raw_items:
        return jsonify({'error': 'Selecciona los artículos que pertenecerán a esta Orden de Compra'}), 400

    # Buscar o crear PurchaseOrder
    po = PurchaseOrder.query.filter_by(po_number=po_number).first()
    if not po:
        po = PurchaseOrder(
            po_number=po_number,
            provider_name=provider_name,
            order_date=order_date,
            estimated_delivery_date=est_delivery,
            buyer_name=buyer,
            status='Emitida',
            currency=currency,
            notes=notes
        )
        db.session.add(po)
        db.session.flush()

    total_po_amount = po.total_amount or 0.0

    for it in raw_items:
        i_id = it.get('item_id')
        item = PurchaseRequestItem.query.filter_by(id=i_id, request_id=order.id).first()
        if not item: continue

        q_ord = int(it.get('quantity_ordered') or item.quantity_approved or item.quantity_requested)
        u_pr = float(it.get('unit_price') or 0.0)

        # Evitar duplicar link
        existing_link = PurchaseOrderItem.query.filter_by(po_id=po.id, request_item_id=item.id).first()
        if not existing_link:
            link = PurchaseOrderItem(
                po_id=po.id,
                request_item_id=item.id,
                quantity_ordered=q_ord,
                unit_price=u_pr
            )
            db.session.add(link)
            total_po_amount += (q_ord * u_pr)

        item.status = 'Pedido'

        log_order_audit(
            request_id=order.id,
            item_id=item.id,
            username=buyer,
            action='Orden de Compra Generada',
            field_name='po_number',
            old_value=None,
            new_value=po_number,
            details=f"Asignado a Orden de Compra {po_number} (Proveedor: {provider_name}, Comprador: {buyer})."
        )

    po.total_amount = round(total_po_amount, 2)
    update_request_general_status(order.id)
    db.session.commit()

    log_activity(buyer, 'Orden de Compra', f'Orden de Compra {po_number} generada para Solicitud {order.request_number}.')
    return jsonify(order.to_dict(include_details=True))

@app.route('/api/orders/<int:order_id>/reception', methods=['POST'])
def receive_order_items(order_id):
    if not check_order_permission('pedidos:recibir'):
        return jsonify({'error': 'No tienes permisos para registrar recepciones'}), 403

    order = PurchaseRequest.query.get_or_404(order_id)
    data = request.json or {}
    item_id = data.get('item_id')
    qty_rec = int(data.get('quantity_received') or 0)
    rec_date = data.get('reception_date', datetime.utcnow().strftime('%Y-%m-%d'))
    receiver = (data.get('received_by') or current_username()).strip()
    provider_name = (data.get('provider_name') or '').strip()
    invoice_num = (data.get('invoice_number') or '').strip()
    notes = (data.get('notes') or '').strip()
    po_id = data.get('po_id')

    if not item_id or qty_rec <= 0:
        return jsonify({'error': 'Artículo y Cantidad Recibida válida son requeridos'}), 400

    item = PurchaseRequestItem.query.filter_by(id=item_id, request_id=order.id).first()
    if not item:
        return jsonify({'error': 'Artículo no encontrado en la solicitud'}), 404

    target_qty = item.quantity_approved if item.quantity_approved > 0 else item.quantity_requested
    new_total_rec = item.quantity_received + qty_rec

    reception_entry = PurchaseItemReception(
        request_item_id=item.id,
        request_id=order.id,
        po_id=po_id,
        quantity_received=qty_rec,
        reception_date=rec_date,
        received_by=receiver,
        provider_name=provider_name or item.recommended_provider,
        invoice_number=invoice_num,
        notes=notes
    )
    db.session.add(reception_entry)

    item.quantity_received = new_total_rec
    if new_total_rec >= target_qty:
        item.status = 'Recibido'
    else:
        item.status = 'Parcialmente Recibido'

    log_order_audit(
        request_id=order.id,
        item_id=item.id,
        username=receiver,
        action='Recepción de Artículo',
        field_name='quantity_received',
        old_value=item.quantity_received - qty_rec,
        new_value=item.quantity_received,
        details=f"Recibidas {qty_rec} unidades por {receiver}. Factura: {invoice_num or 'N/A'}. (Total recibido: {item.quantity_received}/{target_qty})."
    )

    update_request_general_status(order.id)
    db.session.commit()

    log_activity(receiver, 'Recepción de Pedido', f'{qty_rec} unidades de "{item.description}" recibidas en Solicitud {order.request_number}.')
    return jsonify(order.to_dict(include_details=True))

@app.route('/api/orders/<int:order_id>/history', methods=['GET'])
def get_order_history(order_id):
    order = PurchaseRequest.query.get_or_404(order_id)
    logs = [l.to_dict() for l in order.audit_logs]
    return jsonify({'history': logs})

# --- APIS PARA PRÉSTAMOS Y DEMOS ---
@app.route('/api/loans', methods=['GET'])
def get_loans():
    status = request.args.get('status')
    warehouse = request.args.get('warehouse')
    provider = request.args.get('provider')
    
    query = LoanDevice.query
    if status and status != 'all':
        query = query.filter_by(status=status)
    if warehouse and warehouse != 'all':
        query = query.filter_by(warehouse=warehouse)
    if provider and provider != 'all':
        query = query.filter_by(provider=provider)
        
    loans = query.order_by(LoanDevice.id.desc()).all()
    return jsonify([l.to_dict() for l in loans])

@app.route('/api/loans', methods=['POST'])
def add_loan():
    data = request.json
    name = (data.get('name') or '').strip()
    dtype = (data.get('type') or '').strip()
    
    if not name or not dtype:
        return jsonify({'error': 'El Nombre y Tipo de Equipo son requeridos'}), 400
        
    status = data.get('status', 'En Evaluación / Stock')
    warehouse = (data.get('warehouse') or '').strip()
    
    provider_name = (data.get('provider') or '').strip()
    if provider_name:
        existing_prov = Provider.query.filter(db.func.lower(Provider.name) == provider_name.lower()).first()
        if not existing_prov:
            db.session.add(Provider(name=provider_name))
            db.session.commit()

    new_loan = LoanDevice(
        name=name,
        device_type=dtype,
        brand=(data.get('brand') or '').strip(),
        model=(data.get('model') or '').strip(),
        serial_number=(data.get('serial_number') or '').strip(),
        mac_address=(data.get('mac_address') or '').strip(),
        provider=provider_name,
        status=status,
        warehouse=warehouse,
        location=(data.get('location') or '').strip(),
        dispatched_by=(data.get('dispatched_by') or '').strip(),
        received_date=data.get('received_date', datetime.utcnow().strftime('%Y-%m-%d')),
        expected_return_date=data.get('expected_return_date', ''),
        returned_date=data.get('returned_date', ''),
        value=float(data.get('value', 0.0)),
        quantity=int(data.get('quantity', 1)),
        notes=(data.get('notes') or '').strip()
    )
    
    db.session.add(new_loan)
    db.session.commit()
    
    ensure_catalog_entry(new_loan.device_type, new_loan.brand, new_loan.model)
    log_activity(current_username(), 'Registro de Préstamo / Demo', f'Equipo Demo {new_loan.name} (Proveedor: {new_loan.provider}) registrado.')
    return jsonify(new_loan.to_dict()), 201

@app.route('/api/loans/<int:loan_id>', methods=['PUT'])
def update_loan(loan_id):
    loan = LoanDevice.query.get_or_404(loan_id)
    data = request.json
    
    if 'name' in data: loan.name = data['name'].strip()
    if 'type' in data: loan.device_type = data['type'].strip()
    if 'brand' in data: loan.brand = (data.get('brand') or '').strip()
    if 'model' in data: loan.model = (data.get('model') or '').strip()
    if 'serial_number' in data: loan.serial_number = (data.get('serial_number') or '').strip()
    if 'mac_address' in data: loan.mac_address = (data.get('mac_address') or '').strip()
    if 'provider' in data:
        p_name = (data.get('provider') or '').strip()
        loan.provider = p_name
        if p_name:
            existing_prov = Provider.query.filter(db.func.lower(Provider.name) == p_name.lower()).first()
            if not existing_prov:
                db.session.add(Provider(name=p_name))
                db.session.commit()
    if 'status' in data: loan.status = data['status']
    if 'warehouse' in data: loan.warehouse = (data.get('warehouse') or '').strip()
    if 'location' in data: loan.location = (data.get('location') or '').strip()
    if 'dispatched_by' in data: loan.dispatched_by = (data.get('dispatched_by') or '').strip()
    if 'received_date' in data: loan.received_date = data.get('received_date', '')
    if 'expected_return_date' in data: loan.expected_return_date = data.get('expected_return_date', '')
    if 'returned_date' in data: loan.returned_date = data.get('returned_date', '')
    if 'value' in data: loan.value = float(data.get('value', 0.0))
    if 'quantity' in data: loan.quantity = int(data.get('quantity', 1))
    if 'notes' in data: loan.notes = (data.get('notes') or '').strip()
    
    db.session.commit()
    ensure_catalog_entry(loan.device_type, loan.brand, loan.model)
    log_activity(current_username(), 'Edición de Préstamo / Demo', f'Equipo Demo #{loan.id} ({loan.name}) actualizado.')
    return jsonify(loan.to_dict())

@app.route('/api/loans/<int:loan_id>', methods=['DELETE'])
def delete_loan(loan_id):
    loan = LoanDevice.query.get_or_404(loan_id)
    name = loan.name
    prov = loan.provider
    db.session.delete(loan)
    db.session.commit()
    log_activity(current_username(), 'Eliminación de Préstamo / Demo', f'Equipo Demo #{loan_id} ({name}, Proveedor: {prov}) eliminado.')
    return jsonify({'success': True, 'message': f'Equipo Demo #{loan_id} eliminado.'})

@app.route('/api/loans/<int:loan_id>/dispatch', methods=['POST'])
def dispatch_loan(loan_id):
    loan = LoanDevice.query.get_or_404(loan_id)
    data = request.json or {}
    
    loc = (data.get('location') or '').strip()
    disp = (data.get('dispatched_by') or '').strip()
    notes = (data.get('notes') or '').strip()
    
    if not loc:
        return jsonify({'error': 'La ubicación o destino de prueba es obligatorio'}), 400
        
    loan.status = 'En Pruebas / Instalado'
    loan.location = loc
    loan.dispatched_by = disp
    loan.warehouse = ''
    if notes:
        existing_notes = loan.notes or ''
        ts = datetime.utcnow().strftime('%Y-%m-%d')
        loan.notes = f"{existing_notes}\n[{ts} Despacho a Pruebas] Destino: {loc}. Responsable: {disp}. {notes}".strip()
        
    db.session.commit()
    log_activity(current_username(), 'Despacho de Demo a Pruebas', f'Equipo Demo #{loan.id} ({loan.name}) enviado a pruebas en {loc} por {disp}.')
    return jsonify(loan.to_dict())

@app.route('/api/loans/<int:loan_id>/return-to-warehouse', methods=['POST'])
def return_loan_to_warehouse(loan_id):
    loan = LoanDevice.query.get_or_404(loan_id)
    data = request.json or {}
    
    wh = (data.get('warehouse') or '').strip()
    notes = (data.get('notes') or '').strip()
    
    if not wh:
        return jsonify({'error': 'El almacén de resguardo es obligatorio'}), 400
        
    old_loc = loan.location
    loan.status = 'En Evaluación / Stock'
    loan.warehouse = wh
    loan.location = ''
    loan.dispatched_by = ''
    if notes:
        existing_notes = loan.notes or ''
        ts = datetime.utcnow().strftime('%Y-%m-%d')
        loan.notes = f"{existing_notes}\n[{ts} Retorno a Almacén] Reingresado a {wh} desde {old_loc}. {notes}".strip()
        
    db.session.commit()
    log_activity(current_username(), 'Retorno de Demo a Almacén', f'Equipo Demo #{loan.id} ({loan.name}) regresó a {wh} desde {old_loc}.')
    return jsonify(loan.to_dict())

@app.route('/api/loans/<int:loan_id>/return-to-provider', methods=['POST'])
def return_loan_to_provider(loan_id):
    loan = LoanDevice.query.get_or_404(loan_id)
    data = request.json or {}
    
    ret_date = data.get('returned_date') or datetime.utcnow().strftime('%Y-%m-%d')
    notes = (data.get('notes') or '').strip()
    
    loan.status = 'Devuelto al Proveedor'
    loan.returned_date = ret_date
    if notes:
        existing_notes = loan.notes or ''
        ts = datetime.utcnow().strftime('%Y-%m-%d')
        loan.notes = f"{existing_notes}\n[{ts} Devolución al Proveedor] Fecha de entrega: {ret_date}. {notes}".strip()
        
    db.session.commit()
    log_activity(current_username(), 'Devolución de Demo a Proveedor', f'Equipo Demo #{loan.id} ({loan.name}) devuelto formalmente al proveedor {loan.provider}.')
    return jsonify(loan.to_dict())

@app.route('/api/loans/<int:loan_id>/convert-to-inventory', methods=['POST'])
def convert_loan_to_inventory(loan_id):
    loan = LoanDevice.query.get_or_404(loan_id)
    data = request.json or {}
    
    target_status = data.get('status', 'En Stock' if loan.status == 'En Evaluación / Stock' else 'Despachado / Instalado')
    target_warehouse = data.get('warehouse', loan.warehouse) if target_status in ['En Stock', 'Reparado'] else ''
    target_location = data.get('location', loan.location) if target_status == 'Despachado / Instalado' else ''
    
    if target_status in ['En Stock', 'Reparado'] and not target_warehouse:
        target_warehouse = 'ALMACEN ADM' # fallback si no se especifico
        
    new_device = Device(
        name=loan.name,
        device_type=loan.device_type,
        brand=loan.brand,
        model=loan.model,
        serial_number=loan.serial_number,
        mac_address=loan.mac_address,
        status=target_status,
        warehouse=target_warehouse,
        location=target_location,
        dispatched_by=loan.dispatched_by if target_status == 'Despachado / Instalado' else '',
        description=f"Adquirido tras período de evaluación demo (Proveedor original: {loan.provider}). {loan.notes or ''}".strip(),
        value=float(data.get('value', loan.value)),
        quantity=int(data.get('quantity', loan.quantity))
    )
    
    loan.status = 'Comprado / Adquirido'
    db.session.add(new_device)
    db.session.commit()
    
    # Consolidar si es duplicado en inventario
    final_dev = merge_device_if_duplicate(new_device.id)
    ensure_catalog_entry(final_dev.device_type, final_dev.brand, final_dev.model)
    
    log_activity(current_username(), 'Conversión Demo a Inventario', f'Equipo Demo #{loan.id} ({loan.name}) comprado/adquirido y transferido a Inventario General como #{final_dev.id}.')
    return jsonify({
        'success': True,
        'message': f'Equipo #{loan.id} transferido exitosamente al Inventario General como #{final_dev.id}',
        'device': final_dev.to_dict(),
        'loan': loan.to_dict()
    })

# --- APIS PARA CONTROL DE HERRAMIENTAS DE TRABAJO ---
@app.route('/api/tools', methods=['GET'])
def get_tools():
    status = request.args.get('status')
    category = request.args.get('category')
    tech = request.args.get('technician')
    warehouse = request.args.get('warehouse')

    query = Tool.query
    if status and status != 'all':
        query = query.filter_by(status=status)
    if category and category != 'all':
        query = query.filter_by(category=category)
    if tech and tech != 'all':
        query = query.filter_by(assigned_to=tech)
    if warehouse and warehouse != 'all':
        query = query.filter_by(warehouse=warehouse)

    tools = query.order_by(Tool.name.asc()).all()
    all_tools = Tool.query.all()
    
    total_count = sum(t.quantity for t in all_tools)
    available_count = sum(t.quantity for t in all_tools if t.status == 'Disponible')
    in_use_count = sum(t.quantity for t in all_tools if t.status == 'En Uso / Asignada')
    maintenance_count = sum(t.quantity for t in all_tools if t.status == 'En Mantenimiento')
    total_val = sum((t.value or 0.0) * t.quantity for t in all_tools)

    return jsonify({
        'tools': [t.to_dict() for t in tools],
        'stats': {
            'total': total_count,
            'available': available_count,
            'in_use': in_use_count,
            'maintenance': maintenance_count,
            'total_value': total_val
        }
    })

@app.route('/api/tools', methods=['POST'])
def create_tool():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'El nombre de la herramienta es obligatorio'}), 400

    new_tool = Tool(
        code=(data.get('code') or '').strip(),
        name=name,
        category=(data.get('category') or 'General').strip(),
        brand=(data.get('brand') or '').strip(),
        model=(data.get('model') or '').strip(),
        serial_number=(data.get('serial_number') or '').strip(),
        condition=(data.get('condition') or 'Buena').strip(),
        status=(data.get('status') or 'Disponible').strip(),
        assigned_to=(data.get('assigned_to') or '').strip(),
        assigned_date=(data.get('assigned_date') or '').strip(),
        location=(data.get('location') or '').strip(),
        warehouse=(data.get('warehouse') or 'Taller IT').strip(),
        value=float(data.get('value', 0.0)),
        quantity=int(data.get('quantity', 1)),
        last_maintenance_date=(data.get('last_maintenance_date') or '').strip(),
        notes=(data.get('notes') or '').strip()
    )
    db.session.add(new_tool)
    db.session.flush()

    # Log inicial en ToolLog
    init_log = ToolLog(
        tool_id=new_tool.id,
        action='Registro Inicial',
        warehouse=new_tool.warehouse,
        condition=new_tool.condition,
        notes='Herramienta ingresada al catálogo del inventario.',
        performed_by=current_username(),
        date=datetime.utcnow().strftime('%Y-%m-%d')
    )
    db.session.add(init_log)

    db.session.commit()
    log_activity(current_username(), 'Registro de Herramienta', f'Herramienta {new_tool.name} ({new_tool.code or new_tool.serial_number}) registrada.')
    return jsonify(new_tool.to_dict()), 201

@app.route('/api/tools/<int:tool_id>', methods=['PUT'])
def update_tool(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    data = request.json or {}
    
    if 'name' in data: tool.name = data['name'].strip()
    if 'code' in data: tool.code = (data.get('code') or '').strip()
    if 'category' in data: tool.category = (data.get('category') or 'General').strip()
    if 'brand' in data: tool.brand = (data.get('brand') or '').strip()
    if 'model' in data: tool.model = (data.get('model') or '').strip()
    if 'serial_number' in data: tool.serial_number = (data.get('serial_number') or '').strip()
    if 'condition' in data: tool.condition = (data.get('condition') or 'Buena').strip()
    if 'status' in data: tool.status = (data.get('status') or 'Disponible').strip()
    if 'assigned_to' in data: tool.assigned_to = (data.get('assigned_to') or '').strip()
    if 'assigned_date' in data: tool.assigned_date = (data.get('assigned_date') or '').strip()
    if 'location' in data: tool.location = (data.get('location') or '').strip()
    if 'warehouse' in data: tool.warehouse = (data.get('warehouse') or '').strip()
    if 'value' in data: tool.value = float(data.get('value', 0.0))
    if 'quantity' in data: tool.quantity = int(data.get('quantity', 1))
    if 'last_maintenance_date' in data: tool.last_maintenance_date = (data.get('last_maintenance_date') or '').strip()
    if 'notes' in data: tool.notes = (data.get('notes') or '').strip()

    db.session.commit()
    log_activity(current_username(), 'Edición de Herramienta', f'Herramienta #{tool.id} ({tool.name}) actualizada.')
    return jsonify(tool.to_dict())

@app.route('/api/tools/<int:tool_id>', methods=['DELETE'])
def delete_tool(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    name = tool.name
    db.session.delete(tool)
    db.session.commit()
    log_activity(current_username(), 'Eliminar Herramienta', f'Herramienta #{tool_id} ({name}) eliminada.')
    return jsonify({'success': True, 'message': f'Herramienta #{tool_id} eliminada.'})

@app.route('/api/tools/<int:tool_id>/assign', methods=['POST'])
def assign_tool(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    data = request.json or {}
    tech = (data.get('assigned_to') or '').strip()
    loc = (data.get('location') or '').strip()
    date_str = data.get('assigned_date') or datetime.utcnow().strftime('%Y-%m-%d')
    notes = (data.get('notes') or '').strip()

    if not tech:
        return jsonify({'error': 'El técnico responsable es obligatorio'}), 400

    tool.status = 'En Uso / Asignada'
    tool.assigned_to = tech
    tool.assigned_date = date_str
    tool.location = loc

    # Registrar en ToolLog
    new_log = ToolLog(
        tool_id=tool.id,
        action='Asignación',
        technician=tech,
        location=loc,
        date=date_str,
        notes=notes or 'Asignada para tareas operativas',
        performed_by=current_username()
    )
    db.session.add(new_log)

    db.session.commit()
    log_activity(current_username(), 'Asignación de Herramienta', f'Herramienta #{tool.id} ({tool.name}) asignada a {tech} ({loc}).')
    return jsonify(tool.to_dict())

@app.route('/api/tools/<int:tool_id>/return', methods=['POST'])
def return_tool(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    data = request.json or {}
    condition = (data.get('condition') or tool.condition or 'Buena').strip()
    warehouse = (data.get('warehouse') or tool.warehouse or 'Taller IT').strip()
    date_str = datetime.utcnow().strftime('%Y-%m-%d')
    notes = (data.get('notes') or '').strip()

    prev_tech = tool.assigned_to or 'Técnico'
    prev_loc = tool.location or 'N/A'

    tool.status = 'Disponible'
    tool.assigned_to = ''
    tool.assigned_date = ''
    tool.location = ''
    tool.warehouse = warehouse
    tool.condition = condition

    # Registrar en ToolLog
    new_log = ToolLog(
        tool_id=tool.id,
        action='Devolución',
        technician=prev_tech,
        location=prev_loc,
        warehouse=warehouse,
        condition=condition,
        date=date_str,
        notes=notes or 'Devuelta al almacén/taller de resguardo',
        performed_by=current_username()
    )
    db.session.add(new_log)

    db.session.commit()
    log_activity(current_username(), 'Devolución de Herramienta', f'Herramienta #{tool.id} ({tool.name}) devuelta a {warehouse}.')
    return jsonify(tool.to_dict())

@app.route('/api/tools/<int:tool_id>/history', methods=['GET'])
def get_tool_history(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    logs = ToolLog.query.filter_by(tool_id=tool_id).order_by(ToolLog.timestamp.desc(), ToolLog.id.desc()).all()
    
    # Si aún no tiene logs pero tiene notas con historial concatenado previo [YYYY-MM-DD]...
    if not logs and tool.notes:
        legacy_found = False
        clean_notes = []
        for line in tool.notes.split('\n'):
            line_s = line.strip()
            if line_s.startswith('[') and ']' in line_s:
                try:
                    date_part = line_s[1:line_s.index(']')]
                    rest = line_s[line_s.index(']')+1:].strip()
                    action = 'Asignación' if 'Asignada a' in rest else ('Devolución' if 'Devuelta por' in rest else 'Movimiento')
                    
                    tech_match = ''
                    if 'Asignada a ' in rest:
                        tech_match = rest.split('Asignada a ')[1].split('(')[0].strip()
                    elif 'Devuelta por ' in rest:
                        tech_match = rest.split('Devuelta por ')[1].split('(')[0].strip()

                    loc_match = ''
                    if 'Lugar:' in rest:
                        loc_match = rest.split('Lugar:')[1].split(')')[0].strip()

                    note_text = rest.split('):')[-1].strip() if '):' in rest else rest

                    new_log = ToolLog(
                        tool_id=tool.id,
                        action=action,
                        technician=tech_match,
                        location=loc_match,
                        date=date_part,
                        notes=note_text,
                        performed_by='Histórico'
                    )
                    db.session.add(new_log)
                    legacy_found = True
                except Exception:
                    clean_notes.append(line)
            else:
                clean_notes.append(line)

        if legacy_found:
            tool.notes = '\n'.join(clean_notes).strip()
            db.session.commit()
            logs = ToolLog.query.filter_by(tool_id=tool_id).order_by(ToolLog.timestamp.desc(), ToolLog.id.desc()).all()

    return jsonify({
        'tool': tool.to_dict(),
        'history': [l.to_dict() for l in logs]
    })

@app.route('/api/tools/<int:tool_id>/decommission', methods=['POST'])
def decommission_tool(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    data = request.json or {}
    hotel_name = (data.get('hotel') or tool.location or '').strip()
    reason = (data.get('reason') or f"Herramienta dañada / fuera de servicio ({tool.condition})").strip()
    qty = int(data.get('quantity', tool.quantity or 1))
    val = float(data.get('value', tool.value or 0.0))

    if not hotel_name:
        first_hotel = Hotel.query.first()
        hotel_name = first_hotel.name if first_hotel else 'Excellence Punta Cana'

    dec_number = generate_decommission_number(hotel_name)

    new_dec = Decommission(
        decommission_number=dec_number,
        name=f"[Herramienta] {tool.name}",
        device_type=tool.category or 'Herramienta IT',
        brand=tool.brand or '',
        model=tool.model or '',
        serial_number=tool.serial_number or tool.code or f"HER-{tool.id:03d}",
        hotel=hotel_name,
        reason=reason,
        value=val,
        quantity=qty
    )
    db.session.add(new_dec)

    tool.status = 'Dañada'
    tool.condition = 'Dañada'
    tool.assigned_to = ''
    tool.assigned_date = ''
    tool.location = f"Decomiso ({hotel_name})"

    dec_log = ToolLog(
        tool_id=tool.id,
        action='Decomiso',
        technician='',
        location=hotel_name,
        warehouse='Baja / Decomiso',
        condition='Dañada',
        notes=f"Enviada a Decomiso con folio {dec_number}. Motivo: {reason}",
        performed_by=current_username(),
        date=datetime.utcnow().strftime('%Y-%m-%d')
    )
    db.session.add(dec_log)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        dec_number = generate_decommission_number(hotel_name)
        new_dec.decommission_number = dec_number
        db.session.add(new_dec)
        db.session.commit()

    log_activity(current_username(), 'Decomiso de Herramienta', f'Herramienta #{tool.id} ({tool.name}) enviada a decomiso con registro {dec_number}.')
    return jsonify({
        'success': True,
        'message': f'Herramienta enviada a Decomiso con folio {dec_number}',
        'decommission_number': dec_number,
        'tool': tool.to_dict(),
        'decommission': new_dec.to_dict()
    }), 201

@app.route('/api/devices', methods=['GET'])
def get_devices():
    devices = Device.query.all()
    return jsonify([d.to_dict() for d in devices])

@app.route('/api/devices', methods=['POST'])
def add_device():
    data = request.json
    status = data.get('status', 'En Stock')
    warehouse = (data.get('warehouse') or '').strip()
    
    if status in ['En Stock', 'Reparado'] and not warehouse:
        return jsonify({'error': 'El Almacén de Resguardo es obligatorio para equipos en Stock'}), 400
    
    cost_p = float(data.get('cost_price') or 0.0)
    qty = int(data.get('quantity', 1))
    val = float(data.get('value', 0.0))
    if not val and cost_p:
        val = cost_p * qty
    if not cost_p and val and qty:
        cost_p = val / qty

    new_device = Device(
        sku=(data.get('sku') or '').strip(),
        name=data['name'],
        device_type=data.get('type') or 'General',
        brand=data.get('brand', ''),
        model=data.get('model', ''),
        serial_number=data.get('serial_number', ''),
        mac_address=data.get('mac_address', ''),
        status=status,
        repair_count=int(data.get('repair_count', 0)),
        location=data.get('location', ''),
        warehouse=warehouse,
        dispatched_by=data.get('dispatched_by', ''),
        warranty_sent_by=data.get('warranty_sent_by', ''),
        warranty_provider=data.get('warranty_provider', '') or data.get('provider', ''),
        provider=data.get('provider', '') or data.get('warranty_provider', ''),
        cost_price=cost_p,
        profit_margin=float(data.get('profit_margin') or 0.0),
        sale_price_rd=float(data.get('sale_price_rd') or 0.0),
        sale_price_usd=float(data.get('sale_price_usd') or 0.0),
        sale_price_eur=float(data.get('sale_price_eur') or 0.0),
        min_stock=int(data.get('min_stock') or 0),
        description=data.get('description', ''),
        value=val,
        quantity=qty
    )
    
    if new_device.status == 'Reparación / Garantía':
        new_device.warranty_sent_date = datetime.utcnow()
        
    # Clean up status-dependent fields to ensure database consistency and correct duplicate consolidation
    if new_device.status in ['En Stock', 'Reparado']:
        new_device.location = ''
        new_device.dispatched_by = ''
    elif new_device.status == 'Despachado / Instalado':
        new_device.warehouse = ''
    else:
        new_device.warehouse = ''
        new_device.location = ''
        new_device.dispatched_by = ''

    db.session.add(new_device)
    db.session.commit()
    
    # Consolidate if duplicate exists
    final_device = merge_device_if_duplicate(new_device.id)
    
    # Auto-add to catalog if new type/brand/model
    ensure_catalog_entry(final_device.device_type, final_device.brand, final_device.model)
    
    log_activity(current_username(), 'Creación de Equipo', f'Equipo {final_device.name} (S/N: {final_device.serial_number}) añadido.')
    return jsonify(final_device.to_dict()), 201

@app.route('/api/devices/<int:device_id>', methods=['PUT'])
def update_device(device_id):
    device = Device.query.get_or_404(device_id)
    data = request.json
    
    old_status = device.status
    old_quantity = device.quantity
    old_warehouse = device.warehouse
    old_location = device.location
    
    new_status = data.get('status', old_status)
    new_quantity = int(data.get('quantity', old_quantity)) if 'quantity' in data else old_quantity
    new_warehouse = (data.get('warehouse') if 'warehouse' in data else (old_warehouse or '')).strip()
    new_location = data.get('location', old_location)
    
    if new_status in ['En Stock', 'Reparado'] and not new_warehouse:
        return jsonify({'error': 'El Almacén de Resguardo es obligatorio para equipos en Stock'}), 400
    
    is_different_location = (new_status != old_status) or (new_warehouse != old_warehouse) or (new_location != old_location)
    
    if is_different_location and 0 < new_quantity < old_quantity:
        # Split: create a clone holding the remaining quantity in the old state
        remaining_qty = old_quantity - new_quantity
        old_value = device.value or 0.0
        new_value = (new_quantity / old_quantity) * old_value
        remaining_value = old_value - new_value
        
        # Override value in data so that the normal updates below set it to new_value
        data['value'] = new_value
        
        cloned_device = Device(
            sku=device.sku,
            name=device.name,
            device_type=device.device_type,
            brand=device.brand,
            model=device.model,
            serial_number=device.serial_number,
            mac_address=device.mac_address,
            status=old_status,
            repair_count=device.repair_count,
            location=old_location,
            warehouse=old_warehouse,
            description=device.description,
            value=remaining_value,
            cost_price=device.cost_price,
            profit_margin=device.profit_margin,
            sale_price_rd=device.sale_price_rd,
            sale_price_usd=device.sale_price_usd,
            sale_price_eur=device.sale_price_eur,
            min_stock=device.min_stock,
            provider=device.provider,
            quantity=remaining_qty,
            dispatched_by=device.dispatched_by,
            warranty_sent_by=device.warranty_sent_by,
            warranty_sent_date=device.warranty_sent_date,
            warranty_received_date=device.warranty_received_date,
            warranty_provider=device.warranty_provider
        )
        db.session.add(cloned_device)
        log_activity(current_username(), 'Edición de Equipo (División)', 
                     f'Se dividió el lote de {device.name}. {new_quantity} unidades movidas a {new_status} (Valor: {new_value}) y {remaining_qty} unidades retenidas en {old_status} (Valor: {remaining_value}).')
    
    if 'sku' in data: device.sku = data['sku'].strip()
    if 'name' in data: device.name = data['name']
    if 'type' in data: device.device_type = data['type']
    if 'brand' in data: device.brand = data['brand']
    if 'model' in data: device.model = data['model']
    if 'serial_number' in data: device.serial_number = data['serial_number']
    if 'mac_address' in data: device.mac_address = data['mac_address']
    if 'cost_price' in data: device.cost_price = float(data['cost_price'] or 0.0)
    if 'profit_margin' in data: device.profit_margin = float(data['profit_margin'] or 0.0)
    if 'sale_price_rd' in data: device.sale_price_rd = float(data['sale_price_rd'] or 0.0)
    if 'sale_price_usd' in data: device.sale_price_usd = float(data['sale_price_usd'] or 0.0)
    if 'sale_price_eur' in data: device.sale_price_eur = float(data['sale_price_eur'] or 0.0)
    if 'min_stock' in data: device.min_stock = int(data['min_stock'] or 0)
    if 'provider' in data:
        device.provider = data['provider'].strip()
        device.warranty_provider = data['provider'].strip()
    
    if 'status' in data: 
        new_status = data['status']
        # Auto-incrementar el contador de reparaciones si regresa de reparación
        if old_status == 'En Reparación / Garantía' and new_status in ['Reparado', 'En Stock', 'Despachado / Instalado']:
            device.repair_count += 1
        device.status = new_status
        
    if 'repair_count' in data: device.repair_count = int(data['repair_count'])
    if 'location' in data: device.location = data['location']
    if 'warehouse' in data: device.warehouse = data['warehouse']
    if 'dispatched_by' in data: device.dispatched_by = data['dispatched_by']
    if 'warranty_sent_by' in data: device.warranty_sent_by = data['warranty_sent_by']
    if 'description' in data: device.description = data['description']
    if 'value' in data: device.value = float(data['value'])
    if 'quantity' in data: device.quantity = int(data['quantity'])

    # Warranty dates
    if 'warranty_sent_date' in data:
        if data['warranty_sent_date']:
            device.warranty_sent_date = datetime.strptime(data['warranty_sent_date'], '%Y-%m-%d')
        else:
            device.warranty_sent_date = None
            
    if 'warranty_received_date' in data:
        if data['warranty_received_date']:
            device.warranty_received_date = datetime.strptime(data['warranty_received_date'], '%Y-%m-%d')
        else:
            device.warranty_received_date = None
            
    # Auto-fill warranty dates if not provided but status changes via shortcuts
    if 'status' in data:
        new_status = data['status']
        if new_status == 'Reparación / Garantía' and not device.warranty_sent_date:
            device.warranty_sent_date = datetime.utcnow()
        if new_status == 'Reparado' and not device.warranty_received_date and device.status == 'Reparación / Garantía':
            device.warranty_received_date = datetime.utcnow()
            
    # Clean up status-dependent fields to ensure database consistency and correct duplicate consolidation
    if device.status in ['En Stock', 'Reparado']:
        device.location = ''
        device.dispatched_by = ''
    elif device.status == 'Despachado / Instalado':
        device.warehouse = ''
    else:
        device.warehouse = ''
        device.location = ''
        device.dispatched_by = ''
    
    db.session.commit()
    
    # Consolidate if duplicate exists
    final_device = merge_device_if_duplicate(device.id)
    
    log_activity(current_username(), 'Edición de Equipo', f'Equipo {final_device.name} modificado.')
    return jsonify(final_device.to_dict())

@app.route('/api/devices/<int:device_id>', methods=['DELETE'])
def delete_device(device_id):
    device = Device.query.get_or_404(device_id)
    log_activity(current_username(), 'Eliminación de Equipo', f'Equipo {device.name} eliminado.')
    db.session.delete(device)
    db.session.commit()
    return jsonify({'message': 'Device deleted'})

@app.route('/api/decommissions', methods=['GET'])
def get_decommissions():
    decommissions = Decommission.query.all()
    return jsonify([d.to_dict() for d in decommissions])

def generate_decommission_number(hotel_name, date=None):
    """
    Genera el numero de decomiso con formato: [SIGLA]-[ANIO]-[MES]-[SEQ]
    El secuencial reinicia en 001 cada mes por propiedad.
    La operacion es segura ante accesos concurrentes gracias al UNIQUE en BD.
    """
    if not date:
        date = datetime.utcnow()
    
    year  = date.strftime('%Y')
    month = date.strftime('%m')
    
    # Obtener sigla del hotel; si no tiene, usar las 3 primeras letras en mayusculas
    hotel = Hotel.query.filter_by(name=hotel_name).first()
    if hotel and hotel.sigla:
        sigla = hotel.sigla.upper().strip()
    else:
        sigla = (hotel_name[:3] if hotel_name else 'DEC').upper().replace(' ', '')
    
    prefix = f"{sigla}-{year}-{month}-"
    
    # Buscar el ultimo numero secuencial para esta propiedad/mes
    last = (
        Decommission.query
        .filter(Decommission.decommission_number.like(f"{prefix}%"))
        .order_by(Decommission.decommission_number.desc())
        .first()
    )
    
    if last and last.decommission_number:
        try:
            last_seq = int(last.decommission_number.split('-')[-1])
        except (ValueError, IndexError):
            last_seq = 0
    else:
        last_seq = 0
    
    next_seq = last_seq + 1
    return f"{prefix}{str(next_seq).zfill(3)}"


@app.route('/api/decommissions/preview-number', methods=['GET'])
def preview_decommission_number():
    """Retorna el siguiente numero disponible sin crear el registro."""
    hotel_name = request.args.get('hotel', '').strip()
    if not hotel_name:
        return jsonify({'error': 'Se requiere el nombre del hotel'}), 400
    number = generate_decommission_number(hotel_name)
    return jsonify({'decommission_number': number})


@app.route('/api/decommissions', methods=['POST'])
def add_decommission():
    data = request.json
    hotel_name = data.get('hotel', '')
    
    # Generar numero de decomiso automaticamente
    dec_number = generate_decommission_number(hotel_name)
    
    new_decommission = Decommission(
        decommission_number=dec_number,
        name=data['name'],
        device_type=data['type'],
        brand=data.get('brand', ''),
        model=data.get('model', ''),
        serial_number=data.get('serial_number', ''),
        hotel=hotel_name,
        reason=data.get('reason', ''),
        value=float(data.get('value', 0.0)),
        quantity=int(data.get('quantity', 1))
    )
    db.session.add(new_decommission)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # En caso de colision de numero unico (muy raro), reintentar una vez
        dec_number = generate_decommission_number(hotel_name)
        new_decommission.decommission_number = dec_number
        db.session.add(new_decommission)
        db.session.commit()
    
    log_activity(current_username(), 'Decomiso', f'Registro {dec_number}: {new_decommission.name} ({hotel_name})')
    return jsonify(new_decommission.to_dict()), 201

@app.route('/api/decommissions', methods=['DELETE'])
def clear_decommissions():
    try:
        num_rows_deleted = db.session.query(Decommission).delete()
        db.session.commit()
        return jsonify({'message': f'Deleted {num_rows_deleted} rows'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/decommissions/archive', methods=['GET'])
def get_archives():
    archives = DecommissionArchive.query.order_by(DecommissionArchive.date_archived.desc()).all()
    return jsonify([a.to_dict() for a in archives])

@app.route('/api/decommissions/archive', methods=['POST'])
def archive_decommissions():
    data = request.json
    period = data.get('period', 'Desconocido')
    hotel = data.get('hotel', 'all')
    
    if hotel == 'all':
        decommissions = Decommission.query.all()
    else:
        decommissions = Decommission.query.filter_by(hotel=hotel).all()
        
    if not decommissions:
        return jsonify({'error': 'No hay datos para archivar'}), 400
        
    total_value = sum(d.value for d in decommissions)
    data_dump = json.dumps([d.to_dict() for d in decommissions])
    
    archive_period = period if hotel == 'all' else f"{period} ({hotel})"
    
    archive = DecommissionArchive(
        period=archive_period,
        total_value=total_value,
        data_dump=data_dump
    )
    db.session.add(archive)
    
    if hotel == 'all':
        db.session.query(Decommission).delete()
    else:
        db.session.query(Decommission).filter_by(hotel=hotel).delete()
        
    db.session.commit()
    
    return jsonify(archive.to_dict()), 201

def format_spanish_date(dt=None):
    if not dt:
        dt = datetime.now()
    days = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    day_name = days[dt.weekday()]
    month_name = months[dt.month - 1]
    return f"{day_name} {dt.day:02d} {month_name} {dt.year}"

def load_pdf_logo(hotel_logo, default_logo_path, max_w=170, max_h=50):
    """
    Decodifica y procesa el logo para el PDF (soporta base64 data URI, ruta local de archivo y fallback al logo por defecto).
    Mantiene la proporción de aspecto dentro de los límites máximos (max_w, max_h).
    """
    if hotel_logo and isinstance(hotel_logo, str) and hotel_logo.strip():
        try:
            logo_str = hotel_logo.strip()
            image_bytes = None
            
            if ',' in logo_str:
                header, encoded = logo_str.split(',', 1)
                encoded = encoded.strip().replace('\n', '').replace('\r', '').replace(' ', '')
                image_bytes = base64.b64decode(encoded)
            elif logo_str.startswith('/static/') or logo_str.startswith('static/'):
                rel_path = logo_str.lstrip('/')
                full_path = os.path.join(basedir, rel_path)
                if os.path.exists(full_path):
                    with open(full_path, 'rb') as f:
                        image_bytes = f.read()
            elif os.path.exists(logo_str):
                with open(logo_str, 'rb') as f:
                    image_bytes = f.read()
            else:
                try:
                    clean_str = logo_str.replace('\n', '').replace('\r', '').replace(' ', '')
                    image_bytes = base64.b64decode(clean_str)
                except Exception:
                    pass

            if image_bytes:
                img_buf = BytesIO(image_bytes)
                pil_img = PILImage.open(img_buf)
                w, h = pil_img.size
                if w > 0 and h > 0:
                    aspect = w / h
                    if (max_w / max_h) > aspect:
                        draw_h = min(max_h, float(h))
                        draw_w = draw_h * aspect
                    else:
                        draw_w = min(max_w, float(w))
                        draw_h = draw_w / aspect
                else:
                    draw_w, draw_h = max_w, max_h
                
                img_buf.seek(0)
                return Image(img_buf, width=draw_w, height=draw_h)
        except Exception as e:
            print(f"[PDF LOGO WARNING] No se pudo procesar el logo del hotel: {e}")

    # Fallback al logo por defecto
    if os.path.exists(default_logo_path):
        try:
            with open(default_logo_path, 'rb') as f:
                img_buf = BytesIO(f.read())
            pil_img = PILImage.open(img_buf)
            w, h = pil_img.size
            if w > 0 and h > 0:
                aspect = w / h
                if (max_w / max_h) > aspect:
                    draw_h = min(max_h, float(h))
                    draw_w = draw_h * aspect
                else:
                    draw_w = min(max_w, float(w))
                    draw_h = draw_w / aspect
            else:
                draw_w, draw_h = max_w, max_h
            img_buf.seek(0)
            return Image(img_buf, width=draw_w, height=draw_h)
        except Exception:
            return Image(default_logo_path, width=170, height=45)

    return None

def create_decommission_pdf_buffer(data_list, params):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=28,
        rightMargin=28,
        topMargin=20,
        bottomMargin=20
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=12,
        alignment=TA_CENTER
    )
    
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10
    )
    
    val_style = ParagraphStyle(
        'ValStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10
    )
    
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=8.5
    )

    cell_center = ParagraphStyle(
        'CellCenter',
        parent=cell_style,
        alignment=TA_CENTER
    )

    cell_right = ParagraphStyle(
        'CellRight',
        parent=cell_style,
        alignment=TA_RIGHT
    )

    cell_bold_right = ParagraphStyle(
        'CellBoldRight',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        alignment=TA_RIGHT
    )

    story = []
    
    # 1. ENCABEZADO (LOGO E INFORMACIÓN DE CONTROL)
    default_logo_path = os.path.join(basedir, 'static', 'img', 'logo.png')
    hotel_logo_str = params.get('hotel_logo', '')
    
    img_logo = load_pdf_logo(hotel_logo_str, default_logo_path, max_w=220, max_h=52)
    
    if img_logo:
        logo_cell = img_logo
    else:
        hotel_tag_text = params.get('hotel_name') or params.get('location') or "LOGO DE LA EMPRESA"
        logo_cell = Paragraph(f"<b>{hotel_tag_text.upper()}</b>", title_style)
        
    no_control = params.get('no_control', '').strip()
    selected_type = (params.get('decommission_type') or 'BAJA DE EQUIPO').strip().upper()
    
    types_list = [
        "BAJA DE PRODUCTO",
        "BAJA DE ACTIVO",
        "BAJA DE EQUIPO",
        "DEVOLUCIÓN DE MERCANCIA AL PROVEEDOR",
        "RESGUARDO DE EQUIPO",
        "OTROS"
    ]
    
    type_lines = []
    for t in types_list:
        mark = "[X]" if t == selected_type else "[  ]"
        type_lines.append(f"<font size=7 color='#111111'><b>{mark}</b> {t}</font>")
    
    types_html = "<br/>".join(type_lines)
    
    control_str = f"<u>{no_control}</u>" if no_control else "________________________"
    control_box_html = f"<b>No. Control:</b> {control_str}<br/><br/>{types_html}"
    p_control = Paragraph(control_box_html, val_style)
    
    header_table = Table([[logo_cell, p_control]], colWidths=[280, 275])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (0,0), 1, colors.black),
        ('ALIGN', (0,0), (0,0), 'CENTER'),
        ('LEFTPADDING', (1,0), (1,0), 10),
    ]))
    
    story.append(header_table)
    story.append(Spacer(1, 8))
    
    # 2. DATOS GENERALES
    dept = params.get('department', 'SISTEMAS')
    location = params.get('location', 'EXCELLENCE PUNTA CANA')
    date_str = params.get('date_str') or format_spanish_date()
    applicant = params.get('applicant', '')
    
    meta_data = [
        [Paragraph("<b>Departamento:</b>", label_style), Paragraph(dept, val_style)],
        [Paragraph("<b>Ubicación:</b>", label_style), Paragraph(location, val_style)],
        [Paragraph("<b>Fecha:</b>", label_style), Paragraph(date_str, val_style)],
        [Paragraph("<b>Nombre que solicita:</b>", label_style), Paragraph(applicant, val_style)]
    ]
    
    meta_table = Table(meta_data, colWidths=[120, 435])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('LINEBELOW', (1,0), (1,-1), 0.5, colors.black),
    ]))
    
    story.append(meta_table)
    story.append(Spacer(1, 8))
    
    # 3. TABLA DE ARTÍCULOS
    table_headers = [
        Paragraph("<b>No</b>", cell_center),
        Paragraph("<b>Código/Artículo</b>", cell_center),
        Paragraph("<b>Cantidad</b>", cell_center),
        Paragraph("<b>Unidad</b>", cell_center),
        Paragraph("<b>Descripción</b>", cell_center),
        Paragraph("<b>Observación</b>", cell_center),
        Paragraph("<b>Costo Unitario</b>", cell_center),
        Paragraph("<b>Total $</b>", cell_center)
    ]
    
    table_data = [table_headers]
    total_general = 0.0
    
    idx = 1
    for item in data_list:
        qty = item.get('quantity', 1)
        val = item.get('value', 0.0)
        unit_cost = val / qty if qty > 0 else val
        line_total = val
        total_general += line_total
        
        serial = item.get('serial_number', '') or 'N/A'
        desc = item.get('name', '')
        if item.get('brand'):
            desc += f" {item['brand']}"
        if item.get('model'):
            desc += f" {item['model']}"
            
        obs = item.get('reason', 'DAÑADO') or 'DAÑADO'
        
        table_data.append([
            Paragraph(str(idx), cell_center),
            Paragraph(serial, cell_style),
            Paragraph(str(qty), cell_center),
            Paragraph(str(qty), cell_center),
            Paragraph(desc, cell_style),
            Paragraph(obs, cell_style),
            Paragraph(f"$ {unit_cost:,.2f}", cell_right),
            Paragraph(f"$ {line_total:,.2f}", cell_right)
        ])
        idx += 1
        
    # Completar con filas vacías para mantener estructura visual de plantilla si son menos de 13
    min_rows = max(13, len(data_list))
    while len(table_data) <= min_rows:
        table_data.append([
            Paragraph(str(idx), cell_center),
            Paragraph("", cell_style),
            Paragraph("", cell_center),
            Paragraph("", cell_center),
            Paragraph("", cell_style),
            Paragraph("", cell_style),
            Paragraph("", cell_right),
            Paragraph("", cell_right)
        ])
        idx += 1
        
    # Fila de Total
    table_data.append([
        Paragraph("", cell_style),
        Paragraph("", cell_style),
        Paragraph("", cell_style),
        Paragraph("", cell_style),
        Paragraph("", cell_style),
        Paragraph("<b>Total:</b>", cell_bold_right),
        Paragraph(f"<b>$ {total_general:,.2f}</b>", cell_bold_right),
        Paragraph("", cell_style)
    ])
    
    col_widths = [25, 95, 45, 40, 160, 75, 55, 60]
    items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    ts = [
        ('GRID', (0,0), (-1,-2), 0.5, colors.black),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F2F2F2')),
        ('SPAN', (5, -1), (5, -1)),
        ('SPAN', (6, -1), (7, -1)),
        ('BOX', (5, -1), (7, -1), 0.5, colors.black),
    ]
    items_table.setStyle(TableStyle(ts))
    
    story.append(items_table)
    story.append(Spacer(1, 8))
    
    # 4. MOTIVO DE BAJA Y OTROS
    motivo_txt = params.get('reason', 'Artículos de baja por término de vida útil o avería')
    otros_txt = params.get('other_notes', '')
    
    motivo_data = [
        [Paragraph("<b>Motivo de Baja:</b>", label_style), Paragraph(motivo_txt, val_style)],
        [Paragraph("<b>Otros:</b>", label_style), Paragraph(otros_txt, val_style)]
    ]
    motivo_table = Table(motivo_data, colWidths=[90, 465])
    motivo_table.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, colors.black),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.black),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    
    story.append(motivo_table)
    story.append(Spacer(1, 12))
    
    # 5. BLOQUE DE FIRMAS
    sig_style = ParagraphStyle(
        'SigStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        alignment=TA_CENTER
    )
    
    sig_title_style = ParagraphStyle(
        'SigTitleStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        alignment=TA_CENTER
    )
    
    f1_col1 = [
        Paragraph("Solicitado por:", sig_title_style),
        Spacer(1, 18),
        HRFlowable(width="80%", thickness=0.5, color=colors.black, spaceAfter=2),
        Paragraph("Gerente de Área", sig_style)
    ]
    
    f1_col2 = [
        Paragraph("Revisado por:", sig_title_style),
        Spacer(1, 18),
        HRFlowable(width="80%", thickness=0.5, color=colors.black, spaceAfter=2),
        Paragraph("Reporting & Accounting Assistant", sig_style)
    ]
    
    f1_col3 = [
        Paragraph("Verificado por:", sig_title_style),
        Spacer(1, 18),
        HRFlowable(width="80%", thickness=0.5, color=colors.black, spaceAfter=2),
        Paragraph("Gerente de Prevención", sig_style)
    ]
    
    table_signatures1 = Table([[f1_col1, f1_col2, f1_col3]], colWidths=[185, 185, 185])
    table_signatures1.setStyle(TableStyle([
        ('BOX', (0,0), (0,0), 0.5, colors.black),
        ('BOX', (1,0), (1,0), 0.5, colors.black),
        ('BOX', (2,0), (2,0), 0.5, colors.black),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    
    f2_col1 = [
        Paragraph("Aprobado por:", sig_title_style),
        Spacer(1, 18),
        HRFlowable(width="80%", thickness=0.5, color=colors.black, spaceAfter=2),
        Paragraph("Financial Controller", sig_style)
    ]
    
    f2_col2 = [
        Paragraph("Aprobado por:", sig_title_style),
        Spacer(1, 18),
        HRFlowable(width="80%", thickness=0.5, color=colors.black, spaceAfter=2),
        Paragraph("Director General", sig_style)
    ]
    
    table_signatures2 = Table([[f2_col1, f2_col2]], colWidths=[277.5, 277.5])
    table_signatures2.setStyle(TableStyle([
        ('BOX', (0,0), (0,0), 0.5, colors.black),
        ('BOX', (1,0), (1,0), 0.5, colors.black),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    
    signatures_block = KeepTogether([
        table_signatures1,
        table_signatures2
    ])
    
    story.append(signatures_block)
    
    doc.build(story)
    buffer.seek(0)
    return buffer

@app.route('/api/decommission/export/pdf', methods=['POST', 'GET'])
def export_decommission_pdf():
    if request.method == 'POST':
        params = request.json or {}
    else:
        params = request.args.to_dict()

    # Obtener datos de la propiedad seleccionada (por id o por nombre)
    hotel_id     = params.get('hotel_id')
    hotel_filter = params.get('hotel', 'all')
    hotel_obj    = None

    # 1. Intentar buscar por ID
    if hotel_id:
        try:
            hotel_obj = db.session.get(Hotel, int(hotel_id))
        except (ValueError, TypeError):
            pass

    # 2. Buscar por nombre o filtro de hotel
    if not hotel_obj and hotel_filter and hotel_filter != 'all':
        hotel_obj = Hotel.query.filter_by(name=hotel_filter).first()
        if not hotel_obj:
            hotel_obj = Hotel.query.filter(db.func.lower(Hotel.name) == hotel_filter.lower()).first()

    # 3. Determinar decomisos a exportar
    if hotel_obj:
        decommissions = Decommission.query.filter(db.func.lower(Decommission.hotel) == hotel_obj.name.lower()).all()
        if not decommissions:
            decommissions = Decommission.query.all()
    elif hotel_filter and hotel_filter != 'all':
        decommissions = Decommission.query.filter(db.func.lower(Decommission.hotel) == hotel_filter.lower()).all()
        if not decommissions:
            decommissions = Decommission.query.all()
    else:
        decommissions = Decommission.query.all()

    # 4. Auto-detectar hotel_obj si todos los decomisos a exportar pertenecen a una sola propiedad
    if not hotel_obj and decommissions:
        distinct_hotels = list(set([d.hotel for d in decommissions if d.hotel and d.hotel != 'No especificado']))
        if len(distinct_hotels) == 1:
            target_hotel_name = distinct_hotels[0]
            hotel_obj = Hotel.query.filter(db.func.lower(Hotel.name) == target_hotel_name.lower()).first()

    # 5. Inyectar metadatos del hotel (nombre, sigla, logo) de forma garantizada
    if hotel_obj:
        params['hotel_name']  = hotel_obj.name
        params['hotel_sigla'] = hotel_obj.sigla or ''
        params['hotel_logo']  = hotel_obj.logo  or ''
        loc_display           = hotel_obj.name.upper()
    elif hotel_filter and hotel_filter != 'all':
        h_match = Hotel.query.filter(db.func.lower(Hotel.name) == hotel_filter.lower()).first()
        if h_match:
            hotel_obj = h_match
            params['hotel_name']  = h_match.name
            params['hotel_sigla'] = h_match.sigla or ''
            params['hotel_logo']  = h_match.logo  or ''
            loc_display           = h_match.name.upper()
        else:
            params['hotel_name']  = hotel_filter
            loc_display           = hotel_filter.upper()
    else:
        params['hotel_name']  = "TODOS LOS HOTELES"
        loc_display           = "TODOS LOS HOTELES"

    data_list = [d.to_dict() for d in decommissions]

    if not params.get('location'):
        params['location'] = loc_display
    if not params.get('date_str'):
        params['date_str'] = format_spanish_date()

    pdf_buffer = create_decommission_pdf_buffer(data_list, params)

    sigla      = hotel_obj.sigla if hotel_obj and hotel_obj.sigla else (hotel_filter or 'decomiso')
    clean_name = sigla.replace(' ', '_').lower()
    filename   = f"Hoja_Decomiso_{clean_name}_{datetime.now().strftime('%Y%m%d')}.pdf"

    return send_file(
        pdf_buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename
    )


@app.route('/api/decommissions/archive/<int:archive_id>/pdf', methods=['GET'])
def export_archive_decommission_pdf(archive_id):
    archive = db.session.get(DecommissionArchive, archive_id)
    if not archive:
        return jsonify({'error': 'Archivo histórico no encontrado'}), 404

    try:
        data_list = json.loads(archive.data_dump)
    except Exception:
        data_list = []

    # Detectar hotel si aplica
    hotel_obj = None
    if data_list:
        distinct_hotels = list(set([d.get('hotel') for d in data_list if d.get('hotel') and d.get('hotel') != 'No especificado']))
        if len(distinct_hotels) == 1:
            hotel_obj = Hotel.query.filter(db.func.lower(Hotel.name) == distinct_hotels[0].lower()).first()

    params = {
        'no_control': f"HIST-{archive.id:04d}",
        'department': 'SISTEMAS',
        'decommission_type': 'BAJA DE EQUIPO',
        'applicant': 'HISTORIAL ARCHIVADO',
        'reason': f"Historial Archivado del periodo: {archive.period}",
        'other_notes': f"Archivo Histórico #{archive.id} • Fecha de Cierre: {archive.date_archived.strftime('%Y-%m-%d %H:%M:%S')}",
        'date_str': format_spanish_date(archive.date_archived)
    }

    if hotel_obj:
        params['hotel_name'] = hotel_obj.name
        params['hotel_sigla'] = hotel_obj.sigla or ''
        params['hotel_logo'] = hotel_obj.logo or ''
        params['location'] = hotel_obj.name.upper()
    else:
        params['hotel_name'] = f"HISTORIAL - {archive.period.upper()}"
        params['location'] = f"TODOS LOS HOTELES ({archive.period.upper()})"

    pdf_buffer = create_decommission_pdf_buffer(data_list, params)

    clean_period = archive.period.replace(' ', '_').replace('/', '_').lower()
    filename = f"Historial_Decomiso_{clean_period}_{archive.date_archived.strftime('%Y%m%d')}.pdf"

    return send_file(
        pdf_buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename
    )


# --- Settings API: Warehouses ---
@app.route('/api/settings/warehouses', methods=['GET'])
def get_warehouses():
    items = Warehouse.query.order_by(Warehouse.name).all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/settings/warehouses', methods=['POST'])
def add_warehouse():
    data = request.json
    name = data.get('name', '').strip()
    hotel = data.get('hotel', '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if Warehouse.query.filter_by(name=name).first():
        return jsonify({'error': 'Ya existe un almacén con ese nombre'}), 400
    w = Warehouse(name=name, hotel=hotel)
    db.session.add(w)
    db.session.commit()
    return jsonify(w.to_dict()), 201

@app.route('/api/settings/warehouses/<int:id>', methods=['PUT'])
def edit_warehouse(id):
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    w = Warehouse.query.get_or_404(id)
    data = request.json
    name = data.get('name', '').strip()
    hotel = data.get('hotel', '').strip()
    if not name:
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    
    existing = Warehouse.query.filter_by(name=name).first()
    if existing and existing.id != id:
        return jsonify({'error': 'Ya existe un almacén con ese nombre'}), 400
        
    w.name = name
    w.hotel = hotel
    db.session.commit()
    return jsonify(w.to_dict()), 200

@app.route('/api/settings/warehouses/<int:id>', methods=['DELETE'])
def delete_warehouse(id):
    w = Warehouse.query.get_or_404(id)
    db.session.delete(w)
    db.session.commit()
    return '', 204

# --- Settings API: Hotels ---
@app.route('/api/settings/hotels', methods=['GET'])
def get_hotels():
    items = Hotel.query.order_by(Hotel.name).all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/settings/hotels', methods=['POST'])
def add_hotel():
    data = request.json
    name  = data.get('name', '').strip()
    sigla = data.get('sigla', '').strip().upper()
    logo  = data.get('logo', '').strip()
    if not name:
        return jsonify({'error': 'El nombre es requerido'}), 400
    if not sigla:
        return jsonify({'error': 'La sigla es requerida'}), 400
    if Hotel.query.filter_by(name=name).first():
        return jsonify({'error': 'Ya existe un hotel con ese nombre'}), 400
    if Hotel.query.filter_by(sigla=sigla).first():
        return jsonify({'error': f'La sigla "{sigla}" ya esta en uso por otra propiedad'}), 400
    h = Hotel(name=name, sigla=sigla, logo=logo)
    db.session.add(h)
    db.session.commit()

    # Aplicar automáticamente la plantilla global estándar de TEC-RADIOS
    try:
        apply_radio_template_to_hotel(h.id)
    except Exception as e:
        print(f"[AUTO APPLY RADIO TEMPLATE] Error en hotel #{h.id}: {e}")

    log_activity(current_username(), 'Configuracion Hoteles', f'Se agrego la propiedad: {name} ({sigla}) y su estructura TEC-RADIOS.')
    return jsonify(h.to_dict()), 201

@app.route('/api/settings/hotels/<int:id>', methods=['PUT'])
def update_hotel(id):
    h = Hotel.query.get_or_404(id)
    data  = request.json
    name  = data.get('name', h.name).strip()
    sigla = data.get('sigla', h.sigla or '').strip().upper()
    logo  = data.get('logo', h.logo or '').strip()
    # Validar unicidad excluyendo el mismo registro
    conflict_name = Hotel.query.filter(Hotel.name == name, Hotel.id != id).first()
    if conflict_name:
        return jsonify({'error': 'Ya existe un hotel con ese nombre'}), 400
    if sigla:
        conflict_sigla = Hotel.query.filter(Hotel.sigla == sigla, Hotel.id != id).first()
        if conflict_sigla:
            return jsonify({'error': f'La sigla "{sigla}" ya esta en uso por otra propiedad'}), 400
    h.name  = name
    h.sigla = sigla
    h.logo  = logo
    db.session.commit()
    log_activity(current_username(), 'Configuracion Hoteles', f'Se edito la propiedad: {name} ({sigla})')
    return jsonify(h.to_dict())

@app.route('/api/settings/hotels/<int:id>', methods=['DELETE'])
def delete_hotel(id):
    h = Hotel.query.get_or_404(id)
    db.session.delete(h)
    db.session.commit()
    return '', 204

@app.route('/api/settings/technicians', methods=['GET'])
def get_technicians():
    items = Technician.query.order_by(Technician.name.asc()).all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/settings/technicians', methods=['POST'])
def add_technician():
    data = request.json
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'El nombre del técnico es requerido'}), 400
    if Technician.query.filter_by(name=name).first():
        return jsonify({'error': 'Ya existe un técnico con ese nombre'}), 400
    item = Technician(name=name)
    db.session.add(item)
    db.session.commit()
    log_activity(current_username(), 'Nuevo Técnico', f'Técnico {item.name} creado.')
    return jsonify(item.to_dict()), 201

@app.route('/api/settings/technicians/<int:id>', methods=['DELETE'])
def delete_technician(id):
    item = Technician.query.get_or_404(id)
    log_activity(current_username(), 'Eliminar Técnico', f'Técnico {item.name} eliminado.')
    db.session.delete(item)
    db.session.commit()
    return '', 204

@app.route('/api/settings/providers', methods=['GET'])
def get_providers():
    items = Provider.query.order_by(Provider.name.asc()).all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/settings/providers', methods=['POST'])
def add_provider():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'El nombre del proveedor / empresa es obligatorio'}), 400
    
    rnc = (data.get('rnc') or '').strip()
    contact_name = (data.get('contact_name') or '').strip()
    phone = (data.get('phone') or '').strip()
    email = (data.get('email') or '').strip()
    products = data.get('products', [])
    products_notes = json.dumps(products) if isinstance(products, list) else '[]'

    existing = Provider.query.filter(db.func.lower(Provider.name) == name.lower()).first()
    if existing:
        existing.rnc = rnc or existing.rnc
        existing.contact_name = contact_name or existing.contact_name
        existing.phone = phone or existing.phone
        existing.email = email or existing.email
        if products:
            existing.products_notes = products_notes
        db.session.commit()
        log_activity(current_username(), 'Actualizar Proveedor', f'Proveedor {existing.name} actualizado.')
        return jsonify(existing.to_dict()), 200

    item = Provider(
        name=name,
        rnc=rnc,
        contact_name=contact_name,
        phone=phone,
        email=email,
        products_notes=products_notes
    )
    db.session.add(item)
    db.session.commit()
    log_activity(current_username(), 'Nuevo Proveedor', f'Proveedor {item.name} creado con detalles.')
    return jsonify(item.to_dict()), 201

@app.route('/api/settings/providers/<int:id>', methods=['PUT'])
def update_provider(id):
    item = Provider.query.get_or_404(id)
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'El nombre del proveedor es obligatorio'}), 400
    
    existing = Provider.query.filter(db.func.lower(Provider.name) == name.lower()).first()
    if existing and existing.id != id:
        return jsonify({'error': 'Ya existe otro proveedor con ese nombre'}), 400

    item.name = name
    item.rnc = (data.get('rnc') or '').strip()
    item.contact_name = (data.get('contact_name') or '').strip()
    item.phone = (data.get('phone') or '').strip()
    item.email = (data.get('email') or '').strip()
    products = data.get('products', [])
    item.products_notes = json.dumps(products) if isinstance(products, list) else '[]'
    
    db.session.commit()
    log_activity(current_username(), 'Editar Proveedor', f'Proveedor #{item.id} ({item.name}) actualizado.')
    return jsonify(item.to_dict()), 200

@app.route('/api/settings/providers/<int:id>', methods=['DELETE'])
def delete_provider(id):
    item = Provider.query.get_or_404(id)
    log_activity(current_username(), 'Eliminar Proveedor', f'Proveedor {item.name} eliminado.')
    db.session.delete(item)
    db.session.commit()
    return '', 204

@app.route('/api/settings/users', methods=['GET'])
def get_users():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    users = User.query.all()
    return jsonify([u.to_dict() for u in users])

@app.route('/api/settings/users', methods=['POST'])
def add_user():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = data.get('password')
    role = data.get('role', 'Viewer')
    perms = data.get('permissions', [])
    perms_json = json.dumps(perms) if isinstance(perms, list) else '[]'

    if not username or not password:
        return jsonify({'error': 'Usuario y contraseña son requeridos'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'El usuario ya existe'}), 400
    
    new_user = User(username=username, role=role, permissions=perms_json)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    log_activity(current_username(), 'Nuevo Usuario', f'Usuario {new_user.username} (Rol: {new_user.role}) creado.')
    return jsonify(new_user.to_dict()), 201

@app.route('/api/settings/users/<int:id>', methods=['PUT'])
def update_user(id):
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    user = User.query.get_or_404(id)
    data = request.json or {}
    
    new_username = (data.get('username') or user.username).strip()
    if new_username != user.username:
        conflict = User.query.filter(User.username == new_username, User.id != id).first()
        if conflict:
            return jsonify({'error': 'El nombre de usuario ya está en uso'}), 400
        user.username = new_username

    if 'role' in data:
        user.role = data['role']
    
    if 'permissions' in data:
        perms = data['permissions']
        user.permissions = json.dumps(perms) if isinstance(perms, list) else '[]'

    if data.get('password') and len(data.get('password', '')) >= 6:
        user.set_password(data['password'])

    db.session.commit()
    log_activity(current_username(), 'Editar Usuario', f'Usuario #{user.id} ({user.username}) actualizado (Rol: {user.role}).')
    return jsonify(user.to_dict()), 200

@app.route('/api/settings/users/<int:id>', methods=['DELETE'])
def delete_user(id):
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    user = User.query.get_or_404(id)
    if user.username == 'admin':
        return jsonify({'error': 'No se puede eliminar el usuario admin principal'}), 400
    if user.id == session.get('user_id'):
        return jsonify({'error': 'No te puedes eliminar a ti mismo'}), 400
    log_activity(current_username(), 'Eliminar Usuario', f'Usuario {user.username} eliminado.')
    db.session.delete(user)
    db.session.commit()
    return '', 204

@app.route('/api/settings/users/<int:id>/password', methods=['PUT'])
def reset_user_password(id):
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    
    user = User.query.get_or_404(id)
    data = request.json
    new_pass = data.get('new_password')
    
    if not new_pass or len(new_pass) < 6:
        return jsonify({'error': 'La contraseña debe tener al menos 6 caracteres'}), 400
        
    user.set_password(new_pass)
    log_activity(current_username(), 'Restablecer Contraseña', f'Se restableció la contraseña del usuario {user.username}.')
    db.session.commit()
    return jsonify({'message': 'Contraseña actualizada correctamente'})

# --- Auth API ---
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        session['user_id'] = user.id
        session['role'] = user.to_dict()['role']
        session.permanent = True
        log_activity(user.username, 'Login', 'Inicio de sesión exitoso.')
        return jsonify({'message': 'Logged in', 'user': user.to_dict()})
    return jsonify({'error': 'Credenciales inválidas'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    username = current_username()
    if username != "Sistema":
        log_activity(username, "Logout", "Cierre de sesión.")
    session.pop('user_id', None)
    session.pop('role', None)
    return jsonify({'message': 'Logged out'})

@app.route('/api/logs', methods=['GET'])
def get_logs():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    logs = ActivityLog.query.order_by(ActivityLog.timestamp.desc()).limit(200).all()
    return jsonify([log.to_dict() for log in logs])

@app.route('/api/me', methods=['GET'])
def get_me():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            return jsonify({'logged_in': True, 'user': user.to_dict()})
    return jsonify({'logged_in': False}), 401

@app.route('/api/me/password', methods=['PUT'])
def change_password():
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    data = request.json
    current_pass = data.get('current_password')
    new_pass = data.get('new_password')
    
    user = User.query.get(session['user_id'])
    if not user.check_password(current_pass):
        return jsonify({'error': 'La contraseña actual es incorrecta'}), 400
        
    user.set_password(new_pass)
    log_activity(user.username, 'Cambio de Contraseña', 'El usuario actualizó su contraseña.')
    db.session.commit()
    return jsonify({'message': 'Contraseña actualizada correctamente'})

STOCK_LIMITS_FILE = os.path.join(basedir, 'stock_limits.json')

@app.route('/api/settings/stock-limits', methods=['GET'])
def get_stock_limits():
    limits = {}
    if os.path.exists(STOCK_LIMITS_FILE):
        try:
            with open(STOCK_LIMITS_FILE, 'r', encoding='utf-8') as f:
                limits = json.load(f)
        except Exception as e:
            print(f"Error reading stock limits: {e}")
    return jsonify(limits)

@app.route('/api/settings/stock-limits', methods=['POST'])
def save_stock_limits():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    try:
        data = request.json
        with open(STOCK_LIMITS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        log_activity(current_username(), 'Configuración Stock Mínimo', 'Se actualizaron los límites de stock mínimo.')
        return jsonify({'message': 'Configuración guardada correctamente'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

CATALOG_FILE = os.path.join(basedir, 'equipment_catalog.json')

@app.route('/api/settings/catalog', methods=['GET'])
def get_catalog():
    catalog = []
    if os.path.exists(CATALOG_FILE):
        try:
            with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
        except Exception as e:
            print(f"Error reading catalog: {e}")
    else:
        # Prepopulate catalog using existing devices in SQLite database to avoid starting from empty
        try:
            rows = db.session.query(Device.device_type, Device.brand, Device.model).distinct().all()
            for r in rows:
                catalog.append({
                    'type': r.device_type,
                    'brand': r.brand if r.brand else '',
                    'model': r.model if r.model else ''
                })
            # Save initialized catalog
            with open(CATALOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(catalog, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Error pre-populating catalog: {e}")
    return jsonify(catalog)

@app.route('/api/settings/catalog', methods=['POST'])
def save_catalog_entry():
    try:
        entry = request.json
        if not entry or not entry.get('type'):
            return jsonify({'error': 'El tipo de equipo es obligatorio'}), 400
        catalog = []
        if os.path.exists(CATALOG_FILE):
            with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
        
        dtype = entry.get('type', '').strip()
        dbrand = entry.get('brand', '').strip()
        dmodel = entry.get('model', '').strip()
        
        # Check duplicate
        exists = any(
            item.get('type') == dtype and 
            item.get('brand') == dbrand and 
            item.get('model') == dmodel 
            for item in catalog
        )
        if not exists:
            catalog.append({
                'type': dtype,
                'brand': dbrand,
                'model': dmodel
            })
            with open(CATALOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(catalog, f, indent=4, ensure_ascii=False)
            log_activity(current_username(), 'Catálogo Equipos', f"Se agregó al catálogo: {dbrand} {dmodel} ({dtype})")
            return jsonify({'message': 'Agregado correctamente al catálogo'}), 200
        else:
            return jsonify({'message': 'Ya existía en el catálogo'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/catalog', methods=['PUT'])
def edit_catalog_entry():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    try:
        payload = request.json
        old_entry = payload.get('old')
        new_entry = payload.get('new')
        if not old_entry or not new_entry:
            return jsonify({'error': 'Faltan datos de edición'}), 400
            
        catalog = []
        if os.path.exists(CATALOG_FILE):
            with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
                
        # Check duplicate if the new item differs
        if old_entry != new_entry:
            exists = any(
                item.get('type') == new_entry.get('type') and 
                item.get('brand') == new_entry.get('brand') and 
                item.get('model') == new_entry.get('model') 
                for item in catalog
            )
            if exists:
                return jsonify({'error': 'El nuevo modelo ya existe en el catálogo'}), 400

        # Replace
        found = False
        for i, item in enumerate(catalog):
            if (item.get('type') == old_entry.get('type') and 
                item.get('brand') == old_entry.get('brand') and 
                item.get('model') == old_entry.get('model')):
                catalog[i] = new_entry
                found = True
                break
                
        if found:
            with open(CATALOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(catalog, f, indent=4, ensure_ascii=False)
            log_activity(current_username(), 'Catálogo Equipos', f"Se editó modelo: {old_entry.get('model')} -> {new_entry.get('model')}")
            return jsonify({'message': 'Modelo actualizado correctamente'}), 200
        else:
            return jsonify({'error': 'No se encontró la entrada original'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/catalog/delete', methods=['POST'])
def delete_catalog_entry():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    try:
        entry = request.json
        catalog = []
        if os.path.exists(CATALOG_FILE):
            with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
        
        # Filter out the matching entry
        new_catalog = [
            item for item in catalog 
            if not (item.get('type') == entry.get('type') and 
                    item.get('brand') == entry.get('brand') and 
                    item.get('model') == entry.get('model'))
        ]
        
        with open(CATALOG_FILE, 'w', encoding='utf-8') as f:
            json.dump(new_catalog, f, indent=4, ensure_ascii=False)
        log_activity(current_username(), 'Catálogo Equipos', f"Se eliminó modelo del catálogo: {entry.get('brand')} {entry.get('model')}")
        return jsonify({'message': 'Modelo eliminado correctamente del catálogo'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==========================================
# SCHEDULER DE ALERTAS AUTOMÁTICAS EN BACKGROUND
# ================================================

def load_alert_state():
    """Carga el estado del último envío de alertas automáticas."""
    if os.path.exists(ALERT_STATE_FILE):
        try:
            with open(ALERT_STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'last_alert_sent_at': None, 'last_alert_count': 0, 'last_run_at': None, 'last_run_status': 'never'}

def save_alert_state(state):
    """Guarda el estado del scheduler en disco."""
    try:
        with open(ALERT_STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"[SCHEDULER] Error guardando alert_state.json: {e}")

def run_inactivity_alert_job():
    """
    Job del scheduler: detecta tareas vencidas y envia correo de alerta.
    Corre automaticamente en background sin necesidad de usuarios conectados.
    Implementa anti-spam: solo envia si han pasado N horas desde el ultimo envio.
    """
    with app.app_context():
        now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
        print(f"[SCHEDULER] Ejecutando revision de inactividad - {now_str}")
        state = load_alert_state()
        
        try:
            # Obtener todas las tareas activas
            tasks = OperationalTask.query.all()
            stale_tasks = [t.to_dict() for t in tasks if t.to_dict().get('is_stale')]
            
            state['last_run_at'] = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
            state['last_run_status'] = f'OK - {len(stale_tasks)} tarea(s) vencidas de {len(tasks)} totales'
            
            print(f"[SCHEDULER] Encontradas {len(stale_tasks)} tarea(s) vencidas de {len(tasks)} totales.")
            
            if not stale_tasks:
                save_alert_state(state)
                return
            
            # Verificar configuracion de email
            email_settings = load_email_settings()
            if not email_settings.get('enabled'):
                print("[SCHEDULER] Notificaciones por correo desactivadas. Saltando envio.")
                save_alert_state(state)
                return
            
            # Anti-spam: verificar si ya se envio una alerta recientemente
            inactivity_cfg = load_inactivity_settings()
            alert_interval_hours = int(inactivity_cfg.get('alert_interval_hours', 1))
            
            last_sent = state.get('last_alert_sent_at')
            if last_sent:
                try:
                    last_sent_dt = datetime.strptime(last_sent, '%Y-%m-%d %H:%M:%S')
                    elapsed_hours = (datetime.utcnow() - last_sent_dt).total_seconds() / 3600
                    if elapsed_hours < alert_interval_hours:
                        remaining = round(alert_interval_hours - elapsed_hours, 1)
                        print(f"[SCHEDULER] Anti-spam activo: faltan {remaining}h para el proximo envio.")
                        save_alert_state(state)
                        return
                except Exception:
                    pass
            
            # Construir cuerpo del correo
            rows = "".join([
                f"<tr>"
                f"<td style='padding:8px;border:1px solid #ddd;'>#{t['id']} - {t['title']}</td>"
                f"<td style='padding:8px;border:1px solid #ddd;'>{t.get('hotel', '') or 'N/A'}</td>"
                f"<td style='padding:8px;border:1px solid #ddd;'>{t.get('technician_name', '') or 'Sin Asignar'}</td>"
                f"<td style='padding:8px;border:1px solid #ddd;'>{t.get('priority', '')}</td>"
                f"<td style='padding:8px;border:1px solid #ddd;color:#c0392b;font-weight:bold;'>"
                f"Inactivo {t['hours_inactive']} hrs (Limite: {t['inactivity_threshold_hours']} hrs)</td>"
                f"</tr>"
                for t in stale_tasks
            ])
            
            body = f"""
            <div style='font-family:Arial,sans-serif;max-width:700px;margin:auto;'>
                <div style='background:#c0392b;color:white;padding:20px;border-radius:8px 8px 0 0;'>
                    <h2 style='margin:0;'>ALERTA AUTOMATICA - Pendientes con Inactividad Vencida</h2>
                    <p style='margin:5px 0 0 0;opacity:0.85;'>APP-INVENTORY - Seguimiento Operativo</p>
                </div>
                <div style='border:1px solid #ddd;border-top:none;padding:20px;background:#fff;'>
                    <p>Se detectaron <strong>{len(stale_tasks)} pendiente(s)</strong> que superaron su tiempo limite de inactividad (SLA) al <strong>{now_str}</strong>:</p>
                    <table style='border-collapse:collapse;width:100%;font-size:13px;'>
                        <thead>
                            <tr style='background:#f5f5f5;'>
                                <th style='padding:8px;border:1px solid #ddd;text-align:left;'>Tarea / Proyecto</th>
                                <th style='padding:8px;border:1px solid #ddd;text-align:left;'>Hotel</th>
                                <th style='padding:8px;border:1px solid #ddd;text-align:left;'>Tecnico</th>
                                <th style='padding:8px;border:1px solid #ddd;text-align:left;'>Prioridad</th>
                                <th style='padding:8px;border:1px solid #ddd;text-align:left;'>Inactividad</th>
                            </tr>
                        </thead>
                        <tbody>{rows}</tbody>
                    </table>
                    <p style='margin-top:20px;'>Por favor ingresa a <strong>APP-INVENTORY</strong> para actualizar los avances de estos pendientes.</p>
                    <p style='color:#888;font-size:11px;'>Este correo fue generado automaticamente por el scheduler de alertas de APP-INVENTORY. Intervalo configurado: cada {alert_interval_hours} hora(s).</p>
                </div>
            </div>
            """
            
            success, msg = send_email_alert(
                subject=f"[APP-INVENTORY] ALERTA: {len(stale_tasks)} Pendiente(s) con Inactividad Vencida",
                body=body
            )
            
            if success:
                state['last_alert_sent_at'] = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
                state['last_alert_count'] = len(stale_tasks)
                print(f"[SCHEDULER] OK - Correo de alerta enviado correctamente ({len(stale_tasks)} tarea(s)).")
            else:
                print(f"[SCHEDULER] ERROR enviando correo: {msg}")
                state['last_run_status'] = f'ERROR email: {msg}'
            
            save_alert_state(state)
            
        except Exception as e:
            print(f"[SCHEDULER] ERROR inesperado en el job: {e}")
            state['last_run_status'] = f'ERROR: {str(e)}'
            state['last_run_at'] = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
            save_alert_state(state)


# ENDPOINTS PENDIENTES Y SEGUIMIENTO OPERATIVO
# ==========================================

INACTIVITY_SETTINGS_FILE = os.path.join(basedir, 'inactivity_settings.json')

def load_inactivity_settings():
    if os.path.exists(INACTIVITY_SETTINGS_FILE):
        try:
            with open(INACTIVITY_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'timeout_minutes': 5}

@app.route('/api/settings/inactivity-timeout', methods=['GET'])
def get_inactivity_settings():
    return jsonify(load_inactivity_settings())

@app.route('/api/settings/inactivity-timeout', methods=['POST'])
def save_inactivity_settings():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    try:
        data = request.json
        mins = int(data.get('timeout_minutes', 5))
        alert_interval = int(data.get('alert_interval_hours', 1))
        cfg = {
            'timeout_minutes': mins,
            'alert_interval_hours': alert_interval
        }
        with open(INACTIVITY_SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=4)
        log_activity(current_username(), 'Configuración Inactividad', f'Se actualizó el tiempo de inactividad a {mins} minutos. Intervalo de alerta: {alert_interval}h.')
        return jsonify({'message': 'Configuración de inactividad guardada correctamente', 'timeout_minutes': mins, 'alert_interval_hours': alert_interval})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduler/status', methods=['GET'])
def get_scheduler_status():
    """Retorna el estado actual del scheduler de alertas automáticas."""
    state = load_alert_state()
    inactivity_cfg = load_inactivity_settings()
    email_cfg = load_email_settings()
    
    # Contar tareas vencidas actualmente
    try:
        tasks = OperationalTask.query.all()
        stale_count = sum(1 for t in tasks if t.to_dict().get('is_stale'))
    except Exception:
        stale_count = -1
    
    return jsonify({
        'scheduler_running': True,
        'alert_interval_hours': inactivity_cfg.get('alert_interval_hours', 1),
        'email_enabled': email_cfg.get('enabled', False),
        'last_run_at': state.get('last_run_at'),
        'last_run_status': state.get('last_run_status', 'never'),
        'last_alert_sent_at': state.get('last_alert_sent_at'),
        'last_alert_count': state.get('last_alert_count', 0),
        'current_stale_count': stale_count
    })

@app.route('/api/scheduler/run-now', methods=['POST'])
def trigger_scheduler_now():
    """Endpoint de administración para disparar el job manualmente (solo Admins)."""
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    try:
        # Resetear last_alert_sent_at para forzar el envío
        state = load_alert_state()
        state['last_alert_sent_at'] = None
        save_alert_state(state)
        # Ejecutar en hilo para no bloquear la respuesta HTTP
        t = threading.Thread(target=run_inactivity_alert_job, daemon=True)
        t.start()
        return jsonify({'message': 'Job de alertas disparado manualmente. Revisa la consola para ver el resultado.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/email', methods=['GET'])
def get_email_settings():
    return jsonify(load_email_settings())

@app.route('/api/settings/email', methods=['POST'])
def save_email_settings():
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    try:
        data = request.json
        with open(EMAIL_SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
            
        send_test = data.get('send_test_email')
        test_msg = ""
        if send_test:
            success, msg = send_email_alert(
                subject="[APP-INVENTORY] Correo de Prueba de Notificaciones",
                body="<h3>Configuración SMTP Exitosa</h3><p>Este es un correo de prueba enviado desde APP-INVENTORY para confirmar la recepción de alertas de seguimiento operativo.</p>",
                ignore_enabled=True,
                override_settings=data
            )
            if not success:
                return jsonify({'message': 'Configuración guardada pero falló el envío de prueba', 'email_error': msg}), 400
            test_msg = " Y correo de prueba enviado."
            
        log_activity(current_username(), 'Configuración Email', 'Se actualizaron las opciones del servidor SMTP')
        return jsonify({'message': f'Configuración de correo guardada correctamente.{test_msg}'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/operational-tasks/inactivity-check', methods=['GET'])
def check_inactivity_tasks():
    tasks = OperationalTask.query.all()
    stale_tasks = [t.to_dict() for t in tasks if t.to_dict().get('is_stale')]
    
    send_email = request.args.get('send_email', 'false').lower() == 'true'
    if send_email and stale_tasks:
        rows = "".join([
            f"<tr><td style='padding:8px;border:1px solid #ddd;'>#{t['id']} {t['title']}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>{t['hotel']}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>{t['technician_name'] or 'Sin Asignar'}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;color:red;'>Inactivo {t['hours_inactive']} hrs (Límite: {t['inactivity_threshold_hours']} hrs)</td></tr>"
            for t in stale_tasks
        ])
        body = f"""
        <h2>Alerta de Pendientes e Inactividad en Operaciones</h2>
        <p>Se han detectado <strong>{len(stale_tasks)} pendientes</strong> sin avances que sobrepasaron su tiempo límite (SLA):</p>
        <table style='border-collapse:collapse;width:100%;'>
            <thead>
                <tr style='background:#f2f2f2;'>
                    <th style='padding:8px;border:1px solid #ddd;'>Tarea / Proyecto</th>
                    <th style='padding:8px;border:1px solid #ddd;'>Hotel</th>
                    <th style='padding:8px;border:1px solid #ddd;'>Técnico</th>
                    <th style='padding:8px;border:1px solid #ddd;'>Inactividad</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
        <p><br>Por favor ingresa a APP-INVENTORY para coordinar los avances.</p>
        """
        send_email_alert("[APP-INVENTORY] ALERTA: Pendientes e Inactividad Operativa", body)
        
    return jsonify({'stale_tasks': stale_tasks, 'count': len(stale_tasks)})

@app.route('/api/operational-tasks', methods=['GET'])
def get_operational_tasks():
    query = OperationalTask.query
    
    category = request.args.get('category')
    technician = request.args.get('technician')
    status = request.args.get('status')
    hotel = request.args.get('hotel')
    priority = request.args.get('priority')
    search = request.args.get('search')
    
    if category:
        query = query.filter(OperationalTask.category == category)
    if technician:
        query = query.filter(OperationalTask.technician_name == technician)
    if status:
        query = query.filter(OperationalTask.status == status)
    if hotel:
        query = query.filter(OperationalTask.hotel == hotel)
    if priority:
        query = query.filter(OperationalTask.priority == priority)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            db.or_(
                OperationalTask.title.ilike(search_term),
                OperationalTask.description.ilike(search_term),
                OperationalTask.hotel.ilike(search_term),
                OperationalTask.technician_name.ilike(search_term)
            )
        )
        
    tasks = query.order_by(OperationalTask.created_at.desc()).all()
    return jsonify([t.to_dict() for t in tasks])

@app.route('/api/operational-tasks', methods=['POST'])
def create_operational_task():
    try:
        data = request.json
        if not data or not data.get('title'):
            return jsonify({'error': 'El título es obligatorio'}), 400
            
        threshold = data.get('inactivity_threshold_hours')
        if threshold is not None and str(threshold).strip():
            try:
                threshold = int(threshold)
            except ValueError:
                threshold = 72
        else:
            default_thresholds = {'Urgente': 24, 'Alta': 48, 'Media': 72, 'Baja': 168}
            threshold = default_thresholds.get(data.get('priority', 'Media'), 72)

        new_task = OperationalTask(
            title=data['title'].strip(),
            category=data.get('category', 'Pendiente'),
            task_type=data.get('task_type', 'General'),
            hotel=data.get('hotel', ''),
            technician_name=data.get('technician_name', ''),
            priority=data.get('priority', 'Media'),
            status=data.get('status', 'Pendiente'),
            description=data.get('description', ''),
            start_date=data.get('start_date', ''),
            end_date=data.get('end_date', '') or data.get('due_date', ''),
            due_date=data.get('due_date', '') or data.get('end_date', ''),
            created_by=current_username(),
            last_updated_by=current_username(),
            updated_at=datetime.utcnow(),
            inactivity_threshold_hours=threshold
        )
        db.session.add(new_task)
        db.session.flush()
        
        steps_data = data.get('steps', [])
        for index, step in enumerate(steps_data, start=1):
            step_title = step.get('title') if isinstance(step, dict) else str(step)
            if step_title and step_title.strip():
                new_step = OperationalTaskStep(
                    task_id=new_task.id,
                    step_order=index,
                    title=step_title.strip(),
                    status=step.get('status', 'Pendiente') if isinstance(step, dict) else 'Pendiente',
                    notes=step.get('notes', '') if isinstance(step, dict) else ''
                )
                db.session.add(new_step)
                
        db.session.commit()
        log_activity(current_username(), 'Seguimiento Operativo', f"Creó el registro: {new_task.title}")
        return jsonify({'message': 'Registro creado exitosamente', 'task': new_task.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/operational-tasks/<int:task_id>', methods=['PUT'])
def update_operational_task(task_id):
    try:
        task = OperationalTask.query.get_or_404(task_id)
        data = request.json
        
        task.updated_at = datetime.utcnow()
        task.last_updated_by = current_username()
        
        if 'title' in data:
            task.title = data['title'].strip()
        if 'category' in data:
            task.category = data['category']
        if 'task_type' in data:
            task.task_type = data['task_type']
        if 'hotel' in data:
            task.hotel = data['hotel']
        if 'technician_name' in data:
            task.technician_name = data['technician_name']
        if 'priority' in data:
            task.priority = data['priority']
        if 'start_date' in data:
            task.start_date = data['start_date']
        if 'end_date' in data:
            task.end_date = data['end_date']
            task.due_date = data['end_date']
        elif 'due_date' in data:
            task.due_date = data['due_date']
            task.end_date = data['due_date']
        if 'inactivity_threshold_hours' in data and data['inactivity_threshold_hours'] is not None and str(data['inactivity_threshold_hours']).strip():
            try:
                task.inactivity_threshold_hours = int(data['inactivity_threshold_hours'])
            except ValueError:
                pass
        if 'status' in data:
            task.status = data['status']
            if task.status == 'Completado':
                for step in task.steps:
                    if step.status != 'Completado':
                        step.status = 'Completado'
                        step.completed_at = datetime.utcnow()
                        step.completed_by = current_username()
        if 'description' in data:
            task.description = data['description']
            
        db.session.commit()
        log_activity(current_username(), 'Seguimiento Operativo', f"Actualizó el registro #{task_id}: {task.title}")
        return jsonify({'message': 'Registro actualizado correctamente', 'task': task.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/operational-tasks/<int:task_id>', methods=['DELETE'])
def delete_operational_task(task_id):
    try:
        task = OperationalTask.query.get_or_404(task_id)
        title = task.title
        db.session.delete(task)
        db.session.commit()
        log_activity(current_username(), 'Seguimiento Operativo', f"Eliminó el pendiente #{task_id}: {title}")
        return jsonify({'message': 'Pendiente eliminado correctamente'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/operational-tasks/<int:task_id>/steps', methods=['POST'])
def add_task_step(task_id):
    try:
        task = OperationalTask.query.get_or_404(task_id)
        data = request.json
        if not data or not data.get('title'):
            return jsonify({'error': 'El título del paso es obligatorio'}), 400
            
        task.updated_at = datetime.utcnow()
        task.last_updated_by = current_username()
        
        next_order = len(task.steps) + 1
        new_step = OperationalTaskStep(
            task_id=task.id,
            step_order=next_order,
            title=data['title'].strip(),
            status=data.get('status', 'Pendiente'),
            notes=data.get('notes', '')
        )
        db.session.add(new_step)
        
        if task.status == 'Pendiente':
            task.status = 'En Proceso'
            
        db.session.commit()
        log_activity(current_username(), 'Seguimiento Operativo', f"Agregó paso '{new_step.title}' a la tarea #{task_id}")
        return jsonify({'message': 'Paso agregado correctamente', 'task': task.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/operational-tasks/steps/<int:step_id>', methods=['PUT'])
def update_task_step(step_id):
    try:
        step = OperationalTaskStep.query.get_or_404(step_id)
        task = step.task
        data = request.json
        
        task.updated_at = datetime.utcnow()
        task.last_updated_by = current_username()
        
        if 'status' in data:
            old_status = step.status
            step.status = data['status']
            if step.status == 'Completado' and old_status != 'Completado':
                step.completed_at = datetime.utcnow()
                step.completed_by = current_username()
            elif step.status != 'Completado':
                step.completed_at = None
                step.completed_by = ''
                
        if 'notes' in data:
            step.notes = data['notes']
        if 'title' in data:
            step.title = data['title'].strip()
            
        db.session.commit()
        
        total = len(task.steps)
        completed = sum(1 for s in task.steps if s.status == 'Completado')
        in_progress = sum(1 for s in task.steps if s.status == 'En Proceso')
        
        if total > 0 and completed == total:
            task.status = 'Completado'
        elif completed > 0 or in_progress > 0:
            if task.status == 'Pendiente':
                task.status = 'En Proceso'
        db.session.commit()
        
        return jsonify({'message': 'Paso actualizado correctamente', 'task': task.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/operational-tasks/steps/<int:step_id>', methods=['DELETE'])
def delete_task_step(step_id):
    try:
        step = OperationalTaskStep.query.get_or_404(step_id)
        task = step.task
        
        task.updated_at = datetime.utcnow()
        task.last_updated_by = current_username()
        
        db.session.delete(step)
        db.session.commit()
        for idx, s in enumerate(task.steps, start=1):
            s.step_order = idx
        db.session.commit()
        
        return jsonify({'message': 'Paso eliminado correctamente', 'task': task.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

GLOBAL_RADIO_DEPARTMENTS_TEMPLATE = [
    {
        "name": "MANTENIMIENTO",
        "range_start": 1001,
        "range_end": 1140,
        "subdepartments": [
            {"name": "Mantenimiento General", "range_start": 1001, "range_end": 1035},
            {"name": "Mantenimiento Alojamiento", "range_start": 1036, "range_end": 1070},
            {"name": "Zona Industrial", "range_start": 1071, "range_end": 1105},
            {"name": "Fumicontrol", "range_start": 1106, "range_end": 1140},
        ]
    },
    {
        "name": "A&B",
        "range_start": 1141,
        "range_end": 1315,
        "subdepartments": [
            {"name": "Bares", "range_start": 1141, "range_end": 1175},
            {"name": "Cocina", "range_start": 1176, "range_end": 1210},
            {"name": "Restaurantes", "range_start": 1211, "range_end": 1245},
            {"name": "Room Service", "range_start": 1246, "range_end": 1280},
            {"name": "Steward", "range_start": 1281, "range_end": 1315},
        ]
    },
    {
        "name": "DIVISIÓN CUARTOS",
        "range_start": 1316,
        "range_end": 1525,
        "subdepartments": [
            {"name": "Ama de Llaves", "range_start": 1316, "range_end": 1350},
            {"name": "Áreas Públicas", "range_start": 1351, "range_end": 1385},
            {"name": "Front", "range_start": 1386, "range_end": 1420},
            {"name": "Lavandería", "range_start": 1421, "range_end": 1455},
            {"name": "Bell Boys", "range_start": 1456, "range_end": 1490},
            {"name": "Ropería", "range_start": 1491, "range_end": 1525},
        ]
    },
    {
        "name": "PREVENCIÓN",
        "range_start": 1526,
        "range_end": 1560,
        "subdepartments": []
    },
    {
        "name": "GERENCIA",
        "range_start": 1561,
        "range_end": 1805,
        "subdepartments": [
            {"name": "Gerencia", "range_start": 1561, "range_end": 1595},
            {"name": "Grupos y Bodas", "range_start": 1596, "range_end": 1630},
            {"name": "Hospiten", "range_start": 1631, "range_end": 1665},
            {"name": "Relaciones Públicas", "range_start": 1666, "range_end": 1700},
            {"name": "Calidad", "range_start": 1701, "range_end": 1735},
            {"name": "Administración", "range_start": 1736, "range_end": 1770},
            {"name": "Sistemas", "range_start": 1771, "range_end": 1805},
        ]
    },
    {
        "name": "ALMACÉN - COMPRAS",
        "range_start": 1806,
        "range_end": 1840,
        "subdepartments": []
    },
    {
        "name": "RECURSOS HUMANOS",
        "range_start": 1841,
        "range_end": 1910,
        "subdepartments": [
            {"name": "Recursos Humanos", "range_start": 1841, "range_end": 1875},
            {"name": "Capacitación", "range_start": 1876, "range_end": 1910},
        ]
    },
    {
        "name": "SPA",
        "range_start": 1911,
        "range_end": 1980,
        "subdepartments": [
            {"name": "SPA", "range_start": 1911, "range_end": 1945},
            {"name": "Gimnasio", "range_start": 1946, "range_end": 1980},
        ]
    },
    {
        "name": "ENTRETENIMIENTO",
        "range_start": 1981,
        "range_end": 2015,
        "subdepartments": []
    }
]

def apply_radio_template_to_hotel(hotel_id):
    """
    Aplica automáticamente la estructura global estándar de TEC-RADIOS a una propiedad.
    Idempotente: crea departamentos, subdepartamentos y bloques de IDs si no existen.
    """
    try:
        for main_def in GLOBAL_RADIO_DEPARTMENTS_TEMPLATE:
            main_dept = RadioDepartment.query.filter_by(
                hotel_id=hotel_id,
                name=main_def["name"],
                parent_department_id=None
            ).first()

            if not main_dept:
                main_dept = RadioDepartment(
                    hotel_id=hotel_id,
                    name=main_def["name"],
                    parent_department_id=None,
                    id_range_start=main_def["range_start"],
                    id_range_end=main_def["range_end"]
                )
                db.session.add(main_dept)
                db.session.flush()
            else:
                main_dept.id_range_start = main_def["range_start"]
                main_dept.id_range_end = main_def["range_end"]

            if not main_def["subdepartments"]:
                # Departamento directo sin subdepartamentos
                rng = RadioIdRange.query.filter_by(
                    hotel_id=hotel_id,
                    department_id=main_dept.id,
                    subdepartment_id=None
                ).first()
                if not rng:
                    rng = RadioIdRange(
                        hotel_id=hotel_id,
                        department_id=main_dept.id,
                        subdepartment_id=None,
                        range_start=main_def["range_start"],
                        range_end=main_def["range_end"],
                        active=True
                    )
                    db.session.add(rng)
                else:
                    rng.range_start = main_def["range_start"]
                    rng.range_end = main_def["range_end"]
                    rng.active = True
            else:
                for sub_def in main_def["subdepartments"]:
                    sub_dept = RadioDepartment.query.filter_by(
                        hotel_id=hotel_id,
                        name=sub_def["name"],
                        parent_department_id=main_dept.id
                    ).first()

                    if not sub_dept:
                        sub_dept = RadioDepartment(
                            hotel_id=hotel_id,
                            name=sub_def["name"],
                            parent_department_id=main_dept.id,
                            id_range_start=sub_def["range_start"],
                            id_range_end=sub_def["range_end"]
                        )
                        db.session.add(sub_dept)
                        db.session.flush()
                    else:
                        sub_dept.id_range_start = sub_def["range_start"]
                        sub_dept.id_range_end = sub_def["range_end"]

                    sub_rng = RadioIdRange.query.filter_by(
                        hotel_id=hotel_id,
                        department_id=main_dept.id,
                        subdepartment_id=sub_dept.id
                    ).first()

                    if not sub_rng:
                        sub_rng = RadioIdRange(
                            hotel_id=hotel_id,
                            department_id=main_dept.id,
                            subdepartment_id=sub_dept.id,
                            range_start=sub_def["range_start"],
                            range_end=sub_def["range_end"],
                            active=True
                        )
                        db.session.add(sub_rng)
                    else:
                        sub_rng.range_start = sub_def["range_start"]
                        sub_rng.range_end = sub_def["range_end"]
                        sub_rng.active = True

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[RADIO TEMPLATE ERROR] Hotel #{hotel_id}: {e}")

def seed_all_properties_radio_template():
    try:
        hotels = Hotel.query.all()
        for h in hotels:
            apply_radio_template_to_hotel(h.id)
    except Exception as e:
        print(f"[SEED RADIOS TEMPLATE] Error: {e}")

def ensure_radio_tables():
    try:
        with app.app_context():
            db.create_all()
            import sqlite3
            db_path = os.path.join(basedir, 'inventory.db')
            if os.path.exists(db_path):
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                
                # Columnas en radio_department
                cursor.execute("PRAGMA table_info(radio_department)")
                dept_cols = [info[1] for info in cursor.fetchall()]
                if dept_cols and 'parent_department_id' not in dept_cols:
                    cursor.execute("ALTER TABLE radio_department ADD COLUMN parent_department_id INTEGER REFERENCES radio_department(id)")

                # Columnas en radio_id_range
                cursor.execute("PRAGMA table_info(radio_id_range)")
                range_cols = [info[1] for info in cursor.fetchall()]
                if range_cols and 'subdepartment_id' not in range_cols:
                    cursor.execute("ALTER TABLE radio_id_range ADD COLUMN subdepartment_id INTEGER REFERENCES radio_department(id)")

                # Columnas en radio_item
                cursor.execute("PRAGMA table_info(radio_item)")
                item_cols = [info[1] for info in cursor.fetchall()]
                if item_cols:
                    if 'subdepartment_id' not in item_cols:
                        cursor.execute("ALTER TABLE radio_item ADD COLUMN subdepartment_id INTEGER REFERENCES radio_department(id)")
                    if 'decommission_reason' not in item_cols:
                        cursor.execute("ALTER TABLE radio_item ADD COLUMN decommission_reason TEXT DEFAULT ''")
                    if 'decommission_date' not in item_cols:
                        cursor.execute("ALTER TABLE radio_item ADD COLUMN decommission_date VARCHAR(50) DEFAULT ''")
                    if 'decommission_user' not in item_cols:
                        cursor.execute("ALTER TABLE radio_item ADD COLUMN decommission_user VARCHAR(100) DEFAULT ''")

                conn.commit()
                conn.close()

            seed_all_properties_radio_template()
    except Exception as e:
        print(f"[DB MIGRATION RADIOS] Error actualizando columnas de radios: {e}")

ensure_radio_tables()

def assign_next_sequential_radio_id(hotel_id, department_id, subdepartment_id=None):
    """
    Algoritmo transaccional de asignación secuencial de IDs por rangos de la estructura global TEC-RADIOS.
    - Asigna automáticamente el ID numéricamente más bajo disponible dentro del bloque o sub-bloque
      correspondiente al Departamento Principal y Subdepartamento seleccionado.
    - Cada propiedad gestiona sus IDs de forma independiente.
    """
    if not hotel_id:
        return None, "La propiedad es requerida para asignar un ID de radio."

    target_range = None
    dept_label = ""

    # 1. Si se especificó subdepartamento, buscamos su bloque de IDs
    if subdepartment_id:
        sub_dept = RadioDepartment.query.get(subdepartment_id)
        if sub_dept:
            dept_label = sub_dept.name
            if sub_dept.id_range_start and sub_dept.id_range_end:
                target_range = (sub_dept.id_range_start, sub_dept.id_range_end)
            else:
                rng = RadioIdRange.query.filter_by(
                    hotel_id=hotel_id,
                    subdepartment_id=sub_dept.id,
                    active=True
                ).first()
                if rng:
                    target_range = (rng.range_start, rng.range_end)

    # 2. Si no hay subdepartamento, verificar si el departamento principal tiene subdepartamentos o es directo
    if not target_range and department_id:
        main_dept = RadioDepartment.query.get(department_id)
        if main_dept:
            dept_label = main_dept.name
            # Verificar si tiene subdepartamentos
            child_count = RadioDepartment.query.filter_by(hotel_id=hotel_id, parent_department_id=main_dept.id).count()
            if child_count > 0 and not subdepartment_id:
                return None, f"El departamento '{main_dept.name}' requiere que selecciones un Subdepartamento para asignar el ID."

            if main_dept.id_range_start and main_dept.id_range_end:
                target_range = (main_dept.id_range_start, main_dept.id_range_end)
            else:
                rng = RadioIdRange.query.filter_by(
                    hotel_id=hotel_id,
                    department_id=main_dept.id,
                    subdepartment_id=None,
                    active=True
                ).first()
                if rng:
                    target_range = (rng.range_start, rng.range_end)

    if not target_range:
        return None, "No se encontró un bloque de IDs configurado para la selección indicada."

    r_start, r_end = target_range

    # 3. Obtener todos los IDs numéricos usados EXCLUSIVAMENTE en esa propiedad
    existing_items = RadioItem.query.filter_by(hotel_id=hotel_id).all()
    used_ids = set()
    for item in existing_items:
        if item.radio_code:
            digits = ''.join(c for c in str(item.radio_code) if c.isdigit())
            if digits:
                try:
                    used_ids.add(int(digits))
                except ValueError:
                    pass

    # 4. Asignar el ID numéricamente más bajo disponible dentro del bloque
    for candidate_id in range(r_start, r_end + 1):
        if candidate_id not in used_ids:
            return str(candidate_id), None

    return None, f"No quedan IDs disponibles en el bloque {r_start} – {r_end} para '{dept_label}'. Todos los IDs del bloque están en uso en esta propiedad."

def is_id_range_overlapping(hotel_id, range_start, range_end, exclude_id=None):
    """
    Verifica si el intervalo [range_start, range_end] se solapa con otro rango activo en la misma propiedad.
    """
    query = RadioIdRange.query.filter_by(hotel_id=hotel_id, active=True)
    if exclude_id:
        query = query.filter(RadioIdRange.id != exclude_id)
        
    existing_ranges = query.all()
    for r in existing_ranges:
        if max(range_start, r.range_start) <= min(range_end, r.range_end):
            return True, f"El rango [{range_start}-{range_end}] se solapa con el rango activo [{r.range_start}-{r.range_end}] del departamento #{r.department_id}."
    return False, None
            
# ==========================================
# MÓDULO RADIOS - RUTAS Y ENDPOINTS API
# ==========================================

def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    try:
        return db.session.get(User, user_id)
    except Exception:
        return User.query.filter_by(id=user_id).first()

def get_user_radio_allowed_hotel_ids(user):
    if not user:
        return []
    if (user.role or '').strip().lower() == 'admin':
        return [h.id for h in Hotel.query.all()]
    
    accesses = RadioUserPropertyAccess.query.filter_by(user_id=user.id).all()
    return [a.hotel_id for a in accesses if a.can_view or a.can_manage]

def can_user_access_radio_hotel(user, hotel_id, need_manage=False):
    if not user:
        return False
    if (user.role or '').strip().lower() == 'admin':
        return True
    
    access = RadioUserPropertyAccess.query.filter_by(user_id=user.id, hotel_id=hotel_id).first()
    if not access:
        return False
    if need_manage:
        return bool(access.can_manage)

@app.route('/tec-radios')
@app.route('/radios')
def radios_view():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
    
    perms = user.get_permissions()
    if (user.role or '').strip().lower() != 'admin' and ('radios' not in perms and 'tec-radios' not in perms):
        return jsonify({'error': 'No autorizado'}), 403
    
    res = make_response(render_template('radios.html'))
    res.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    res.headers['Pragma'] = 'no-cache'
    res.headers['Expires'] = '0'
    return res

# API: Propiedades permitidas para radios
@app.route('/api/radios/properties', methods=['GET'])
def get_radio_properties():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
    
    perms = user.get_permissions()
    if (user.role or '').strip().lower() != 'admin' and ('radios' not in perms and 'tec-radios' not in perms):
        return jsonify({'error': 'No autorizado al módulo radios'}), 403
        
    allowed_ids = get_user_radio_allowed_hotel_ids(user)
    hotels = Hotel.query.filter(Hotel.id.in_(allowed_ids)).order_by(Hotel.name).all() if allowed_ids else []
    
    res = []
    for h in hotels:
        can_manage = can_user_access_radio_hotel(user, h.id, need_manage=True)
        h_dict = h.to_dict()
        h_dict['can_manage'] = can_manage
        res.append(h_dict)
        
    return jsonify(res)

# API: Obtener/Editar asignación de propiedades y departamentos a un usuario
@app.route('/api/radios/user-access/<int:user_id>', methods=['GET'])
def get_user_radio_access(user_id):
    current_u = get_current_user()
    if not current_u or (current_u.role or '').strip().lower() != 'admin':
        return jsonify({'error': 'No autorizado'}), 403
        
    target_user = User.query.get_or_404(user_id)
    all_hotels = Hotel.query.order_by(Hotel.name).all()
    access_records = {a.hotel_id: a for a in RadioUserPropertyAccess.query.filter_by(user_id=user_id).all()}
    
    res = []
    for h in all_hotels:
        rec = access_records.get(h.id)
        res.append({
            'hotel_id': h.id,
            'hotel_name': h.name,
            'hotel_sigla': h.sigla or '',
            'can_view': rec.can_view if rec else False,
            'can_manage': rec.can_manage if rec else False
        })
    return jsonify({'user': target_user.to_dict(), 'properties': res})

@app.route('/api/radios/user-department-access/<int:user_id>', methods=['GET'])
def get_user_radio_department_access(user_id):
    current_u = get_current_user()
    if not current_u or (current_u.role or '').strip().lower() != 'admin':
        return jsonify({'error': 'No autorizado'}), 403
        
    target_user = User.query.get_or_404(user_id)
    dept_accesses = RadioUserDepartmentAccess.query.filter_by(user_id=user_id).all()
    prop_accesses = RadioUserPropertyAccess.query.filter_by(user_id=user_id).all()
    
    # Determinar radio_role si está en permisos o derivarlo
    radio_role = 'viewer'
    perms = target_user.get_permissions()
    for p in perms:
        if p.startswith('tec-radios:role:'):
            radio_role = p.split(':', 2)[2]
            break
            
    return jsonify({
        'user_id': target_user.id,
        'username': target_user.username,
        'radio_role': radio_role,
        'properties': [a.to_dict() for a in prop_accesses],
        'accesses': [a.to_dict() for a in dept_accesses]
    })

@app.route('/api/radios/user-department-access/<int:user_id>', methods=['POST'])
def save_user_radio_department_access(user_id):
    current_u = get_current_user()
    if not current_u or (current_u.role or '').strip().lower() != 'admin':
        return jsonify({'error': 'No autorizado'}), 403
        
    target_user = User.query.get_or_404(user_id)
    data = request.json or {}
    
    radio_role = data.get('radio_role', 'viewer')
    properties_data = data.get('properties', [])
    dept_accesses_data = data.get('accesses', [])
    
    try:
        # 1. Actualizar permisos de rol de TEC-RADIOS en el usuario
        current_perms = [p for p in target_user.get_permissions() if not p.startswith('tec-radios:role:')]
        current_perms.append(f'tec-radios:role:{radio_role}')
        target_user.permissions = json.dumps(current_perms)
        
        # 2. Reemplazar accesos de propiedades
        RadioUserPropertyAccess.query.filter_by(user_id=user_id).delete()
        for p in properties_data:
            h_id = p.get('hotel_id')
            if not h_id:
                continue
            can_v = bool(p.get('can_view', True))
            can_m = bool(p.get('can_manage', radio_role == 'admin'))
            if can_v or can_m:
                db.session.add(RadioUserPropertyAccess(
                    user_id=target_user.id,
                    hotel_id=int(h_id),
                    can_view=can_v,
                    can_manage=can_m
                ))
                
        # 3. Reemplazar accesos departamentales
        RadioUserDepartmentAccess.query.filter_by(user_id=user_id).delete()
        for d in dept_accesses_data:
            h_id = d.get('hotel_id')
            dept_id = d.get('department_id')
            if not h_id or not dept_id:
                continue
            db.session.add(RadioUserDepartmentAccess(
                user_id=target_user.id,
                hotel_id=int(h_id),
                department_id=int(dept_id),
                subdepartment_id=int(d['subdepartment_id']) if d.get('subdepartment_id') else None,
                access_level=d.get('access_level', 'view')
            ))
            
        db.session.commit()
        log_activity(current_u.username, 'Configuración Radios', f"Actualizó accesos de propiedades y departamentos para {target_user.username} (Rol Radios: {radio_role})")
        return jsonify({'message': 'Accesos guardados correctamente', 'radio_role': radio_role})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# API: Dashboard Metrics
@app.route('/api/radios/dashboard', methods=['GET'])
def get_radio_dashboard():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'No autenticado'}), 401
            
        allowed_ids = get_user_radio_allowed_hotel_ids(user)
        if not allowed_ids:
            return jsonify({
                'total': 0, 'operativo': 0, 'requiere_revision': 0, 'en_reparacion': 0,
                'danado': 0, 'perdido': 0, 'fuera_servicio': 0, 'disponible': 0, 'en_almacen': 0,
                'assigned': 0, 'unassigned': 0, 'recent_history': [], 'alerts': [],
                'alert_noinv_90': 0, 'alert_danados_fuera': 0, 'alert_perdidos': 0, 'alert_revision': 0
            })
            
        hotel_id = request.args.get('hotel_id')
        if hotel_id and hotel_id != 'all':
            try:
                h_id = int(hotel_id)
                if h_id not in allowed_ids:
                    return jsonify({'error': 'No autorizado para esta propiedad'}), 403
                query_ids = [h_id]
            except ValueError:
                query_ids = allowed_ids
        else:
            query_ids = allowed_ids

        radios = RadioItem.query.filter(RadioItem.hotel_id.in_(query_ids)).all()
        
        counts = {
            'total': len(radios),
            'operativo': sum(1 for r in radios if r.status == 'operativo'),
            'requiere_revision': sum(1 for r in radios if r.status == 'requiere_revision'),
            'en_reparacion': sum(1 for r in radios if r.status == 'en_reparacion'),
            'danado': sum(1 for r in radios if r.status == 'danado'),
            'perdido': sum(1 for r in radios if r.status == 'perdido'),
            'fuera_servicio': sum(1 for r in radios if r.status == 'fuera_servicio'),
            'disponible': sum(1 for r in radios if r.status == 'disponible'),
            'en_almacen': sum(1 for r in radios if r.status == 'en_almacen'),
            'assigned': sum(1 for r in radios if r.assigned_person_name or r.assigned_employee_id),
            'unassigned': sum(1 for r in radios if not (r.assigned_person_name or r.assigned_employee_id))
        }

        # Calculo de Alertas Atendibles Dinámicas
        from datetime import datetime, timedelta
        cutoff_date = datetime.now() - timedelta(days=90)
        
        inv_radio_ids = set()
        try:
            recent_inv_items = RadioFormalInventoryItem.query.join(RadioFormalInventory).filter(
                RadioFormalInventory.hotel_id.in_(query_ids),
                RadioFormalInventory.created_at >= cutoff_date
            ).all()
            inv_radio_ids = set(item.radio_id for item in recent_inv_items)
        except Exception as e_inv:
            print("[DASHBOARD WARNING] Error consultando inventarios antiguos:", e_inv)

        no_inv_90 = sum(1 for r in radios if r.id not in inv_radio_ids and (r.created_at or datetime.now()) <= cutoff_date)
        
        counts['alert_noinv_90'] = no_inv_90
        counts['alert_danados_fuera'] = counts['danado'] + counts['fuera_servicio']
        counts['alert_perdidos'] = counts['perdido']
        counts['alert_revision'] = counts['requiere_revision']
        
        try:
            recent_history = RadioHistory.query.filter(RadioHistory.hotel_id.in_(query_ids)).order_by(RadioHistory.timestamp.desc()).limit(15).all()
            counts['recent_history'] = [h.to_dict() for h in recent_history]
        except Exception:
            counts['recent_history'] = []
        
        alerts = []
        for r in radios:
            if r.status in ['requiere_revision', 'en_reparacion', 'danado', 'perdido']:
                alerts.append({
                    'id': f"alt-{r.id}",
                    'radioId': str(r.id),
                    'radioCode': r.radio_code or str(r.id),
                    'serialNumber': r.serial_number,
                    'status': r.status,
                    'propertySigla': r.hotel.sigla if r.hotel else '',
                    'title': f"Radio #{r.radio_code or r.id} ({r.serial_number})",
                    'description': f"Estado: {r.status.replace('_', ' ').capitalize()}. {r.notes or ''}",
                    'severity': 'high' if r.status in ['danado', 'perdido'] else 'medium'
                })
        counts['alerts'] = alerts[:20]

        # Agrupar radios reales por departamento de forma 100% segura
        dept_counts = {}
        main_depts = RadioDepartment.query.filter(RadioDepartment.hotel_id.in_(query_ids), RadioDepartment.parent_department_id.is_(None)).all()
        for d in main_depts:
            dept_counts[d.name] = 0

        for r in radios:
            dept_name = 'General'
            if r.department_id:
                dept_obj = RadioDepartment.query.get(r.department_id)
                if dept_obj:
                    if dept_obj.parent_department_id:
                        parent_obj = RadioDepartment.query.get(dept_obj.parent_department_id)
                        dept_name = parent_obj.name if parent_obj else dept_obj.name
                    else:
                        dept_name = dept_obj.name
            dept_counts[dept_name] = dept_counts.get(dept_name, 0) + 1

        counts['by_department'] = [{'name': k, 'count': v} for k, v in dept_counts.items()]

        try:
            invs = RadioFormalInventory.query.filter(RadioFormalInventory.hotel_id.in_(query_ids)).order_by(RadioFormalInventory.created_at.desc()).limit(10).all()
            counts['recent_inventories'] = [i.to_dict() for i in invs]
        except Exception:
            counts['recent_inventories'] = []
        
        return jsonify(counts)
    except Exception as err_dash:
        import traceback
        print("[DASHBOARD CRITICAL ERROR]:", err_dash)
        traceback.print_exc()
        return jsonify({'error': str(err_dash)}), 500

# API: Listar / Crear Radios
@app.route('/api/radios', methods=['GET'])
def get_radios_list():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    allowed_ids = get_user_radio_allowed_hotel_ids(user)
    if not allowed_ids:
        return jsonify([])
        
    hotel_id = request.args.get('hotel_id')
    department_id = request.args.get('department_id')
    area_id = request.args.get('area_id')
    status = request.args.get('status')
    search = request.args.get('search')
    
    query = RadioItem.query
    if hotel_id and hotel_id != 'all':
        try:
            h_id = int(hotel_id)
            if h_id not in allowed_ids:
                return jsonify({'error': 'No autorizado para esta propiedad'}), 403
            query = query.filter(RadioItem.hotel_id == h_id)
        except ValueError:
            query = query.filter(RadioItem.hotel_id.in_(allowed_ids))
    else:
        query = query.filter(RadioItem.hotel_id.in_(allowed_ids))
        
    if department_id:
        query = query.filter(RadioItem.department_id == int(department_id))
    if area_id:
        query = query.filter(RadioItem.area_id == int(area_id))
    if status:
        query = query.filter(RadioItem.status == status)
    if search:
        st = f"%{search.strip()}%"
        query = query.filter(
            db.or_(
                RadioItem.radio_code.ilike(st),
                RadioItem.serial_number.ilike(st),
                RadioItem.brand.ilike(st),
                RadioItem.model.ilike(st),
                RadioItem.assigned_person_name.ilike(st),
                RadioItem.assigned_employee_id.ilike(st),
                RadioItem.notes.ilike(st)
            )
        )
        
    radios = query.order_by(RadioItem.created_at.desc()).all()
    return jsonify([r.to_dict() for r in radios])

@app.route('/api/radios', methods=['POST'])
def create_radio():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    data = request.json or {}
    hotel_id = data.get('hotel_id') or data.get('propertyId')
    serial = (data.get('serial_number') or data.get('serialNumber') or '').strip()
    brand = (data.get('brand') or 'Motorola').strip()
    model = (data.get('model') or '').strip()
    radio_code = (data.get('radio_code') or data.get('id') or '').strip()
    department_id = int(data['department_id']) if data.get('department_id') else None
    subdepartment_id = int(data['subdepartment_id']) if data.get('subdepartment_id') else None
    
    if not hotel_id or not serial:
        return jsonify({'error': 'La propiedad y el número de serie son obligatorios'}), 400
        
    try:
        h_id = int(hotel_id)
    except ValueError:
        return jsonify({'error': 'ID de propiedad inválido'}), 400
        
    if not can_user_access_radio_hotel(user, h_id, need_manage=True):
        return jsonify({'error': 'Sin permisos de gestión para esta propiedad'}), 403
        
    if RadioItem.query.filter_by(serial_number=serial).first():
        return jsonify({'error': f'Ya existe un radio registrado con el serial "{serial}"'}), 400
        
    # Asignación automática secuencial de ID si no viene especificado
    if not radio_code:
        if not department_id:
            return jsonify({'error': 'Debes seleccionar un departamento para asignar automáticamente el ID del radio.'}), 400
        
        assigned_id, err_msg = assign_next_sequential_radio_id(h_id, department_id, subdepartment_id)
        if err_msg or not assigned_id:
            return jsonify({'error': err_msg or 'No quedan IDs disponibles para el departamento seleccionado.'}), 400
        radio_code = assigned_id
        
    assigned_p = data.get('assigned_person') or data.get('assignedPerson') or {}
    
    new_radio = RadioItem(
        radio_code=radio_code,
        serial_number=serial,
        brand=brand,
        model=model,
        hotel_id=h_id,
        department_id=department_id,
        subdepartment_id=subdepartment_id,
        area_id=int(data['area_id']) if data.get('area_id') else None,
        status=data.get('status', 'operativo'),
        assigned_person_name=assigned_p.get('name', ''),
        assigned_employee_id=assigned_p.get('employeeId', ''),
        assigned_position=assigned_p.get('position', ''),
        assigned_date=assigned_p.get('assignedDate', ''),
        assigned_by=user.username,
        notes=data.get('notes', '')
    )
    
    db.session.add(new_radio)
    db.session.flush()
    
    history_event = RadioHistory(
        radio_id=new_radio.id,
        hotel_id=h_id,
        event_type='registro',
        detail=f"Radio {brand} {model} (ID: {radio_code}, Serial: {serial}) registrado con asignación secuencial de ID.",
        user_id=user.id,
        user_name=user.username
    )
    db.session.add(history_event)
    db.session.commit()
    
    log_activity(user.username, 'Módulo Radios', f"Registró radio ID #{radio_code} (Serial: {serial}) en propiedad #{h_id}")
    return jsonify(new_radio.to_dict()), 201

# API: Detalle / Edición / Eliminación de Radio
@app.route('/api/radios/<int:radio_id>', methods=['GET'])
def get_radio_detail(radio_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    radio = RadioItem.query.get_or_404(radio_id)
    if not can_user_access_radio_hotel(user, radio.hotel_id):
        return jsonify({'error': 'No autorizado para ver este equipo'}), 403
        
    res = radio.to_dict()
    res['history'] = [h.to_dict() for h in radio.history_events]
    return jsonify(res)

@app.route('/api/radios/<int:radio_id>', methods=['PUT'])
def update_radio(radio_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    radio = RadioItem.query.get_or_404(radio_id)
    if not can_user_access_radio_hotel(user, radio.hotel_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para modificar este equipo'}), 403
        
    data = request.json or {}
    old_status = radio.status
    old_notes = radio.notes
    
    if 'brand' in data:
        radio.brand = data['brand'].strip()
    if 'model' in data:
        radio.model = data['model'].strip()
    if 'radio_code' in data:
        radio.radio_code = str(data['radio_code']).strip()
    if 'department_id' in data:
        radio.department_id = int(data['department_id']) if data['department_id'] else None
    if 'area_id' in data:
        radio.area_id = int(data['area_id']) if data['area_id'] else None
    if 'status' in data and data['status'] != old_status:
        radio.status = data['status']
        h_ev = RadioHistory(
            radio_id=radio.id,
            hotel_id=radio.hotel_id,
            event_type='cambio_estado',
            detail=f"Cambio de estado: {old_status} -> {radio.status}",
            previous_info=old_status,
            new_info=radio.status,
            user_id=user.id,
            user_name=user.username
        )
        db.session.add(h_ev)
    if 'notes' in data:
        radio.notes = data['notes']
        if data['notes'] != old_notes and 'status' not in data:
            h_ev = RadioHistory(
                radio_id=radio.id,
                hotel_id=radio.hotel_id,
                event_type='observacion',
                detail=f"Notas actualizadas: {data['notes']}",
                user_id=user.id,
                user_name=user.username
            )
            db.session.add(h_ev)

    db.session.commit()
    log_activity(user.username, 'Módulo Radios', f"Actualizó equipo #{radio.id} ({radio.serial_number})")
    return jsonify(radio.to_dict())

@app.route('/api/radios/<int:radio_id>', methods=['DELETE'])
def delete_radio(radio_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    radio = RadioItem.query.get_or_404(radio_id)
    if not can_user_access_radio_hotel(user, radio.hotel_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para eliminar este equipo'}), 403
        
    serial = radio.serial_number
    db.session.delete(radio)
    db.session.commit()
    log_activity(user.username, 'Módulo Radios', f"Eliminó el radio con serial {serial}")
    return jsonify({'message': 'Radio eliminado correctamente'})

# API: Asignar / Devolver Radio
@app.route('/api/radios/<int:radio_id>/assign', methods=['POST'])
def assign_radio(radio_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    radio = RadioItem.query.get_or_404(radio_id)
    if not can_user_access_radio_hotel(user, radio.hotel_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para asignar este equipo'}), 403
        
    data = request.json or {}
    action = data.get('action', 'assign')
    
    if action == 'return':
        prev_person = radio.assigned_person_name or 'Sin Asignar'
        radio.assigned_person_name = ''
        radio.assigned_employee_id = ''
        radio.assigned_position = ''
        radio.assigned_date = ''
        radio.assigned_by = ''
        
        h_ev = RadioHistory(
            radio_id=radio.id,
            hotel_id=radio.hotel_id,
            event_type='cambio_asignacion',
            detail=f"Devolución de radio liberado de {prev_person}.",
            previous_info=prev_person,
            new_info='Sin asignación',
            user_id=user.id,
            user_name=user.username
        )
        db.session.add(h_ev)
        db.session.commit()
        log_activity(user.username, 'Módulo Radios', f"Devolución de radio #{radio.id} de {prev_person}")
        return jsonify(radio.to_dict())
    else:
        name = (data.get('name') or '').strip()
        emp_id = (data.get('employeeId') or data.get('employee_id') or '').strip()
        pos = (data.get('position') or '').strip()
        ass_date = data.get('assignedDate') or datetime.utcnow().strftime('%Y-%m-%d')
        
        if not name:
            return jsonify({'error': 'El nombre del responsable es obligatorio'}), 400
            
        prev_info = radio.assigned_person_name or 'Sin Asignar'
        radio.assigned_person_name = name
        radio.assigned_employee_id = emp_id
        radio.assigned_position = pos
        radio.assigned_date = ass_date
        radio.assigned_by = user.username
        
        new_info = f"{name} ({emp_id or 'Sin ID'}) - {pos}"
        h_ev = RadioHistory(
            radio_id=radio.id,
            hotel_id=radio.hotel_id,
            event_type='cambio_asignacion',
            detail=f"Asignación de radio a {new_info}.",
            previous_info=prev_info,
            new_info=new_info,
            user_id=user.id,
            user_name=user.username
        )
        db.session.add(h_ev)
        db.session.commit()
        log_activity(user.username, 'Módulo Radios', f"Asignó radio #{radio.id} a {name}")
        return jsonify(radio.to_dict())

# API: Inventarios Formales
@app.route('/api/radios/inventories', methods=['GET'])
def get_formal_inventories():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    allowed_ids = get_user_radio_allowed_hotel_ids(user)
    if not allowed_ids:
        return jsonify([])
        
    hotel_id = request.args.get('hotel_id')
    query = RadioFormalInventory.query
    if hotel_id and hotel_id != 'all':
        try:
            h_id = int(hotel_id)
            if h_id not in allowed_ids:
                return jsonify({'error': 'No autorizado para esta propiedad'}), 403
            query = query.filter(RadioFormalInventory.hotel_id == h_id)
        except ValueError:
            query = query.filter(RadioFormalInventory.hotel_id.in_(allowed_ids))
    else:
        query = query.filter(RadioFormalInventory.hotel_id.in_(allowed_ids))
        
    invs = query.order_by(RadioFormalInventory.created_at.desc()).all()
    return jsonify([i.to_dict() for i in invs])

@app.route('/api/radios/inventories', methods=['POST'])
def create_formal_inventory():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    data = request.json or {}
    hotel_id = data.get('hotel_id') or data.get('propertyId')
    dept_id = data.get('department_id') or data.get('departmentId')
    area_id = data.get('area_id') or data.get('areaId')
    title = (data.get('title') or 'Inventario Formal de Radios').strip()
    assigned_user = data.get('assignedToUserName') or data.get('assigned_to_user_name') or user.username
    due_date = data.get('dueDate') or data.get('due_date') or ''
    
    if not hotel_id:
        return jsonify({'error': 'La propiedad es obligatoria'}), 400
        
    try:
        h_id = int(hotel_id)
    except ValueError:
        return jsonify({'error': 'Propiedad inválida'}), 400
        
    if not can_user_access_radio_hotel(user, h_id, need_manage=True):
        return jsonify({'error': 'Sin permisos de gestión para esta propiedad'}), 403
        
    radios_query = RadioItem.query.filter_by(hotel_id=h_id)
    if dept_id:
        radios_query = radios_query.filter_by(department_id=int(dept_id))
    if area_id:
        radios_query = radios_query.filter_by(area_id=int(area_id))
    target_radios = radios_query.all()
    
    inv = RadioFormalInventory(
        inventory_code=f"INV-{datetime.utcnow().strftime('%Y%m%d')}-{h_id}",
        hotel_id=h_id,
        department_id=int(dept_id) if dept_id else None,
        area_id=int(area_id) if area_id else None,
        title=title,
        assigned_to_user_name=assigned_user,
        due_date=due_date,
        status='pendiente',
        total_expected=len(target_radios),
        created_by=user.username
    )
    db.session.add(inv)
    db.session.flush()
    
    for r in target_radios:
        item = RadioFormalInventoryItem(
            inventory_id=inv.id,
            radio_id=r.id,
            serial_number=r.serial_number,
            verified_status=r.status,
            previous_status=r.status,
            notes='',
            confirmed=False
        )
        db.session.add(item)
        
    db.session.commit()
    log_activity(user.username, 'Módulo Radios', f"Creó inventario formal '{title}' (#{inv.id}) en propiedad #{h_id}")
    return jsonify(inv.to_dict()), 201

@app.route('/api/radios/inventories/<int:inv_id>', methods=['GET'])
def get_formal_inventory_detail(inv_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    inv = RadioFormalInventory.query.get_or_404(inv_id)
    if not can_user_access_radio_hotel(user, inv.hotel_id):
        return jsonify({'error': 'No autorizado para ver este inventario'}), 403
        
    return jsonify(inv.to_dict())

@app.route('/api/radios/inventories/<int:inv_id>', methods=['PUT'])
def update_formal_inventory(inv_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    inv = RadioFormalInventory.query.get_or_404(inv_id)
    if not can_user_access_radio_hotel(user, inv.hotel_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para actualizar este inventario'}), 403
        
    data = request.json or {}
    new_status = data.get('status')
    items_data = data.get('items', [])
    
    for item_d in items_data:
        item_id = item_d.get('id')
        if item_id:
            inv_item = RadioFormalInventoryItem.query.get(item_id)
            if inv_item and inv_item.inventory_id == inv.id:
                if 'verifiedStatus' in item_d:
                    inv_item.verified_status = item_d['verifiedStatus']
                if 'notes' in item_d:
                    inv_item.notes = item_d['notes']
                if 'confirmed' in item_d:
                    inv_item.confirmed = bool(item_d['confirmed'])
                    inv_item.verified_at = datetime.utcnow()
                    inv_item.verified_by = user.username

    if new_status:
        inv.status = new_status
        if new_status == 'completado':
            inv.completed_at = datetime.utcnow()
            today_str = datetime.utcnow().strftime('%Y-%m-%d')
            for item in inv.items:
                radio = item.radio
                if radio:
                    radio.last_inventory_date = today_str
                    radio.last_inventory_by = user.username
                    if item.verified_status != radio.status:
                        prev_st = radio.status
                        radio.status = item.verified_status
                        h_ev = RadioHistory(
                            radio_id=radio.id,
                            hotel_id=radio.hotel_id,
                            event_type='inventario',
                            detail=f"Estado actualizado durante inventario formal '{inv.title}'",
                            previous_info=prev_st,
                            new_info=radio.status,
                            user_id=user.id,
                            user_name=user.username
                        )
                        db.session.add(h_ev)
                    else:
                        h_ev = RadioHistory(
                            radio_id=radio.id,
                            hotel_id=radio.hotel_id,
                            event_type='inventario',
                            detail=f"Verificado en inventario formal '{inv.title}'",
                            user_id=user.id,
                            user_name=user.username
                        )
                        db.session.add(h_ev)

        db.session.commit()
    log_activity(user.username, 'Módulo Radios', f"Actualizó inventario formal #{inv.id} a estado '{inv.status}'")
    return jsonify(inv.to_dict())

# API: Importación Excel / Masiva
@app.route('/api/radios/import-excel', methods=['POST'])
def import_radios_excel():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    data = request.json or {}
    hotel_id = data.get('hotel_id') or data.get('propertyId')
    radios_data = data.get('radios', [])
    
    if not hotel_id or not isinstance(radios_data, list):
        return jsonify({'error': 'Propiedad y datos de radios son obligatorios'}), 400
        
    try:
        h_id = int(hotel_id)
    except ValueError:
        return jsonify({'error': 'ID de propiedad inválido'}), 400
        
    if not can_user_access_radio_hotel(user, h_id, need_manage=True):
        return jsonify({'error': 'Sin permiso de gestión para esta propiedad'}), 403
        
    created_count = 0
    updated_count = 0
    errors = []
    
    for idx, r_item in enumerate(radios_data, start=1):
        serial = (r_item.get('serial_number') or r_item.get('serialNumber') or '').strip()
        brand = (r_item.get('brand') or 'Motorola').strip()
        model = (r_item.get('model') or '').strip()
        r_code = (r_item.get('radio_code') or r_item.get('id') or '').strip()
        status = r_item.get('status', 'operativo')
        notes = r_item.get('notes', '')
        
        if not serial:
            errors.append(f"Fila {idx}: Serial omitido.")
            continue
            
        existing = RadioItem.query.filter_by(serial_number=serial).first()
        if existing:
            if existing.hotel_id != h_id:
                errors.append(f"Fila {idx}: Serial '{serial}' pertenece a otra propiedad.")
                continue
            existing.brand = brand
            existing.model = model
            if r_code:
                existing.radio_code = r_code
            existing.status = status
            if notes:
                existing.notes = notes
            updated_count += 1
            
            h_ev = RadioHistory(
                radio_id=existing.id,
                hotel_id=h_id,
                event_type='observacion',
                detail="Actualización por importación masiva.",
                user_id=user.id,
                user_name=user.username
            )
            db.session.add(h_ev)
        else:
            new_r = RadioItem(
                radio_code=r_code,
                serial_number=serial,
                brand=brand,
                model=model,
                hotel_id=h_id,
                status=status,
                notes=notes
            )
            db.session.add(new_r)
            db.session.flush()
            
            h_ev = RadioHistory(
                radio_id=new_r.id,
                hotel_id=h_id,
                event_type='registro',
                detail="Registrado mediante importación masiva.",
                user_id=user.id,
                user_name=user.username
            )
            db.session.add(h_ev)
            created_count += 1

    db.session.commit()
    log_activity(user.username, 'Módulo Radios', f"Importación masiva en propiedad #{h_id}: {created_count} creados, {updated_count} actualizados")
    return jsonify({
        'message': f"Importación finalizada. Creados: {created_count}, Actualizados: {updated_count}",
        'created_count': created_count,
        'updated_count': updated_count,
        'errors': errors
    })

@app.route('/api/radios/next-available-id', methods=['GET'])
def get_next_available_radio_id():
    hotel_id = request.args.get('hotel_id')
    department_id = request.args.get('department_id')
    subdepartment_id = request.args.get('subdepartment_id')

    if not hotel_id:
        return jsonify({'available': False, 'error': 'Propiedad requerida'}), 400

    try:
        h_id = int(hotel_id)
        d_id = int(department_id) if department_id else None
        s_id = int(subdepartment_id) if subdepartment_id else None
    except ValueError:
        return jsonify({'available': False, 'error': 'Parámetros numéricos requeridos'}), 400

    if not d_id:
        return jsonify({'available': False, 'error': 'Selecciona un departamento'}), 200

    main_dept = db.session.get(RadioDepartment, d_id)
    sub_dept = db.session.get(RadioDepartment, s_id) if s_id else None

    # Si sub_dept no pertenece al departamento principal o está mal vinculado, buscar por ID directo
    r_start = None
    r_end = None
    if sub_dept:
        r_start = sub_dept.id_range_start
        r_end = sub_dept.id_range_end
    elif main_dept:
        r_start = main_dept.id_range_start
        r_end = main_dept.id_range_end

    assigned_id, err_msg = assign_next_sequential_radio_id(h_id, d_id, s_id)
    if err_msg or not assigned_id:
        return jsonify({
            'available': False, 
            'error': err_msg or 'No quedan IDs disponibles en este bloque',
            'range_start': r_start,
            'range_end': r_end,
            'department_name': main_dept.name if main_dept else '',
            'subdepartment_name': sub_dept.name if sub_dept else ''
        }), 200

    return jsonify({
        'available': True,
        'next_id': assigned_id,
        'range_start': r_start,
        'range_end': r_end,
        'department_name': main_dept.name if main_dept else '',
        'subdepartment_name': sub_dept.name if sub_dept else ''
    }), 200
# API: Rangos de IDs por Departamento
@app.route('/api/radios/departments', methods=['GET'])
def get_radio_departments():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    hotel_id = request.args.get('hotel_id')
    allowed_ids = get_user_radio_allowed_hotel_ids(user)
    
    if hotel_id:
        try:
            h_id = int(hotel_id)
            if h_id not in allowed_ids:
                return jsonify({'error': 'No autorizado para esta propiedad'}), 403
            depts = RadioDepartment.query.filter_by(hotel_id=h_id).order_by(RadioDepartment.name).all()
        except ValueError:
            return jsonify({'error': 'ID de propiedad inválido'}), 400
    else:
        depts = RadioDepartment.query.filter(RadioDepartment.hotel_id.in_(allowed_ids)).order_by(RadioDepartment.name).all() if allowed_ids else []
        
    res = []
    for d in depts:
        d_dict = d.to_dict()
        r_count = RadioItem.query.filter(
            db.or_(RadioItem.department_id == d.id, RadioItem.subdepartment_id == d.id)
        ).count()
        d_dict['radios_count'] = r_count
        res.append(d_dict)
        
    return jsonify(res)

@app.route('/api/radios/departments', methods=['POST'])
def create_radio_department():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    data = request.json or {}
    hotel_id = data.get('hotel_id')
    dept_name = (data.get('name') or '').strip()
    parent_id = data.get('parent_department_id')
    auto_range = data.get('auto_range', True)
    id_qty = data.get('id_qty', 35)
    
    if not hotel_id or not dept_name:
        return jsonify({'error': 'Propiedad y nombre de departamento son obligatorios'}), 400
        
    h_id = int(hotel_id)
    if not can_user_access_radio_hotel(user, h_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para gestionar esta propiedad'}), 403
        
    parent_dept_id = int(parent_id) if parent_id else None
    if parent_dept_id:
        parent_obj = RadioDepartment.query.get(parent_dept_id)
        if not parent_obj or parent_obj.hotel_id != h_id:
            return jsonify({'error': 'El departamento principal seleccionado no existe en esta propiedad'}), 400

    r_start = data.get('id_range_start')
    r_end = data.get('id_range_end')

    if auto_range and (r_start is None or r_end is None):
        max_range = db.session.query(db.func.max(RadioIdRange.range_end)).filter_by(hotel_id=h_id).scalar()
        max_dept = db.session.query(db.func.max(RadioDepartment.id_range_end)).filter_by(hotel_id=h_id).scalar()
        current_max = max([val for val in [max_range, max_dept] if val is not None], default=1000)
        
        try:
            qty = int(id_qty) if id_qty else 35
        except (ValueError, TypeError):
            qty = 35
        qty = max(1, qty)
        
        r_start = current_max + 1
        r_end = r_start + qty - 1

    dept = RadioDepartment(
        hotel_id=h_id,
        name=dept_name,
        parent_department_id=parent_dept_id,
        id_range_start=r_start,
        id_range_end=r_end
    )
    db.session.add(dept)
    db.session.flush()
    
    if r_start and r_end:
        main_d_id = parent_dept_id if parent_dept_id else dept.id
        sub_d_id = dept.id if parent_dept_id else None
        
        existing_rng = RadioIdRange.query.filter_by(
            hotel_id=h_id,
            department_id=main_d_id,
            subdepartment_id=sub_d_id
        ).first()
        if not existing_rng:
            rng = RadioIdRange(
                hotel_id=h_id,
                department_id=main_d_id,
                subdepartment_id=sub_d_id,
                range_start=r_start,
                range_end=r_end,
                active=True
            )
            db.session.add(rng)
        else:
            existing_rng.range_start = r_start
            existing_rng.range_end = r_end
            existing_rng.active = True
    
    areas_data = data.get('areas', [])
    for area_name in areas_data:
        if isinstance(area_name, str) and area_name.strip():
            db.session.add(RadioArea(department_id=dept.id, name=area_name.strip()))
            
    db.session.commit()
    log_activity(user.username, 'Módulo Radios', f"Creó departamento '{dept_name}' en propiedad #{hotel_id} con bloque IDs [{r_start}-{r_end}]")
    return jsonify(dept.to_dict()), 201

@app.route('/api/radios/departments/<int:dept_id>', methods=['DELETE'])
def delete_radio_department(dept_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    dept = RadioDepartment.query.get_or_404(dept_id)
    if not can_user_access_radio_hotel(user, dept.hotel_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para gestionar esta propiedad'}), 403
        
    r_count = RadioItem.query.filter(
        db.or_(RadioItem.department_id == dept.id, RadioItem.subdepartment_id == dept.id)
    ).count()
    if r_count > 0:
        return jsonify({'error': f"No se puede eliminar '{dept.name}' porque tiene {r_count} radio(s) asignados."}), 400

    if dept.parent_department_id is None:
        subdepts = RadioDepartment.query.filter_by(parent_department_id=dept.id).all()
        for sub in subdepts:
            sub_r_count = RadioItem.query.filter(
                db.or_(RadioItem.department_id == sub.id, RadioItem.subdepartment_id == sub.id)
            ).count()
            if sub_r_count > 0:
                return jsonify({'error': f"No se puede eliminar el departamento principal '{dept.name}' porque el subdepartamento '{sub.name}' tiene {sub_r_count} radio(s) asignados."}), 400

        for sub in subdepts:
            RadioIdRange.query.filter(
                db.or_(RadioIdRange.department_id == sub.id, RadioIdRange.subdepartment_id == sub.id)
            ).delete(synchronize_session=False)
            db.session.delete(sub)

    RadioIdRange.query.filter(
        db.or_(RadioIdRange.department_id == dept.id, RadioIdRange.subdepartment_id == dept.id)
    ).delete(synchronize_session=False)

    dept_name = dept.name
    hotel_id = dept.hotel_id
    db.session.delete(dept)
    db.session.commit()

    log_activity(user.username, 'Módulo Radios', f"Eliminó el departamento '{dept_name}' (#{dept_id}) de la propiedad #{hotel_id}")
    return jsonify({'message': f"Departamento '{dept_name}' eliminado correctamente."}), 200

@app.route('/api/radios/id-ranges', methods=['GET'])
def get_radio_id_ranges():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
    
    allowed_ids = get_user_radio_allowed_hotel_ids(user)
    hotel_id = request.args.get('hotel_id')
    
    query = RadioIdRange.query
    if hotel_id and hotel_id != 'all':
        try:
            h_id = int(hotel_id)
            if h_id not in allowed_ids:
                return jsonify({'error': 'No autorizado'}), 403
            query = query.filter_by(hotel_id=h_id)
        except ValueError:
            query = query.filter(RadioIdRange.hotel_id.in_(allowed_ids))
    else:
        query = query.filter(RadioIdRange.hotel_id.in_(allowed_ids)) if allowed_ids else query.filter(db.false())
        
    ranges = query.order_by(RadioIdRange.hotel_id, RadioIdRange.department_id, RadioIdRange.range_start).all()
    return jsonify([r.to_dict() for r in ranges])

@app.route('/api/radios/id-ranges', methods=['POST'])
def create_radio_id_range():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
    
    data = request.json or {}
    hotel_id = data.get('hotel_id')
    department_id = data.get('department_id')
    subdepartment_id = data.get('subdepartment_id')
    range_start = data.get('range_start')
    range_end = data.get('range_end')
    
    if not hotel_id or not department_id or range_start is None or range_end is None:
        return jsonify({'error': 'Faltan campos obligatorios para el rango'}), 400
        
    try:
        h_id = int(hotel_id)
        dept_id = int(department_id)
        r_start = int(range_start)
        r_end = int(range_end)
    except ValueError:
        return jsonify({'error': 'Valores numéricos inválidos'}), 400
        
    if not can_user_access_radio_hotel(user, h_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para gestionar esta propiedad'}), 403
        
    if r_end < r_start:
        return jsonify({'error': 'El ID final debe ser mayor o igual al ID inicial'}), 400
        
    overlap, overlap_msg = check_radio_id_range_overlap(h_id, r_start, r_end)
    if overlap:
        return jsonify({'error': overlap_msg}), 400
        
    new_range = RadioIdRange(
        hotel_id=h_id,
        department_id=dept_id,
        subdepartment_id=int(subdepartment_id) if subdepartment_id else None,
        range_start=r_start,
        range_end=r_end,
        active=True
    )
    db.session.add(new_range)
    db.session.commit()
    
    log_activity(user.username, 'Configuración Radios', f"Creó rango de IDs [{r_start}-{r_end}] para depto #{dept_id} en propiedad #{h_id}")
    return jsonify(new_range.to_dict()), 201

@app.route('/api/radios/id-ranges/<int:range_id>', methods=['DELETE'])
def delete_radio_id_range(range_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    range_obj = RadioIdRange.query.get_or_404(range_id)
    if not can_user_access_radio_hotel(user, range_obj.hotel_id, need_manage=True):
        return jsonify({'error': 'Sin permiso'}), 403
        
    db.session.delete(range_obj)
    db.session.commit()
    log_activity(user.username, 'Configuración Radios', f"Eliminó rango de IDs #{range_id}")
    return jsonify({'message': 'Rango eliminado correctamente'})

# ----------------------------------------------------
# NUEVOS ENDPOINTS: AMPLIACIÓN Y REASIGNACIÓN DE IDs
# ----------------------------------------------------

def get_used_radio_ids_set(hotel_id):
    """Retorna un conjunto de enteros con todos los IDs numéricos extraídos de radio_code en el hotel indicado."""
    existing_items = RadioItem.query.filter_by(hotel_id=hotel_id).all()
    used_ids = set()
    for item in existing_items:
        if item.radio_code:
            digits = ''.join(c for c in str(item.radio_code) if c.isdigit())
            if digits:
                try:
                    used_ids.add(int(digits))
                except ValueError:
                    pass
    return used_ids

@app.route('/api/radios/id-ranges/subdept-free-ids', methods=['GET'])
def get_subdepartment_free_ids():
    """Consulta la disponibilidad de IDs libres en los subdepartamentos de un departamento principal."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401

    hotel_id = request.args.get('hotel_id', type=int)
    department_id = request.args.get('department_id', type=int)

    if not hotel_id or not department_id:
        return jsonify({'error': 'Faltan parámetros obligatorios'}), 400

    if not can_user_access_radio_hotel(user, hotel_id):
        return jsonify({'error': 'No autorizado'}), 403

    subdepts = RadioDepartment.query.filter_by(hotel_id=hotel_id, parent_department_id=department_id).all()
    used_ids = get_used_radio_ids_set(hotel_id)

    result = []
    for sub in subdepts:
        # Obtener rangos activos de este subdepartamento
        ranges = RadioIdRange.query.filter_by(
            hotel_id=hotel_id,
            department_id=department_id,
            subdepartment_id=sub.id,
            active=True
        ).all()

        total_ids_assigned = []
        for r in ranges:
            total_ids_assigned.extend(range(r.range_start, r.range_end + 1))

        free_ids = [i for i in total_ids_assigned if i not in used_ids]
        used_count = len(total_ids_assigned) - len(free_ids)

        result.append({
            'subdepartment_id': sub.id,
            'subdepartment_name': sub.name,
            'total_ids_count': len(total_ids_assigned),
            'used_ids_count': used_count,
            'free_ids_count': len(free_ids),
            'free_ids': free_ids
        })

    return jsonify(result)

@app.route('/api/radios/id-ranges/expand', methods=['POST'])
def expand_radio_id_range():
    """Aumenta automáticamente el rango de IDs para un departamento o subdepartamento."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401

    data = request.json or {}
    hotel_id = data.get('hotel_id')
    department_id = data.get('department_id')
    subdepartment_id = data.get('subdepartment_id')
    count = data.get('count')

    if not hotel_id or not department_id or not count:
        return jsonify({'error': 'Faltan campos obligatorios (hotel_id, department_id, count)'}), 400

    try:
        h_id = int(hotel_id)
        dept_id = int(department_id)
        subdept_id = int(subdepartment_id) if subdepartment_id else None
        add_count = int(count)
    except ValueError:
        return jsonify({'error': 'Valores numéricos inválidos'}), 400

    if add_count <= 0:
        return jsonify({'error': 'La cantidad de IDs a agregar debe ser mayor a 0'}), 400

    if not can_user_access_radio_hotel(user, h_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para gestionar esta propiedad'}), 403

    dept = RadioDepartment.query.get(dept_id)
    if not dept or dept.hotel_id != h_id:
        return jsonify({'error': 'Departamento no encontrado'}), 404

    subdept = RadioDepartment.query.get(subdept_id) if subdept_id else None
    dept_label = f"{dept.name} > {subdept.name}" if subdept else dept.name

    # Buscar el rango activo con el mayor range_end para este departamento/subdepartamento
    query = RadioIdRange.query.filter_by(hotel_id=h_id, department_id=dept_id, active=True)
    if subdept_id:
        query = query.filter_by(subdepartment_id=subdept_id)
    else:
        query = query.filter(RadioIdRange.subdepartment_id.is_(None))

    existing_range = query.order_by(RadioIdRange.range_end.desc()).first()

    if existing_range:
        # Intentar extender el rango existente de forma contigua
        desired_start = existing_range.range_end + 1
        desired_end = existing_range.range_end + add_count

        overlap, _ = is_id_range_overlapping(h_id, desired_start, desired_end, exclude_id=existing_range.id)
        if not overlap:
            # Extensión directa contigua sin solapamiento
            existing_range.range_end = desired_end
            if not subdept_id:
                dept.id_range_end = max(dept.id_range_end or 0, desired_end)
            db.session.commit()
            log_activity(user.username, 'Configuración Radios', f"Amplió rango de IDs a [{existing_range.range_start}-{desired_end}] para '{dept_label}'")
            return jsonify({
                'message': f"Se ampliaron +{add_count} IDs exitosamente. Rango actualizado: [{existing_range.range_start} - {desired_end}]",
                'range': existing_range.to_dict()
            }), 200

    # Si no existía o si la extensión contigua solapaba, buscar el siguiente bloque contiguo libre en la propiedad
    all_ranges = RadioIdRange.query.filter_by(hotel_id=h_id, active=True).order_by(RadioIdRange.range_start).all()
    used_ids = get_used_radio_ids_set(h_id)

    # Punto de partida sugerido
    max_end = max([r.range_end for r in all_ranges] + [1000]) if all_ranges else 1000
    candidate_start = max_end + 1

    # Buscar bloque contiguo que no colisione con ningún rango ni IDs usados
    found = False
    for start_try in range(candidate_start, 99999):
        end_try = start_try + add_count - 1
        overlap, _ = is_id_range_overlapping(h_id, start_try, end_try)
        if not overlap:
            # Verificar que no colisione con IDs de radios usados
            if not any(cid in used_ids for cid in range(start_try, end_try + 1)):
                candidate_start = start_try
                found = True
                break

    if not found:
        return jsonify({'error': 'No se encontró un bloque libre contiguo en la propiedad'}), 400

    new_range = RadioIdRange(
        hotel_id=h_id,
        department_id=dept_id,
        subdepartment_id=subdept_id,
        range_start=candidate_start,
        range_end=candidate_start + add_count - 1,
        active=True
    )
    db.session.add(new_range)
    if not subdept_id:
        if not dept.id_range_start or dept.id_range_start == 0:
            dept.id_range_start = new_range.range_start
        dept.id_range_end = max(dept.id_range_end or 0, new_range.range_end)

    db.session.commit()
    log_activity(user.username, 'Configuración Radios', f"Creó nuevo bloque de IDs [{new_range.range_start}-{new_range.range_end}] para '{dept_label}' (+{add_count} IDs)")
    return jsonify({
        'message': f"Se asignaron +{add_count} IDs en un nuevo bloque [{new_range.range_start} - {new_range.range_end}] para '{dept_label}'",
        'range': new_range.to_dict()
    }), 201

@app.route('/api/radios/id-ranges/reallocate', methods=['POST'])
def reallocate_radio_id_range():
    """Transfiere IDs libres (no asignados a radios) de un subdepartamento origen a uno destino del mismo departamento principal."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401

    data = request.json or {}
    hotel_id = data.get('hotel_id')
    source_subdept_id = data.get('source_subdepartment_id')
    target_subdept_id = data.get('target_subdepartment_id')
    count = data.get('count')

    if not hotel_id or not source_subdept_id or not target_subdept_id or not count:
        return jsonify({'error': 'Faltan campos obligatorios'}), 400

    try:
        h_id = int(hotel_id)
        source_id = int(source_subdept_id)
        target_id = int(target_subdept_id)
        transfer_count = int(count)
    except ValueError:
        return jsonify({'error': 'Valores numéricos inválidos'}), 400

    if transfer_count <= 0:
        return jsonify({'error': 'La cantidad de IDs a transferir debe ser mayor a 0'}), 400

    if source_id == target_id:
        return jsonify({'error': 'El subdepartamento origen y destino deben ser diferentes'}), 400

    if not can_user_access_radio_hotel(user, h_id, need_manage=True):
        return jsonify({'error': 'Sin permiso para gestionar esta propiedad'}), 403

    source_sub = RadioDepartment.query.get(source_id)
    target_sub = RadioDepartment.query.get(target_id)

    if not source_sub or not target_sub:
        return jsonify({'error': 'Subdepartamentos no encontrados'}), 404

    if source_sub.parent_department_id != target_sub.parent_department_id:
        return jsonify({'error': 'La transferencia solo está permitida entre subdepartamentos del mismo departamento principal'}), 400

    dept_id = source_sub.parent_department_id
    used_ids = get_used_radio_ids_set(h_id)

    # Rangos del subdepartamento origen
    source_ranges = RadioIdRange.query.filter_by(
        hotel_id=h_id,
        department_id=dept_id,
        subdepartment_id=source_id,
        active=True
    ).order_by(RadioIdRange.range_end.desc()).all()

    # Recolectar IDs libres del origen de mayor a menor
    free_ids_in_source = []
    for r in source_ranges:
        for val in range(r.range_end, r.range_start - 1, -1):
            if val not in used_ids:
                free_ids_in_source.append((r, val))

    if len(free_ids_in_source) < transfer_count:
        return jsonify({
            'error': f"El subdepartamento '{source_sub.name}' solo cuenta con {len(free_ids_in_source)} ID(s) libre(s) sin asignar."
        }), 400

    # Seleccionar los `transfer_count` IDs libres a mover
    selected_to_move = free_ids_in_source[:transfer_count]
    moved_id_values = sorted([val for _, val in selected_to_move])

    # Ajustar rangos del origen retirando los IDs libres seleccionados
    for rng, val in selected_to_move:
        if val == rng.range_end and rng.range_start < rng.range_end:
            rng.range_end -= 1
        elif val == rng.range_start and rng.range_start < rng.range_end:
            rng.range_start += 1
        elif rng.range_start == rng.range_end:
            db.session.delete(rng)
        else:
            # Dividir rango intermedio
            orig_end = rng.range_end
            rng.range_end = val - 1
            new_split = RadioIdRange(
                hotel_id=h_id,
                department_id=dept_id,
                subdepartment_id=source_id,
                range_start=val + 1,
                range_end=orig_end,
                active=True
            )
            db.session.add(new_split)

    # Asignar los IDs al subdepartamento destino en bloques continuos
    # Agrupar los `moved_id_values` en sub-bloques continuos
    blocks = []
    curr_start = moved_id_values[0]
    curr_prev = moved_id_values[0]

    for val in moved_id_values[1:]:
        if val == curr_prev + 1:
            curr_prev = val
        else:
            blocks.append((curr_start, curr_prev))
            curr_start = val
            curr_prev = val
    blocks.append((curr_start, curr_prev))

    for b_start, b_end in blocks:
        # Intentar fusionar o extender con rangos existentes del destino
        target_range = RadioIdRange.query.filter_by(
            hotel_id=h_id,
            department_id=dept_id,
            subdepartment_id=target_id,
            active=True
        ).filter(
            db.or_(
                RadioIdRange.range_end == b_start - 1,
                RadioIdRange.range_start == b_end + 1
            )
        ).first()

        if target_range:
            if target_range.range_end == b_start - 1:
                target_range.range_end = b_end
            elif target_range.range_start == b_end + 1:
                target_range.range_start = b_start
        else:
            new_target_range = RadioIdRange(
                hotel_id=h_id,
                department_id=dept_id,
                subdepartment_id=target_id,
                range_start=b_start,
                range_end=b_end,
                active=True
            )
            db.session.add(new_target_range)

    db.session.commit()

    ids_summary = f"{moved_id_values[0]}-{moved_id_values[-1]}" if len(moved_id_values) > 1 else f"{moved_id_values[0]}"
    log_activity(user.username, 'Configuración Radios', f"Transfirió {transfer_count} IDs ({ids_summary}) de '{source_sub.name}' a '{target_sub.name}'")

    return jsonify({
        'message': f"Se transfirieron exitosamente {transfer_count} IDs de '{source_sub.name}' a '{target_sub.name}'. IDs: {ids_summary}",
        'moved_ids': moved_id_values
    }), 200




# API: Decomisos y Bajas
@app.route('/api/radios/decommissions', methods=['GET'])
def get_radio_decommissions():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
        
    allowed_ids = get_user_radio_allowed_hotel_ids(user)
    hotel_id = request.args.get('hotel_id')
    
    query = RadioItem.query.filter(RadioItem.status.in_(['danado', 'perdido', 'fuera_servicio']))
    if hotel_id and hotel_id != 'all':
        try:
            h_id = int(hotel_id)
            if h_id not in allowed_ids:
                return jsonify({'error': 'No autorizado'}), 403
            query = query.filter(RadioItem.hotel_id == h_id)
        except ValueError:
            query = query.filter(RadioItem.hotel_id.in_(allowed_ids))
    else:
        query = query.filter(RadioItem.hotel_id.in_(allowed_ids)) if allowed_ids else query.filter(db.false())
        
    radios = query.order_by(RadioItem.updated_at.desc()).all()
    res = []
    for r in radios:
        d = r.to_dict()
        d['decommission_reason'] = r.notes or 'Fuera de operación / Baja'
        d['decommission_date'] = r.updated_at.strftime('%d/%m/%Y %H:%M') if r.updated_at else ''
        d['decommission_user'] = r.assigned_by or 'Sistema'
        res.append(d)
    return jsonify(res)

# Alias de compatibilidad
@app.route('/api/radios/items', methods=['GET'])
def get_radios_items_alias():
    return get_radios_list()

@app.route('/api/radios/items', methods=['POST'])
def create_radio_item_alias():
    return create_radio()

@app.route('/api/radios/formal-inventories', methods=['GET'])
def get_formal_inventories_alias():
    return get_formal_inventories()


if __name__ == '__main__':
    # Habilitar debug solo si la variable FLASK_DEBUG es "True"
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    # Iniciar scheduler de alertas automáticas en background
    inactivity_cfg = load_inactivity_settings()
    alert_interval_hours = int(inactivity_cfg.get('alert_interval_hours', 1))
    
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        func=run_inactivity_alert_job,
        trigger='interval',
        hours=alert_interval_hours,
        id='inactivity_alert_job',
        name='Alerta Automática de Inactividad',
        replace_existing=True
    )
    scheduler.start()
    print(f"[SCHEDULER] Scheduler iniciado - revision cada {alert_interval_hours} hora(s).")
    
    app.run(debug=debug_mode, host='0.0.0.0', port=5000)
