# Supabase migrations

For a new Supabase project, apply the SQL files in this directory in filename
order. The three `base_*` files describe the complete application database:

1. schema, tables, columns, constraints, and indexes;
2. application functions and their execution grants;
3. triggers, row-level security, and the final catalog verification.

Each file has its own transaction so failures do not leave a partial phase.
The final query must report `matches = true` for all eight catalog categories.
Extension versions are shown separately because Supabase projects can use
different minor extension versions without changing the application schema.

Files under `history/` document changes already incorporated into the base.
Do not apply them when provisioning a new project.

`../checks/verify_database_inventory.sql` can be run independently to compare
any database against the canonical catalog captured by the base.
