# Duall Master 3.0 — Web Console

Building security and facility management dashboard.

## Tech Stack

- **Framework:** React 18 + TypeScript 5
- **Build:** Vite 6
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Routing:** React Router v7
- **State:** Zustand
- **Data Fetching:** TanStack Query
- **Charts:** Recharts
- **Icons:** Lucide React

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Project Structure

```
src/
├── app/           # App setup, router, providers
├── components/    # Shared components (ui, layout, common, charts)
├── features/      # Feature modules by domain
├── hooks/         # Custom React hooks
├── lib/           # Utilities, API client, constants
├── stores/        # Zustand state stores
├── types/         # TypeScript types and enums
└── styles/        # Global CSS
```

## Domains

- 🔒 **SECURE** — Access Control, CCTV, Intrusion, Intercom, AI Detection, Emergency
- 👤 **MANAGE** — Identity, Visitors, Contractors, Attendance, Deliveries, Provisioning
- 🏢 **OPERATE** — Room Booking, Parking, Maintenance, Guard Tour, Keys, IoT & Energy
- 🧠 **SMART** — AI Assistant, Analytics, Automation
