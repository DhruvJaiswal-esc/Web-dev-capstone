# Online Examination & Assessment Management System


## 1. Executive summary

This project is a full-stack online examination platform. Faculty build question banks and schedule timed exams, students attempt them inside a server-enforced window, objective questions are graded automatically, and faculty get aggregation-based analytics. A real-time layer (Socket.IO) and an audit log round out the backend. A small React client covers all three roles (admin, faculty, student), and the whole stack runs with one `docker compose up --build`.

**Overall assessment: a strong, well-organised capstone.** The backend is the standout. The security-critical rules (answer-key protection, deadline enforcement, server-side scoring, ownership checks, double-submit prevention) are implemented on the server in the right places and are backed by targeted tests. The weaker areas are the frontend (feature-thin, and it does not use the real-time layer at all), a few session and deployment-hardening gaps, and some documentation placeholders left unfilled.

| Aspect | Rating | One-line verdict |
|---|---|---|
| Architecture & code organisation | Strong | Clean Route → Middleware → Controller → Service/Model layering |
| Business-rule correctness | Strong | Atomic state transitions, unique/partial indexes, server-side grading |
| Security | Good | JWT + rotating refresh, RBAC, Zod, Helmet, CORS allow-list; a few gaps (section 9) |
| Analytics | Strong | Real MongoDB aggregation pipelines for overall, section-wise and question-wise stats |
| Testing | Good | 41 integration tests covering the core rules; not executed during this review |
| Frontend | Basic | Functional for core flows; no Socket.IO, no edit screens, no pagination UI |
| DevOps | Good | Multi-stage Dockerfiles, health-checked Mongo, idempotent seed; insecure defaults if left unchanged |
| Documentation | Strong | Detailed README with API tables, rules-to-code mapping, demo flow |

## 2. Scope and method

I unpacked the archive and read every source file in the backend (`src/`, `scripts/`, `tests/`), the frontend (`src/`, build config, Dockerfile, nginx config), `docker-compose.yml`, the env templates and the README. This is a **static code review**. I did not install dependencies, start the stack or run the test suite, so statements about behaviour come from reading the code, and the test results are not independently confirmed.

**Size of the codebase** (excluding lockfiles): about 1,500 lines of backend source, 400 lines of tests, 1,100 lines of frontend (including ~19 KB of CSS), plus the README (~16 KB).

## 3. Technology stack

| Layer | Technology |
|---|---|
| Runtime / framework | Node.js ≥ 18, Express 4 |
| Database | MongoDB 7 via Mongoose 8 |
| Authentication | `bcryptjs` (cost 10), JWT access token (15 min) + rotating refresh token (7 days) |
| Validation | Zod schemas on every route, plus Mongoose validators |
| Real-time | Socket.IO 4 (JWT-authenticated) bridged from a Node `EventEmitter` bus |
| HTTP hardening | Helmet, CORS allow-list, 100 KB body limit, rate limiting on `/api/auth` |
| Logging | Morgan (disabled in tests) |
| Frontend | React 18 + Vite 5, hand-written CSS (glassmorphism dark theme), served by nginx in production |
| Testing | Jest, Supertest, mongodb-memory-server, socket.io-client |
| Packaging | Docker Compose: `mongo`, `backend`, `frontend` |

## 4. Architecture

### 4.1 Request flow

Every API call follows the same path, which keeps the codebase easy to reason about:

**Route → Middleware (authenticate, authorize, validate) → Controller → Service / Model → MongoDB → JSON response**, with all errors funnelled to one central handler.

### 4.2 Backend layout

- `server.js`: connects to the database, registers the audit listener, creates the HTTP server, attaches Socket.IO, starts a 30-second sweeper for expired attempts, and shuts down gracefully on SIGINT/SIGTERM.
- `src/app.js`: Express app wiring (Helmet, CORS, JSON parsing, rate limiter, route mounting, 404 and error handlers). It is separate from `server.js`, which is what lets Supertest drive it without opening a port.
- `config/`: environment loading (production refuses to start without required secrets), DB connection, CORS options shared by Express and Socket.IO.
- `models/`: User, Group, Question, Exam, Attempt, AuditLog.
- `controllers/`: auth, user, group, question, exam, attempt, result, report.
- `services/`: `examService` (ownership, eligibility, recipients, student-safe exam view) and `attemptService` (answer merging, grading, finalisation, sweeper).
- `middleware/`: `authenticate`, `authorize`, `validate`, `errorHandler`.
- `events/`: an `EventEmitter` bus and an audit-log subscriber.
- `sockets/`: Socket.IO server and the bus-to-socket bridge.

### 4.3 Event-driven decoupling

Controllers and services emit domain events (`exam.published`, `attempt.started`, `attempt.progress`, `attempt.submitted`, `results.released`). The audit logger and the Socket.IO layer both subscribe to the bus, so business code depends on neither. This is a clean, low-ceremony design for a single-process service.

## 5. Feature walkthrough

### 5.1 Users, roles and groups

- Three roles: **admin**, **faculty**, **student**. Public registration always creates a student; faculty and admins are created by an admin.
- Admins manage users (list with role filter and search, create, update, deactivate, delete) and **groups** (sections) with add/remove members. Admins cannot demote, deactivate or delete themselves.
- Users can read their profile and change name or password (current password required).

### 5.2 Question bank

- Multiple-choice questions with 2 to 6 options, a correct index, marks, negative marks, subject, topic and difficulty.
- Faculty see and edit only their own questions; admins see all. Filtering by topic, subject and difficulty, with pagination.
- A question used in a **published** exam cannot be edited or deleted (409).

### 5.3 Exam creation and scheduling

- Title, instructions, duration (1 to 600 min), start/end window, question list, optional `questionCount` (draw N random questions from the pool), shuffle, negative marking, `maxAttempts` (1 to 5), and `releaseMode` (`manual` or `immediate`).
- Assignment to individual students and/or groups. Publishing requires at least one question, at least one assignee and an end time in the future. Only drafts can be edited; exams with attempts cannot be deleted.
- Faculty can only use questions from their own bank; assignees are verified to be real students and real groups.

### 5.4 Taking an exam

1. **Start**: allowed only for assigned students, only while published, and only inside the window. If an in-progress attempt exists it is resumed; otherwise a new one is created with a deadline of `min(start + duration, exam end)`.
2. **Autosave**: `PUT /attempts/:id/answers` merges answers after checking that each question belongs to *that attempt* and each option index is in range.
3. **Submit**: `POST /attempts/:id/submit`. If the deadline plus a small grace period (default 5 s) has passed, the payload is ignored and only previously autosaved answers are graded, with status `auto_submitted`.
4. **Sweeper**: a background job auto-submits abandoned attempts every 30 seconds. Attempts are also finalised lazily when read or saved after the deadline.

### 5.5 Grading

Scoring happens only in `finalizeAttempt()` on the server, from the stored answer key. It supports per-question marks and negative marking, and records correct, wrong and unanswered counts. Any `score` sent by a client is stripped by validation and never read.

### 5.6 Results and release control

Students see scores only after release (`immediate` mode, or faculty clicks release). Releasing is blocked while attempts are still in progress. A student's result detail shows per-question correctness but never the answer key itself.

### 5.7 Analytics (MongoDB aggregation)

| Endpoint | What it computes |
|---|---|
| `GET /reports/exams` | Exam-wise attempts, average, highest and lowest score over a date range, paginated |
| `GET /reports/exams/:id/results` | Student-wise results, sortable by score or submission time |
| `GET /reports/exams/:id/summary` | Overall average, highest, lowest, average percentage, auto-submit count, **plus section-wise breakdown** via `$lookup` and `$unwind` on user groups |
| `GET /reports/exams/:id/questions` | Per-question appeared / attempted / correct counts and correct rate, hardest first |

### 5.8 Real-time and audit

- Socket.IO connections must present a valid JWT. Each user joins `user:<id>`; the exam owner (or an admin) can join `exam:<id>` through `monitor:join` and receives `attempt:started`, `attempt:progress` and `attempt:submitted`. Assigned students receive `exam:available`, and attempting students receive `result:released`.
- An audit log records exam publication, attempt start and submission, and result release.

## 6. Data model

| Collection | Key fields | Notable indexes / rules |
|---|---|---|
| User | name, email, password hash (`select:false`), role, groups, isActive, refreshTokenHash (`select:false`) | Unique email; role index; `toJSON` strips secrets |
| Group | name, description, createdBy | Unique name |
| Question | text, options, **correctIndex (`select:false`)**, marks, negativeMarks, subject, topic, difficulty, createdBy | `{topic, difficulty}`; validator that `correctIndex` is within options |
| Exam | schedule, duration, question pool, flags, assignees, status, createdBy | `{startTime, endTime}`; assignee indexes; validator that end is after start and `questionCount` ≤ pool size |
| Attempt | exam, student, attemptNumber, ordered questions, answers (selected, isCorrect, marksAwarded), status, deadline, score, counts | Unique `(exam, student, attemptNumber)`; **partial-unique index allowing only one `in_progress` attempt per student per exam**; `(status, deadline)` for the sweeper; `(exam, status)` for reports |
| AuditLog | action, actor, exam, attempt, meta | Indexed on action and exam |

The partial-unique index and the atomic `findOneAndUpdate({status:'in_progress'})` in finalisation are the two best design choices in the data layer: they make double-start and double-submit races safe at the database level rather than relying on application checks alone.

## 7. API surface

The backend exposes about **43 endpoints** under `/api`, all returning a uniform envelope (`{success, data, meta?}` or `{success:false, message, details?}`).

| Group | Endpoints | Access |
|---|---|---|
| Health | 1 | Public |
| Auth (register, login, refresh, logout) | 4 | Public / any |
| Users (self + admin CRUD) | 7 | Any (self) / Admin |
| Groups (CRUD + members) | 7 | Admin write, Admin/Faculty read |
| Questions | 5 | Faculty, Admin |
| Exams (CRUD, publish, assign, release, live, start) | 10 | Staff; `start` is student-only; list/detail are role-aware |
| Attempts (get, autosave, submit) | 3 | Student (own attempts only) |
| Results | 2 | Student |
| Reports | 4 | Faculty (own exams), Admin |

## 8. Business rules and where they are enforced

| Rule | Mechanism (verified in code) |
|---|---|
| Unassigned exam is inaccessible | `isEligible()`; start returns 403, detail returns the same 404 as a missing exam so ids cannot be probed |
| Answer keys never reach students | `correctIndex` is `select:false`; student views select fields explicitly |
| One submission unless retakes allowed | `maxAttempts` check plus unique and partial-unique indexes plus atomic finalisation |
| Time window and duration | Checked on start; deadline fixed at start; late submit ignores the payload |
| Scores computed on the backend | `finalizeAttempt()` only; Zod strips client-sent `score` |
| Foreign question or option ids rejected | `mergeAnswers()` validates against *that attempt's* question list and option counts |
| Ownership | `loadOwnedExam()` and scoped question queries |

## 9. Security assessment

**Implemented well**

- Passwords hashed with bcrypt; the 72-character cap matches bcrypt's input limit.
- Short-lived access tokens, refresh-token rotation with hashed storage, and reuse detection that revokes the session.
- The user is reloaded from the database on every request, so deactivation takes effect immediately.
- Zod validation on params, query and body, with unknown fields stripped. This blocks mass assignment (for example `role` or `score`) and, because query values are coerced to typed values, also operator-injection style payloads.
- Helmet, CORS allow-list shared with Socket.IO, body-size limit, auth rate limiting, regex escaping in user search, and production-mode error messages that hide internals.
- Central error mapping for Zod, Mongoose validation, cast, duplicate-key (409) and JWT errors.

**Gaps and risks** (see also section 12)

- Tokens are stored in `localStorage`, so any XSS would expose them. The nginx-served frontend sets no security headers such as CSP.
- Only one refresh-token hash is stored per user, so a second login overwrites the first.
- Socket connections are authenticated once and are not re-checked when the access token expires or the account is deactivated.
- Rate limiting covers only `/api/auth`, and `trust proxy` is not set (matters if the API is placed behind a reverse proxy).
- Changing a password does not revoke existing refresh tokens.

## 10. Frontend

A React + Vite single-page client with role-based home screens and a custom dark glassmorphism theme.

- **Login / register**: student self-registration, tab-style switch.
- **Student**: My Exams (start / resume / submitted state), exam-taking screen with live countdown, progress bar, question navigator, per-click autosave, auto-submit at zero, and a My Results table.
- **Faculty**: add and delete questions, create exams (questions, groups, negative marking, release mode), publish, release results, and a report view (summary and student results).
- **Admin**: create users, create groups, add students to groups, list all users.
- API client with automatic single retry after token refresh.

**Observations**

- The frontend has **no Socket.IO client**. The live monitoring and notification features exist only on the backend and cannot be seen in the UI.
- There is no UI for editing questions or exams, viewing per-question analytics or section-wise results, deactivating or deleting users, or paging through lists (lists are fixed at 50–100 items).
- Autosave fires on every click with no debounce, retry or offline queue; failures show an error banner only. The timer counts down locally from the initial server value, which is acceptable because the server enforces the real deadline.

## 11. DevOps and testing

**Deployment**

- Backend image: Node 20 Alpine, production dependencies only, runs as the unprivileged `node` user.
- Frontend: multi-stage build, served by nginx with SPA fallback; the API URL is baked in at build time.
- Compose: MongoDB with a health check and persistent volume, backend waits for a healthy database, and the seed script is idempotent so restarts are safe.

**Tests**: `tests/api.test.js` contains **41 Jest/Supertest tests** against an in-memory MongoDB, grouped as Authentication (7), RBAC and question bank (6), Exam management (4), Attempts and business rules (13), Results and analytics (6), Admin management (2) and CORS (3). They cover the required happy and failure paths (401, 403, 404, 409, 400) and the business-rule boundaries: outside-window start, expired deadline, duplicate submit, foreign answer ids, answer-key leakage, client-supplied score, negative marking, retakes and result release. I did not run them here. The README notes that the first run needs internet access to download a MongoDB binary.

## 12. Findings and recommendations

### 12.1 Prioritised findings

| # | Finding | Severity | Suggested fix |
|---|---|---|---|
| 1 | `docker-compose.yml` runs the API in production mode but falls back to known dev JWT secrets, and `SEED_DEMO` defaults to `true`, creating accounts with published passwords (including an admin) | High if deployed as-is; fine for demos | Remove secret defaults so Compose fails without a `.env`; default `SEED_DEMO` to `false` |
| 2 | Frontend never connects to Socket.IO, so live monitoring and notifications are unused in the UI | Medium (feature gap) | Add `socket.io-client`; build a live-monitor panel and toast notifications |
| 3 | Single `refreshTokenHash` per user: logging in on a second device invalidates the first, and that device's next refresh looks like token reuse and kills the session | Medium | Store a list of session records (token id, device, expiry) and revoke per session |
| 4 | Deleting a question that sits in a **draft** exam leaves a dangling id. Publishing only checks that the list is non-empty, so an attempt could present fewer questions than advertised | Medium | Verify all question ids exist at publish and start; block deletion of questions referenced by any exam |
| 5 | Tokens in `localStorage` and no CSP or security headers on the nginx frontend | Low to Medium | Add CSP and related headers in `nginx.conf`; consider httpOnly cookie for the refresh token |
| 6 | Socket auth is checked only at connection time | Low | Disconnect on token expiry, or re-validate on each `monitor:join` |
| 7 | Assigning to an already-published exam re-emits `exam.published`, creating duplicate audit entries with a misleading action name | Low | Emit a distinct `exam.assigned` event |
| 8 | Audit log is write-only: no API or UI to read it | Low | Add an admin-only paginated `GET /api/audit` |
| 9 | `releaseResults` can be repeated and overwrites the timestamp; there is no way to withdraw results | Low | Make release idempotent; optionally add an unrelease action |
| 10 | Password change does not revoke refresh tokens; no login lockout beyond the IP rate limit; `trust proxy` unset | Low | Revoke sessions on password change; set `trust proxy` behind a proxy; add per-account throttling |
| 11 | Section-wise report counts a student once per group they belong to | Informational | Document the behaviour, or define a primary section |
| 12 | README "Team contributions" table still has placeholder names | Housekeeping | Fill in before submission |

### 12.2 Suggested roadmap

1. **Quick wins (hours):** fix the Compose defaults (finding 1), referential checks at publish (4), fill the README table (12), add nginx security headers (5).
2. **Short term (days):** Socket.IO monitoring and notifications in the UI (2), edit screens for questions and exams, pagination controls, and a question-wise analytics view that uses the existing endpoint.
3. **Medium term:** multi-session refresh tokens (3), audit-log viewer (8), OpenAPI/Swagger documentation, ESLint and a CI pipeline running the Jest suite, and a small set of frontend tests.
4. **Feature growth:** additional question types (multi-select, numeric, descriptive with manual grading), CSV import for question banks and student rosters, CSV/PDF export of results, and proctoring-style signals such as tab-switch counts.

## 13. Conclusion

The project delivers what its brief asks for and does so with unusually good engineering discipline for a capstone. The layered structure is consistent, the security-sensitive logic lives on the server, race conditions are handled with database constraints and atomic updates, and the test suite targets the rules most likely to be broken. The work remaining is mostly at the edges: bringing the frontend up to the level of the backend, tightening session handling and deployment defaults, and polishing documentation. Addressing findings 1 to 4 would move it from an excellent demo to something close to deployable.

## Appendix: repository inventory

| Area | Contents |
|---|---|
| Root | `README.md`, `docker-compose.yml`, `.env.example`, `.gitignore`, `.gitattributes` |
| `backend/` | `server.js`, `Dockerfile`, `package.json`, `.env.example`, `scripts/seed.js`, `src/` (config 3, models 6, controllers 8, routes 8, services 2, middleware 4, events 2, sockets 1, utils 4, validators 1), `tests/api.test.js` |
| `frontend/` | `index.html`, `vite.config.js`, `Dockerfile`, `nginx.conf`, `src/` (`api.js`, `App.jsx`, `main.jsx`, pages: Login, StudentHome, TakeExam, FacultyHome, AdminHome; components: Icons, Ui; `styles.css`) |
