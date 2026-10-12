# School Line 1.8 — official source release

## Source and release identity

- Base: `School_Line_1.8.2_Light_Buffer_Adjusted_Prototype.zip` (unchanged preserved input).
- Release ZIP: `School_Line_1.8_Official_Release.zip`.
- Server-visible `BALANCE_VERSION`: **1.8**; `GAME_VERSION`: **1.8**.
- `package.json` semver: `1.8.0`.
- Competitive statistic series: **1.8**, logically distinct from existing 1.7 records; no historical data import, deletion, schema migration, or DB reset.
- GitHub, running production server, live PostgreSQL, account records, and match history are **not changed by producing this ZIP**. This artifact is the official **source package**; deployment is a separate operator action.

## Final Dia and Iron tuning (new in this release)

### Dia (다이아)

1. **Form beam DPS 90 → 95**, no other beam geometry or form stats changed.
2. Form Change cooldown remains **16 seconds** at activation. **Every server-credited enemy kill by a living Dia**, in either normal form or Dia form, reduces the **remaining Form Change cooldown by 6 seconds**. It cannot go below ready-now; kills do not create a new cooldown if none is running.
3. The historical competitive statistic `diaFormKills` still counts **direct kills made specifically in Dia form**, not all kills. Its semantics and database schema remain intact.
4. The in-game ability description is updated to state 95 DPS and the all-form kill-cooldown rule.

### Iron (아이언)

1. Incoming damage reduction **20% → 10%**: authoritative damage multiplier `0.80 → 0.90` for damage reaching the central damage resolver.
2. Basic projectile speed **14 → 20m/s** (one tier); damage 17, fire rate 5/s, range 24m and projectile collision radius 0.32 unchanged.
3. Ultimate `분쇄` stun **1.5 → 2.0 seconds**, when damage lands and stun is eligible; 2-second pre-cast delay, 12m radius, 50 damage and cost 1200 unchanged.
4. Legacy ultimate regression tests were updated to the **new real damage taken** by Iron (including laser-generated shield, Fire, Spray, and Runner bomb). Character stats and combat resolver were *not* reverted merely to preserve obsolete test numbers.

## Retained work from the prior 1.8 development line

- Ultimates redesigned for Runner (225-damage Sticky Bomb), Laser (wall-ignoring rectangle and damage-based shield), Fire (4 × 5 radial-fan volleys), Spray (4 × 8 rotating volleys), and Light (800-cost 24×6m attack/heal/self-heal).
- Heal-type projectile pass-through for full-HP allies; walls and enemies retain their respective existing interactions.
- Runner basic 65 DPS; Shooter ultimate charge 700; Sniper range-independent 60/hit base and 80/hit ultimate, with local-only faint 36m aim guide.
- Light base ray collision padding +0.5m allies / +0.2m enemies; independently hits nearest ally and enemy along ray, even when the other team is in front; full-health ally target selection retained.
- Buffer base link healing 40 HPS; during its ultimate 65 HPS, other Buffer characteristics unchanged.
- All other character and account configuration is unchanged from the input 1.8.2 Light/Buffer ZIP.

## Regression checks

Run from the extracted root (Node.js 20+):

```bash
npm run check
npm run test:1.8-release
npm run test:ult
npm run test:heal-pierce
npm run test:1.8.2
npm run test:light-buffer
npm run test:stats
```

- Official 1.8 focused checks cover all-form Dia kill cooldown, Dia transformation/beam, historical form-kill metric, Iron DR and its real projectile velocity, delayed ultimate stun timing, visible text, version identity, and pre-existing balance.
- Former ultimate tests have been recalibrated to Iron's 10% DR; all old-gameplay regression suites remain.
- Tests are in-memory and intentionally do **not** run or alter the production database, hosted game, or account data.

## Production deployment checklist (not yet executed)

1. Take a **fresh verified backup** of PostgreSQL competitive matches and player accounts, independent of this source ZIP.
2. Confirm environment secrets / `DATABASE_URL` on the target deployment host. The server intentionally refuses to launch without durable PostgreSQL; there is no local-JSON fallback.
3. Deploy with an isolated staging database first. Verify full mobile multiplayer 4v4, visual/UI correctness, network packet load, actual kill credit on Dia, Iron ability animation and the complete 1.8 combat loop.
4. Only after staging succeeds, deploy the exact tested build to production using the existing preservation-safe workflow and verify 1.7 stats remain available under their separate series.
5. Known carry-over caveat: temporary shields still use a shared expiration timestamp; interactions between Laser's 3s shield and other shields need live verification. No independent per-shield-expiry architecture was introduced by this balance release.

Historical `README_*PROTOTYPE*` and patch notes remain bundled strictly for traceability; the present release document takes precedence for the **final 1.8 package**.
