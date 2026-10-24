import base64
import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
DB_PATH = BACKEND_DIR / 'attendance.db'
FACES_DIR = BACKEND_DIR / 'faces'
MODEL_PATH = BACKEND_DIR / 'lbph_model.xml'
CASCADE_PATH = BACKEND_DIR / 'haarcascade_frontalface_default.xml'
FACE_MATCH_THRESHOLD = 80.0


def ensure_cascade_file():
    if CASCADE_PATH.exists():
        return CASCADE_PATH

    cascade_url = 'https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml'
    import urllib.request

    try:
        with urllib.request.urlopen(cascade_url, timeout=20) as response:
            cascade_xml = response.read()
        CASCADE_PATH.write_bytes(cascade_xml)
        return CASCADE_PATH
    except Exception:
        fallback = Path(cv2.data.haarcascades) / 'haarcascade_frontalface_default.xml'
        if fallback.exists():
            return fallback
        raise FileNotFoundError('Face detection model file could not be downloaded or found.')


app = Flask(__name__, static_folder=None)
app.config['JSON_SORT_KEYS'] = False
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024

face_cascade = cv2.CascadeClassifier(str(ensure_cascade_file()))


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def init_db():
    FACES_DIR.mkdir(exist_ok=True)
    conn = get_db_connection()
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            roll_number TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            face_path TEXT
        )
        '''
    )
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            subject_id INTEGER,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES students(id),
            FOREIGN KEY(subject_id) REFERENCES subjects(id)
        )
        '''
    )
    attendance_columns = {
        row['name'] for row in conn.execute('PRAGMA table_info(attendance)').fetchall()
    }
    if 'subject_id' not in attendance_columns:
        conn.execute('ALTER TABLE attendance ADD COLUMN subject_id INTEGER REFERENCES subjects(id)')

    conn.execute('INSERT OR IGNORE INTO subjects (name) VALUES (?)', ('General',))
    default_subject_id = conn.execute(
        'SELECT id FROM subjects WHERE name = ?', ('General',)
    ).fetchone()['id']
    conn.execute(
        'UPDATE attendance SET subject_id = ? WHERE subject_id IS NULL',
        (default_subject_id,),
    )
    conn.execute(
        '''
        CREATE INDEX IF NOT EXISTS attendance_student_subject_date
        ON attendance (student_id, subject_id, date)
        '''
    )
    conn.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS subjects_name_case_insensitive '
        'ON subjects (name COLLATE NOCASE)'
    )
    conn.commit()
    conn.close()


def decode_base64_image(data_url: str):
    if not data_url:
        raise ValueError('No image was provided.')

    match = re.match(r'^data:image/(png|jpeg|jpg);base64,', data_url)
    if match is None:
        raise ValueError('Unsupported image format. Please use a PNG or JPEG file.')

    encoded = data_url.split(',', 1)[1]
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError('The uploaded image is not valid base64 data.') from exc
    if not image_bytes or len(image_bytes) > 6 * 1024 * 1024:
        raise ValueError('The uploaded image is empty or too large.')
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError('The uploaded image could not be read.')
    return image


def detect_face(gray_image):
    faces = face_cascade.detectMultiScale(gray_image, scaleFactor=1.1, minNeighbors=5, minSize=(70, 70))
    if len(faces) == 0:
        raise ValueError('No face was detected. Please position the face properly in front of the camera.')
    if len(faces) > 1:
        raise ValueError('More than one face was detected. Make sure only one person is in the frame.')
    x, y, w, h = faces[0]
    face_crop = gray_image[y:y + h, x:x + w]
    face_crop = cv2.resize(face_crop, (200, 200), interpolation=cv2.INTER_LINEAR)
    return face_crop


def save_face_sample(student_id: int, face_crop):
    sample_name = f'{student_id}_{datetime.now().strftime("%Y%m%d%H%M%S")}_{uuid.uuid4().hex[:8]}.jpg'
    sample_path = FACES_DIR / sample_name
    if not cv2.imwrite(str(sample_path), face_crop):
        raise RuntimeError('Could not save the face sample.')
    return str(sample_path)


def build_model():
    samples = []
    labels = []
    for sample_path in sorted(FACES_DIR.glob('*.jpg')):
        try:
            student_id = int(sample_path.stem.split('_', 1)[0])
        except ValueError:
            continue

        image = cv2.imread(str(sample_path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            continue

        samples.append(image)
        labels.append(student_id)

    if not samples:
        return None

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.train(samples, np.asarray(labels, dtype=np.int32))
    recognizer.write(str(MODEL_PATH))
    return recognizer


def get_student_by_id(student_id):
    conn = get_db_connection()
    student = conn.execute(
        'SELECT id, name, roll_number FROM students WHERE id = ?',
        (student_id,),
    ).fetchone()
    conn.close()
    return dict(student) if student else None


def get_subject(subject_id):
    conn = get_db_connection()
    subject = conn.execute(
        'SELECT id, name FROM subjects WHERE id = ?', (subject_id,)
    ).fetchone()
    conn.close()
    return dict(subject) if subject else None


def parse_subject_id(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError('A valid subject must be selected.')
    try:
        subject_id = int(value)
    except (TypeError, ValueError):
        raise ValueError('A valid subject must be selected.')
    if get_subject(subject_id) is None:
        raise ValueError('The selected subject does not exist.')
    return subject_id


def get_attendance_records(subject_id):
    conn = get_db_connection()
    rows = conn.execute(
        '''
        SELECT a.id, s.name as student_name, s.roll_number, a.date, a.time,
               sub.name AS subject
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        JOIN subjects sub ON sub.id = a.subject_id
        WHERE a.subject_id = ?
        ORDER BY a.id DESC
        LIMIT 20
        ''',
        (subject_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_students_with_count(subject_id):
    conn = get_db_connection()
    rows = conn.execute(
        '''
        WITH tracked_days AS (
            SELECT DISTINCT date FROM attendance WHERE subject_id = ?
        ),
        student_present_days AS (
            SELECT student_id,
                   COUNT(DISTINCT date) AS present_days
            FROM attendance WHERE subject_id = ?
            GROUP BY student_id
        )
        SELECT s.id, s.name, s.roll_number,
               COALESCE(spd.present_days, 0) AS present_days,
               COUNT(DISTINCT td.date) AS tracked_days
        FROM students s
        LEFT JOIN student_present_days spd ON spd.student_id = s.id
        LEFT JOIN tracked_days td ON td.date >= date(s.created_at)
        GROUP BY s.id, s.name, s.roll_number
        ORDER BY s.name ASC
        ''',
        (subject_id, subject_id),
    ).fetchall()
    conn.close()
    students = []
    for row in rows:
        student = dict(row)
        student['absent_days'] = max(student['tracked_days'] - student['present_days'], 0)
        students.append(student)
    return students


def recognize_in_image(image, subject_id):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    face = detect_face(gray)

    if not MODEL_PATH.exists():
        recognizer = build_model()
    else:
        recognizer = cv2.face.LBPHFaceRecognizer_create()
        recognizer.read(str(MODEL_PATH))

    if recognizer is None:
        return {'status': 'unknown'}

    label_id, confidence = recognizer.predict(face)

    if confidence > FACE_MATCH_THRESHOLD:
        return {'status': 'unknown', 'message': 'Face not recognized. Try again in good lighting.'}

    student = get_student_by_id(int(label_id))
    if not student:
        return {'status': 'unknown'}

    now = datetime.now()
    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M:%S')
    conn = get_db_connection()
    conn.execute('BEGIN IMMEDIATE')
    existing = conn.execute(
        'SELECT id FROM attendance WHERE student_id = ? AND subject_id = ? AND date = ? LIMIT 1',
        (student['id'], subject_id, today),
    ).fetchone()
    already_marked = existing is not None
    if not already_marked:
        conn.execute(
            '''
            INSERT INTO attendance (student_id, subject_id, date, time)
            VALUES (?, ?, ?, ?)
            ''',
            (student['id'], subject_id, today, current_time),
        )
    conn.commit()
    conn.close()

    return {
        'status': 'already_marked' if already_marked else 'success',
        'student': student,
        'subject': get_subject(subject_id)['name'],
        'date': today,
        'time': current_time,
    }


@app.route('/')
def index():
    return send_from_directory(str(BASE_DIR), 'index.html')


@app.route('/app.js')
def frontend_script():
    return send_from_directory(str(BASE_DIR), 'app.js')


@app.route('/styles.css')
def frontend_styles():
    return send_from_directory(str(BASE_DIR), 'styles.css')


@app.route('/api/students', methods=['GET'])
def list_students():
    try:
        subject_id = parse_subject_id(request.args.get('subject_id'))
        return jsonify({'students': get_students_with_count(subject_id)})
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400


@app.route('/api/students', methods=['POST'])
def register_student():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    name = payload.get('name')
    roll_number = payload.get('roll_number')
    photo = payload.get('photo')

    if not isinstance(name, str) or not isinstance(roll_number, str):
        return jsonify({'error': 'Student name and roll number must be text.'}), 400
    name = name.strip()
    roll_number = roll_number.strip()
    if not name or not roll_number:
        return jsonify({'error': 'Student name and roll number are required.'}), 400
    if len(name) > 80 or len(roll_number) > 40:
        return jsonify({'error': 'Student name or roll number is too long.'}), 400

    if not isinstance(photo, str) or not photo:
        return jsonify({'error': 'Student image is required.'}), 400

    sample_path = None
    conn = None
    try:
        image = decode_base64_image(photo)
        face_crop = detect_face(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
        conn = get_db_connection()
        cursor = conn.execute(
            'INSERT INTO students (name, roll_number) VALUES (?, ?)',
            (name, roll_number),
        )
        student_id = cursor.lastrowid
        sample_path = save_face_sample(student_id, face_crop)
        build_model()
        conn.commit()

        return jsonify({
            'student': {
                'id': student_id,
                'name': name,
                'roll_number': roll_number,
            }
        })
    except sqlite3.IntegrityError:
        if conn:
            conn.rollback()
        if sample_path and Path(sample_path).exists():
            Path(sample_path).unlink()
        return jsonify({'error': 'This roll number is already registered.'}), 409
    except ValueError as exc:
        if conn:
            conn.rollback()
        if sample_path and Path(sample_path).exists():
            Path(sample_path).unlink()
        return jsonify({'error': str(exc)}), 400
    except (cv2.error, OSError, RuntimeError) as exc:
        if conn:
            conn.rollback()
        if sample_path and Path(sample_path).exists():
            Path(sample_path).unlink()
        app.logger.exception('Student face enrollment failed')
        return jsonify({'error': f'Face enrollment failed: {exc}'}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/subjects', methods=['GET'])
def list_subjects():
    conn = get_db_connection()
    subjects = conn.execute(
        'SELECT id, name FROM subjects ORDER BY name COLLATE NOCASE ASC'
    ).fetchall()
    conn.close()
    return jsonify({'subjects': [dict(subject) for subject in subjects]})


@app.route('/api/subjects', methods=['POST'])
def create_subject():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    name = payload.get('name')
    if not isinstance(name, str) or not name.strip():
        return jsonify({'error': 'A subject name is required.'}), 400
    name = name.strip()
    if len(name) > 60:
        return jsonify({'error': 'Subject names must be 60 characters or fewer.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.execute('INSERT INTO subjects (name) VALUES (?)', (name,))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({'error': 'A subject with this name already exists.'}), 409
    finally:
        conn.close()
    return jsonify({'subject': {'id': cursor.lastrowid, 'name': name}}), 201


@app.route('/api/system', methods=['GET'])
def system_summary():
    try:
        subject_id = parse_subject_id(request.args.get('subject_id'))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    conn = get_db_connection()
    total_students = conn.execute('SELECT COUNT(*) AS count FROM students').fetchone()['count']
    total_attendance = conn.execute(
        'SELECT COUNT(*) AS count FROM attendance WHERE subject_id = ?', (subject_id,)
    ).fetchone()['count']
    today = datetime.now().strftime('%Y-%m-%d')
    present_today = conn.execute(
        'SELECT COUNT(DISTINCT student_id) AS count FROM attendance WHERE date = ? AND subject_id = ?',
        (today, subject_id),
    ).fetchone()['count']
    tracked_days = conn.execute(
        'SELECT COUNT(DISTINCT date) AS count FROM attendance WHERE subject_id = ?',
        (subject_id,),
    ).fetchone()['count']
    conn.close()

    return jsonify({
        'project_name': 'Face Recognition Attendance System',
        'framework': 'Flask + OpenCV',
        'model_type': 'LBPH',
        'detection_method': 'Haar Cascade',
        'subject': get_subject(subject_id)['name'],
        'total_students': total_students,
        'total_attendance': total_attendance,
        'present_today': present_today,
        'absent_today': total_students - present_today,
        'tracked_days': tracked_days,
        'today': today,
    })


@app.route('/api/attendance', methods=['GET'])
def attendance_records():
    try:
        subject_id = parse_subject_id(request.args.get('subject_id'))
        return jsonify({'attendance': get_attendance_records(subject_id)})
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400


@app.route('/api/attendance/mark', methods=['POST'])
def mark_attendance():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    image_data = payload.get('image') or payload.get('photo')

    if not isinstance(image_data, str) or not image_data:
        return jsonify({'error': 'Image is required for attendance marking.'}), 400

    try:
        subject_id = parse_subject_id(payload.get('subject_id'))
        image = decode_base64_image(image_data)
        result = recognize_in_image(image, subject_id)
        if result.get('status') == 'unknown':
            return jsonify({'status': 'unknown', 'message': 'Face not recognized.'}), 200
        return jsonify(result), 200
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except cv2.error:
        app.logger.exception('Face recognition failed')
        return jsonify({'error': 'Face recognition could not process this image.'}), 500


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({'error': 'The uploaded image is too large.'}), 413


init_db()


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
