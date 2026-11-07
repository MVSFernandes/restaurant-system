# Supabase migrations

Every installation (one restaurant, one environment) has its own database. The
SQL files directly in this directory are the **active migrations**; they are
applied in filename order and recorded by the Supabase CLI in
`supabase_migrations.schema_migrations` of each database. That table is the
only record of what a database has.

The three `base_*` files describe the complete application database at the
canonical base (schema; functions and execution grants; triggers, RLS and the
final catalog verification). The later files are incremental. Each file runs in
its own transaction.

Files under `history/` record how older databases reached the base. They are
already part of the base: never apply or record them. The CLI only reads
`<digits>_<name>.sql` files directly in this directory, so `history/` and this
README are ignored by it (it prints "Skipping migration README.md...").

## Rules

- An applied migration file never changes. Corrections are new migrations.
- After adding a migration, regenerate `../checks/migration_catalog.json` on a
  local disposable PostgreSQL and commit it with the migration:
  `MIGRATION_CHECK_PG_URL=postgres://...@127.0.0.1:<port>/postgres npm run db:migrations:catalog`
- No client data and no per-client adjustment in migrations.
- Each version appears once: two files with the same `<digits>` prefix, or a
  version repeated in the manifest, make the check stop before any query.
- Never record a version as applied (`migration repair`) without the catalog
  check below saying so.
- The previous application version must keep working after a migration, unless
  the release declares otherwise: see the compatibility rule in
  `../../../RELEASES.md`, section 2.
- Run this check from a checkout of the newest tag applied to that database. An
  older checkout does not know the newer migrations and reports `divergent`.

## The catalog check (read-only)

`npm run db:migrations:check -- --linked` (add `--workdir <dir>` if the link
lives elsewhere) or `-- --db-url <url>`, from `backend/`, compares the database
catalog with the expected state after each migration
(`../checks/catalog_objects.sql` + `../checks/migration_catalog.json`) and with
the CLI history. It writes nothing. Verdicts:

| Exit | Verdict | Meaning | Next step |
| --- | --- | --- | --- |
| 0 | `up_to_date` | Catalog = last migration; all versions recorded | Nothing |
| 10 | `needs_recording` | Catalog proves versions that are not recorded | Run the printed `migration repair --status applied` command (no SQL runs) |
| 20 | `pending` | Catalog and history agree; newer migrations missing | Run the printed `db push … --dry-run`, then without `--dry-run` |
| 30 | `ambiguous` | An unrecorded migration leaves no trace in the catalog, so the catalog cannot say whether it ran | Stop. Nothing is printed to run; see "Limits" below |
| 1 | `divergent` | Catalog matches no expected state, or history disagrees | Stop. Investigate the listed objects; record or push nothing |
| 2 | error | Files differ from the manifest, duplicate versions, `--workdir` without the same migrations, or the check could not run | Fix the cause first |

The printed commands always target the connection that was checked: with
`--linked` they use `--linked` (and the same `--workdir`, as an absolute path);
with `--db-url` they use a `<DB_URL>` placeholder for that same database
(shown with the password masked). Credentials are never printed: fill in the
URL yourself and never point it at another database.

### `--workdir`

With `--linked --workdir <dir>` the Supabase CLI reads the migrations from
`<dir>/supabase/migrations`, not from `backend/` (`migration repair` stores
each file's name and statements; `db push` applies them). A workdir created
only for the link (`supabase link --workdir <dir>`) has no migrations, and
`repair` fails there with `glob supabase\migrations\<version>_*.sql: file does
not exist` after creating the empty history table.

So, before querying the remote, the check requires `<dir>/supabase/migrations`
to hold exactly the active migrations: the same versions, the same file names
and the same sha256 (line endings normalized) as the manifest. A missing
folder, a missing, renamed or altered file, a duplicate version or an
additional migration is an error (exit 2): the remote is not queried and no
`repair`/`push` is suggested. `history/` and files that are not
`<digits>_<name>.sql` are ignored, as the CLI ignores them; symbolic links are
not followed (they count as missing).

Prefer linking inside `backend/` (it writes only the ignored
`backend/supabase/.temp/`) and running without `--workdir`. `--linked` without
`--workdir` and `--db-url` are not affected by this rule.

A database is "at version N" only when its catalog is **identical** to the
expected state after N (tables, columns, constraints, indexes, functions with
owner and EXECUTE grants, triggers, RLS, policies, API-role table privileges,
extensions and required data rows). Some tables existing proves nothing.

### Limits of the catalog check

The fingerprint only sees what `catalog_objects.sql` reads. A migration that
changes nothing there leaves no trace: a data-only migration (inserts, updates,
backfills other than the rows in the `data` category), changes to objects
outside `public`, comments, settings, sequence values, extension versions, and
so on. For such a migration the catalog is the same whether it ran or not, so:

- if the CLI history already records it, the history is trusted (the check
  says so in a note);
- if it is not recorded, the verdict is `ambiguous` and nothing is recommended:
  recording it could skip it, pushing it could run it twice. Establish by
  other means whether it ran (its data effects, who applied what), and only
  then decide by hand.

`db:migrations:catalog` warns when a migration has an empty delta. Prefer
giving such a migration a verifiable effect (for example a row it must leave
behind, added to the `data` category of the query) before it reaches a
database without CLI history.

## Prerequisites (both procedures)

From `backend/`:

1. `npx supabase --version` (devDependency, 2.95.x) and `npx supabase login`.
2. `npx supabase link --project-ref <project-ref>` for the installation's
   project. It only writes `backend/supabase/.temp/` (ignored by Git). Confirm
   the reference against the installation inventory before continuing.

## New database (new installation)

1. `npm run db:migrations:check -- --linked` → must be `pending` with every
   version pending (empty catalog).
2. `npx supabase db push --linked --dry-run` → lists all active migrations in
   order, nothing from `history/`.
3. `npx supabase db push --linked` → applies and records each version.
4. `npm run db:migrations:check -- --linked` → `up_to_date`.
5. Continue the provisioning (installation marker, configuration, storage,
   first administrator and verification) with `../../PROVISIONING.md`.

## Existing database without CLI history (installed by hand)

No SQL is re-applied. Only the history table is created and filled.

1. `npm run db:migrations:check -- --linked` → must be `needs_recording` and
   show the installation marker of the expected installation. Any other
   verdict: stop.
2. Run exactly the `npx supabase migration repair --status applied <versions> --linked`
   printed by the check (it lists only versions the catalog proves).
3. `npm run db:migrations:check -- --linked` → `up_to_date` (or `pending` if
   the database was behind; then follow steps 2–4 of "New database").
4. `npx supabase migration list --linked` → every version in both columns.
5. `npx supabase db push --linked --dry-run` → "Remote database is up to date".

Repeating any step is harmless: `repair` re-records the same versions, `push`
finds nothing to apply.

## Tests

`npm run test:migrations` rehearses all of the above on a disposable local
PostgreSQL (see the header of `../../tests/migration-control-pg.cjs`).
`npm run test:migrations:unit` covers the same rules (ambiguity, command
destination, duplicate versions, `--workdir` contents) without a database.

`../checks/verify_database_inventory.sql` remains the comparison with the
canonical base captured on 2026-10-03 (base only, without later migrations).
