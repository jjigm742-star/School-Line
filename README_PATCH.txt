SCHOOL LINE 1.8 OFFICIAL SOURCE RELEASE
==================================
Official source package version: 1.8 (package.json: 1.8.0), competitive stats series: 1.8.
Based on the isolated 1.8.2 Light/Buffer adjustment prototype, with final Dia/Iron changes.

Dia: Normal-form OR Dia-form credited kills reduce remaining Form Change cooldown by 6s; Form beam 90 -> 95 DPS.
Iron: incoming DR 20% -> 10%, projectile speed 14 -> 20m/s, Pulverize stun 1.5 -> 2.0s.
All earlier 1.8 ultimate, heal-pierce, Runner/Sniper/Shooter, Light/Buffer changes retained.
Source archive only: NOT deployed; GitHub, live service, PostgreSQL, account records, and historical match records untouched.
See README_1.8_RELEASE.md for verification and deployment precautions.

--- Historical development notes (pre-1.8 release) ---
1.8.2 LIGHT / BUFFER ADJUSTMENT PROTOTYPE — ISOLATED, NOT FOR PRODUCTION
Based on School_Line_1.8.2_Sniper_Tuning_Prototype.zip.
Light basic beam: +0.5m ally / +0.2m enemy hit radius; nearest one ally and one enemy independently even if either stands behind the other; full HP ally selection retained; solid walls still block the ray. Client ray visually penetrates players.
Buffer base link healing ONLY: 45 -> 40 HPS; ultimate 65 HPS and other characteristics unchanged.
All prior 1.8/1.8.1/1.8.2 changes retained. Not deployed to GitHub/live service/database.
See README_LIGHT_BUFFER_ADJUSTMENT.md for tests and limitations.

--- Historical 1.8.2 notes ---
1.8.2 RUNNER / SNIPER / SHOOTER TUNING — ISOLATED PROTOTYPE, NOT FOR PRODUCTION
Based directly on School_Line_1.8.1_Heal_Pierce_Prototype.zip. Keeps five 1.8 ultimate reworks and common heal-projectile pierce.
Runner DPS 55 -> 65 (13 per shot at 5/s); Attached Bomb 250 -> 225; Shooter Confidence cost 1000 -> 700.
Sniper removes range-dependent damage and its 16m red ring. Base 60/shot (120 DPS), ultimate 80/shot (160 DPS) at all ranges; 36m and 2/s preserved. New local-only faint 36m directional dashed aim guide. Sniper ultimate named 정밀사격; its larger projectiles remain.
No live-server or database changes. See README_1.8.2_TUNING.md for details, checks and caveats.

--- Historical 1.8.1 and 1.8 notes ---
1.8.1 HEAL-PROJECTILE PIERCE ISOLATED PROTOTYPE — NOT FOR PRODUCTION
Starting point: School_Line_1.8_Ultimate_Rework_Prototype.zip.
The five 1.8 ultimate reworks are retained. The sole gameplay change in 1.8.1 is that heal-type projectiles pass through full-HP allies; damaged allies, enemies, and walls keep existing collision behavior.
See README_1.8.1_HEAL_PIERCE.md for test cases, scope and deployment precautions.

--- Historical 1.8 prototype notes ---
1.8 ULTIMATE REWORK ISOLATED PROTOTYPE — NOT FOR PRODUCTION
This file preserves the 1.7.1 history below. The prototype changes server game logic, UI and server/client ultimate visuals for Runner/Laser/Fire/Spray/Light. Other balance changes are not included.
See README_1.8_ULTIMATE_PROTOTYPE.md.

--- Original 1.7.1 historical notes ---
School Line 1.7.1 Visual Update

This build preserves the verified Alpha 1.6.2 gameplay balance and the 1.7 competitive statistics system.
Only visual-layer changes were applied:
- 13 finalized character illustrations added/replaced
- 13 finalized minimi/token assets extracted and wired
- in-game token render sizing normalized to the existing small / medium / large gameplay size classes
- visual asset URLs cache-busted with ?v=1.7.1

No server logic, gameplay values, persistence behavior, or statistics aggregation rules were changed.
- 1.7.1-final: character-select portraits are cropped to show illustration only, and mecha portrait corruption is fixed.
