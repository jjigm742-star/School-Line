# School Line Alpha 1.8.2 — Runner / Sniper / Shooter tuning (isolated prototype)

## Source and deployment boundary

- **Input:** `School_Line_1.8.1_Heal_Pierce_Prototype.zip` (the five 1.8 ultimate reworks and 1.8.1 healing-projectile full-HP ally piercing are retained).
- **Output:** `School_Line_1.8.2_Sniper_Tuning_Prototype.zip`.
- This is a **detached test source package**. No commit or deployment was made to the running 1.7 service or GitHub. No change was made to the PostgreSQL database, account seed, SQL schema, existing competitive match records, or image assets.
- Version ID is `1.8.2-prototype`. The statistics **series remains `1.8`**, distinct from historical `1.7`; there is no new 1.8.2 stats reset. **Never connect this prototype to the live production database.**

## Changes from 1.8.1

| Character | Item | Before | 1.8.2 |
| --- | --- | --- | --- |
| Runner | Basic projectile damage | 11 | **13** |
| Runner | Basic DPS | 55 (5 shots/sec) | **65** (5 shots/sec) |
| Runner | Attached Bomb | 250 | **225** direct damage after 3 sec; other mechanics unchanged |
| Sniper | Base hit at every distance | 45 at <=16m / 60 beyond | **60** throughout the 36m attack range |
| Sniper | Basic DPS | 90/120 by distance | **120** everywhere (2 shots/sec) |
| Sniper | Ultimate hit at every distance | 45 at <=16m / 100 beyond | **80** throughout attack range |
| Sniper | Ultimate DPS | 90/200 by distance | **160** everywhere (2 shots/sec; +40 DPS over base) |
| Shooter | Confidence ultimate charge cost | 1,000 | **700** (-300) |

### Sniper range rule and private aiming guide

- Server: removed the Sniper distance-damage band settings, legacy distance-damage resolution, and per-projectile distance-damage arrays; direct damage now uses the projectile's captured fixed `damage` value. 36m range, 42m/s projectile speed, and 2 shots/sec are unchanged.
- The 8-second sniper ultimate now named **정밀사격** keeps its **increased projectile collision radius (0.20 -> 0.32)** and uses 80 damage/shot at every range. Ultimate cost is unchanged at 800.
- Client: removes the Sniper's red 16m circle and all distance-based damage descriptions. Instead draws a subtle **36m purple dashed ray** from the locally controlled, living Sniper along the current firing direction. This is a client-only guide, not actual projectile geometry: it does not add server state or visible indicators for teammates, enemies, or spectators. When the local aim stick is active, direction is read directly from the local stick for smoother steering; otherwise it uses the authoritative aim snapshot.
- The retired `sniperLongRangeDamage` match-stat field is retained for **historical record/schema compatibility** but is no longer accumulated or presented for new play. No existing record is rewritten.

## Tests

From the project root:

```bash
npm run check
npm run test:stats
npm run test:ult
npm run test:heal-pierce
npm run test:1.8.2
```

Verified passing:
- Code syntax (server, durable persistence adapter, browser client).
- Preexisting stats regression and 1.8 ultimate suite (59 focused assertions plus edge cases).
- Preexisting 1.8.1 full-HP teammate piercing suite (40 assertions).
- New 1.8.2 suite (89 assertions), including actual near (5m), long (22m), and deep-range (34m) physical projectile hits both before and during sniper ultimate, expiration to base damage, projectile radii, Runner/Shooter changes, client private-guide invariant and no distance-band code.

**Limitations:** These are Node-based unit/code checks; live multi-device mobile visual quality, WebSocket integration, performance, and database integration have not been tested. Use only an isolated test database for any future local multiplayer run.
