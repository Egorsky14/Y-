# Development roadmap

## Completed

### Milestone 0 — Greenfield repository ✅
- Fresh repository, Vite + React + TypeScript + Three.js/R3F scaffold, ESLint, Vitest, Playwright.
- Deterministic simulation core with 17 unit tests including a reconciled 90-day campaign.

### Milestone 1 — Premium 3D vertical slice ✅
- Summerlin Ridge neighborhood: 32 houses (5 styles), streets, avenues, sidewalks, driveways, desert landscaping, mountains, HQ, supply warehouse, competitor, park.
- Branded compact van driving a real A* road route from HQ to the customer curb and back; technician walks to the condenser and works; diagnosis, quote, repair, payment; camera focus/follow; world selection and inspector.
- Real-browser evidence: `e2e/gameplay.spec.ts` and `docs/screenshots/*`.

### Milestone 2 — Employees and fleet ✅ (systems complete, visuals functional)
- Four roles, 13 attributes with documented effects, hiring market, XP/levels, morale, fatigue, nine training programs, certifications, raises, dismissal, turnover.
- Four vehicle classes, new/used purchases, cash/loan/lease, upgrades, paint, resale, capacity limits, garage turntable preview.
- Proven in the e2e test: hiring a technician and buying a second van lets two jobs run concurrently.

### Milestone 3 — Business simulation ✅ (core), ⚠️ balance is first-pass
- Concurrent jobs, repairs and replacements with install crews, warranty receivables and authorization, marketing channels, brand, payroll, fuel, upkeep, loans/leases, reputation and reviews, three competitors with market share, HQ upgrades, accounting invariants under test.

### Milestone 5 (partial) — Campaign and polish
- 90-day campaign, 15 milestones, celebrations, tutorial hints, autosave, manual save/load with schema version, graphics settings, campaign summary, hotkeys.

### Graphics overhaul (branch `v3-premium-graphics`) ✅ Phases A–E, F measured
- glTF asset pipeline and four detailed vehicles; premium neighborhood with PBR materials and
  instanced landscaping; rebuilt headquarters; articulated characters; clock and weather driven
  lighting; quality presets; regression at 1920×1080 and 1366×768. See `docs/graphics/`.

## Pending

### Milestone 4 — World expansion ❌
- Additional districts (Spring Valley, Henderson, North Las Vegas, Enterprise), more building styles, ambient traffic, weather effects beyond the HUD readout, visible competitor vans on the road, bigger HQ campus options.
- Performance work for a larger world: LOD, texture atlases, merged static geometry, further instancing.

### Milestone 5 — Remaining polish ❌
- Sound effects and music (none yet; the settings toggle is a placeholder).
- Skeletal (rigged, clip-based) characters and a celebration beat at job completion; install crews do not yet carry visible equipment to the pad.
- Level of detail for distant houses and vegetation; texture atlases; static geometry baked to glTF.
- Visual regression suite (pixel comparisons) on top of the existing e2e screenshots.
- GLB asset pipeline for flagship vehicles and characters (procedural models are in place and licensed clean).
- Comfort advisor in-home sales visits as their own job type (today the advisor passively boosts close rates).

## Known limitations

- Software-rendered CI (SwiftShader) runs at a few FPS; the targets in `QA_REPORT.md` for a midrange GPU are measured by draw calls and triangle counts, not on real hardware in this session.
- Lease buyout, vehicle breakdowns, sick days, work-capacity overtime and leadership crew bonuses are documented as planned and not implemented.
- Balance (lead rates, prices, wages, competitor behavior) is tuned by a single autopilot run and will need live playtesting.
- The world has one neighborhood; service "regions" are not yet separate districts.
