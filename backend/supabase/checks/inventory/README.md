# Database catalog inventory

The canonical database base was generated from the raw Supabase SQL Editor
captures in `2026-10-03/`, collected from the production project on
2026-10-03. The files are kept exactly as exported and contain catalog
metadata and function definitions, not application table rows.

From the repository root, regenerate the three base migrations and the
standalone verification query with:

```bash
node backend/supabase/checks/inventory/generate-base.js 2026-10-03
```

The command overwrites the three `base_*` files in `backend/supabase/migrations/`
and `backend/supabase/checks/verify_database_inventory.sql`. Future catalog
captures should use a new `YYYY-MM-DD` directory and pass that date to the same
command.
