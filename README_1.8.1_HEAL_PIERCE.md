# School Line Alpha 1.8.1 — Full-HP Ally Heal-Projectile Pass-Through (isolated prototype)

## Input and deployment policy

- **Base:** `School_Line_1.8_Ultimate_Rework_Prototype.zip` (retains all five 1.8 ultimate reworks).
- **Output:** `School_Line_1.8.1_Heal_Pierce_Prototype.zip`.
- This is a **detached source package**, not a change to the existing 1.7 service or production PostgreSQL database.
- The existing 1.8 statistical series remains `1.8` (`1.8.1-prototype` is a patch-version within that bucket). **Never point a prototype at the live production DB.**
- No changes to accounts, competitive match records, schemas, existing character balance values, portraits, or networking protocol.

## Single gameplay change

Only the server's **shared** `updateProjectiles()` collision-candidate filter in `server.js` was changed. After existing ally/enemy validity filtering, before the ally-enlarged hit circle and segment intersection, the code now skips any teammate whose health is already full:

```js
if (p.type === 'heal' && relation === TARGET_RELATION.ALLY && target.hp >= target.maxHp - 1e-6) continue;
```

`1e-6` is a tiny numerical tolerance to avoid consuming a healing projectile on insignificant floating-point health deficits. It does **not** grant piercing through meaningfully damaged teammates.

| Target encountered | Result |
|---|---|
| Alive teammate at 100% HP (even with full shield or no shield) | Projectile passes through |
| Teammate meaningfully below 100% HP | Existing collision and healing (or healing-block) resolution |
| Enemy | Existing damage collision if the healing projectile is dual-purpose; no extra behavior for heal-only shots |
| Wall / environment boundary | Existing collision and removal |
| Multiple or overlapping full-HP allies | Each skipped; the next valid target/wall is still checked |

The rule applies to every character using a `type: 'heal'` projectile, including **Water, Wind, Star, Angel**, with no per-character adjustments. It does *not* alter healing amount, attack damage, anti-heal, healing-on-hit stats, hitbox expansion for damaged allies, or the 1.8 five-ultimate code.

## Verification

Commands executed successfully from the prototype root:

- `npm run check` — syntax: server, database adapter, browser client.
- `npm run test:stats` — existing competitive statistics regression.
- `npm run test:ult` — existing 1.8 ultimate regression (59 named assertions plus additional edge cases).
- `npm run test:heal-pierce` — **40 new assertions** for Water/Wind/Star/Angel enemy reach behind full-HP allies, 99%-HP interception and healing, overlapping allies, near-full floating point tolerance, heal-only projectile, healing-blocked injured ally, wall blocking, and basic attack regression.

**Limitations:** Automated server-unit regression only, not a live multi-device/4v4 browser test, packet-load benchmark or database integration test. A test DB is mandatory before live launching any experimental build.
