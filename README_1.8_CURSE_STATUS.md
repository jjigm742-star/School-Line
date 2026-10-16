# School Line 1.8 — Curse status infrastructure only

Basis: School_Line_1.8_Aim_And_Buffer_Display_Fix.zip. This is an isolated local source build, not a deployment.

## Scope

- Registered `curse` as an independent harmful status in the existing status framework.
- `curse` defines only the harmful status **effect** (damage-taken bonus `+0.25` (25 percentage points)), not a duration. The skill applying it chooses the duration in milliseconds: `applyStatus(room, caster, enemy, 'curse', durationMs, now)`. For example, Witch's planned skills may pass `5000`, while another skill can pass a different duration.
- While Curse is active, the authoritative damage resolver adds 25 percentage points to the existing incoming-damage multiplier rather than multiplying two factors: `finalMultiplier = max(0, existingDamageMultiplier + 0.25)`. For example, a target with 10% existing damage reduction receives 115% of incoming damage (100 -> 115), **not** 112.5%. For a target with no reduction, 100 -> 125. This applies before damage is allocated between personal shield and HP. Without Curse, existing mitigation is unchanged.
- Added tests for additive damage on all existing mitigation characters, shield-only damage, shield spillover to HP, damage statistics, and expiration returning mitigation to normal.
- Repeat application extends expiration to at least `now + durationMs` without stacking the damage multiplier (a shorter reapplication never truncates an existing longer effect). Expiration and death/status clearing follow existing shared status rules. Invulnerable targets cannot receive harmful statuses.
- Added a `cursed` boolean to ordinary player snapshots and compact c3/c4/c5/c6 live-wire status bit 13; no change to existing row indices or data schema.
- Added a purple dashed circle on cursed character tokens and a local status label in the HUD.
- Updated client JS cache version to surface the new indicator after deployment.
- No Witch character, Curse ability, ultimate, 1.9 balance change, match-stat migration, account modification, or live deployment was made.

## Verification

`npm run check`, `npm run test:curse`, `npm run test:stats`, `npm run test:ult`, `npm run test:heal-pierce`, `npm run test:1.8.2`, `npm run test:light-buffer`, `npm run test:1.8-release`, `npm run test:aim-hotfix`.

Notes: No existing character invokes Curse yet. The status is dormant in normal gameplay until a future skill explicitly applies it. The manual fixed self-HP cost of Mecha's self-destruct is not routed through the combat damage resolver and remains unchanged.
