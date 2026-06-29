# AI Agent Instructions - jadwal-dinas-app

This document provides comprehensive guidance for AI agents working on **jadwal-dinas-app**, a healthcare staff scheduling system.

## Project Context

**What is this app?**
A hospital staff scheduling & leave management system with multi-department isolation. Features include shift scheduling, staff/doctor management, leave requests, patient capacity tracking, and shift swaps.

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + Tailwind CSS 4
- Backend: Node.js API routes
- Database: Turso (SQLite) via LibSQL client
- Auth: Session cookies (24h, non-httpOnly)
- UI Language: 100% Bahasa Indonesia

## When Working on Features

### Before Making Changes
1. **Always verify session handling** — Check `middleware.js` for route protection rules
2. **Understand ruangan (department) filtering** — Every user belongs to ONE department; data must be filtered by ruangan
3. **Check existing API patterns** — Look at 2-3 existing routes to match conventions
4. **Review the database tables** — Understand the schema before writing queries
5. **Test auth redirects** — After changes, verify 401 redirects to `/login`

### API Route Development

**Required pattern for every GET/POST route:**
```javascript
export const dynamic = "force-dynamic";

async function getSessionRuangan() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_dak_pro");
  if (!session) return null;
  return JSON.parse(session.value)?.ruangan || null;
}

export async function GET(req) {
  const ruangan = await getSessionRuangan();
  if (!ruangan) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  // Query with: WHERE UPPER(TRIM(ruangan)) = ?
}
```

**Critical security rule:** NEVER trust ruangan from request body. ALWAYS get it from session cookie.

**Batch operations for mutations:**
```javascript
const queries = [];
queries.push({ sql: "DELETE FROM table WHERE ruangan = ? AND ...", args: [ruangan, ...] });
queries.push({ sql: "INSERT INTO table (...) VALUES (...)", args: [...] });
await turso.batch(queries, "write");
```

### Frontend Component Development

**Always add `"use client"` for interactive components:**
```javascript
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  
  // ... component logic
}
```

**Auth check in fetch:**
```javascript
const res = await fetch("/api/endpoint", { method: "POST", ... });
if (res.status === 401) {
  router.push("/login");
  return;
}
const result = await res.json();
if (!result.success) {
  setError(result.error || "Error");
  return;
}
```

**Loading states:** Use `animate-spin` on Lucide icons:
```javascript
{submitting && <Loader2 className="animate-spin w-4 h-4 ml-2" />}
```

## Common Tasks & Examples

### Task: Add a new API endpoint

1. Create file: `src/app/api/[feature]/route.js`
2. Copy template from existing route (e.g., `src/app/api/sdm/route.js`)
3. Replace table name, columns, and queries
4. **MUST DO:** Add `getSessionRuangan()` helper
5. **MUST DO:** Add `export const dynamic = "force-dynamic";`
6. **MUST DO:** Filter all queries by ruangan: `WHERE UPPER(TRIM(ruangan)) = ?`
7. Test: Verify 401 response when no session, 200 when authenticated

### Task: Add a form to a dashboard page

1. Create `"use client"` component in `src/app/(dashboard)/[feature]/page.js`
2. Add `useState` for form fields and loading state
3. Create submit handler that calls `fetch("/api/[feature]", { method: "POST" })`
4. Add auth check: `if (res.status === 401) router.push("/login");`
5. Show loading spinner during submission
6. Show error/success messages
7. Test form submission and verify data in database

### Task: Update authentication logic

1. Check `src/middleware.js` for route protection rules
2. Auth setup: `src/app/(auth)/login/page.js` + `src/app/api/login/route.js`
3. **DO NOT** change session cookie structure without coordinating with all API routes
4. Always test: login → cookie set → redirect to dashboard → redirect back if logged in
5. Test logout: session removed → 401 on protected routes → redirect to login

### Task: Add a new database table or column

1. Update the Turso database schema (outside this codebase)
2. Update relevant API routes to include the new column
3. **MUST DO:** If adding ruangan-filterable data, add `ruangan` column and include in WHERE clauses
4. Test queries with `UPPER(TRIM())` normalization
5. Test backward compatibility if making columns optional

### Task: Debug a data filtering issue

1. Check if `getSessionRuangan()` returns correct value
2. Verify database query has: `WHERE UPPER(TRIM(ruangan)) = ?`
3. Verify session cookie format: `{id, nama, role, ruangan}`
4. Verify all data being inserted has ruangan set
5. Check for NULL/empty ruangan values (should be filtered with: `WHERE field IS NULL OR TRIM(field) = '' OR ...`)

## Key Code Locations

| What | Where |
|------|-------|
| Session management | `src/middleware.js` |
| Database client | `src/lib/turso.js` |
| Auth flow | `src/app/(auth)/login/page.js` + `src/app/api/login/route.js` |
| Navbar & routing | `src/app/(dashboard)/layout.js` |
| API examples | Any file in `src/app/api/*/route.js` |
| UI components | Dashboard pages in `src/app/(dashboard)/**/page.js` |
| Server actions | Files named `actions.js` (e.g., `src/app/(dashboard)/cuti-sdm/actions.js`) |
| Styling examples | Any component (search for `className=` patterns) |

## Data Model Quick Reference

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `users` | Staff accounts | id, hospital_id, ruangan, nama, username, password (bcrypt), role |
| `hospitals` | Hospital master | id, kode_rs, nama_rs |
| `sdm` | Employees | id, nama, jabatan, no_wa, ruangan |
| `jadwal_dinas` | Shift schedules | sdm_id, tanggal, bulan, tahun, ruangan, simbol (P/S/M) |
| `jumlah_pasien_poli` | Patient counts | nama_dokter, klinik, tanggal, bulan, tahun, jumlah |
| `cuti_sdm` | Staff leave | id, nama_sdm, jenis_cuti, tgl_mulai, tgl_selesai, status_acc, ruangan |
| `cuti_dokter` | Doctor leave | Similar to cuti_sdm |

**All user-editable data tables have:**
- `ruangan` column for department filtering
- Values normalized with `UPPER(TRIM())`
- Backward compatibility for NULL/empty values

## Common Enum Values

| Field | Values |
|-------|--------|
| ruangan (unit) | POLIKLINIK, IGD, ICU, LABORATORIUM, etc. |
| jenis_cuti (leave type) | CS (Sakit), DL (Dinas Luar), CT (Cuti Tahunan), L (Libur) |
| status_acc (approval) | Menunggu, Disetujui, Ditolak |
| simbol (shift) | P (Pagi), S (Siang), M (Malam) |
| role | dokter, sdm, admin, etc. |

## Styling Conventions

- **Theme:** Dark (bg-slate-900, text-white)
- **Typography:** Headers use `text-[10px] font-black uppercase tracking-widest`
- **Spacing:** `gap-4`, `p-6`, `my-2`
- **Rounded:** `rounded-2xl` or `rounded-[2.5rem]`
- **Colors:** `blue-600` for accents, `red-500` for errors, `green-500` for success
- **Icons:** Lucide React (lucide-react v0.575.0)
- **Status indicators:** "✅ " prefix for success, "❌ " prefix for errors
- **Loading:** `<Loader2 className="animate-spin" />`
- **Grid layouts:** `grid-cols-1 md:grid-cols-3` for responsiveness

## Development Workflow

1. **Start dev server:** `npm run dev` → http://localhost:3000
2. **Check changes:** Frontend hot-reloads, API routes need refresh
3. **Debug errors:** Check browser console + Next.js terminal output
4. **Lint before commit:** `npm run lint`
5. **Test auth:** Always test login flow and protected route redirects
6. **Test database:** Use browser DevTools to verify data was saved

## Troubleshooting

**Issue: API returns 401 even with valid session**
- Solution: Check `getSessionRuangan()` → verify cookie name is `session_dak_pro` → verify JSON structure

**Issue: Data appears for wrong department**
- Solution: Check WHERE clause includes `UPPER(TRIM(ruangan)) = ?` → verify ruangan value being passed → check if data has NULL ruangan

**Issue: Form submission does nothing**
- Solution: Check browser console for fetch errors → verify API endpoint URL → check if `res.status === 401` and redirecting → verify JSON response format

**Issue: UI not updating after mutation**
- Solution: Check if using server actions → verify `revalidatePath()` called → verify `useState` state being updated on success

**Issue: Build fails with Tailwind/CSS**
- Solution: Verify Tailwind syntax is valid → check `postcss.config.mjs` has `@tailwindcss/postcss` → clear `.next` folder: `rm -rf .next && npm run build`

## Performance Tips

1. **Avoid N+1 queries:** Use JOINs or batch operations when possible
2. **ISR with revalidatePath:** Caches pages; revalidate after mutations
3. **React Compiler:** Already enabled in next.config.mjs for optimization
4. **Force dynamic routes:** API routes use `export const dynamic = "force-dynamic";` to prevent caching
5. **Batch database operations:** Multiple inserts should use `turso.batch()`

## Security Checklist

- ✅ Every API route calls `getSessionRuangan()`
- ✅ Every query filters by ruangan from session (never from request body)
- ✅ Passwords hashed with bcrypt (saltRounds=10)
- ✅ Cookies checked for 401 responses
- ✅ Friendly error messages returned (no DB error details)
- ✅ HTTPS in production (Secure flag set on cookies)
- ✅ No sensitive data in logs
- ✅ All inputs validated before database operations

## Next Steps After Reading This

1. Review `.cursorrules` for quick reference of conventions
2. Open `src/middleware.js` to understand route protection
3. Open `src/app/api/sdm/route.js` as a template for new API routes
4. Open `src/app/(dashboard)/cuti-sdm/page.js` as a template for client components
5. Open `src/lib/turso.js` to see database client (do not edit)

---

**Last Updated:** 2026-06-28
**Project:** jadwal-dinas-app v2.5
**Author:** Daniel Ari Kristianto
