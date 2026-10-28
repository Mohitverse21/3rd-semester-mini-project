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

Camera access is generally restricted by browsers to secure contexts. `http://127.0.0.1:5000` and `http://localhost:5000` are supported local development origins.

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

Open **http://127.0.0.1:5000** in your browser and allow camera access when prompted. The Flask server binds to `127.0.0.1:5000` by default.

On first start, the application initializes its SQLite database and face-sample directory. If the Haar Cascade file is missing, the backend attempts to download it and then falls back to the copy included with OpenCV.

## Deploy a public demo on Railway

The app is not designed for real student data on a public URL: it has no authentication, and face images and attendance records are sensitive. Use this deployment only with test data.

1. Push this repository to GitHub, then create a Railway project from the GitHub repository and deploy its `main` branch. Railway detects the root `Dockerfile`.
2. Add a Railway volume to the service and set its mount path to `/data`. The app stores its SQLite database, face samples, and recognition model in `ATTENDLY_DATA_DIR` (`/data` in the container).
3. Configure the service health check to use `/health`, then generate a public domain in Railway's networking settings.
4. Open the generated HTTPS URL, allow camera access, and use test identities only.

The container listens on Railway's injected `PORT`. The Railway domain and project must be created in your account; this repository does not contain a fabricated deployment URL. Without a mounted volume, local files may be lost when Railway replaces the container.

## Using the dashboard

1. Choose the attendance subject, or create one with **Add subject**.
2. In **Register a student**, enter the student's name and roll number, capture a face image, then register the student.
3. In **Mark attendance**, capture the student's face. A successful match records the check-in for the selected subject and current date.
4. Review the subject's student roster, summary, and latest check-ins. Use the attendance search field to filter recent activity.

Each student can be marked once per subject per day. Face matching depends on image quality, lighting, and camera position; ensure the student is correctly identified if a result is uncertain.

## API overview

The frontend and API are served by the same Flask application.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/subjects` | List subjects |
| `POST` | `/api/subjects` | Create a subject |
| `GET` | `/api/students?subject_id=<id>` | List students and attendance counts |
| `POST` | `/api/students` | Enroll a student using a captured face image |
| `GET` | `/api/attendance?subject_id=<id>` | Get recent attendance records |
| `POST` | `/api/attendance/mark` | Match a captured face and record attendance |
| `GET` | `/api/system?subject_id=<id>` | Get dashboard summary statistics |
| `GET` | `/health` | Check whether the app is ready |

JSON request bodies are used for `POST` requests. Image data is sent as a base64 data URL by the browser.

## Project layout

```text
.
├── backend/
│   ├── app.py              # Flask app, API, database, and face recognition
│   └── requirements.txt    # Python dependencies
├── Dockerfile              # Railway container build and production server
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
