import { useState } from 'react';
import { api, setTokens } from './api';
import Login from './pages/Login.jsx';
import StudentHome from './pages/StudentHome.jsx';
import FacultyHome from './pages/FacultyHome.jsx';
import AdminHome from './pages/AdminHome.jsx';
import { CapIcon, LogoutIcon } from './components/Icons.jsx';

const SUBTITLE = { student: 'Student portal', faculty: 'Faculty workspace', admin: 'Administration' };

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));

  const onLogin = (data) => {
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  };
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setTokens(null);
    localStorage.removeItem('user');
    setUser(null);
  };

  if (!user) return (<><div className="orb-teal" /><Login onLogin={onLogin} /></>);

  const initials = (user.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <div className="orb-teal" />
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-logo"><CapIcon /></div>
            <h1>Online Examination System<small>{SUBTITLE[user.role]}</small></h1>
          </div>
          <div className="user-chip">
            <div className="user-meta">
              <strong>{user.name}</strong>
              <span className="badge">{user.role}</span>
            </div>
            <div className="avatar" title={user.name}>{initials}</div>
            <button className="secondary small" onClick={logout} aria-label="Logout"><LogoutIcon width={16} height={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Logout</button>
          </div>
        </header>
        {user.role === 'student' && <StudentHome />}
        {user.role === 'faculty' && <FacultyHome />}
        {user.role === 'admin' && <AdminHome />}
      </div>
    </>
  );
}
