# Online Examination and Assessment Management System

Backend Development Capstone - **Project 2** (Advanced · Education / Online Assessment)

A REST + real-time backend (plus a small React client) where faculty build question banks and schedule exams, students attempt them inside a server-enforced time window, objective questions are auto-evaluated, and faculty get aggregation-based analytics. All security-critical rules (access, timing, scoring, answer-key protection) are enforced **on the server**.

| | |
|---|---|
| Backend | Node.js, Express.js, MongoDB, Mongoose |
| Auth | bcrypt-hashed passwords (`bcryptjs`), JWT access + rotating refresh tokens, RBAC |
| Validation | Zod schemas on every route + Mongoose model validators |
| Real-time | Socket.IO (JWT-authenticated) + Node `EventEmitter` event bus |
| Cross-origin | Explicit CORS allow-list (`CLIENT_ORIGIN`) for Express and Socket.IO |
| Frontend | React + Vite (basic client for all three roles) |
| Tests | Jest + Supertest + mongodb-memory-server |
| Packaging | Docker Compose (MongoDB + backend + frontend) |

---

## 1. Features

- **Roles:** Administrator, Faculty, Student - each restricted to its own operations.
- **Question bank:** CRUD for multiple-choice questions (options, correct answer, marks, negative marks, subject/topic, difficulty); filter by topic/subject/difficulty with pagination.
- **Exam creation & scheduling:** title, instructions, duration, start/end time; assign to selected students and/or groups (sections); question selection (random N from a pool) and per-attempt shuffling.
- **Attempt & submission:** start only inside the window, resume an in-progress attempt, autosave answers, final submit, **server-side deadline enforcement** and automatic submission when time runs out.
- **Automatic evaluation:** marks computed on the backend only (supports negative marking).
- **Results & analytics (MongoDB aggregation):** student-wise results, average / highest / lowest score, section(group)-wise performance, question-wise correct rate, exam-wise report over a date range.
- **Result release control:** `manual` (faculty releases) or `immediate`.
- **Live status:** Socket.IO monitoring for faculty, notifications for students.
- **Audit log:** exam published, attempt started/submitted, results released.

## 2. Repository structure

```
docker-compose.yml        MongoDB + backend + frontend in one command
.env.example              settings for docker compose (copy to .env)
backend/
  server.js               entry: DB connect, HTTP + Socket.IO, expired-attempt sweeper
  scripts/seed.js         create admin (and optional demo data)
  src/
    app.js                Express app (helmet, CORS, rate limit, routes, error handling)
    config/               env, DB connection, CORS options
    models/               User, Group, Question, Exam, Attempt, AuditLog
    routes/               route definitions (+ middleware chain)
    controllers/          request handlers (auth, user, group, question, exam, attempt, result, report)
    services/             examService (ownership/eligibility), attemptService (merge answers, grading)
    middleware/           authenticate / authorize (RBAC), validate (Zod), centralized errorHandler
    validators/           Zod schemas
    events/               EventEmitter bus + audit-log listener
    sockets/              Socket.IO server
  tests/api.test.js       API integration tests
  Dockerfile
frontend/                 React (Vite) client: login, student, faculty, admin screens
  Dockerfile, nginx.conf
```

Request flow: **Route -> Middleware (auth, RBAC, validation) -> Controller -> Service/Model -> MongoDB -> Response**; errors go to the centralized handler.

## 3. Running the project

### Option A - Docker (everything together)

Requires Docker Desktop (or Docker Engine + Compose).

```bash
docker compose up --build     # that's it; dev JWT secrets are built in
# For real deployments: cp .env.example .env and set strong JWT secrets first
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000/api (health: `/api/health`) |
| MongoDB | internal to Compose (data kept in the `mongo_data` volume) |

On start, the backend creates the admin account and (with `SEED_DEMO=true`) demo users. Useful commands:

```bash
docker compose logs -f backend   # watch API logs
docker compose down              # stop (data is kept)
docker compose down -v           # stop and delete the database
```

### Option B - Without Docker

Requires Node.js >= 18 and a running MongoDB (local or Atlas).

```bash
# terminal 1 - backend
cd backend
npm install
cp .env.example .env          # set JWT secrets and MONGO_URI
npm run seed:demo
npm run dev                   # http://localhost:5000

# terminal 2 - frontend
cd frontend
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:5000/api
npm run dev                   # http://localhost:5173
```

### CORS

The frontend and backend run on different origins (`:5173` and `:5000`), so the browser enforces CORS. The backend allows only the origins listed in `CLIENT_ORIGIN` (comma separated), answers preflight (`OPTIONS`) requests, and permits the `Authorization` and `Content-Type` headers. Requests from other browser origins receive no CORS headers and are blocked. Socket.IO uses the same allow-list. When you deploy the frontend to another URL, add it to `CLIENT_ORIGIN`; if the API URL changes, rebuild the frontend with a new `VITE_API_URL`.

### Environment variables (backend)

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/exam_system` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets (**required in production**) | dev placeholders |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | Token lifetimes | `15m` / `7d` |
| `CLIENT_ORIGIN` | Allowed browser origins (CORS) | `http://localhost:5173` |
| `SUBMIT_GRACE_SECONDS` | Network grace after the deadline | `5` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used by the seed script | see `.env.example` |
| `SEED_DEMO` | `true` also creates demo faculty/students/group | - |

> `.env` files are git-ignored. **Never commit secrets.**

### Demo accounts (created with `SEED_DEMO=true` / `npm run seed:demo`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@example.com` | `Admin@12345` |
| Faculty | `faculty@example.com` | `Faculty@12345` |
| Student | `student1@example.com` / `student2@example.com` | `Student@12345` |

Change these (and set `SEED_DEMO=false`) before any real deployment.

### Using the web client

- **Student:** My Exams -> Start/Resume -> answer (autosaved) -> Submit; My Results shows scores once released.
- **Faculty:** Question Bank (add/delete), Exams (create with questions + groups, Publish, Release results, Report).
- **Admin:** create users, create groups, add students to groups.
- Faculty assign exams to **groups** (the demo group `CSE-A` contains both demo students).

## 4. Running tests

```bash
cd backend
npm test
```

Tests spin up an in-memory MongoDB (`mongodb-memory-server`, which downloads a MongoDB binary on first run - internet access required once). Coverage follows the assignment's minimum list: valid request, validation failure, missing resource (404), missing token (401), insufficient role (403), duplicate/conflict (409), and business-rule boundaries (outside window, expired deadline, duplicate submission, foreign answer ids, answer-key leakage, client-supplied score, negative marking, retakes, result release), plus CORS allow/deny and preflight checks.

## 5. API reference

All responses: `{ "success": true, "data": ..., "meta"?: {...} }` or `{ "success": false, "message": "...", "details"?: [...] }`.
Protected routes need `Authorization: Bearer <accessToken>`.

### Authentication
| Method | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Always creates a **student** |
| POST | `/api/auth/login` | Public | Returns `accessToken` + `refreshToken` |
| POST | `/api/auth/refresh` | Public | Body `{refreshToken}`; rotates tokens, reuse is rejected |
| POST | `/api/auth/logout` | Any | Revokes the refresh token |

### Users & groups
| Method | Endpoint | Access |
|---|---|---|
| GET / PATCH | `/api/users/me` | Any (update name / password) |
| GET / POST | `/api/users` | Admin (list with `role`, `search`, pagination / create any role) |
| GET / PATCH / DELETE | `/api/users/:id` | Admin |
| GET | `/api/groups`, `/api/groups/:id` | Admin, Faculty |
| POST / PATCH / DELETE | `/api/groups`, `/api/groups/:id` | Admin |
| POST | `/api/groups/:id/members` | Admin – body `{studentIds:[]}` |
| DELETE | `/api/groups/:id/members/:userId` | Admin |

### Question bank (Faculty owns their questions; Admin sees all)
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/questions` | `{text, options[2-6], correctIndex, marks, negativeMarks, subject, topic, difficulty}` |
| GET | `/api/questions?topic=&subject=&difficulty=&page=&limit=` | Filter + pagination |
| GET / PATCH / DELETE | `/api/questions/:id` | Blocked (409) if the question is in a published exam |

### Examinations
| Method | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/api/exams` | Faculty/Admin | Create (draft) |
| GET | `/api/exams` | All | Student: assigned + published only. Faculty: own. Filters `status`, `from`, `to` |
| GET | `/api/exams/:id` | All | Students never receive question ids or answer keys |
| PATCH / DELETE | `/api/exams/:id` | Faculty/Admin | Only drafts editable; no delete once attempts exist |
| POST | `/api/exams/:id/publish` | Faculty/Admin | Notifies assigned students |
| POST | `/api/exams/:id/assign` | Faculty/Admin | `{studentIds, groupIds}` |
| POST | `/api/exams/:id/release-results` | Faculty/Admin | Blocked while attempts are in progress |
| GET | `/api/exams/:id/live` | Faculty/Admin | Active attempts snapshot |
| POST | `/api/exams/:id/start` | Student | Starts / resumes an attempt |

### Attempts & results (Student)
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/attempts/:attemptId` | Questions (no answer key), saved answers, `remainingSeconds` |
| PUT | `/api/attempts/:attemptId/answers` | Autosave `{answers:[{questionId, selectedIndex}]}` |
| POST | `/api/attempts/:attemptId/submit` | Final submit; optional `answers`; any `score` sent by the client is ignored |
| GET | `/api/results/me` | Scores shown only once released |
| GET | `/api/results/me/:attemptId` | Per-question correctness (never the key itself) |

### Reports (Faculty/Admin, own exams only)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reports/exams?from=&to=&page=&limit=` | Exam-wise stats over a date range |
| GET | `/api/reports/exams/:examId/results?sortBy=&order=&page=&limit=` | Student-wise results |
| GET | `/api/reports/exams/:examId/summary` | Average / highest / lowest overall and **section-wise** |
| GET | `/api/reports/exams/:examId/questions` | Question-wise performance (hardest first) |

## 6. Real-time (Socket.IO)

Connect with the same JWT: `io(URL, { auth: { token: accessToken } })`. Unauthenticated sockets are refused.

| Direction | Event | Payload | Who |
|---|---|---|---|
| client → server | `monitor:join` | `{ examId }` (ack returns current active attempts) | Faculty/Admin who own the exam |
| client → server | `monitor:leave` | `{ examId }` | Faculty/Admin |
| server → client | `attempt:started` | `{examId, attemptId, studentId, studentName, startedAt, deadline, totalQuestions}` | Room `exam:<id>` |
| server → client | `attempt:progress` | `{examId, attemptId, studentId, answered, totalQuestions}` | Room `exam:<id>` |
| server → client | `attempt:submitted` | `{examId, attemptId, studentId, status, submittedAt}` | Room `exam:<id>` |
| server → client | `exam:available` | `{examId, title, startTime, endTime}` | Assigned students (`user:<id>`) |
| server → client | `result:released` | `{examId, title}` | Students who attempted |

Rooms: `user:<userId>` (personal) and `exam:<examId>` (monitoring). Domain events are emitted on a Node `EventEmitter` bus; the audit logger and Socket.IO both subscribe to it.

## 7. Business rules → where they are enforced

| Rule | Enforcement |
|---|---|
| Student cannot access an unassigned exam | `isEligible()` in `examService`; start returns 403, detail/list return 404/empty |
| Answer keys never returned to students | `Question.correctIndex` is `select: false`; student views never load it |
| One submission unless retake configured | `maxAttempts` + unique indexes (`exam, student, attemptNumber` and one active attempt) + atomic `findOneAndUpdate` on `status: in_progress` |
| Start/end time and duration validated server-side | `start` checks the window; deadline = `min(start + duration, exam.endTime)`; late submits graded only on autosaved answers; background sweeper auto-submits abandoned attempts |
| Marks calculated on backend | `finalizeAttempt()` – client score is stripped by validation and never read |
| Answer ids validated against the exam | `mergeAnswers()` checks question ids belong to **that attempt** and option indexes are in range |
| Ownership | Faculty can only manage their own questions/exams/reports |

## 8. Data model (summary)

- **User** – name, email (unique), password hash, role, groups, isActive, refreshTokenHash
- **Group** – name (unique), description
- **Question** – text, options, correctIndex (hidden), marks, negativeMarks, subject, topic, difficulty, createdBy · index `{topic, difficulty}`
- **Exam** – title, instructions, duration, start/end, questions, questionCount, shuffleQuestions, negativeMarking, maxAttempts, releaseMode, resultsReleasedAt, assignedStudents/Groups, status, createdBy
- **Attempt** – exam, student, attemptNumber, questions (this attempt's order), answers (`selectedIndex`, `isCorrect`, `marksAwarded`), status, startedAt, deadline, submittedAt, score, counts
- **AuditLog** – action, actor, exam, attempt, meta

Indexes: unique email; `Question {topic, difficulty}`; `Exam {startTime, endTime}`, assignment indexes; `Attempt` unique `(exam, student, attemptNumber)`, partial-unique one active attempt, `(status, deadline)` for the sweeper, `(exam, status)` for reports.

## 9. Security notes

- Passwords hashed with bcrypt; JWT access tokens (short-lived) + rotating refresh tokens stored hashed; refresh reuse revokes the session.
- RBAC middleware on every protected route; deactivated users are rejected immediately (user is reloaded per request).
- Zod validation strips unknown fields (no mass-assignment of `role`, `score`, …); malformed ids return 400.
- `helmet`, **CORS allow-list** (`CLIENT_ORIGIN`; unknown browser origins get no CORS headers, preflight handled), request body size limit, rate limiting on auth routes.
- Uniform 404 for resources a student must not know exist.
- Secrets live in `.env` (git-ignored); production refuses to start without JWT secrets.

## 10. Quick demo flow (Postman / curl)

1. `POST /api/auth/login` as faculty → copy `accessToken`.
2. `POST /api/questions` (a few MCQs) → `POST /api/exams` with `questions`, `assignedStudents` or `assignedGroups`, start/end window → `POST /api/exams/:id/publish`.
3. Login as student → `GET /api/exams` → `POST /api/exams/:id/start` → `PUT /api/attempts/:id/answers` → `POST /api/attempts/:id/submit`.
4. Faculty: `GET /api/exams/:id/live`, `POST /api/exams/:id/release-results`, then the `/api/reports/...` endpoints.
5. Student: `GET /api/results/me`.

## 11. Milestone mapping

| Milestone | Delivered in |
|---|---|
| 1 – Planning & design | Sections 1, 8 (modules, data model) |
| 2 – Core backend | MVC structure, Mongoose models, CRUD APIs |
| 3 – Security & business logic | Zod validation, middleware, central error handling, bcrypt, JWT, RBAC |
| 4 – Advanced features | Aggregation reports, indexes, EventEmitter, Socket.IO, negative marking, randomization, audit log |
| 5 – Testing & demo | `tests/api.test.js`, this README |

## 12. Team contributions

| Member | Contribution |
|---|---|
| _Name 1_ | _e.g. auth, RBAC, users/groups_ |
| _Name 2_ | _e.g. question bank, exams, attempts_ |
| _Name 3_ | _e.g. reports/aggregation, Socket.IO, tests_ |

> Every member should be able to explain the execution flow **Route → Middleware → Controller → Model → MongoDB → Response** for any API in this project.
