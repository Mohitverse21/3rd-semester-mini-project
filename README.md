# Attendly — Face Recognition Attendance

[View the GitHub repository](https://github.com/Mohitverse21/3rd-semester-mini-project)

Attendly is a local, browser-based attendance dashboard for a classroom. It uses a webcam to enroll students and mark attendance by face, with records organized by subject and stored in a local SQLite database.

> **Project status:** Educational/miniproject prototype. Face recognition is probabilistic and should not be used as the sole basis for consequential attendance decisions.

## Features

- Live webcam preview with student face enrollment
- Face detection using OpenCV Haar cascades
- Face matching with OpenCV's LBPH recognizer
- Subject creation and subject-specific attendance records
- Student roster, daily summary, and recent attendance activity
- Date-range attendance trends with recorded-session averages
- Spreadsheet-safe CSV attendance exports
- Searchable check-in log and dashboard refresh
- Local SQLite persistence; no external database service
- Responsive dashboard interface

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Python, Flask |
| Face detection and recognition | OpenCV, Haar Cascade, LBPH |
| Data storage | SQLite |

## Requirements

- Python 3.10 or newer
- A modern browser with webcam support
- A working webcam and permission to access it

Camera access is restricted by browsers to secure contexts. Localhost is supported for local development; other devices generally need to use the app over HTTPS to access their camera.

## Run locally

Run these commands from the project root.

### Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python backend\app.py
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python backend/app.py
```

Open **http://127.0.0.1:5000** on the computer running the app. The Flask development server listens on all network interfaces by default, so another device on the same Wi-Fi/LAN can open `http://<server-ip>:5000` (for example, `http://192.168.1.20:5000`). Find the server's local IPv4 address with `ipconfig` on Windows or `ip addr` on macOS/Linux, and allow inbound connections on port 5000 in the computer's firewall if prompted.

The LAN address makes the dashboard reachable, but browsers generally block webcam access on plain HTTP LAN addresses. To use face enrollment or attendance from another device, deploy the app behind HTTPS (for example, follow the Railway instructions below). This prototype has no authentication, so any public deployment must use test data only.

On first start, the application initializes its SQLite database and face-sample directory. If the Haar Cascade file is missing, the backend attempts to download it and then falls back to the copy included with OpenCV.

Run the report tests from the project root with `python -m unittest discover -s tests -v`.

## Deploy a public demo on Railway

The app is not designed for real student data on a public URL: it has no authentication, and face images and attendance records are sensitive. Use this deployment only with test data.

1. Push this repository, including `railway.json`, to GitHub. In Railway, create a project from this GitHub repository and deploy the `main` branch. Railway uses the root `Dockerfile` and the `railway.json` health-check configuration.
2. Add a Railway volume to the service and set its mount path to `/data`. The app stores its SQLite database, face samples, and recognition model in `ATTENDLY_DATA_DIR` (`/data` in the container).
3. In the service's networking settings, generate a public domain. Railway provides an HTTPS URL that can be shared with other people.
4. Open the generated URL, allow camera access, and use test identities only. The public app has no sign-in, so anyone with the URL can use it and view its attendance data.

The container listens on Railway's injected `PORT`. Creating the Railway project, volume, and public domain requires access to a Railway account; this repository cannot create or supply a deployment URL by itself. Without a mounted volume, local files may be lost when Railway replaces the container.

## Using the dashboard

1. Choose the attendance subject, or create one with **Add subject**.
2. In **Register a student**, enter the student's name and roll number, capture a face image, then register the student.
3. In **Mark attendance**, capture the student's face. A successful match records the check-in for the selected subject and current date.
4. Review the subject's student roster, summary, and latest check-ins. Use the attendance search field to filter recent activity.
5. In **Attendance trends**, choose a date range to review attendance on recorded days, or download the selected subject's attendance as a CSV file. Unrecorded dates are shown as no session rather than assumed absences. Report ranges can include up to 366 days.

Each student can be marked once per subject per day. Face matching depends on image quality, lighting, and camera position; ensure the student is correctly identified if a result is uncertain.

## Ideas for the next release

The reporting feature is a useful base for a more capable attendance platform. Consider adding these in order:

1. **Authentication and roles:** require sign-in, protect student and attendance APIs, and separate administrator and instructor permissions before storing real student data.
2. **Session scheduling and manual review:** define class meetings, let instructors correct a check-in, and keep an audit trail. Only calculate absences for scheduled sessions.
3. **Privacy-first check-in options:** offer a QR code or instructor-confirmed fallback, consent and retention controls, and a way to remove biometric samples without losing attendance history.
4. **Installable offline-friendly app:** add a PWA shell and queue only non-biometric attendance actions when offline, then sync safely when the server is available.
5. **Production data and observability:** move from SQLite to PostgreSQL for multi-user deployments, add backups and migrations, and monitor health without logging face images or sensitive payloads.

Treat facial recognition as an optional convenience, not proof of identity. Any automated match should be reviewable and have a non-biometric alternative.

## API overview

The frontend and API are served by the same Flask application.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/subjects` | List subjects |
| `POST` | `/api/subjects` | Create a subject |
| `GET` | `/api/students?subject_id=<id>` | List students and attendance counts |
| `POST` | `/api/students` | Enroll a student using a captured face image |
| `GET` | `/api/attendance?subject_id=<id>` | Get recent attendance records |
| `GET` | `/api/reports?subject_id=<id>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` | Get daily attendance trends for a date range |
| `GET` | `/api/attendance/export?subject_id=<id>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` | Download an attendance CSV |
| `POST` | `/api/attendance/mark` | Match a captured face and record attendance |
| `GET` | `/api/system?subject_id=<id>` | Get dashboard summary statistics |
| `GET` | `/health` | Check whether the app is ready |

JSON request bodies are used for `POST` requests. Image data is sent as a base64 data URL by the browser.
Report dates are inclusive, and ranges are limited to 366 days. Omitting both report dates returns the last seven calendar days.

## Project layout

```text
.
├── backend/
│   ├── app.py              # Flask app, API, database, and face recognition
│   └── requirements.txt    # Python dependencies
├── Dockerfile              # Railway container build and production server
├── tests/
│   └── test_reports.py     # Report and CSV export tests
├── app.js                  # Dashboard behavior and API requests
├── index.html              # Dashboard markup
├── styles.css              # Dashboard styles
└── README.md
```

Runtime data is created under `backend/` and is excluded from version control:

- `attendance.db` — student, subject, and attendance records
- `faces/` — enrolled face samples
- `lbph_model.xml` — trained face-recognition model
- `haarcascade_frontalface_default.xml` — face-detection cascade

## Privacy and responsible use

Face images and the generated recognition model are biometric data. This application processes them locally by default, but stores student face samples and records on the machine running the backend. Restrict access to that machine, obtain informed consent before enrolling anyone, and follow applicable privacy and data-retention requirements. Back up or delete local data deliberately; deleting the database or face samples is irreversible unless you have a backup.

The project is a development prototype: it does not include user authentication, role-based access, or production deployment hardening. Do not expose the Flask development server or this application to a public network with real student data.

## Troubleshooting

- **The dashboard cannot reach the server:** Start the backend from the project root with `python backend\app.py` (Windows) or `python backend/app.py` (macOS/Linux).
- **The camera does not start:** Allow camera permission in the browser, confirm another application is not using the webcam, and open the app through `localhost` or `127.0.0.1`.
- **OpenCV installation fails:** Use a supported Python version and install dependencies from `backend/requirements.txt` inside a virtual environment.
- **A face is not recognized:** Improve lighting, face the camera directly, and recapture the registration image if needed.

## License

No license has been specified for this repository. Contact the repository owner before reusing or redistributing the project.
