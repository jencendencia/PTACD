# PTA CD — Parent-Teacher Association Collection & Disbursement System

An offline-first **Electron + React + MySQL** desktop app for managing school PTA
funds. It shares the same MySQL database (`tapin_school`) as the **TapIn School**
gate-attendance app, so students, guardians (families), sections, enrollments and
school years are already there — the PTA app reads them and adds its own `pta_*`
tables.

---

## 1. Goals

- Collect PTA fees (membership, miscellaneous, and other collectibles) per school
  year with correct **per-family / per-child** billing.
- Auto-**distribute** every collection into PTA funds by configurable percentages.
- Approve and pay **disbursements** with a two-step (President + Treasurer)
  workflow and auto-numbered Disbursement Vouchers (DV).
- Manage **cash advances** and **liquidation** with receipt attachments.
- Produce **financial reports**: fund balances, collections summaries,
  per-section collection efficiency, parent balances, and an individual
  **Statement of Account** per family (printable).
- Stay fully usable offline (local MySQL like TapIn School).

## 2. Relationship with TapIn School

| Concern | Owner |
|---|---|
| Students, guardians, sections, enrollments, school years | TapIn School (shared tables: `students`, `sections`, `school_years`, `enrollments`) |
| PTA officers login | PTA app (`pta_users` — separate from TapIn `users`) |
| PTA fees, funds, collections, disbursements, advances, reports | PTA app (`pta_*` tables in the same `tapin_school` database) |

- **Family identity** is derived from the guardian fields already on each student
  (`guardian_name` + `guardian_address`). Children sharing the same guardian
  identity form one PTA family — exactly how TapIn's guardian QR works.
- Students with no guardian on file become their own single-child family.
- A family sync runs at PTA app boot (and can be re-run manually) so the PTA
  registry always mirrors the student roster.

## 3. Billing model (per your spec)

Example for school year 2026–2027, three children in one family:

```
School collects 650 per child = 200 Membership + 200 Miscellaneous + 250 Other
  Child 1:  200 (membership) + 200 (misc) + 250 (other)  =  650
  Child 2:                         200 (misc) + 250 (other)  =  450
  Child 3:                         200 (misc) + 250 (other)  =  450
Family total = 1,550   (membership billed ONCE per family)
```

- **Fee components** are configurable (label, amount, `per_family` vs `per_child`,
  optional term like 1st/2nd/3rd/4th quarter). Amounts and terms are entered by
  admin/staff in Settings.
- **Charges** are computed per school year: one membership charge per family +
  one charge per child for each per-child component (× term when set).
- A **charge** is the smallest billed item (student × component × term). Payments
  settle charges FIFO (oldest first), optionally targeted at a specific child.
- Balances and statements are derived from charges vs. payments, so they always
  reconcile.

## 4. Fund accounting & automatic distribution

- **Funds** (chart of accounts): e.g. General Fund, Classroom Fund, Special
  Project Fund. Default: General Fund.
- **Distribution rules**: per fee component → target fund(s) with percentages
  (must total 100%). Default: all components → General Fund 100%.
- When a collection is recorded, the payment is applied to the family's charges
  (FIFO). The amount settled per component is then split into funds using that
  component's rules — giving an auditable per-collection allocation.
- **Fund balance** = allocated collections − paid disbursements − issued advances
  (+ returned cash / − additional release on liquidation).

## 5. Officer roles & security (based on DepEd PTA practice)

| Role | Can |
|---|---|
| Admin | Everything |
| President | Approve disbursements (step 2) |
| Treasurer | Record collections, mark disbursements PAID, issue/close advances |
| Secretary | Draft disbursements, record collections, data entry |
| Auditor | View everything + financial reports (read-only) |

- Disbursement lifecycle: **DRAFT → APPROVED (President) → PAID (Treasurer)**.
  Payment records a reference (check/OR) number.
- Every collection gets an auto-numbered **Official Receipt (OR)**; every
  disbursement an auto-numbered **Disbursement Voucher (DV)** (prefix + running
  number per school year).

## 6. Cash advances & liquidation

- An **advance** is issued from a fund to an officer for a purpose (e.g. school
  fair) and tracked as outstanding.
- **Liquidation**: the officer lists expense items (date, description, amount)
  and attaches scanned/photographed receipts.
  - Total items < advance → **returned amount** goes back to the fund.
  - Total items > advance → **additional release** charged to the fund.
- Status auto-computed: ISSUED → PARTIALLY LIQUIDATED → LIQUIDATED / RETURNED.
- Attachments are copied to an app-data folder; the DB stores metadata.

## 7. Screens

1. **Login** — PTA officer accounts (`pta_users`), role-based access.
2. **Dashboard** — fund balances, today's collections, top outstanding balances,
   pending approvals.
3. **Families** — search by guardian/student; see children, charges, payments,
   balance; open the individual **Statement of Account** (printable).
4. **Collections** — record a payment against a family (auto OR no, auto-apply
   FIFO with per-child breakdown, auto fund distribution preview), list + void.
5. **Funds & Distribution** — funds CRUD and per-component percentage rules.
6. **Disbursements** — draft / approve (President) / pay (Treasurer) with DV no.
7. **Advances & Liquidation** — issue advances, add liquidation items with
   attachments, close with returned/additional amounts.
8. **Reports** — fund balances, collections summary (date range + per section),
   parent balances, per-section collection efficiency, statement of account.
9. **Settings** — school year, fee components (amounts/terms), OR/DV prefixes.

## 8. Reports & statements

- **Fund Balance** — collected / disbursed / advances-out / balance per fund.
- **Collections Report** — by date range, per section, per component.
- **Parent Balances** — charges, paid, balance per family; roll up per section.
- **Statement of Account (individual)** — per family: all charges (debit) and
  payments (credit) with running balance and balance-due; printable.
- All reports can be printed to PDF via the browser print dialog (v1) and
  exported to CSV (v1) / Excel (v2, using ExcelJS like TapIn School).

## 9. Tech stack

- **Electron 33 + React 18 + Vite 5 + TypeScript** (identical to TapIn School).
- **mysql2** against the shared `tapin_school` database (`.env`: DB_HOST,
  DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).
- Offline-first: the app bootstraps its `pta_*` schema idempotently (same
  `ensureSchema` pattern as TapIn School).
- Browser mock mode for development (`npm run dev:renderer`) — an in-memory
  mock mirrors the backend so the UI is testable without Electron/MySQL.

## 10. Implementation phases

- **M1 (this build):** schema, services, IPC, full renderer for all nine screens,
  statements + core reports, mock mode. 
- **M2:** Excel/PDF export polish, batch collections (CSV import of payments),
  SMS/email receipts to parents.
- **M3:** TapIn School integration — launch PTA CD from the TapIn admin, shared
  officer accounts, dashboard widget for collection totals.

## 11. Key decisions & assumptions

- PTA app uses its **own officer accounts** (`pta_users`) so TapIn School users
  are untouched.
- Fees, terms and distribution percentages are **configurable**, seeded with the
  650 = 200 + 200 + 250 example.
- OR/DV numbers are **per school year** sequences.
- V1 is single-user-per-machine (no concurrent editing), matching the TapIn
  deployment model; a shared MySQL server still centralizes the data.
