# HealthLine

A telemedicine web app where patients book a doctor, pay online, and consult over video. Doctors manage their appointments and write prescriptions; an admin panel handles the rest.

I built this as a full-stack project to learn how a real booking + payment + video flow fits together.

**Live:** https://doctor-appointment-project-one.vercel.app
(frontend on Vercel, backend on Render, so the first request may be slow while the server wakes up)

## What it does

**Patient**
- Register / login (email + password, or Google)
- Browse doctors and book a slot
- Pay with Razorpay (test mode)
- Join a video consultation and chat with the doctor
- View and download prescriptions as PDF, upload medical records
- Leave a review after a completed appointment

**Doctor**
- Set up profile and availability
- See and manage appointments
- Create prescriptions

**Admin**
- Dashboard and reports
- Manage coupons, blog/CMS, feature flags, support tickets and roles

## Tech stack

| Part | Used |
|---|---|
| Frontend | React, Tailwind, Axios |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| Auth | JWT in httpOnly cookie, Google OAuth (Passport) |
| Payments | Razorpay |
| Video | Twilio Video, WebSocket for in-call chat |
| OTP / notifications | Fast2SMS (SMS), Nodemailer with Gmail (email) |
| Background jobs | Redis + BullMQ (reminders, cleanup of unpaid bookings) |
| PDFs | PDFKit |

## Run it locally

You need Node 20+, MongoDB, and Yarn. Redis is optional (only for reminders).

```bash
git clone https://github.com/Vishnu71227/doctor_appointment_project.git
cd doctor_appointment_project
```

Backend:
```bash
cd backend
yarn install
cp .env.example .env     # fill in the values
yarn dev                 # http://localhost:8001
```

Frontend:
```bash
cd frontend
yarn install
cp .env.example .env     # set REACT_APP_BACKEND_URL
yarn start               # http://localhost:3000
```

Or with Docker: `docker-compose up -d`

To create an admin user: `yarn seed:admin` (from the `backend` folder).

## Environment variables

The minimum to get the app running:

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=healthline_db
JWT_SECRET=<any long random string>
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

Everything else is optional and switched on with flags:

| Feature            | Variables                                                                    |
|    -     -    -    |                    -               -                     -                   |                                      |
| Payments           | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENT_TEST_MODE=true`           |
| Google login       | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`            |
| Video              | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`                  |
| SMS OTP            | `SMS_ENABLED=true`, `FAST2SMS_API_KEY`                                       |
| Email              | `EMAIL_ENABLED=true`, `GMAIL_USER`, `GMAIL_PASS`, `EMAIL_FROM`               |
| WhatsApp reminders | `WHATSAPP_ENABLED=true`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| Reminders queue    | `REDIS_URL`                                                                  |

See `backend/.env.example` for the full list. WhatsApp is off by default.

## Project structure

```
backend/
  src/
    routes/  controllers/  services/   # API layer
    models/  middlewares/  workers/    # data, auth, background jobs
frontend/
  src/pages/    # patient, doctor, admin, consultation, auth
docker-compose.yml
``

## Known limitations

- Payments run in Razorpay test mode.
- Video and SMS need paid or verified accounts for real use.
- Render's free tier sleeps when idle.

## Author

Vishnu, B.Tech IT, JECRC Foundation, Jaipur
GitHub: [@Vishnu71227](https://github.com/Vishnu71227)
