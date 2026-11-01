# Rooftop Service Architecture Brief

The implementation should extend the **existing** simulation, not build a second rooftop-only job game. Names below are proposals; adapt to actual repository types after inspecting code.

## A. Minimum domain concepts

**Equipment location** (stable metadata, only if missing):
```ts
type EquipmentPlacement =
  | { kind: 'ground'; equipmentId: string }
  | { kind: 'roof'; equipmentId: string; roofId: string; accessId: string };
```
Derive placement from real customer HVAC configuration and compatible building topology. A home with a split-system condenser generally retains its ground condenser; don't also generate a rooftop package by default. A suitable low-rise commercial building with an eligible roof can have an RTU. Add a backward-compatible save default of `ground` for old saves.

**Access capability** (stable eligibility, not detailed real-world safety instructions):
```ts
type RoofAccessOutcome =
  | { ok: true; method: 'approved-ladder' | 'permanent-access'; accessId: string }
  | { ok: false; reason: 'no-equipment' | 'unsupported-roof' | 'blocked-approach' | 'missing-authorization' };
```
Do not infer that a steep roof, tall building or arbitrary roof edge is safely reachable. Use explicit game-certified access points, appropriate building tiers and available vehicle ladder capability. Permanent access and portable ladder should be separate animation branches if both are implemented.

**Visual choreography** (derived from authoritative task/phase and time, not a second financial ledger):
```ts
type RooftopVisualStage =
  | 'arrived' | 'walk-to-rack' | 'retrieve-ladder' | 'carry-ladder'
  | 'place-ladder' | 'climb-up' | 'roof-walk' | 'roof-diagnose'
  | 'roof-repair' | 'collect-tools' | 'roof-return' | 'climb-down'
  | 'carry-back' | 'stow-ladder' | 'depart';
```
Names are illustrative. Do not implement all as persisted job statuses unless justified by architecture. If visual sequencing needs long waits, integrate explicit, bounded service/access durations via the existing clock engine, while preventing animation completion from bypassing real authorizations or business rules.

## B. One canonical ladder object
One logical ladder ID, and at most one visible active mesh for that ladder (or a controlled crossfade, never two persistent copies). Recommended location states: `rack`, `held`, `placed`, `in-use`; always linked to same vehicle/assignment. On close/cancel/save/load/reassign, reconcile location and technician attachment. If the model uses asset instances, logical ownership must still have one source of truth.

## C. Pilot vertical slice: flat commercial rooftop repair
1. Player dispatches valid technician/vehicle to a commercial service call targeting an RTU on a suitable low-rise flat roof.
2. Confirm vehicle has usable ladder and the property has a valid modeled access point. If not, move to existing review/blocked workflow with specific explanation; no automatic teleport.
3. Technician exits, walks to truck, retrieves ladder, carries it, places it at access point. Ground contact and no wall intersections.
4. Technician visibly climbs rung by rung and transitions onto roof. Do not let vehicle depart prematurely.
5. Technician traverses to RTU, places owned tools, performs normal diagnostic decisions using the existing job system.
6. Follow standard catalog repair estimate, customer acceptance, and warranty authorization rules. The Operations Center may automate eligible routine steps, but must not bypass decisions.
7. After authorized service, technician collects tools, walks back, descends, returns ladder to rack, and returns to van. Reconcile idle/next-job state.
8. Record history normally and do not duplicate repair fees, parts, or revenue.

**Heavy replacement boundary:** If a job requires installing/replacing a large packaged rooftop unit, do not represent lifting the equipment up a portable ladder. Keep that job on the existing installer/approval workflow until crane/rigging mechanics are explicitly added as a separate milestone.

## D. Positioning and navigation
- Define explicit anchor transforms for vehicle ladder rack, ground access approach, ladder base, upper transition, roof entry/landing, RTU service side and return route.
- Validate transform orientation, height, scale and collision for at least one genuine game building before generalizing.
- Use the existing road nav for driving; local ground/roof traversal may need a small task-specific path. Do not rebuild global routefinding.
- Camera mode targets must support variable Y elevation and obstruction checks for roof/parapets/RTU. Avoid camera clipping through building or roof.

## E. Determinism, time and persistence
- All economic results remain in existing simulation/actions workflow. Animation has no authority to approve claims or post financial transactions.
- Keep time scaling consistent for 1x, 5x, large time advances and save/load. Use deterministic stage-time or event logic; no wall-clock economic outcomes.
- After loading mid-climb, reconstruct the visual pose and ladder location from authoritative progression, or restart the nearest safe non-economic visual checkpoint. State clearly how recovery works.
- Reconciliation rules: only one ladder; one tech assigned; no floating on roof; no duplicate tools; job can't become free-floating if player switches views.
- `blocked-access` should not become an endless retry or spam the Owner Attention queue.

## F. Expansion policy
After the pilot passes: add a roof variant for a second commercial building; then qualifying residential rooftop systems only when their actual HVAC location matches; then additional eligible access methods. No universal roof scattering, no unsafe ladders, no simultaneous full installation system rewrite.
