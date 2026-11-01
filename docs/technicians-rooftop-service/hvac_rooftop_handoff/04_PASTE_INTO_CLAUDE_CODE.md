# Copy this message into Claude Code after placing the other files under docs/technicians-rooftop-service/

You have full authority to make routine **local** artistic, programming, animation, Blender, gameplay and QA decisions for the HVAC Company Owner V3 technician + rooftop service mission. I am unavailable for routine approvals.

Before editing, read these handoff files in full:
- `docs/technicians-rooftop-service/00_READ_FIRST.md`
- `docs/technicians-rooftop-service/01_CHARACTER_ART_AND_ANIMATION.md`
- `docs/technicians-rooftop-service/02_ROOFTOP_WORKFLOW_ARCHITECTURE.md`
- `docs/technicians-rooftop-service/03_ACCEPTANCE_AND_TEST_MATRIX.md`

**This handoff simplifies the mission.** Follow the milestone gates, not a monolithic all-at-once rewrite. Verify the current repo state; preserve uncommitted work; start a new local feature branch from the latest validated game version. The last reported camera branch `feature/v3-cinematic-camera` at `bbc2558` is a clue, not an assumption.

Most important decisions already made:
1. Character visual upgrade with existing rig compatibility first.
2. One low-rise flat commercial roof, one RTU and one ladder-equipped vehicle for the pilot.
3. One canonical ladder object and explicit rack/carry/place/climb/return sequence.
4. Service/repair first, NOT RTU installation. Heavy RTU replacement requires crane/rigging and is a separate milestone.
5. Keep existing job engine, financial records, Operations Center authorization rules and save logic authoritative.
6. Test real browser visuals after each milestone. A GLB render or passing TypeScript alone does not establish success.
7. Expand to selected compatible residential/commercial roofs only after the playable pilot passes.

Implement each gate, run targeted tests, capture actual screenshots, commit locally, update `MISSION_PROGRESS.md`, and continue autonomously within available session limits. Never mark COMPLETE before actual end-to-end gameplay works; report partial results honestly if blocked. No push, force push, merge, deploy, paid asset, destructive cleanup or production change without separate approval.

Start now with G0 baseline and G1 technician improvement; continue to G2/G3 rooftop vertical slice without pausing for routine questions.
