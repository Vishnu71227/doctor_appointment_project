# Contributing to HealthLine

Ye guide batati hai ki project me **kya kahan rakhna hai**, taaki har developer same structure follow kare.
Full folder tree ke liye `README.md` → *Project Structure* dekho.

---

## 1. Backend (`backend/src`)

Request ka flow hamesha ek hi direction me chalta hai:

```
routes  →  controllers  →  services  →  models
```

| Folder         | Kya rakhna hai                                              | Naming                     |
| -------------- | ----------------------------------------------------------- | -------------------------- |
| `routes/`      | URL → controller mapping, middleware attach karna           | `feature.routes.js`        |
| `controllers/` | `req`/`res` handle karna, validation call, response bhejna  | `feature.controller.js`    |
| `services/`    | Business logic, external APIs (email, SMS, payment, etc.)   | `feature.service.js`       |
| `models/`      | Mongoose schemas                                            | `PascalCase.js`            |
| `middlewares/` | Auth, rate limit, validation, error handling                | `name.middleware.js`       |
| `workers/`     | BullMQ background jobs                                      | `name.worker.js`           |
| `config/`      | DB, Redis, CORS, env, passport setup                        | `name.js`                  |
| `utils/`       | Chhote reusable helpers, loggers                            | `camelCase.js`             |

**Naya feature add karna ho** (example: `labReport`):

1. `models/LabReport.js`
2. `services/labReport.service.js`
3. `controllers/labReport.controller.js`
4. `routes/labReport.routes.js`
5. `app.js` me route mount karo

Rules:
- Controller me business logic mat likho. Wo `services/` me jaata hai.
- Route file me sirf routing aur middleware hoga.
- One-off scripts (seeding, data fixes) `backend/scripts/` me jaate hain, `src/` me nahi.

### Seed scripts

```bash
cd backend
npm run seed:admin          # admin user banata hai (scripts/seed-admin.mjs)
node scripts/seed-test-users.mjs   # test patient/doctor/admin
```

---

## 2. Frontend (`frontend/src`)

```
pages/
  public/        # Landing, Terms, Privacy, Refund (login ke bina)
  auth/          # Login, Register, ForgotPassword, GoogleRoleSelect
  patient/       # Patient dashboard, booking, history, payments, prescriptions
  doctor/        # Doctor dashboard, profile setup, create prescription
  consultation/  # Video / chat room (patient aur doctor dono use karte hain)
  blog/          # Blog list + post
  admin/         # Saare Admin* pages
components/
  ui/            # shadcn/ui primitives, generated hain (hand-edit avoid karo)
  common/        # App-wide reusable components (ErrorBoundary, ...)
  <feature>/     # Feature-specific components (jaise reviews/)
context/         # React context providers
hooks/           # Custom hooks
lib/             # Utilities
```

Rules:
- **Hamesha `@/` alias se import karo**, relative path (`../../`) se nahi:
  `import Login from "@/pages/auth/Login"`. Isse file move karne pe imports nahi tootte.
- Naya page kis role ka hai, wahi folder choose karo. Kisi ek role ke liye nahi hai to `public/` ya `consultation/` jaise shared folder.
- Ek hi feature ke 2+ components ho jaayein to `components/<feature>/` folder banao.
- Naya route `App.js` me register karo. Heavy pages ke liye `React.lazy` use karo.

---

## 3. Tests (`tests/`)

Python API tests `tests/api/` me hain. Ye **running backend** ke against chalte hain.

| File                            | Kaise chalana hai                                             |
| ------------------------------- | ------------------------------------------------------------- |
| `test_bug_fixes.py`             | `REACT_APP_BACKEND_URL=http://localhost:8001 pytest tests/api/test_bug_fixes.py -v` |
| `backend_test.py`               | `python tests/api/backend_test.py` (standalone script)        |
| `prescription_workflow_test.py` | `python tests/api/prescription_workflow_test.py` (standalone script) |

```bash
pip install requests pytest
```

> **Note:** `backend_test.py` aur `prescription_workflow_test.py` me `base_url` default ab
> `http://localhost:8001/api` hai, jo local backend ke against test chalane ke liye ready hai.

---

## 4. Docs (`docs/`)

| Folder          | Content                                        |
| --------------- | ---------------------------------------------- |
| `docs/setup/`   | Setup guides (WhatsApp/auth, download/zip)     |
| `docs/git/`     | GitHub push instructions                       |
| `docs/reports/` | Implementation & production-readiness reports  |
| `docs/design/`  | `design_guidelines.json`                       |

Root pe sirf `README.md` aur `CONTRIBUTING.md` rakho. Naye reports/guides `docs/` me daalo.

---

## 5. Dependencies / lockfiles

- **Backend** → `npm` (`backend/package-lock.json`). CI aur Dockerfile `npm ci` use karte hain.
- **Frontend** → `yarn` (`frontend/yarn.lock`). CI aur Dockerfile `yarn install --frozen-lockfile` use karte hain.

Dono managers mix mat karo. Ek project me `package-lock.json` aur `yarn.lock` dono update hone se lockfiles out-of-sync ho jaate hain.

---

## 6. Secrets

- Real `.env` files kabhi commit ya zip me share mat karo (`.gitignore` inhe ignore karta hai).
- Naya env variable add karo to `backend/.env.example` me bhi add karo (dummy value ke saath).

---

## 7. Commit checklist

- [ ] Code sahi folder me hai (upar ka table dekho)
- [ ] Imports `@/` alias se hain (frontend)
- [ ] `cd frontend && yarn build` pass hota hai
- [ ] Backend start hota hai: `cd backend && npm run dev`
- [ ] Koi secret / `.env` commit nahi hua
