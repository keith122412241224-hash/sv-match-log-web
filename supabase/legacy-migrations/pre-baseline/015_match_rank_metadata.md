## 015: optional match rank metadata

`015_match_rank_metadata.sql` is the validated R1 DDL, retained unchanged for schema history.
Production already received this migration manually during R1-C (PostgreSQL 17.6).
Do **not** run it again as part of the R2 application release. It is not an idempotent script.
For another database, inspect its schema and migration history before deciding whether it needs 015.
This file adds only three nullable text columns and one combination CHECK; it does not add defaults or backfill data.
