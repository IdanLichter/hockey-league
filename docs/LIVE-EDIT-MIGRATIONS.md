# Live-edit database migrations

The live-edit agent can change the database now. This is what it may do, what stops
it, and what you do when something needs undoing.

## The thing to keep in mind

**There is one Supabase project.** The dev site and rinkhockeyil.com read the same
database. There is no staging copy. A migration that lands on `dev` runs against real
league data — real players, real coaches, and four minors whose dates of birth are on
file. "It's only dev" is never true here.

## How a database change happens

1. The agent adds a new file under `supabase/migrations/`, e.g.
   `supabase/migrations/20260914_1200_add_mom_column.sql`. That is the **only** path
   under `supabase/` it may touch, and it may only **add** — modifying or deleting an
   already-committed migration refuses the deploy, because a migration that has already
   run cannot be un-run by editing the file. Rewriting it just leaves the repo claiming
   one schema while the database has another, quietly.
2. `.github/workflows/deploy-dev.yml` runs `scripts/check-migration.mjs` over every
   newly added file. If it rejects anything, **the job fails and nothing is applied or
   deployed** — the commit sits on `dev` until you look at it.
3. The validated files are applied with `psql`, in filename order, each one inside a
   single transaction. A migration that fails half-way leaves nothing behind.
4. Only then does the frontend deploy — so the UI never ships expecting a column that
   does not exist yet.

Applied files are recorded in `public.live_edit_migrations`, so a re-run of the job
skips what already ran.

Check a file yourself before pushing:

```
node scripts/check-migration.mjs supabase/migrations/*.sql
node scripts/check-migration.mjs --selftest
```

## What the validator allows

Nothing but these shapes, and only in schema `public`:

| Allowed | Notes |
| --- | --- |
| `CREATE TABLE IF NOT EXISTS` | must be paired with `ENABLE ROW LEVEL SECURITY` **in the same file** |
| `ALTER TABLE … ADD COLUMN` | nullable, or with a `DEFAULT` |
| `ALTER TABLE … ENABLE / FORCE ROW LEVEL SECURITY` | strengthening only |
| `CREATE INDEX` | not `CONCURRENTLY` (cannot run in a transaction) |
| `CREATE POLICY … TO authenticated` | or `service_role`; no other role is accepted |
| `CREATE FUNCTION` | plain only — no `OR REPLACE`, no `SECURITY DEFINER`, `sql`/`plpgsql`, body must only compute |
| `CREATE TRIGGER` | its function must be defined in the same file |
| `COMMENT ON` | |

It is an **allowlist**. Anything it does not positively recognise is refused, including
harmless things — `CREATE TYPE`, `CREATE VIEW`, `INSERT`, a `GRANT` to `authenticated`.
That is deliberate: a blocklist of dangerous verbs is defeated by the first construct
nobody thought of.

## What it refuses, and why it is that paranoid

Everything destructive, obviously: `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `DROP COLUMN`,
`RENAME`, `ALTER COLUMN … TYPE`, `SET NOT NULL` on an existing column.

But the incidents that actually happened here were not destructive. Both were *additive*
statements that widened access:

- **`players.birth_date` readable by `anon`** (`supabase/players-birth-date-privacy.sql`).
  `anon` held a table-level `SELECT` on `public.players`, so anyone on the internet
  could ask for `select=birth_date` and get every date of birth on file, four of them
  children's. Nothing was dropped. A `GRANT` did it.
  → hence: no `GRANT`, no `REVOKE`, no `ALTER DEFAULT PRIVILEGES`, no `CREATE POLICY`
  that names `anon` or `PUBLIC` (a new permissive policy widens access just as
  effectively as altering one), and any statement mentioning `birth_date` is refused
  outright.

- **A `SECURITY DEFINER` function executable by `PUBLIC`** became a settlement API
  anyone could call. A definer function runs with its owner's rights, so one missing
  `revoke execute` turns it into a hole with no RLS in front of it.
  → hence: no `SECURITY DEFINER` at all, and no `CREATE OR REPLACE FUNCTION` — replacing
  an existing function rewrites live behaviour, and
  `create or replace function public.is_admin() … select true` would make every visitor
  an admin without a single `GRANT`.

Also refused: `admin_users` and anything matching `medical*` (private health files);
the `auth`, `storage`, `extensions`, `cron`, `net` and `vault` schemas — only
`auth.uid()`, `auth.jwt()`, `auth.role()` and `auth.email()` may be *called*, which is
all a policy needs; roles and passwords; `CREATE EXTENSION`; `COPY`, `dblink`, `http()`,
`pg_read_file`; `DO` blocks and dynamic `EXECUTE`; psql meta-commands (`\i`, `\!`); and
your own `BEGIN`/`COMMIT`, which would break CI's all-or-nothing guarantee.

Comments and string literals are stripped before any of this is matched, so a keyword
cannot hide inside `/* … */` or `'…'` — and an apostrophe in a comment cannot cause a
false rejection either.

### Two things the validator lets through that are worth an eye

- A `CREATE POLICY … TO authenticated` on a table that already existed widens what every
  signed-in user may do there. It is allowed, but the CI log prints a warning naming the
  table. Read those.
- The validator checks *shape*, not *intent*. `ALTER TABLE public.players ADD COLUMN
  notes text` is structurally fine; whether the app should be writing player notes is
  your call, not the validator's.

## Setup: the `SUPABASE_DB_URL` secret

Migrations are only applied if this GitHub Actions secret exists. Without it the job
logs a warning, skips applying, and still deploys the frontend — it never half-applies
and never fails the run for a missing secret.

To add it: Supabase dashboard → Project Settings → Database → Connection string → URI
(the direct connection, with the database password filled in). Then GitHub → the repo →
Settings → Secrets and variables → Actions → New repository secret, named
`SUPABASE_DB_URL`.

Like the Vercel token, the agent never sees it: it lives in GitHub's secret store and is
only read by the workflow.

## Undoing a migration

The validator will never let the agent write the undo — `DROP COLUMN` and `DROP POLICY`
are refused — so this is always a human job, done by hand against the database, not by
pushing a file:

1. Look at what ran: `select * from public.live_edit_migrations order by applied_at desc;`
2. Reverse it yourself in the Supabase SQL editor. An added column →
   `alter table public.x drop column y;`. A new policy → `drop policy "name" on public.x;`
   A new table → `drop table public.x;` **Check first that nothing is using it** — an
   added column may already hold data the app wrote.
3. Delete the ledger row if you want that filename to be applicable again:
   `delete from public.live_edit_migrations where filename = '…';`
4. **Do not delete or edit the migration file** to undo it. The fence refuses that push,
   and it would not have undone anything anyway. If you want the file gone from the repo,
   a human removes it on `main` with the reversal already applied.

If a migration is wrong but already deployed, the frontend that depends on it is also
already live — reverse the frontend first, or it will break on the missing column.
