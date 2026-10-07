School Line durable data policy (stats series 1.7+)

- Runtime competitive statistics are NOT stored in this folder.
- Runtime player-account edits are NOT stored in this folder.
- PostgreSQL is the only authoritative persistence layer.
- data/player_accounts_seed.json is bootstrap data used only when the PostgreSQL account table is empty.
- GitHub/Render redeploys may replace this whole directory without affecting accumulated statistics.
- The server intentionally refuses to start without DATABASE_URL (or SCHOOL_LINE_DATABASE_URL).
