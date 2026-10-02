This data directory is intentionally included for the one-time statistics recovery deployment.

competitive_stats.json contains:
- 1.4: 15 matches with raw historical match records
- 1.5: 0-match historical bucket
- 1.6: 14 aggregate matches merged from two separate 1.6.2 exports
- all-time total: 29 matches

After the server writes a new result it will also rotate the previous file to competitive_stats.json.bak.
The administrator stats export button now creates a FULL restorable backup, not a single-version screen export.
