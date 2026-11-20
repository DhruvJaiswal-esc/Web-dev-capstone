import { useEffect, useState } from 'react';
import { api, fmt } from '../api';
import TakeExam from './TakeExam.jsx';
import { ClockIcon, ListIcon, CalendarIcon } from '../components/Icons.jsx';
import { Badge, Empty, PageTitle } from '../components/Ui.jsx';

export default function StudentHome() {
  const [tab, setTab] = useState('exams');
  const [attempt, setAttempt] = useState(null);

  if (attempt) return <TakeExam attempt={attempt} onFinish={() => { setAttempt(null); setTab('results'); }} />;
  return (
    <>
      <PageTitle title="Dashboard" subtitle="Your assigned exams and results at a glance." />
      <nav>
        <button className={tab === 'exams' ? 'active' : ''} onClick={() => setTab('exams')}>My Exams</button>
        <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>My Results</button>
      </nav>
      {tab === 'exams' ? <Exams onStart={setAttempt} /> : <Results />}
    </>
  );
}

function Exams({ onStart }) {
  const [exams, setExams] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api('/exams?limit=50').then((r) => setExams(r.data)).catch((e) => setError(e.message)); }, []);

  const start = async (id) => {
    setError('');
    try {
      const r = await api(`/exams/${id}/start`, { method: 'POST' });
      onStart(r.data);
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {!exams.length && <div className="card"><Empty>No exams assigned to you yet.</Empty></div>}
      <div className="grid">
        {exams.map((e) => {
          const inProgress = e.myAttempts.some((a) => a.status === 'in_progress');
          const finished = e.myAttempts.length >= e.maxAttempts && !inProgress;
          return (
            <div className="card card-hover exam-card" key={e._id}>
              <h3>{e.title} {inProgress && <Badge variant="in_progress">in progress</Badge>}{finished && <Badge variant="submitted">submitted</Badge>}</h3>
              <p className="desc">{e.instructions}</p>
              <div className="meta">
                <span className="chip"><ListIcon /> {e.totalQuestions} questions</span>
                <span className="chip"><ClockIcon /> {e.durationMinutes} min</span>
              </div>
              <p className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <CalendarIcon width={14} height={14} /> {fmt(e.startTime)} → {fmt(e.endTime)}
              </p>
              <button disabled={finished} onClick={() => start(e._id)}>
                {finished ? 'Submitted' : inProgress ? 'Resume' : 'Start exam'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Results() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api('/results/me?limit=50').then((r) => setRows(r.data)).catch((e) => setError(e.message)); }, []);
  return (
    <div className="card">
      <h3>My Results</h3>
      {error && <p className="error">{error}</p>}
      {!rows.length && <Empty>No submitted exams yet.</Empty>}
      {!!rows.length && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Exam</th><th>Submitted</th><th>Status</th><th>Score</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attemptId}>
                  <td><strong>{r.examTitle}</strong></td>
                  <td>{fmt(r.submittedAt)}</td>
                  <td><Badge>{r.status}</Badge></td>
                  <td>{r.resultsReleased ? <strong>{`${r.score} / ${r.totalMarks} (${r.percentage}%)`}</strong> : <span className="muted">Pending release</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
