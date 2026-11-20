import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Empty, PageTitle } from '../components/Ui.jsx';

export default function AdminHome() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'faculty' });
  const [groupName, setGroupName] = useState('');
  const [pick, setPick] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api('/users?limit=100').then((r) => setUsers(r.data)).catch((e) => setError(e.message));
    api('/groups?limit=100').then((r) => setGroups(r.data)).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  const run = async (fn, ok) => {
    setMsg(''); setError('');
    try { await fn(); setMsg(ok); load(); } catch (e) { setError(e.message); }
  };

  const students = users.filter((u) => u.role === 'student');

  return (
    <div>
      <PageTitle title="Administration" subtitle="Manage users, groups and sections." />
      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => api('/users', { method: 'POST', body: form }), 'User created'); }}>
        <h3>Create user</h3>
        <div className="row">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option>faculty</option><option>student</option><option>admin</option>
          </select>
        </div>
        <button type="submit">Create</button>
      </form>

      <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => api('/groups', { method: 'POST', body: { name: groupName } }), 'Group created').then(() => setGroupName('')); }}>
        <h3>Groups / sections <span className="count">{groups.length}</span></h3>
        <div className="row">
          <input placeholder="New group name (e.g. CSE-A)" value={groupName} onChange={(e) => setGroupName(e.target.value)} required />
          <button type="submit" style={{ flex: 'none', alignSelf: 'flex-start', marginTop: 6 }}>Create group</button>
        </div>
        {groups.map((g) => (
          <div className="exam-row" key={g._id}>
            <strong>{g.name}</strong>
            <div className="actions">
              <select value={pick[g._id] || ''} onChange={(e) => setPick({ ...pick, [g._id]: e.target.value })}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.email})</option>)}
              </select>
              <button type="button" className="secondary" disabled={!pick[g._id]}
                onClick={() => run(() => api(`/groups/${g._id}/members`, { method: 'POST', body: { studentIds: [pick[g._id]] } }), 'Student added to group')}>
                Add to group
              </button>
            </div>
          </div>
        ))}
      </form>

      <div className="card">
        <h3>All users <span className="count">{users.length}</span></h3>
        {!users.length && <Empty>No users found.</Empty>}
        {!!users.length && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u._id}>
                  <td><strong>{u.name}</strong></td><td>{u.email}</td>
                  <td><Badge variant="">{u.role}</Badge></td>
                  <td><Badge variant={u.isActive ? 'yes' : 'no'}>{u.isActive ? 'yes' : 'no'}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
