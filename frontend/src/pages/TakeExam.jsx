import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ClockIcon, CheckIcon } from '../components/Icons.jsx';
import { Badge } from '../components/Ui.jsx';

const mmss = (s) => `${String(Math.floor(Math.max(s, 0) / 60)).padStart(2, '0')}:${String(Math.max(s, 0) % 60).padStart(2, '0')}`;
const LETTERS = 'ABCDEFGHIJ';

export default function TakeExam({ attempt, onFinish }) {
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(attempt.answers.filter((a) => a.selectedIndex !== null).map((a) => [a.questionId, a.selectedIndex]))
  );
  const [left, setLeft] = useState(attempt.remainingSeconds);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const submitting = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const body = { answers: Object.entries(answersRef.current).map(([questionId, selectedIndex]) => ({ questionId, selectedIndex })) };
      setDone(await api(`/attempts/${attempt._id}/submit`, { method: 'POST', body }));
    } catch (e) {
      setError(e.message);
      submitting.current = false;
    }
  }, [attempt._id]);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left <= 0 && !done) submit(); }, [left, done, submit]);

  // autosave every choice so progress survives a refresh
  const choose = async (qid, idx) => {
    setAnswers((a) => ({ ...a, [qid]: idx }));
    try {
      await api(`/attempts/${attempt._id}/answers`, { method: 'PUT', body: { answers: [{ questionId: qid, selectedIndex: idx }] } });
    } catch (e) { setError(e.message); }
  };

  if (done) {
    return (
      <div className="card result-card">
        <div className="tick"><CheckIcon width={32} height={32} /></div>
        <h2>{done.message}</h2>
        <p>Status: <Badge>{done.data.status}</Badge></p>
        {done.data.resultsReleased && <div className="score">{done.data.score} / {done.data.totalMarks}</div>}
        {!done.data.resultsReleased && <p className="muted">Your result will be visible once your faculty releases it.</p>}
        <button onClick={onFinish}>Back to dashboard</button>
      </div>
    );
  }

  const total = attempt.questions.length;
  const answered = Object.keys(answers).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const level = left <= 60 ? 'crit' : left <= 300 ? 'warn' : '';

  return (
    <div>
      <div className={`timer card ${level}`}>
        <div className="timer-top">
          <div className="clock"><ClockIcon /> <strong>Time left: {mmss(left)}</strong></div>
          <span className="muted">{answered} / {total} answered</span>
        </div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        <div className="qnav">
          {attempt.questions.map((q, i) => (
            <a key={q._id} href={`#q-${q._id}`} className={answers[q._id] !== undefined ? 'done' : ''}
              onClick={(e) => { e.preventDefault(); document.getElementById(`q-${q._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              {i + 1}
            </a>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {attempt.questions.map((q, i) => (
        <div className="card question" key={q._id} id={`q-${q._id}`}>
          <div className="q-head">
            <span className="q-num">Q{i + 1}</span>
            <p className="q-text">{q.text} <span className="muted">({q.marks} marks)</span></p>
          </div>
          {q.options.map((opt, idx) => (
            <label className="option" key={idx}>
              <input type="radio" name={q._id} checked={answers[q._id] === idx} onChange={() => choose(q._id, idx)} />
              <span className="letter">{LETTERS[idx]}</span>
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ))}
      <div className="submit-bar">
        <button onClick={() => window.confirm('Submit the exam? You cannot change answers afterwards.') && submit()}>Submit exam</button>
      </div>
    </div>
  );
}
