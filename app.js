const state = {
  cameraStream: null,
  students: [],
  attendance: [],
  subjects: [],
  activeSubjectId: null,
  summary: null,
  capturedRegistrationPhoto: null,
};

const registerVideo = document.getElementById('registerVideo');
const attendanceVideo = document.getElementById('attendanceVideo');
const studentNameInput = document.getElementById('studentName');
const studentRollInput = document.getElementById('studentRoll');
const registerStatus = document.getElementById('registerStatus');
const attendanceStatus = document.getElementById('attendanceStatus');
const studentList = document.getElementById('studentList');
const attendanceList = document.getElementById('attendanceList');
const systemSummary = document.getElementById('systemSummary');
const subjectSelect = document.getElementById('subjectSelect');
const subjectStatus = document.getElementById('subjectStatus');
const subjectNameInput = document.getElementById('subjectName');
const registerButton = document.getElementById('registerBtn');
const attendanceButton = document.getElementById('captureAttendanceBtn');
const cameraToggleButton = document.getElementById('toggleCameraBtn');
const cameraIndicatorText = document.getElementById('cameraIndicatorText');
const cameraIndicatorDot = document.getElementById('cameraIndicatorDot');

function setStatus(element, message, kind = 'info') {
  element.textContent = message;
  element.className = `status-box ${kind}`;
}

function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.label = button.textContent.trim();
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

async function apiRequest(path, options) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('Cannot reach the attendance server. Check that the backend is running.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed (${response.status}).`);
  }
  return data;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function initialsFor(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
}

function renderStudents() {
  const count = state.students.length;
  document.getElementById('studentCount').textContent = `${count} ${count === 1 ? 'student' : 'students'}`;

  if (!count) {
    studentList.replaceChildren(makeElement('div', 'empty-state', 'No students registered yet. Register a face to build your class roster.'));
    return;
  }

  const rows = state.students.map((student) => {
    const item = makeElement('article', 'student-row');
    const avatar = makeElement('span', 'student-avatar', initialsFor(student.name));
    const meta = makeElement('div', 'student-meta');
    meta.append(
      makeElement('strong', '', student.name || 'Unnamed student'),
      makeElement('small', '', `Roll ${student.roll_number || '—'}`),
    );
    const stats = makeElement('div', 'student-stats');
    stats.append(
      makeElement('span', 'present-stat', `${student.present_days ?? 0} present`),
      makeElement('span', 'absent-stat', `${student.absent_days ?? 0} absent`),
    );
    item.append(avatar, meta, stats);
    return item;
  });
  studentList.replaceChildren(...rows);
}

function renderAttendance() {
  const query = document.getElementById('attendanceSearch').value.trim().toLocaleLowerCase();
  const filtered = state.attendance.filter((entry) => (
    String(entry.student_name || '').toLocaleLowerCase().includes(query)
    || String(entry.roll_number || '').toLocaleLowerCase().includes(query)
    || String(entry.subject || '').toLocaleLowerCase().includes(query)
  ));

  if (!filtered.length) {
    const message = query
      ? 'No attendance records match that search.'
      : 'No attendance marked yet. A successful face check-in will appear here.';
    attendanceList.replaceChildren(makeElement('div', 'empty-state', message));
    return;
  }

  const rows = filtered.slice(0, 20).map((entry) => {
    const item = makeElement('article', 'activity-row');
    const icon = makeElement('span', 'activity-icon', initialsFor(entry.student_name));
    const meta = makeElement('div', 'activity-meta');
    meta.append(
      makeElement('strong', '', entry.student_name || 'Unknown student'),
      makeElement('small', '', `${entry.subject || 'General'} · Roll ${entry.roll_number || '—'} · ${entry.date || ''} ${entry.time || ''}`.trim()),
    );
    item.append(icon, meta, makeElement('span', 'present-badge', 'Present'));
    return item;
  });
  attendanceList.replaceChildren(...rows);
}

function renderSummary(summary) {
  const subjectName = summary.subject || 'Selected subject';
  const cards = [
    { label: 'Total students', value: summary.total_students, caption: 'In the class roster', tone: 'blue', icon: '♙' },
    { label: 'Present today', value: summary.present_today, caption: `${subjectName} · ${summary.today || 'Today'}`, tone: 'green', icon: '✓' },
    { label: 'Absent today', value: summary.absent_today, caption: `${subjectName} · not checked in`, tone: 'amber', icon: '−' },
    { label: 'Check-ins', value: summary.total_attendance, caption: `${summary.tracked_days} active days · ${subjectName}`, tone: 'violet', icon: '◷' },
  ];

  systemSummary.replaceChildren(...cards.map((card) => {
    const item = makeElement('article', `summary-card ${card.tone}`);
    const top = makeElement('div', 'summary-card-top');
    top.append(makeElement('span', 'summary-label', card.label), makeElement('span', 'summary-icon', card.icon));
    item.append(top, makeElement('strong', 'summary-value', String(card.value ?? 0)), makeElement('small', 'summary-caption', card.caption));
    return item;
  }));
}

async function loadDashboard() {
  const refreshButton = document.getElementById('refreshBtn');
  refreshButton.classList.add('is-loading');
  try {
    const subjectsData = await apiRequest('/api/subjects');
    if (!Array.isArray(subjectsData.subjects)) {
      throw new Error('The server returned an invalid subjects list.');
    }
    state.subjects = subjectsData.subjects;
    const existingSubject = state.subjects.find((subject) => String(subject.id) === String(state.activeSubjectId));
    if (!existingSubject) {
      state.activeSubjectId = state.subjects[0]?.id ?? null;
    }
    subjectSelect.replaceChildren(...state.subjects.map((subject) => {
      const option = makeElement('option', '', subject.name);
      option.value = subject.id;
      return option;
    }));
    if (state.activeSubjectId !== null) {
      subjectSelect.value = String(state.activeSubjectId);
    }
    if (state.activeSubjectId === null) {
      throw new Error('Add a subject before recording attendance.');
    }
    const subjectQuery = `?subject_id=${encodeURIComponent(state.activeSubjectId)}`;
    const [studentsData, attendanceData, summary] = await Promise.all([
      apiRequest(`/api/students${subjectQuery}`),
      apiRequest(`/api/attendance${subjectQuery}`),
      apiRequest(`/api/system${subjectQuery}`),
    ]);
    if (!Array.isArray(studentsData.students) || !Array.isArray(attendanceData.attendance)) {
      throw new Error('The server returned unexpected attendance data.');
    }

    state.students = studentsData.students;
    state.attendance = attendanceData.attendance;
    state.summary = summary;
    renderStudents();
    renderAttendance();
    renderSummary(summary);
    return true;
  } catch (error) {
    systemSummary.replaceChildren(makeElement('div', 'dashboard-error', error.message));
    subjectSelect.replaceChildren(makeElement('option', '', 'Unable to load subjects'));
    studentList.replaceChildren(makeElement('div', 'empty-state error-text', 'Could not load students. Use refresh to try again.'));
    attendanceList.replaceChildren(makeElement('div', 'empty-state error-text', 'Could not load attendance activity.'));
    return false;
  } finally {
    refreshButton.classList.remove('is-loading');
  }
}

function captureImageFromVideo(videoElement) {
  if (!state.cameraStream || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || !videoElement.videoWidth || !videoElement.videoHeight) {
    throw new Error('Camera is not ready yet. Allow access and wait for the preview.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not capture an image from the camera.');
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const message = 'Camera access requires HTTPS or localhost and a supported browser.';
    setStatus(registerStatus, message, 'error');
    setStatus(attendanceStatus, message, 'error');
    cameraIndicatorText.textContent = 'Camera unavailable';
    cameraIndicatorDot.className = 'live-dot failed';
    return false;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    state.cameraStream = stream;
    registerVideo.srcObject = stream;
    attendanceVideo.srcObject = stream;
    await Promise.all([registerVideo.play(), attendanceVideo.play()]);
    setStatus(registerStatus, 'Camera ready. Enter student details, then capture a clear face image.');
    setStatus(attendanceStatus, 'Camera ready. Face the camera and capture to mark attendance.');
    cameraToggleButton.textContent = 'Turn camera off';
    cameraIndicatorText.textContent = 'Camera ready';
    cameraIndicatorDot.className = 'live-dot';
    return true;
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    if (state.cameraStream === stream) {
      state.cameraStream = null;
      registerVideo.srcObject = null;
      attendanceVideo.srcObject = null;
    }
    const message = error.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access in your browser settings and retry.'
      : error.name === 'NotFoundError'
        ? 'No camera was found. Connect a webcam and retry.'
        : 'Could not start the camera. Check that it is not being used by another app.';
    setStatus(registerStatus, message, 'error');
    setStatus(attendanceStatus, message, 'error');
    cameraIndicatorText.textContent = 'Camera unavailable';
    cameraIndicatorDot.className = 'live-dot failed';
    return false;
  }
}

function stopCamera() {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  registerVideo.srcObject = null;
  attendanceVideo.srcObject = null;
  cameraToggleButton.textContent = 'Turn camera on';
  cameraIndicatorText.textContent = 'Camera off';
  cameraIndicatorDot.className = 'live-dot inactive';
  setStatus(registerStatus, 'Camera is off. Turn it on to capture a student face.', 'info');
  setStatus(attendanceStatus, 'Camera is off. Turn it on to mark attendance.', 'info');
}

async function registerStudent() {
  const name = studentNameInput.value.trim();
  const rollNumber = studentRollInput.value.trim();
  if (!name || !rollNumber) {
    setStatus(registerStatus, 'Enter both the student name and roll number.', 'error');
    (!name ? studentNameInput : studentRollInput).focus();
    return;
  }

  try {
    const photo = state.capturedRegistrationPhoto || captureImageFromVideo(registerVideo);
    setBusy(registerButton, true, 'Registering…');
    setStatus(registerStatus, 'Saving student and enrolling face…');
    const result = await apiRequest('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, roll_number: rollNumber, photo }),
    });

    state.capturedRegistrationPhoto = null;
    studentNameInput.value = '';
    studentRollInput.value = '';
    setStatus(registerStatus, `${result.student.name} was registered successfully.`, 'success');
    await loadDashboard();
  } catch (error) {
    setStatus(registerStatus, error.message, 'error');
  } finally {
    setBusy(registerButton, false);
  }
}

async function markAttendance() {
  try {
    if (state.activeSubjectId === null) {
      throw new Error('Add or select a subject before marking attendance.');
    }
    const image = captureImageFromVideo(attendanceVideo);
    setBusy(attendanceButton, true, 'Checking face…');
    setStatus(attendanceStatus, 'Matching the face against registered students…');
    const result = await apiRequest('/api/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, subject_id: Number(state.activeSubjectId) }),
    });

    if (result.status === 'unknown') {
      setStatus(attendanceStatus, result.message || 'Face not recognized. Try again in good lighting.', 'error');
      return;
    }
    if (result.status === 'already_marked') {
      setStatus(attendanceStatus, result.message || `${result.student.name} is already marked present today.`, 'info');
      return;
    }
    if (result.status !== 'success') {
      throw new Error(result.message || 'Attendance could not be confirmed.');
    }

    setStatus(attendanceStatus, `${result.student.name} marked present for ${result.subject || 'this subject'} at ${result.time}.`, 'success');
    await loadDashboard();
  } catch (error) {
    setStatus(attendanceStatus, error.message, 'error');
  } finally {
    setBusy(attendanceButton, false);
  }
}

document.getElementById('captureRegisterBtn').addEventListener('click', () => {
  state.capturedRegistrationPhoto = null;
  try {
    state.capturedRegistrationPhoto = captureImageFromVideo(registerVideo);
    setStatus(registerStatus, 'Face captured. Enter the student details and register.', 'success');
  } catch (error) {
    setStatus(registerStatus, error.message, 'error');
  }
});

registerButton.addEventListener('click', registerStudent);
attendanceButton.addEventListener('click', markAttendance);
document.getElementById('attendanceSearch').addEventListener('input', renderAttendance);
document.getElementById('refreshBtn').addEventListener('click', loadDashboard);
cameraToggleButton.addEventListener('click', async () => {
  if (state.cameraStream) stopCamera();
  else await startCamera();
});
subjectSelect.addEventListener('change', async () => {
  state.activeSubjectId = Number(subjectSelect.value);
  await loadDashboard();
});
document.getElementById('manageSubjectsBtn').addEventListener('click', () => {
  const form = document.getElementById('subjectAddForm');
  form.hidden = !form.hidden;
  if (!form.hidden) subjectNameInput.focus();
});
document.getElementById('addSubjectBtn').addEventListener('click', async () => {
  const name = subjectNameInput.value.trim();
  if (!name) {
    subjectNameInput.focus();
    subjectStatus.textContent = 'Enter a subject name.';
    subjectStatus.className = 'subject-status error-text';
    return;
  }

  const addButton = document.getElementById('addSubjectBtn');
  setBusy(addButton, true, 'Saving…');
  subjectStatus.textContent = '';
  try {
    const result = await apiRequest('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    state.activeSubjectId = result.subject.id;
    subjectNameInput.value = '';
    document.getElementById('subjectAddForm').hidden = true;
    subjectStatus.textContent = `${result.subject.name} added.`;
    subjectStatus.className = 'subject-status success-text';
    await loadDashboard();
  } catch (error) {
    subjectStatus.textContent = error.message;
    subjectStatus.className = 'subject-status error-text';
  } finally {
    setBusy(addButton, false);
  }
});

subjectNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') document.getElementById('addSubjectBtn').click();
});

document.getElementById('currentDate').textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date());

loadDashboard();
startCamera();

window.addEventListener('beforeunload', () => {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
});
