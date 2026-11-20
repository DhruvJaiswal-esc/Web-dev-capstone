import { useEffect, useState } from 'react';
import { api, fmt } from '../api';
import { Badge, Empty, PageTitle } from '../components/Ui.jsx';

export default function FacultyHome() {
  const [tab, setTab] = useState('questions');
  return (
    <>
      <PageTitle title="Faculty workspace" subtitle="Build your question bank, create exams and review results." />
      <nav>
        <button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>Question Bank</button>
        <button className={tab === 'exams' ? 'active' : ''} onClick={() => setTab('exams')}>Exams</button>
      </nav>
      {tab === 'questions' ? <Questions /> : <Exams />}
    </>
  );
}

const emptyQ = { text: '', options: ['', '', '', ''], correctIndex: 0, marks: 1, topic: '', difficulty: 'medium' };
const LETTERS = 'ABCDEFGHIJ';

function Questions() {
  const [form, setForm] = useState(emptyQ);
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api('/questions?limit=100').then((r) => setList(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const setOpt = (i, v) => setForm({ ...form, options: form.options.map((o, j) => (j === i ? v : o)) });

  const save = async (e) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      await api('/questions', { method: 'POST', body: { ...form, marks: Number(form.marks), correctIndex: Number(form.correctIndex) } });
      setForm(emptyQ); setMsg('Question added'); load();
    } catch (err) { setError(err.message); }
  };
  const remove = async (id) => {
    setMsg(''); setError('');
    try { await api(`/questions/${id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <form className="card" onSubmit={save}>
        <h3>Add question</h3>
        <textarea placeholder="Question text" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required />
        <span className="section-label">Options — select the correct answer</span>
        {form.options.map((o, i) => (
          <label className={`option input-option ${Number(form.correctIndex) === i ? 'correct' : ''}`} key={i}>
            <input type="radio" name="correct" checked={Number(form.correctIndex) === i} onChange={() => setForm({ ...form, correctIndex: i })} />
            <span className="letter">{LETTERS[i]}</span>
            <input placeholder={`Option ${i + 1}${Number(form.correctIndex) === i ? ' (correct answer)' : ''}`} value={o} onChange={(e) => setOpt(i, e.target.value)} required />
          </label>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="Topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} required />
          <input type="number" min="0.5" step="0.5" placeholder="Marks" value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} />
          <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
            <option>easy</option><option>medium</option><option>hard</option>
          </select>
        </div>
        {msg && <p className="success">{msg}</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit">Add question</button>
      </form>

      <div className="card">
        <h3>My questions <span className="count">{list.length}</span></h3>
        {!list.length && <Empty>No questions yet. Add your first one above.</Empty>}
        {!!list.length && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Question</th><th>Topic</th><th>Difficulty</th><th>Marks</th><th /></tr></thead>
              <tbody>
                {list.map((q) => (
                  <tr key={q._id}>
                    <td>{q.text}<br /><span className="muted">Answer: {q.options[q.correctIndex]}</span></td>
                    <td>{q.topic}</td><td><Badge>{q.difficulty}</Badge></td><td>{q.marks}</td>
                    <td><button className="danger small" onClick={() => remove(q._id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Exams() {
  const [exams, setExams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [report, setReport] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '', instructions: '', durationMinutes: 30, startTime: '', endTime: '',
    questions: [], assignedGroups: [], negativeMarking: false, releaseMode: 'manual',
  });

  const load = () => api('/exams?limit=100').then((r) => setExams(r.data)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/questions?limit=100').then((r) => setQuestions(r.data)).catch(() => {});
    api('/groups?limit=100').then((r) => setGroups(r.data)).catch(() => {});
  }, []);

  const toggle = (key, id) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  const create = async (e) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      await api('/exams', {
        method: 'POST',
        body: { ...form, durationMinutes: Number(form.durationMinutes), startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString() },
      });
      setMsg('Exam created (draft). Publish it from the list below.');
      load();
    } catch (err) { setError(err.message); }
  };

  const action = async (id, path, okMsg) => {
    setMsg(''); setError('');
    try { await api(`/exams/${id}/${path}`, { method: 'POST' }); setMsg(okMsg); load(); } catch (err) { setError(err.message); }
  };

  const showReport = async (exam) => {
    setError('');
    try {
      const [s, r] = await Promise.all([api(`/reports/exams/${exam._id}/summary`), api(`/reports/exams/${exam._id}/results?limit=100`)]);
      setReport({ title: exam.title, summary: s.data, results: r.data });
    } catch (err) { setError(err.message); }
  };

  const o = report?.summary.overall;

  return (
    <div>
      <form className="card" onSubmit={create}>
        <h3>Create exam</h3>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <textarea placeholder="Instructions" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        <div className="row">
          <label>Duration (min)<input type="number" min="1" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} required /></label>
          <label>Start<input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></label>
          <label>End<input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></label>
        </div>
        <div className="row">
          <label className="option"><input type="checkbox" checked={form.negativeMarking} onChange={(e) => setForm({ ...form, negativeMarking: e.target.checked })} /> Negative marking</label>
          <label>Results<select value={form.releaseMode} onChange={(e) => setForm({ ...form, releaseMode: e.target.value })}>
            <option value="manual">Release manually</option><option value="immediate">Show immediately</option>
          </select></label>
        </div>
        <span className="section-label">Questions {!questions.length && <span className="muted">(add questions in the Question Bank first)</span>}</span>
        {questions.map((q) => (
          <label className="option" key={q._id}>
            <input type="checkbox" checked={form.questions.includes(q._id)} onChange={() => toggle('questions', q._id)} /> <span style={{ flex: 1 }}>{q.text}</span> <span className="muted">({q.marks} marks)</span>
          </label>
        ))}
        <span className="section-label">Assign to groups {!groups.length && <span className="muted">(no groups yet; an admin creates them)</span>}</span>
        {groups.map((g) => (
          <label className="option" key={g._id}>
            <input type="checkbox" checked={form.assignedGroups.includes(g._id)} onChange={() => toggle('assignedGroups', g._id)} /> {g.name}
          </label>
        ))}
        <button type="submit" style={{ marginTop: 12 }}>Create exam</button>
      </form>

      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h3>My exams <span className="count">{exams.length}</span></h3>
        {!exams.length && <Empty>No exams yet.</Empty>}
        {exams.map((e) => (
          <div className="exam-row" key={e._id}>
            <div>
              <strong>{e.title}</strong> <Badge>{e.status}</Badge>
              {e.resultsReleasedAt && <Badge variant="released">results released</Badge>}
              <div className="muted">{fmt(e.startTime)} → {fmt(e.endTime)} · {e.durationMinutes} min · {e.questions.length} questions</div>
            </div>
            <div className="actions">
              {e.status === 'draft' && <button onClick={() => action(e._id, 'publish', 'Exam published')}>Publish</button>}
              {e.status === 'published' && <button className="secondary" onClick={() => action(e._id, 'release-results', 'Results released')}>Release results</button>}
              {e.status === 'published' && <button className="secondary" onClick={() => showReport(e)}>Report</button>}
            </div>
          </div>
        ))}
      </div>

      {report && (
        <div className="card">
          <h3>Report: {report.title} <button className="secondary small" onClick={() => setReport(null)}>Close</button></h3>
          <div className="stats">
            <div className="stat"><span>Attempts</span><strong>{o.attempts}</strong></div>
            <div className="stat"><span>Average</span><strong>{o.averageScore ?? '-'}</strong></div>
            <div className="stat"><span>Highest</span><strong>{o.highestScore ?? '-'}</strong></div>
            <div className="stat"><span>Lowest</span><strong>{o.lowestScore ?? '-'}</strong></div>
            <div className="stat"><span>In progress</span><strong>{report.summary.inProgress}</strong></div>
          </div>
          {!!report.summary.sectionWise.length && (
            <>
              <h4>Section-wise</h4>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Section</th><th>Attempts</th><th>Avg</th><th>High</th><th>Low</th></tr></thead>
                  <tbody>{report.summary.sectionWise.map((s) => (
                    <tr key={s.section}><td>{s.section}</td><td>{s.attempts}</td><td>{s.averageScore}</td><td>{s.highestScore}</td><td>{s.lowestScore}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          <h4>Student-wise</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Status</th></tr></thead>
              <tbody>{report.results.map((r) => (
                <tr key={r._id}><td>{r.student?.name}</td><td><strong>{r.score} / {r.totalMarks}</strong></td><td>{r.correctCount}</td><td>{r.wrongCount}</td><td><Badge>{r.status}</Badge></td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
