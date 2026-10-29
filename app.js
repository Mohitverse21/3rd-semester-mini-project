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
const reportStartDate = document.getElementById('reportStartDate');
const reportEndDate = document.getElementById('reportEndDate');
const attendanceTrend = document.getElementById('attendanceTrend');
const reportStatus = document.getElementById('reportStatus');

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

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setDefaultReportDates() {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  reportStartDate.value = formatLocalDate(weekAgo);
  reportEndDate.value = formatLocalDate(today);
}

function getReportQuery() {
  if (state.activeSubjectId === null) {
    throw new Error('Select a subject before requesting a report.');
  }
  const start = reportStartDate.value;
  const end = reportEndDate.value;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(start) || !isoDate.test(end)) {
    throw new Error('Choose both a start date and an end date.');
  }
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startTime) || Number.isNaN(endTime)
      || new Date(startTime).toISOString().slice(0, 10) !== start
      || new Date(endTime).toISOString().slice(0, 10) !== end) {
    throw new Error('Choose valid dates for the report.');
  }
  if (startTime > endTime) {
    throw new Error('The start date must be on or before the end date.');
  }
  if ((endTime - startTime) / 86400000 >= 366) {
    throw new Error('Choose a date range of 366 days or fewer.');
  }
  return new URLSearchParams({
    subject_id: String(state.activeSubjectId),
    start_date: start,
    end_date: end,
  });
}

function renderReport(report) {
  document.getElementById('reportAverage').textContent = report.average_attendance_rate === null
    ? '—'
    : `${report.average_attendance_rate}%`;
  document.getElementById('reportActiveDays').textContent = String(report.active_days);
  document.getElementById('reportCheckIns').textContent = String(report.total_check_ins);

  const days = report.daily.map((day) => {
    const item = makeElement('div', 'trend-day');
    item.setAttribute('role', 'listitem');
    const hasSession = day.has_session === true;
    const dateParts = day.date.split('-').map(Number);
    const dateLabel = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateParts[0], dateParts[1] - 1, dateParts[2]));
    const countLabel = hasSession
      ? `${day.present_count}/${day.total_students}`
      : '—';
    item.setAttribute(
      'aria-label',
      hasSession
        ? `${dateLabel}: ${day.present_count} of ${day.total_students} students present`
        : `${dateLabel}: no session recorded`,
    );
    item.append(makeElement('span', 'trend-count', countLabel));

    const track = makeElement('span', 'trend-track');
    track.setAttribute('aria-hidden', 'true');
    if (hasSession && day.attendance_rate !== null) {
      const bar = makeElement('span', 'trend-bar');
      bar.style.height = `${Math.max(3, Math.min(100, day.attendance_rate))}%`;
      track.append(bar);
    } else {
      track.append(makeElement('span', 'trend-no-session', '—'));
    }
    item.append(track, makeElement('span', 'trend-label', dateLabel));
    return item;
  });
  attendanceTrend.replaceChildren(...days);
  reportStatus.className = 'report-status';
  reportStatus.textContent = report.active_days
    ? `${report.active_days} recorded ${report.active_days === 1 ? 'session' : 'sessions'} in this range. Days without a recorded session are not counted as absences.`
    : 'No attendance sessions were recorded in this date range.';
}

function showReportError(message) {
  document.getElementById('reportAverage').textContent = '—';
  document.getElementById('reportActiveDays').textContent = '—';
  document.getElementById('reportCheckIns').textContent = '—';
  attendanceTrend.replaceChildren(makeElement('div', 'empty-state error-text', message));
  reportStatus.className = 'report-status error-text';
  reportStatus.textContent = message;
}

async function loadReport() {
  const refreshButton = document.getElementById('refreshReportBtn');
  setBusy(refreshButton, true, 'Updating…');
  reportStatus.className = 'report-status';
  reportStatus.textContent = 'Loading attendance report…';
  try {
    const query = getReportQuery();
    const report = await apiRequest(`/api/reports?${query}`);
    if (!Array.isArray(report.daily)) {
      throw new Error('The server returned an invalid attendance report.');
    }
    renderReport(report);
    return true;
  } catch (error) {
    showReportError(error.message);
    return false;
  } finally {
    setBusy(refreshButton, false);
  }
}

async function exportAttendanceReport() {
  const exportButton = document.getElementById('exportReportBtn');
  setBusy(exportButton, true, 'Preparing…');
  try {
    const query = getReportQuery();
    let response;
    try {
      response = await fetch(`/api/attendance/export?${query}`);
    } catch {
      throw new Error('Cannot reach the attendance server. Check that the backend is running.');
    }
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `Export failed (${response.status}).`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const downloadLink = makeElement('a');
    downloadLink.href = url;
    downloadLink.download = `attendly-attendance-${state.activeSubjectId}-${reportStartDate.value}-${reportEndDate.value}.csv`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    reportStatus.className = 'report-status';
    reportStatus.textContent = 'Attendance report downloaded as CSV.';
  } catch (error) {
    reportStatus.className = 'report-status error-text';
    reportStatus.textContent = error.message;
  } finally {
    setBusy(exportButton, false);
  }
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
    await loadReport();
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
document.getElementById('refreshReportBtn').addEventListener('click', loadReport);
document.getElementById('exportReportBtn').addEventListener('click', exportAttendanceReport);
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

setDefaultReportDates();
loadDashboard();
startCamera();

window.addEventListener('beforeunload', () => {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
});
