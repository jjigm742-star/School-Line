# School Line Alpha 1.8.2 — Light / Buffer isolated adjustment

## Source and isolation

- Input source ZIP: `School_Line_1.8.2_Sniper_Tuning_Prototype.zip`.
- Output source ZIP: `School_Line_1.8.2_Light_Buffer_Adjusted_Prototype.zip`.
- This is an **isolated continuation of the 1.8.2 prototype**, not a live deployment and not an unrequested 1.8.3 patch.
- Build label is `1.8.2-light-buffer-prototype`. The competitive stats series remains `1.8` (no data reset).
- Live GitHub, running 1.7 service, PostgreSQL, account seed, SQL schema, image assets and historic records are **untouched**. Do not point this prototype at a live production database.

## Character balance and geometry changes

### Light: basic lightBeam only

- Same basic beam **16m range**, **50 DPS to one enemy**, **50 HPS to one allied player**. No change to ultimate `스포트라이트` (cost 800, rectangle attack/heal and independent 100 self-heal).
- An ally's effective collision radius for Light's beam is their body `radius + 0.5m`.
- An enemy's effective collision radius for Light's beam is their body `radius + 0.2m`.
- Select the **nearest valid ally**, and **nearest valid enemy**, independently on the same ray before its wall endpoint, regardless of whether an ally or enemy appears first. **Only one player per relation** can receive healing/damage per tick.
- **Full-HP allies remain eligible** for healing target selection; if a full-HP ally is nearest, a more distant injured ally is not selected.
- Both enemy and ally bodies are transparent to Light's ray; **solid walls and world boundaries continue to stop it**. The rendered ray is likewise reconstructed to wall or 16m, rather than ending at an enemy, matching the new server geometry.
- This does **not** modify physical body hitboxes, the common heal-projectile collision logic, other beam heroes or Light's ultimate.
- Light's hit padding values are exposed as static character definition fields in the initial config (not extra recurring live WebSocket fields).

### Buffer: base link only

- `linkHealHps`: **45 -> 40**.
- Ultimate link healing remains **65 HPS** during `업그레이드` (8 seconds, cost 1000); attack speed +25%, link range 16m, speed-tier buff, HP, movement and all other characteristics unchanged.
- Client-facing Buffer character description updated from 45 to 40. No new healing formula or mechanics.

## Validation

From the project folder:

```bash
npm run check
npm run test:light-buffer
npm run test:ult
npm run test:heal-pierce
npm run test:1.8.2
npm run test:stats
```

Validated:

- 66 focused assertions for Light/Buffer: wider but team-specific collision radii, friendly/hostile penetration in both encounter orders, one target per team relation, full-health ally remains the selected target, invulnerable enemy does not block healing, walls/world boundaries block the beam, other beam characters unaffected, basic and ultimate Buffer link HPS measured in simulation ticks, visual reconstruction/character strings.
- Previous 59 focused ultimate assertions and additional edge cases.
- Previous 40 heal-projectile piercing assertions.
- Previous 89 1.8.2 character/specific projectile and sniper guide assertions.
- Existing statistics persistence self-test; JS server/client syntax checks.

**Not tested:** real mobile-browser visual quality, live WebSocket integration, live multiplayer throughput, and production database integration. Deployment requires isolated database integration and real-client verification.
