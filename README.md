<div align="center">
  <img src="public/icons/icon-512.png" alt="Spendr Logo" width="64" height="64"/>
  <h1>Spendr</h1>
  <p>A mobile-first personal finance PWA built for Filipinos — track expenses, manage credit cards, log debts, and visualize spending, all offline and synced across devices.</p>

  <p>
    <img src="https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React"/>
    <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite"/>
    <img src="https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
    <img src="https://img.shields.io/badge/Dexie.js_(IndexedDB)-FF6B35?style=flat-square" alt="Dexie.js"/>
    <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase"/>
    <img src="https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=googlechrome&logoColor=white" alt="PWA"/>
  </p>
</div>

---

![Spendr App](assets/spendr-main.png)

---

## Features

- **Offline-first** — all data lives in IndexedDB (Dexie.js); works without any connection
- **Cross-device sync** — optional Supabase backend with `updated_at` conflict resolution
- **Transaction logging** — expense, income, and transfer flows with a custom numeric keypad
- **Account hierarchy** — group GCash Wallet + GCash Savings under one "GCash" parent
- **Credit card intelligence** — live available credit computed from billing cycle transactions, not a stored balance
- **Budget tracking** — per-category monthly limits with compact 2-column chip grid on home and insights
- **Debts** — track "I lent / I owe" with partial payment history and overdue detection
- **Recurring bills** — daily/weekly/monthly/yearly with one-tap "Pay Now" that auto-advances the next date
- **Analytics** — donut, bar, and area charts with month navigation
- **Data export** — CSV, full JSON backup, monthly PDF report
- **Accent color system** — 8 presets + custom hex; every UI element adapts in real time
- **QR codes** — attach a payment QR (5:7 crop, base64) to any account; synced across devices
- **48 Philippine presets** — GCash, Maya, BPI, BDO, UnionBank, and more

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS v4 |
| Routing | React Router v6 |
| Local DB | Dexie.js (IndexedDB) |
| Backend / Auth | Supabase (PostgreSQL + RLS) |
| Charts | Recharts |
| PDF Export | @react-pdf/renderer |
| CSV Parsing | PapaParse |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Image Crop | react-image-crop |
| PWA | vite-plugin-pwa + Workbox |

---

*Built by [James Sablay](https://github.com/jeymsx) · 2024–2025*
