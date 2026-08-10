# SCI CENTER MANAGEMENT SYSTEM - PROJECT HANDBOOK (CODEX GUIDE)

This document provides a comprehensive guide for Codex AI agents working on the SCI Center Management codebase.

---

## 🚀 Project Overview
- **Application:** SCI Center Management & Student Web App
- **Stack:** React (Vite) + TailwindCSS + Supabase PostgreSQL + Firebase Hosting
- **Local Dev Server:** `npm run dev` (`http://localhost:5173`)
- **Build Command:** `npm run build`
- **Deployment:** Firebase Hosting (`https://sci-center-6f265.web.app`)

---

## 📁 Key Architecture & Directory Structure

```
src/
├── api/                   # Supabase API services
│   ├── haifnApi.js        # Haifn point transactions & rewards
│   ├── noticesApi.js     # Notice & recruiting program CRUD & responses
│   ├── userApi.js         # User management API
│   ├── userMergeApi.js    # User account merge logic (with RPC fallback)
│   ├── communityApi.js    # Community posts, likes, comments (with RPC fallback)
│   └── badgesApi.js       # Badge tracking & rewards
├── components/
│   ├── admin/             # Admin Dashboard Components
│   │   ├── board/         # Content & Program management (AdminBoard)
│   │   ├── dashboard/     # Analytics & Logs (AdminLogs)
│   │   ├── school/        # School management & detail sidebar
│   │   ├── settings/      # Admin settings & WebAccessSettings
│   │   ├── statistics/    # Analytics views (User, Program, Space)
│   │   ├── store/         # Haifn Store & point management
│   │   └── users/         # User management & 3-month filter
│   ├── student/           # Student App Components
│   │   ├── azit/          # Community / Azit tab & reactions
│   │   ├── modals/        # Student modals & feedback
│   │   ├── NoticeModal.jsx# Notice view modal & deduplicated view counts
│   │   └── NoticeReactions.jsx # Emoji reaction component
│   └── common/            # Shared UI components (UserAvatar, Pagination, etc.)
├── hooks/                 # Custom React Hooks
│   ├── useStudentDashboard.jsx # Student app main hook & daily session tracking
│   ├── useNotices.js      # Notice state management
│   └── useKioskManager.js # Physical Kiosk QR check-in manager
├── utils/                 # Utilities
│   ├── visitUtils.js      # Visit session aggregation logic
│   ├── analyticsUtils.js  # Analytics data processing
│   ├── dateUtils.js       # KST Date formatting helpers
│   └── exportUtils.js     # Excel export helpers
└── pages/                 # Top-level Page Views
    ├── AdminDashboard.jsx # Admin Portal Main Page
    ├── StudentDashboard.jsx # Student Portal Main Page
    └── GuestMobileWelcome.jsx # Mobile Web Check-in
```

---

## 🔑 Key Features & Core Rules

1. **User Types & Groups:**
   - `청소년` (Youth Member) / `대학생` / `선생님/스탭` (Staff) / `게스트` (Guest) / `미가입` (Temporary Unregistered User).
   - Temporary users (`preferences.is_temporary === true`) are created by admins before student sign up and get merged when students register.

2. **User Merging (`userMergeApi.js`):**
   - Merges temporary account into primary account.
   - Handles `haifn_transactions`, `logs`, `notice_responses`, `user_badges`, `program_feedback`, and deletes source user.

3. **Visit Logging vs Web Access:**
   - Physical Kiosk Check-ins log `CHECKIN`/`CHECKOUT` events in `logs`.
   - Web App accesses update `user.preferences.last_web_login_at`.
   - Admin Logs (`AdminLogs.jsx`) Option B includes `센터 방문일지` (Member + Guest with sub-filters), `학생 만남일지`, and `관리자 활동 로그` (`AdminActivityLogTable.jsx`).

4. **Program Management:**
   - Completing a program finalizes attendance rewards (`haifn_transactions`) and keeps user on `AdminBoard`.

---

## 🛠️ Workflows & Operating Guidelines
- **Development:** Always test locally (`npm run dev`).
- **Deployments:** Only run `npx firebase-tools deploy --only hosting` when explicitly requested by user.
- **Safety:** Do NOT alter existing database schemas or delete raw logs. Always provide direct table update fallbacks for Supabase RPC functions.
