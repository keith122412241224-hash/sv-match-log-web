// Resolve historical SQL snapshots after archival; compare against unchanged Git paths.
exports.legacySourcePath = file => file.startsWith('supabase/migrations/') ? file.replace('supabase/migrations/','supabase/legacy-migrations/pre-baseline/') : file;
