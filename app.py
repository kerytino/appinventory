# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
# pyrefly: ignore [missing-import]
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import os
import json
from io import BytesIO
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

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import threading
import atexit
from apscheduler.schedulers.background import BackgroundScheduler

EMAIL_SETTINGS_FILE = os.path.join(basedir, 'email_settings.json')
ALERT_STATE_FILE = os.path.join(basedir, 'alert_state.json')

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
        msg = MIMEMultipart()
        msg['From'] = settings.get('sender_email') or settings.get('smtp_user')
        msg['To'] = ", ".join(recipient_list)
        msg['Subject'] = subject
        
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
            'name': self.name,
            'type': self.device_type,
            'brand': self.brand,
            'model': self.model,
            'serial_number': self.serial_number,
            'mac_address': self.mac_address,
            'status': self.status,
            'repair_count': self.repair_count,
            'location': self.location,
            'warehouse': self.warehouse,
            'description': self.description,
            'value': self.value,
            'quantity': self.quantity,
            'dispatched_by': self.dispatched_by,
            'warranty_sent_by': self.warranty_sent_by,
            'warranty_provider': self.warranty_provider,
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
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    
    def to_dict(self):
        return {'id': self.id, 'name': self.name}

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='Viewer') # Admin, Tecnico, Viewer
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        raw_role = (self.role or '').strip().lower()
        if raw_role == 'admin':
            normalized_role = 'Admin'
        elif raw_role in ['tecnico', 'técnico']:
            normalized_role = 'Tecnico'
        else:
            normalized_role = 'Viewer'
        return {'id': self.id, 'username': self.username, 'role': normalized_role}

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

    # Consolidar duplicados en el inicio del servidor
    consolidate_existing_inventory()


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

@app.route('/configuracion')
def configuracion():
    return render_template('configuracion.html')

@app.route('/api/devices', methods=['GET'])
def get_devices():
    devices = Device.query.all()
    return jsonify([d.to_dict() for d in devices])

@app.route('/api/devices', methods=['POST'])
def add_device():
    data = request.json
    new_device = Device(
        name=data['name'],
        device_type=data['type'],
        brand=data.get('brand', ''),
        model=data.get('model', ''),
        serial_number=data.get('serial_number', ''),
        mac_address=data.get('mac_address', ''),
        status=data['status'],
        repair_count=int(data.get('repair_count', 0)),
        location=data.get('location', ''),
        warehouse=data.get('warehouse', ''),
        dispatched_by=data.get('dispatched_by', ''),
        warranty_sent_by=data.get('warranty_sent_by', ''),
        warranty_provider=data.get('warranty_provider', ''),
        description=data.get('description', ''),
        value=float(data.get('value', 0.0)),
        quantity=int(data.get('quantity', 1))
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
    new_warehouse = data.get('warehouse', old_warehouse)
    new_location = data.get('location', old_location)
    
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
    
    if 'name' in data: device.name = data['name']
    if 'type' in data: device.device_type = data['type']
    if 'brand' in data: device.brand = data['brand']
    if 'model' in data: device.model = data['model']
    if 'serial_number' in data: device.serial_number = data['serial_number']
    if 'mac_address' in data: device.mac_address = data['mac_address']
    
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
    logo_path = os.path.join(basedir, 'static', 'img', 'logo.png')
    if os.path.exists(logo_path):
        img_logo = Image(logo_path, width=170, height=45)
    else:
        img_logo = Paragraph("<b>LOGO DE LA EMPRESA</b>", title_style)
        
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
    
    header_table = Table([[img_logo, p_control]], colWidths=[280, 275])
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
        Paragraph(":Solicitado por", sig_title_style),
        Spacer(1, 18),
        HRFlowable(width="80%", thickness=0.5, color=colors.black, spaceAfter=2),
        Paragraph("Gerente de Área", sig_style)
    ]
    
    f1_col2 = [
        Paragraph(":Revisado por", sig_title_style),
        Spacer(1, 18),
        HRFlowable(width="80%", thickness=0.5, color=colors.black, spaceAfter=2),
        Paragraph("Reporting & Accounting Assistant", sig_style)
    ]
    
    f1_col3 = [
        Paragraph(":Verificado por", sig_title_style),
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

    if hotel_id:
        hotel_obj = Hotel.query.get(int(hotel_id))
    elif hotel_filter and hotel_filter != 'all':
        hotel_obj = Hotel.query.filter_by(name=hotel_filter).first()

    # Determinar los decomisos a exportar
    if hotel_obj:
        decommissions = Decommission.query.filter_by(hotel=hotel_obj.name).all()
        loc_display   = hotel_obj.name.upper()
        # Inyectar datos del hotel en el payload para el PDF
        params['hotel_name']  = hotel_obj.name
        params['hotel_sigla'] = hotel_obj.sigla or ''
        params['hotel_logo']  = hotel_obj.logo  or ''
    elif hotel_filter and hotel_filter != 'all':
        decommissions = Decommission.query.filter_by(hotel=hotel_filter).all()
        loc_display   = hotel_filter.upper()
    else:
        decommissions = Decommission.query.all()
        loc_display   = "TODOS LOS HOTELES"

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
    log_activity(current_username(), 'Configuracion Hoteles', f'Se agrego la propiedad: {name} ({sigla})')
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
    items = Technician.query.all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/settings/technicians', methods=['POST'])
def add_technician():
    data = request.json
    item = Technician(name=data['name'])
    db.session.add(item)
    db.session.commit()
    log_activity(current_username(), 'Nuevo Almacén', f'Almacén {item.name} creado.')
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
    items = Provider.query.all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/settings/providers', methods=['POST'])
def add_provider():
    data = request.json
    item = Provider(name=data['name'])
    db.session.add(item)
    db.session.commit()
    log_activity(current_username(), 'Nuevo Almacén', f'Almacén {item.name} creado.')
    return jsonify(item.to_dict()), 201

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
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'Viewer')
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'El usuario ya existe'}), 400
    
    new_user = User(username=username, role=role)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    log_activity(current_username(), 'Nuevo Usuario', f'Usuario {new_user.username} creado.')
    return jsonify(new_user.to_dict()), 201

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
    if session.get('role') != 'Admin':
        return jsonify({'error': 'No autorizado'}), 403
    try:
        entry = request.json
        catalog = []
        if os.path.exists(CATALOG_FILE):
            with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
        
        # Check duplicate
        exists = any(
            item.get('type') == entry.get('type') and 
            item.get('brand') == entry.get('brand') and 
            item.get('model') == entry.get('model') 
            for item in catalog
        )
        if not exists:
            catalog.append(entry)
            with open(CATALOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(catalog, f, indent=4, ensure_ascii=False)
            log_activity(current_username(), 'Catálogo Equipos', f"Se agregó modelo al catálogo: {entry.get('brand')} {entry.get('model')} ({entry.get('type')})")
            return jsonify({'message': 'Modelo agregado correctamente al catálogo'}), 200
        else:
            return jsonify({'error': 'El modelo ya existe en el catálogo'}), 400
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
                    <p style='margin:5px 0 0 0;opacity:0.85;'>NetVault - Seguimiento Operativo</p>
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
                    <p style='margin-top:20px;'>Por favor ingresa a <strong>NetVault</strong> para actualizar los avances de estos pendientes.</p>
                    <p style='color:#888;font-size:11px;'>Este correo fue generado automaticamente por el scheduler de alertas de NetVault. Intervalo configurado: cada {alert_interval_hours} hora(s).</p>
                </div>
            </div>
            """
            
            success, msg = send_email_alert(
                subject=f"[NetVault] ALERTA: {len(stale_tasks)} Pendiente(s) con Inactividad Vencida",
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
                subject="[NetVault] Correo de Prueba de Notificaciones",
                body="<h3>Configuración SMTP Exitosa</h3><p>Este es un correo de prueba enviado desde NetVault para confirmar la recepción de alertas de seguimiento operativo.</p>",
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
        <p><br>Por favor ingresa a NetVault para coordinar los avances.</p>
        """
        send_email_alert("[NetVault] ALERTA: Pendientes e Inactividad Operativa", body)
        
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
    
    # Detener el scheduler limpiamente al cerrar la app
    atexit.register(lambda: scheduler.shutdown(wait=False))
    
    app.run(debug=debug_mode, port=5000)
