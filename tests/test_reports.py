import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import app as attendance_app


class AttendanceReportTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        data_dir = Path(self.temporary_directory.name)
        patcher = patch.multiple(
            attendance_app,
            DATA_DIR=data_dir,
            DB_PATH=data_dir / 'attendance.db',
            FACES_DIR=data_dir / 'faces',
            MODEL_PATH=data_dir / 'lbph_model.xml',
        )
        patcher.start()
        self.addCleanup(self.temporary_directory.cleanup)
        self.addCleanup(patcher.stop)

        attendance_app.init_db()
        self.client = attendance_app.app.test_client()
        self.client.testing = True
        conn = attendance_app.get_db_connection()
        self.subject_id = conn.execute(
            'SELECT id FROM subjects WHERE name = ?', ('General',)
        ).fetchone()['id']
        conn.execute(
            'INSERT INTO students (name, roll_number, created_at) VALUES (?, ?, ?)',
            ('=HYPERLINK("https://example.test")', '@roll-1', '2026-02-01 09:00:00'),
        )
        first_student_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.execute(
            'INSERT INTO students (name, roll_number, created_at) VALUES (?, ?, ?)',
            ('Second Student', 'roll-2', '2026-02-01 09:00:00'),
        )
        second_student_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.execute(
            'INSERT INTO students (name, roll_number, created_at) VALUES (?, ?, ?)',
            ('Third Student', 'roll-3', '2026-03-02 09:00:00'),
        )
        third_student_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.executemany(
            '''
            INSERT INTO attendance (student_id, subject_id, date, time)
            VALUES (?, ?, ?, ?)
            ''',
            [
                (first_student_id, self.subject_id, '2026-03-01', '09:00:00'),
                (first_student_id, self.subject_id, '2026-03-03', '09:01:00'),
                (second_student_id, self.subject_id, '2026-03-03', '09:02:00'),
                (third_student_id, self.subject_id, '2026-03-04', '09:00:00'),
            ],
        )
        conn.commit()
        conn.close()

    def test_report_counts_only_dates_with_recorded_sessions(self):
        response = self.client.get(
            f'/api/reports?subject_id={self.subject_id}'
            '&start_date=2026-03-01&end_date=2026-03-03'
        )

        self.assertEqual(response.status_code, 200)
        report = response.get_json()
        self.assertEqual(report['active_days'], 2)
        self.assertEqual(report['total_students'], 3)
        self.assertEqual(report['total_check_ins'], 3)
        self.assertEqual(report['average_attendance_rate'], 58.4)
        self.assertEqual(
            report['daily'],
            [
                {
                    'date': '2026-03-01',
                    'present_count': 1,
                    'total_students': 2,
                    'attendance_rate': 50.0,
                    'has_session': True,
                },
                {
                    'date': '2026-03-02',
                    'present_count': 0,
                    'total_students': 0,
                    'attendance_rate': None,
                    'has_session': False,
                },
                {
                    'date': '2026-03-03',
                    'present_count': 2,
                    'total_students': 3,
                    'attendance_rate': 66.7,
                    'has_session': True,
                },
            ],
        )

    def test_report_defaults_to_seven_days(self):
        report = self.client.get(
            f'/api/reports?subject_id={self.subject_id}'
        ).get_json()

        self.assertEqual(len(report['daily']), 7)
        self.assertEqual(report['active_days'], 0)
        self.assertIsNone(report['average_attendance_rate'])

    def test_report_rejects_invalid_date_ranges(self):
        invalid_ranges = [
            'start_date=2026-03-03&end_date=2026-03-01',
            'start_date=2026-02-30&end_date=2026-03-01',
            'start_date=2026-01-01&end_date=2027-01-02',
            'start_date=2026-03-01',
        ]
        for date_range in invalid_ranges:
            with self.subTest(date_range=date_range):
                response = self.client.get(
                    f'/api/reports?subject_id={self.subject_id}&{date_range}'
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.get_json())

    def test_csv_export_escapes_spreadsheet_formulas_and_filters_dates(self):
        response = self.client.get(
            f'/api/attendance/export?subject_id={self.subject_id}'
            '&start_date=2026-03-01&end_date=2026-03-03'
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response.content_type)
        self.assertIn('attachment;', response.headers['Content-Disposition'])
        rows = list(csv.reader(response.get_data(as_text=True).splitlines()))
        self.assertEqual(rows[0], ['Student name', 'Roll number', 'Subject', 'Date', 'Time'])
        self.assertEqual(len(rows), 4)
        self.assertTrue(rows[1][0].startswith("'=HYPERLINK"))
        self.assertEqual(rows[1][1], "'@roll-1")
        self.assertEqual([row[3] for row in rows[1:]], [
            '2026-03-01',
            '2026-03-03',
            '2026-03-03',
        ])


if __name__ == '__main__':
    unittest.main()
