import { useState } from 'react';
import { api } from '../api';
import { CapIcon, ShieldIcon, ClockIcon, ChartIcon } from '../components/Icons.jsx';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const r = await api(`/auth/${mode}`, { method: 'POST', body, auth: false });
      onLogin(r.data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-shell">
      <div className="login card auth">
        <section className="auth-hero">
          <div className="brand-logo"><CapIcon width={26} height={26} /></div>
          <h1>Online Examination System</h1>
          <p>A secure, timed and fully automated platform for conducting exams and tracking results.</p>
          <ul className="feature-list">
            <li><ShieldIcon /> Secure, role-based access</li>
            <li><ClockIcon /> Timed exams with autosave</li>
            <li><ChartIcon /> Instant reports and analytics</li>
          </ul>
        </section>

        <section className="auth-form">
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="sub">{mode === 'login' ? 'Sign in to continue to your dashboard.' : 'Register as a student to get started.'}</p>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <label>Full name
                <input placeholder="Jane Doe" value={form.name} onChange={set('name')} required />
              </label>
            )}
            <label>Email
              <input type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
            </label>
            <label>Password
              <input type="password" placeholder="Min 8 characters" value={form.password} onChange={set('password')} required />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="block">{mode === 'login' ? 'Login' : 'Register'}</button>
          </form>
          <p className="link" onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'New student? Register' : 'Back to login'}
          </p>
        </section>
      </div>
    </div>
  );
}
