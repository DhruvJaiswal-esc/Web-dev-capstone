import { InboxIcon } from './Icons.jsx';

// Maps backend status/difficulty strings to badge colour classes.
export const Badge = ({ children, variant }) => (
  <span className={`badge ${variant ?? String(children)}`}>{String(children).replace('_', ' ')}</span>
);

export const Empty = ({ children }) => (
  <div className="empty"><InboxIcon /><p>{children}</p></div>
);

export const PageTitle = ({ title, subtitle }) => (
  <div className="page-title"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
);
