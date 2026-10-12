> **1.8.1 update:** The five ultimate reworks below are retained. This archive additionally includes full-HP ally pass-through for healing projectiles; see `README_1.8.1_HEAL_PIERCE.md`. Runtime version is now `1.8.1-prototype`, still stats series 1.8.

# School Line — Alpha 1.8 Ultimate Rework **isolated prototype**

## Source / safety

- Unmodified input archive: `School_Line_1.7.1_Visual_Update_Final_for_download(1).zip` (user-supplied source).
- This is a **detached test ZIP**, **not** an edit to the original archive, a GitHub push or a live 1.7 deployment.
- The original ultimate prototype used `1.8.0-prototype`; the derived 1.8.1 build now uses `1.8.1-prototype`. Version parser routes competitive statistics to **1.8**, not 1.7. Do **NOT** point this experimental build at the live production PostgreSQL database; use a separate test DB if running a server.
- No PostgreSQL tables, schemas, account seeds, historical match records or other gameplay balance values were modified in this task. The five ultimate implementations/UI descriptions/FX plus the 1.8.1 full-HP healing-projectile collision exception differ from the source gameplay. The 1.7.1 illustration/token assets were preserved.
- Production release / merge remains a separate future step, with a fresh baseline and regression pass.

## Implemented ultimates (authoritative server)

| Character | Ultimate | Charge | Effect |
|---|---|---:|---|
| Runner | 부착 폭탄 | 700 | **One selected enemy** within 6 m; attached bomb explodes **3 s later** for **250 raw damage**. Persists after owner death/distance changes, cancels if victim dies before detonation. Failed cast consumes no charge. 3-s charge lock; bomb damage does not charge. |
| Laser | 파괴광선 | 1400 | Instant wall/LOS-ignoring **24 × 6 m** aimed rectangle; **10 + 30% of each target's max HP** raw damage. Gains **effective actual damage** as 3-second temporary shield, shared cap 500. No ultimate charge from the effect. |
| Fire | 대화재 | 800 | At **t=0/1/2/3 s**, emits **5** projectiles spanning **30°** around the current aim (**20 total**); **40 raw damage each**, **40 maximum direct damage per target per volley**. Uses regular 2-s burn (10 DPS, 30% anti-heal), no special 4-s burn. Movement and basic attacks remain available. |
| Spray | 탄막 | 1400 | At **t=0/1/2/3 s**, emits **8** projectiles across full 360°, **45°** apart (**32 total**). Rotates the pattern **+11.25°** per volley. **25 raw damage**, **25 maximum direct damage per target per volley**. Physical projectile radius **0.52**, range 24 m, speed 28 m/s. Movement and basic attacks remain available. |
| Light | 스포트라이트 | **800** | Instant wall/LOS-ignoring aimed **24 × 6 m** rectangle. Enemies suffer **50 raw damage**, other living allies inside receive **100 healing**; the caster separately receives **100 self-healing once**, regardless of location. Generic healer 25%-bonus self-heal is suppressed for this ultimate, so no double healing. No charge from the effect. |

**Raw vs effective:** Tank mitigation and current shields/HP are applied by existing `dealDamageDetailed`; anti-heal, missing HP and full healing blocks by `applyHealing`. Direct damage caps apply to raw damage **per target per 1-second volley**, not total damage including Fire's normal burn.

**Rectangle contract:** Start at caster's coordinates, oriented to caster's aim at the activation instant; inclusion uses each *target body's center*, length 0–24 m, perpendicular offset at most ±3 m. No projectile, no ray collision, no wall or LOS checks, and no windup. Neither laser nor light hits itself via the rectangle; Light self-heal is a *separate* single effect. 

**Projectile contract:** Full existing server-authoritative wall + enemy collision, existing spawn/remove network updates, existing speed/range. The generic per-target volley-ID damage cap reuses Dia's existing hit tracking, without adding per-frame data fields. Hit-once is enforced even when several bullets from a single volley physically collide with the same enemy.

**Interruptions:** For Fire/Spray, death cancels remaining scheduled shots while already-launched bullets remain; stun at an emission time skips that emission only. Ultimate charge remains locked for 4 seconds (including the final volley and a short tail). For Runner, bomb is held at *room* level, not on the owner: owner death does not erase the bomb or its 3-s lock.

## Frontend / transport

- Runner enemy targeting is enabled in the existing click/tap selection system, with a 6 m range check on the server and in the local ultimate button. Selection is required; sprint ability remains independent.
- Immediate Laser/Light rectangle visual effect is delivered as a small **one-shot `ultimate_fx` message** with the exact server-captured casting position and direction, not as a fake wall-blockable ray or a recurring state property.
- Runner target bomb fuse/explosion one-shot visual notifications; Fire/Spray reuse existing `ultimateProjectile` bullet visuals and client projectile interpolation.
- Projectile data is still sent by the existing spawn/remove/full-resync compact c6 protocol. No extra per-frame projectile row is introduced.
- The client still uses the 1.7.1 character portraits and tokens.

## Testing

`npm run check` — Node syntax check of server.js, durable_store.js, public/game.js.

`npm run test:stats` — existing competitive statistics regression test (1.7/1.8 series separation, nontrivial stats behavior).

`npm run test:ult` — focused ultimate unit tests (cast validity and charge; death and delayed detonation; mitigation and true effective shield; wall-free rectangle geometry; healing and no self-heal doubling; volley emission counts, rotation, burn, caps, stun; Dia regression, etc.).

**Testing limits:** This pack does not claim a full live 4v4 multiplayer smoke test, touchscreen browser QA, sustained performance profiling or a PostgreSQL roundtrip. Those require a running isolated test server (never the live 1.7 database) and human-controlled clients.

**Existing additive shield pool note:** The common engine stores a single `shieldUntil` timestamp for the shared temporary shield pool; when other shields have a longer existing expiry, `max(existing, now+3000)` means the pool's common expiry can outlive Laser's 3-second grant. This project deliberately leaves the global shield engine unchanged. If a *strictly source-specific* 3-second expiry is required even when shields overlap, a separate generic shield-source expiry model should be designed before production merge.
