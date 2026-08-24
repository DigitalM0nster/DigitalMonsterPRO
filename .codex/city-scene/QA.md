# Interactive 3D City — QA ledger

Status: `GATE 5 — IN PROGRESS`

## GATE 4 correction pass 1 — independent TECH verdict

TECH REVIEWER: `FAIL`. Production traffic now exercises all 14 routes, four entries and four exits; canonical 45 s / 120 s and two adversarial scheduling runs complete without deadlock, starvation or safety violations. Debug allocation and strict projection blockers are closed. Remaining acceptance blockers: immutable minimum-gap threshold is missing; FIFO ticket order and blocked-exit denial are not independently asserted; bypass mutations may still report `valid=true`; the source ledger is stale. Correction pass 2 is authorized by the user's instruction to continue. VISUAL review and GATE 5 remain locked.

The user granted standing authorization to continue through all remaining gates and correction passes without pausing for confirmation. This does not waive gate order, independent review, evidence requirements or protected-scope constraints.

## GATE 4 correction pass 2 — independent TECH verdict

TECH REVIEWER: `FAIL`. Canonical/adversarial simulation, immutable gap guard, real runtime FIFO telemetry, projection, lifecycle, graph and protected scope pass. Remaining blockers are limited to QA architecture: blocked-exit tests literal booleans instead of exercising the production detector/reservation path, and FIFO contention hard-codes owner `5` / ticket `7`. Correction pass 3 must use the production policy owner, real blocker states, derived winners and multiple permutations; negative mutations of the actual detector/policy must fail. VISUAL review remains locked.

## GATE 4 correction pass 3 — independent TECH verdict

TECH REVIEWER: `FAIL`. Real blocked-exit construction and FIFO derivation now pass, but `reserveOrClampConflict` still accepts a policy argument. A runtime-call mutation can therefore use different semantics from positive QA while `sharedFunctionBody` remains true. Correction pass 4 must make the production wrapper non-injectable, route runtime and positive QA through it, isolate mutation policies in a QA-only lower-level harness, and assert fixed-wrapper parity. VISUAL review remains locked.

## GATE 4 correction pass 4 — independent TECH verdict

TECH REVIEWER: `FAIL`. The fixed wrapper is correct in source, but its acceptance contract reads `Function.toString()` and literal identifiers/whitespace. Minification deterministically makes the built production contract false and causes traffic-system construction to throw. Correction pass 5 must replace source introspection with executable minification-safe capability/counter invariants and validate the built artifact. VISUAL review remains locked.

## GATE 4 correction pass 5 — independent TECH verdict

TECH REVIEWER: `PASS`. Independent execution of the real minified traffic factory passes capability boundaries, canonical and adversarial simulations, projection, resource budgets and all protected invariants. Canonical source evidence is refreshed in `evidence/gate4-source-validation.json`. Runtime/visual capture is unlocked; GATE 5 remains locked until independent VISUAL `PASS`.

## GATE 4 runtime and visual evidence

- Exact normal and debug stills: 1920×945, DPR 1, main canvas 3840×1890.
- Normal and debug traffic motion: 31 frames over approximately 15 seconds, plus unaltered local-road crops/contact sheets.
- Isolated hardware probe: WebGL2, NVIDIA RTX 3070 Ti, average 68.39 FPS, p95 15.1 ms, max 15.7 ms, frames >25 ms: 0.
- Console errors: 0. Existing Three.js deprecation and HUD sampler compiler warnings are recorded separately.
- Evidence ledger: `evidence/gate4-runtime-visual.json`.
- Loopback preview, in-app tab and isolated headless context are closed. GATE 5 remains locked pending VISUAL verdict.

## GATE 4 independent VISUAL verdict

VISUAL REVIEWER: `FAIL`. Normal local roads appear empty; fragment core/halo and directed movement cannot be distinguished from pavement/windows/noise. Debug conflict rings are readable, but lane directions/connectors/arcs are too faint. Protected highway, G3 facades, crane and chrome pass. Correction pass 6 is restricted to local-fragment visibility/depth and debug-only topology contrast/direction cues; all accepted geometry, simulation and protected systems remain frozen.

## GATE 4 visual correction pass 6 — TECH re-check verdict

TECH REVIEWER: `FAIL`. Pass-6 visual constants and geometry pass, but shader/CPU fog visibility diverges at NDC-visible staging endpoints, and route-visibility acceptance only enforces 4 of 14 routes. Correction pass 7 must share a zero-at-fogFar envelope with CPU QA, catch a visible far-endpoint mutation, require 14/14 route IDs and catch a single missing route. VISUAL recapture remains locked.

## GATE 4 visual correction pass 7 — TECH and runtime evidence

TECH REVIEWER: `PASS`. Shared CPU/GLSL terminal fog envelope reaches zero contribution at fogFar; all NDC-visible staging endpoints are hidden by actual shader parity. Exact 14/14 route coverage and all negative mutations pass. Recapture evidence is listed in `evidence/gate4-pass7-runtime-visual.json`; 15-second hardware probe measured 68.54 FPS average, p95 15.2 ms and zero frames over 25 ms. Independent VISUAL re-review is active.

## GATE 4 pass 7 VISUAL verdict

VISUAL REVIEWER: `FAIL`. Normal roads remain perceptually empty; exact-size fragments are not trackable. Debug topology improves to `PARTIAL`, protected highway and G3 invariants pass. Correction pass 8 must be pixel-evidence-driven and remain limited to normal core/halo output or a proven minimal depth-placement issue. Acceptance target: at least six visible fragments across three routes with core/halo contrast approximately 45–60 / 10–18 sRGB levels above pavement.

## GATE 4 pass 8 dual independent verdict

TECH REVIEWER: `PASS`. The corrected instance basis has positive winding with `FrontSide` preserved; the real factory catches the legacy mirrored basis. Actual minified production execution, 45 s / 120 s traffic simulation, capability mutations, projection/fog contracts, resources, lint/build, frozen masterplan and protected highway all pass.

VISUAL REVIEWER: `PASS`. The exact still, 15-second motion/crop, contact sheet, t=10 overlay and debug view show multiple thin symmetric local-traffic capsules moving coherently across distinct routes, roundabout and exits. They remain weaker than the protected highway and show no pop, teleport, comet/taper form or scene regression. Hardware probe: WebGL2 / RTX 3070 Ti, 74.94 FPS average, p95 13.5 ms, one frame above 25 ms, console errors zero.

GATE 4 is accepted. Evidence is recorded in `evidence/gate4-source-validation.json` and `evidence/gate4-pass8-runtime-visual.json`. The in-app browser, headless context, temporary profile and loopback listener are closed. GATE 5 is active under standing authorization.

## Fixed comparison state

| Parameter | Value |
|---|---|
| Required surface | User-authorized isolated localhost preview on `127.0.0.1` only |
| Viewport | 1920×945 |
| DPR | 1 |
| BASELINE_CAMERA position | `(11.9, 7.35, 14.3)` |
| BASELINE_CAMERA target | `(-1.35, -0.62, -0.2)` |
| BASELINE_CAMERA FOV | `39` |
| BASELINE_SEED | `0xD1617A1` |
| QA_CAMERA | FROZEN: position `(11.9, 7.35, 14.3)`, target `(-1.35, -0.62, -0.2)`, FOV `39` |
| QA_SEED | FROZEN: `0xD1617A1` |
| Warmup | 15 s |
| Perf runs | 3 × 30 s: idle; slow camera; traffic + HUD/hover |

## GATE 0 material verification

| Item | Status | Evidence |
|---|---|---|
| Final gated brief read completely | PASS | 1007 lines / 54,515 bytes; canonicalized in `SPEC.md` |
| Original brief read completely | PASS | 258 lines / 18,446 bytes |
| Current screenshot available and inspected | PASS | `codex-clipboard-b33e99f7-174d-4d25-9d01-06ae477a0d2c.png` |
| Target reference available and inspected | PASS | `3.png` |
| Workspace source available | PASS | `C:/websites/develope/DigitalMonsterPRO` |
| User-authorized isolated preview | PASS | Vite bound only to `127.0.0.1:4184`; no external bind/deployment; in-app browser and clean headless contexts only |
| Hardware-accelerated runtime | PASS | ANGLE / NVIDIA GeForce RTX 3070 Ti / Direct3D11; WebGL2; timer-query extension available |
| Fixed browser viewport/DPR | PASS | `innerWidth=1920`, `innerHeight=945`, `devicePixelRatio=1` |
| Renderer backing resolution | RECORDED | High tier renders `3840×1890` internally (`graphics DPR 2`) despite browser DPR 1; keep identical for GATE 1 comparison |
| Baseline screenshot | PASS | `evidence/gate0-baseline-city-exact-1920x945-dpr1.png`, verified 1920×945; the earlier `gate0-baseline-city-1920x945-dpr1.png` is retained only as a 1664×945 in-app panel capture |
| Slow-camera video | PASS | `evidence/gate0-slow-camera-1920x945-dpr1.webm`, 5,675,687 bytes; contains ≥12 s drag segment |
| Baseline performance | PASS | Three 30 s hardware runs after 15 s city-stage warmup; table below |

## Production-change lock

GATE 0 received independent `PASS` from VISUAL REVIEWER and TECH REVIEWER. Production changes are now authorized only for IMPLEMENTER and only for GATE 1 grey blockout. Existing dirty-worktree files belong to the user and must be preserved. GATE 2 and later remain locked.

The canonical deep-link `/capabilities/spatial-matrix` deterministically enters stage 5. `SpatialCityWorld.update` reapplies the frozen runtime pose: seed `0xD1617A1`; camera position `(11.9, 7.35, 14.3)`; target `(-1.35, -0.62, -0.2)`; FOV `39`. The exact baseline used neutral pointer/parallax state `(0, 0)`, `pointerDown=false`. The isolated baseline rendered this exact stage and configuration.

## GATE 0 source audit checklist

- [x] City plan/building generator: `SpatialCityWorld.js:74-295`, instanced body `:1546-1624`, accessories `:1626-1738`.
- [x] Facade/window shader and LOD: `SpatialCityWorld.js:298-519`; integrated world-space pitches and derivative AA, with visual motion evidence still pending.
- [x] Local-road path-array/junction system: `spatialCityLocalRoads.js:8-49`, physical ribbons `:400-433`.
- [x] Old traffic system: independent random instance assignment `spatialCityLocalRoads.js:268-310`, wrapping shader `:346-367`, forbidden head/tail fragment `:379-388`.
- [x] Foreground highway owner: mutable monolith `SpatialCityWorld.js:22-54`, `:657-743`, `:1769-1839`; insufficiently isolated.
- [x] Crane owner/attachment: `Mmk1CapabilityScene.js:202-205`; borrowed clone/material isolation `SpatialCityWorld.js:1954-1986`.
- [x] Renderer/color/compositor: `DigitalMonsterThreeApp.js:73-146`, sRGB `:111`; HDR scene pass `SceneManager.js:803-817`; bloom warmup `DigitalMonsterThreeApp.js:306-325`; cached bloom chain `ModelsBloomPipeline.js:96-135`.
- [x] Old city card/bridge: `spatialCityBridge.js:59-115`, `SpatialCityHud.jsx:11-69` plus local CSS; projected state `SpatialCityWorld.js:2012-2040`; raycast `:2043-2086`; old beam/rings `:1886-1918`; no occlusion.
- [x] Warmup/reuse/dispose: app prepare `DigitalMonsterThreeApp.js:255-389`; chunked real RT draw `SceneManager.js:487-503`; scene visibility/update `Mmk1CapabilityScene.js:377-447`; city dispose `SpatialCityWorld.js:2178-2204`.
- [x] Physical delete/replace list recorded below.
- [x] Concrete target architecture frozen in `PLAN.md`.

## Physical delete/replace list

1. Replace `spatialCityLocalRoads.js` independent curves, decorative junction disks, random wrapping flow, and head/tail fragment shader with one directed road graph, physical junction geometry, and conflict-safe thin-line traffic.
2. Remove the old city card runtime, fixed HUD offsets, per-frame external-store anchor publication, old city-specific card CSS, and old beam/three-ring interaction target.
3. Replace synchronous `SpatialCityWorld._build()` construction with a chunked preloader `readyPromise` while preserving real warm draws and post-Start reuse.
4. Extract and freeze the protected foreground highway before shared road/material work.
5. Retain the integrated procedural facade principle, but split ownership, validate facade-light separation, freeze world-space floor/bay metrics, and prove LOD stability in isolated motion evidence.
6. Retain the single renderer, allWarm capability variant draws, hex lifecycle, inactive-scene reuse, and final disposal contracts.

## GATE 0 issue register

| Priority | Finding | Owner / next action |
|---|---|---|
| P0 | Previous cloud-only preview blocker | RESOLVED by the user's explicit isolated-localhost exception and captured hardware baseline |
| P0 | GATE 1 required dual GATE 0 PASS | RESOLVED; both independent reviewers returned PASS |
| P1 | City builds synchronously during scene construction | IMPLEMENTER converts to chunked preloader preparation after unlock |
| P1 | Local road/traffic lacks directed topology, following distance and conflicts | IMPLEMENTER replaces system in GATE 2/4 |
| P1 | Protected highway shares mutable city helpers | IMPLEMENTER isolates output-identically before mutable road/material changes |
| P1 | Old city card/markers remain and publish projected state through React | IMPLEMENTER physically replaces in GATE 5 |
| P1 | Production frame/CPU/GPU collector is absent | Baseline captured with an isolated non-production Playwright harness; GPU timer extension exists but reliable GPU p95 remains unavailable |
| P2 | Facade-light strips may need physical separation audit | Verify in GATE 3 close-up/motion evidence |

## Baseline performance ledger

| Run | Average FPS | p95 frame ms | >25 ms | consecutive ~33.3 ms | p95 CPU ms | p95 GPU ms | draw calls/frame | triangles/frame | traffic count |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Idle | 74.95 | 13.40 | 0.044% | 0 | 4.10 | unavailable* | 62.36 | 296,535 | 920 total (300 local + 620 protected highway) |
| Slow camera | 74.95 | 13.40 | 0.044% | 0 | 4.00 | unavailable* | 62.36 | 296,535 | 920 total (300 local + 620 protected highway) |
| Traffic + HUD | 74.85 | 13.40 | 0.134% | one isolated ≥33 ms frame; no sequence | 4.80 | unavailable* | 62.36 | 296,535 | 920 total (300 local + 620 protected highway) |

`*` `EXT_disjoint_timer_query_webgl2` is available, but the current app exposes no trustworthy per-frame GPU-p95 collector. The SPEC treats GPU ≤14 ms as desirable, not a hard threshold. All hard delivered-frame and CPU thresholds pass. The isolated display cadence is approximately 75 Hz.

### GATE 0 runtime environment

- Browser: Headless Chrome 151 in a new Playwright-owned isolated profile; no user profile, cookies, tabs, or authorization.
- GPU: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti, Direct3D11)`.
- WebGL: WebGL 2.0; antialias false; depth/stencil true; power preference default.
- Hardware: 12 logical cores, 16 GB reported device memory.
- Server: `127.0.0.1:4184` only; no external listener and no deployment.
- QA path: `/capabilities/spatial-matrix`.
- Initial city selection: `Q-01 / ЖИЛОЙ КВАРТАЛ 01`.

## Reviewer verdicts

### GATE 0 — VISUAL REVIEWER

BLOCKED

| point | status | evidence | deviation | required fix |
|---|---|---|---|---|
| Cloud baseline | BLOCKED | No deploy URL/config and no cloud browser tab; current screenshot is 729×406, not 1920×945 DPR 1. | No camera/seed, dynamic video, matched protected-element comparison, or full chrome validation. | Supply/open exact cloud preview and capture the required fixed baseline. |
| Current composition | FAIL | Screenshot has uniform high-rise scatter, weak plan separation and no clear active-quarter hierarchy versus reference. | Reads as placed objects, not a coherent masterplan. | Deterministic GATE 1 blockout after unlock. |
| Roads | FAIL | Visible acute X overlap and decorative loop tangle; physical road surfaces/junctions do not read. | Random/decorative topology. | Shared physical road graph with explicit junctions/roundabouts. |
| Facades/light | FAIL | High-frequency white/cyan window noise and weak graphite volume/depth. | Architecture is overwhelmed by emissive grids. | Stable facade LOD, controlled window groups, selective light/depth hierarchy. |
| Protected/global systems | BLOCKED | Attached crop cannot prove crane/highway identity or global UI/HUD behavior. | Mandatory regression evidence missing. | Matched cloud still/video and interaction pass. |

### GATE 0 — TECH REVIEWER

BLOCKED

| point | status | evidence | deviation | required fix |
|---|---|---|---|---|
| Cloud/hardware/performance | BLOCKED | No cloud WebGL context or baseline logs; renderer permits major performance caveat; no percentile harness found. | GPU identity, hardware acceleration, timer query and three runs cannot be verified. | Record renderer/browser/HW facts and fixed baseline on the cloud preview. |
| allWarm/reuse/dispose | PASS | Single renderer, prepare gate, real capability draws, hex warmup, retained worlds and final disposal are present. | No missing warm-draw path found. | Preserve these contracts. |
| Preparation | FAIL | All placeholder worlds construct immediately; `SpatialCityWorld._build()` is synchronous. | Can freeze loader despite being under curtain. | Chunk deterministic preparation across breaths and resolve `readyPromise` only after completion. |
| Roads/traffic | FAIL | Independent curves/disks/random wrapping traffic; explicit head/tail shader. | No directed lane graph, conflicts, spacing, routing, or compliant appearance. | Physical shared graph plus ordered/reserved route scheduler and symmetric thin lines. |
| Protected highway | FAIL | Highway remains in mutable monolith and shares road/material helpers. | Structural isolation is insufficient. | Extract/freeze before city changes, matched output only. |
| Old HUD | FAIL | Old bridge/card/beam/rings remain; no occlusion; projected anchor state can rerender React. | Does not meet GATE 5 architecture or performance. | Physically remove and replace with anchored WebGL/imperative DOM bridge. |

Previous cloud-only acceptance status is retained above as historical context only. The user explicitly superseded that environment constraint, the corrected isolated evidence was independently re-reviewed, and GATE 0 now has dual `PASS`.

### GATE 0 — current independent acceptance

| Reviewer | Verdict | Independent evidence |
|---|---|---|
| TECH REVIEWER | PASS | Live isolated `/capabilities/spatial-matrix`; 1920×945 DPR 1; WebGL2; ANGLE RTX 3070 Ti D3D11; 3840×1890 renderer buffer; exact PNG; raw 3×30 s metrics; source/allWarm/architecture audit |
| VISUAL REVIEWER | PASS | Exact 1920×945 baseline; 59.2 s WebM and 18 s frame sequence; camera continuity; protected highway/crane; stable global chrome; stage-5 identity |

GATE 1 deterministic grey blockout is unlocked for IMPLEMENTER. GATE 2 remains locked.

## GATE 1 implementation and evidence

| Item | Status | Evidence |
|---|---|---|
| Deterministic masterplan | IMPLEMENTED | Fixed `0xD1617A1` plan with foreground low/wide blocks, active midground groups, selected tower, rear cluster and sparse periphery |
| Left text safe zone | IMPLEMENTED | No new blockout masses placed in the left text composition zone |
| Windows/facade noise | TEMPORARILY DISABLED | `CITY_BLOCKOUT_ACTIVE`; procedural facade code retained for later-gate replacement, but blockout shader output is neutral grey |
| Local traffic | TEMPORARILY DISABLED | `LOCAL_ROAD_BLOCKOUT_ACTIVE`; protected 620-fragment foreground highway traffic remains live |
| Decorative city 3D/HUD | TEMPORARILY DISABLED | City boundary/beacon/rings/ambient/mist/interaction and old card visibility are off; GATE 5 code is not deleted or replaced early |
| Protected highway | UNCHANGED BY IMPLEMENTER | Generator/material/transform/update path not edited; global postprocess remains active |
| Protected crane/construction | UNCHANGED BY IMPLEMENTER | Clone/material isolation/transform/animation path not edited |
| Targeted ESLint | PASS | Implementer report; no lint errors |
| Production build | PASS | Implementer report; `npm run build` completed |
| Exact blockout still | AVAILABLE | `evidence/gate1-blockout-city-exact-1920x945-dpr1.png`, verified 1920×945 |
| 50% blockout/reference overlay | AVAILABLE | `evidence/gate1-blockout-reference-overlay-50.png`, reference scaled from 1774×887 to the fixed QA viewport for composition comparison |
| Runtime environment | PASS | `/capabilities/spatial-matrix`; 1920×945 DPR 1; WebGL2 ANGLE RTX 3070 Ti D3D11; 3840×1890 renderer backing; no page/console errors; old city HUD absent |

GATE 1 production changes are limited to:

- `src/three/scenes/capabilities/spatialCity/SpatialCityWorld.js`;
- `src/three/scenes/capabilities/spatialCity/spatialCityLocalRoads.js`;
- `src/pages/capabilities/components/SpatialCityHud/SpatialCityHud.jsx`.

GATE 2 remains locked until both independent reviewers issue their GATE 1 verdicts. Per the user's instruction, execution stops after this independent review and does not advance to GATE 2 without confirmation.

## GATE 1 independent verdicts

| Reviewer | Verdict | Accepted | Blocking findings |
|---|---|---|---|
| TECH REVIEWER | FAIL | Determinism/camera; neutral shader output; disabled mutable traffic/ambience/interaction/HUD; protected highway/crane; postprocess/lifecycle/allocation scope; gate scope; targeted ESLint | Four blockout masses enter the 0.255 road-bed corridor by about 0.0585–0.0779 world units; one enters the 0.185 road surface by about 0.0079. Center-only clearance is insufficient for rotated footprints. |
| VISUAL REVIEWER | FAIL | Exact evidence; left safe zone; selected-tower hierarchy; protected highway/crane; global chrome | Rear plan is too dark; district groups and rear cluster are weak; density is too sparse; secondary masses still read as isolated boxes; muted road/parcel skeleton is not legible enough to verify conflicts. |

### Deduplicated GATE 1 findings

| Priority | Finding | Required correction |
|---|---|---|
| P1 | Geometric building/road conflict | Use rotated-footprint-aware road-bed clearance with epsilon; reposition/reject the four conflicting masses and prove zero intersection. |
| P1 | Rear/background hierarchy is not readable | Raise neutral blockout tones/fill for rear and periphery while keeping windows/final emissive detail off. |
| P1 | District structure/density remains too weak | Assemble low/wide foreground groups, a denser active quarter and a coherent rear business cluster with deliberate inter-district gaps. |
| P1 | Secondary masses still read as box scatter | Use blockout-level podium groups, stepped silhouettes and elongated masses without beginning final GATE 2 detailing. |
| P1 | Road conflict cannot be visually audited | Show the muted road and parcel skeleton in the correction still, with traffic and decorative neon disabled. |
| PRESERVE | Accepted composition/runtime invariants | Keep left safe zone, selected tower, protected highway/crane, global chrome, deterministic camera/seed and allWarm lifecycle unchanged. |

The user authorized correction pass 1 after reviewing the failure summary. GATE 2 remains locked, and `QA_CAMERA` / `QA_SEED` remain unfrozen until a future dual GATE 1 `PASS`.

## GATE 1 correction pass 1

| Item | Result |
|---|---|
| Footprint validator | 45 candidate / 45 accepted masses; 1140 local-road segments; minimum signed clearance `0.045278`; required epsilon `0.035`; conflicts `0`; valid `true` |
| Protected highway exclusion | Foreground highway is not part of mutable local-road validator data; source owner/output path remains unchanged |
| Composition correction | Compound low/wide foreground groups; denser active midground; coherent taller rear cluster; sparse periphery; left safe zone retained |
| Blockout readability | Building rear/periphery tones and neutral fill raised; local road beds/junction footprints and parcel/grid skeleton raised without traffic/neon/final facade detail |
| Disabled systems | Windows/facade emissive noise, mutable local traffic, ambient/mist, selection decoration and city HUD remain off |
| Targeted ESLint | PASS |
| Production build | PASS |
| Runtime | WebGL2 ANGLE RTX 3070 Ti; 1920×945 DPR 1; renderer 3840×1890; no console errors; old city HUD absent |

Correction evidence:

- `evidence/gate1-correction1-blockout-city-exact-1920x945-dpr1.png`;
- `evidence/gate1-correction1-blockout-reference-overlay-50.png`;
- `evidence/gate1-correction1-runtime.json`.

The independent correction re-review is complete. No GATE 2 implementation has started.

## GATE 1 correction pass 1 — final independent verdicts

| Reviewer | Verdict | Independent acceptance evidence |
|---|---|---|
| TECH REVIEWER | PASS | Exact rotated-footprint calculation independently matched implementation within `8.9e-16`; 45/45 masses, 1140 segments, minimum signed clearance `0.0452779243`, epsilon `0.035`, conflicts `0`; protected highway/crane, deterministic camera/seed, lifecycle, disabled mutable systems and gate scope passed. |
| VISUAL REVIEWER | PASS | Foreground/midground/background separation, district grouping, selected tower/rear-cluster balance, reference-like density, compound massing, matte-grey legibility, road/parcel skeleton, left safe zone, protected highway/crane and global chrome passed. |

GATE 1 is accepted. `QA_CAMERA` and `QA_SEED` are frozen to the values at the top of this ledger. The user explicitly authorized GATE 2; GATE 3 and later remain locked.

## GATE 2 implementation and evidence

- Six deterministic architecture families cover all 45 accepted masterplan buildings.
- New owners: `spatialCityArchitecture.js`, `spatialCityRoadGraph.js`, `spatialCityRoadGeometry.js`.
- Architecture uses instanced block-level parts and shared opaque custom graphite materials; window grids/transmission/GATE 3 facade logic remain absent.
- Pure road graph: 27 nodes, 30 edges, 9 junctions, one clockwise roundabout, four tangent entry/exit connections, 39 centerlines; validator reports no errors.
- Physical road/public realm: extruded slabs, explicit junction meshes, sidewalks/curbs, annular circulation, physical island, plazas and building-ground contact. Local moving traffic remains off.
- Footprints: 45/45 buildings, 198 graph segments, minimum signed clearance `0.05292`, epsilon `0.035`, conflicts `0`.
- Scoped new-system estimate: 15 draw calls, 6,640 triangles. Short delivered-frame probe at the fixed QA view: 75.006 FPS, p95 13.4 ms, zero frames over 25 ms.
- Protected foreground highway and crane/construction paths were not imported into or modified by the new systems.
- Targeted ESLint and production build: PASS.

Evidence:

- `evidence/gate2-city-exact-1920x945-dpr1.png`;
- `evidence/gate2-reference-overlay-50.png`;
- `evidence/gate2-runtime.json`.

The exact runtime capture is technically clean but visibly very dark. This is explicitly submitted to independent GATE 2 review rather than being accepted by the Orchestrator. GATE 3 remains locked.

## GATE 2 independent verdicts

| Reviewer | Verdict | Accepted | Blocking findings |
|---|---|---|---|
| TECH REVIEWER | FAIL | Six meaningful family builders; instanced/shared architecture rendering; physical public realm primitives; reproduced metrics/budgets; protected highway/crane; lifecycle/disposal; lint/build/evidence | Two frozen GATE 1 footprints changed; legacy CatmullRom/junction/road builder remains a second topology owner; physical renderer includes entry but omits exit connectors; validator excludes exit and complete produced-centerline crossing coverage. |
| VISUAL REVIEWER | FAIL | Exact evidence; left safe zone; protected highway/crane; global chrome | Architecture/material layers and family silhouettes are too dark to verify; roads read as faint lines rather than physical surfaces; roundabout/island/approaches, sidewalks/curbs/plazas and selected hierarchy are not legible. |

### Deduplicated GATE 2 findings

| Priority | Finding | Required correction |
|---|---|---|
| P1 | Frozen masterplan mutation | Restore both accepted GATE 1 coordinates and route the physical system around them. |
| P1 | Dual topology ownership | Remove/derive the legacy road paths, junctions and builder from the new graph owner. |
| P1 | Incomplete roundabout physical geometry | Build both entry and exit tangent throats and prove their joins with approach/circulation geometry. |
| P1 | Incomplete graph validation | Validate crossings/joins/tangency for edges, entry, exit and circulation segments. |
| P1 | Architecture families are not visually provable | Raise neutral graphite values/fill and material separation; preserve night mood without windows/Bloom. |
| P1 | Constructive layers and silhouette variety disappear | Make podium/main/setback/roof/technical/ribs/belts/articulated tops readable through geometry/material response. |
| P1 | Physical road/public realm is not visually provable | Raise non-neon road/sidewalk/curb/island/plaza contrast and provide exact plus top/oblique debug evidence. |
| PRESERVE | Accepted invariants | Keep protected highway/crane, left safe zone, global chrome, camera/seed and lifecycle unchanged. |

The user explicitly authorized GATE 2 correction pass 1. GATE 3 remains locked.

## GATE 2 correction pass 1

- Frozen GATE 1 footprints restored at `(0.25, 1.25)` and `(-1.55, -1.35)`; no other masterplan movement reported.
- `spatialCityLocalRoads.js` now contains only generic footprint validation; `CatmullRom`, `ROAD_ROUTE_POINTS`, `JUNCTIONS`, and the legacy local-road builder have zero matches. `spatialCityRoadGraph.js` is the single topology owner.
- All 39 produced centerlines / 198 segments are validated: 30 edge, 96 connector, 72 circulation; unexpected crossings `0`; entry tangency `4/4`; exit tangency `4/4`; circulation attachments `8/8`; approach joins `8/8`.
- Physical renderer contains four entry and four exit roundabout connectors.
- Footprints: 45 authored / 45 accepted; minimum signed clearance `0.0435196714`; required epsilon `0.035`; conflicts `0`.
- Architecture/public-realm custom material values and silhouette parts were raised for evidence readability without enabling windows, emissive facade grids, local traffic or final Bloom work.
- Scoped architecture + roads: 16 calls / 7,432 triangles. Fixed-view short probe: 75.006 FPS, p95 13.4 ms, zero frames over 25 ms; no console errors.
- Targeted ESLint and production build: PASS.

Evidence:

- `evidence/gate2-correction1-city-exact-1920x945-dpr1.png`;
- `evidence/gate2-correction1-road-oblique-1920x945-dpr1.png`;
- `evidence/gate2-correction1-families-central.png`;
- `evidence/gate2-correction1-families-foreground.png`;
- `evidence/gate2-correction1-families-rear.png`;
- `evidence/gate2-correction1-roads-public-realm.png`;
- `evidence/gate2-correction1-reference-overlay-50.png`;
- `evidence/gate2-correction1-runtime.json`.

## GATE 2 correction pass 4 — independent verdicts

| Reviewer | Verdict | Acceptance |
|---|---|---|
| TECH REVIEWER | PASS | Actual island geometry, exact field-level assertion, mandatory mutation guard, positive + eight negative cases, mesh immutability, pass scope, extents/clearance, frozen plan/graph, lifecycle/budgets/checks all independently pass. |
| VISUAL REVIEWER | PASS | Assertion-only pass preserves all correction-3 visual acceptance: island/circulation/connectors, ID6/top-2, roads/public realm, six families/hierarchy, safe zone, protected highway/crane, chrome and no hard visible deviation. |

### GATE 2 frozen acceptance state

- Masterplan: 45 rows, SHA-256 `56f8f9534957e889f2afba3bc335f40bc1a2a1c7ca2641ded68042ca75c439d2`.
- Architecture: six accepted related families; scoped architecture + roads 16 calls / 6,632 triangles.
- Road/public-realm model: 108 exact extents, 39/39 centerlines mapped, 8/8 junctions watertight, conflicts `0`, minimum clearance `0.0435196714`.
- Former blocker ID6/top-2: positive clearance `0.1873593361`.
- Roundabout island: exact X/Z radii `0.17`, center `(-0.62, 0.05)`, Y `[0, 0.095]`; mandatory positive/negative geometry-to-extent guard passes.
- Graph: 27 nodes / 30 edges / 39 centerlines / 198 segments, zero unexpected crossings, all roundabout joins/tangencies accepted.
- Targeted ESLint and production build: PASS. Protected systems and global chrome preserved.

GATE 2 is accepted with dual independent `PASS`. GATE 3 is locked and has not started; explicit user confirmation is required.

## GATE 3 authorization

The user explicitly authorized continuation. GATE 3 implementation is active for stable procedural facades/windows and distance LOD only. Acceptance requires canonical close-up and distant stills, at least 10 seconds of slow-camera motion, source/runtime evidence, and independent TECH + VISUAL `PASS`. GATE 4 remains locked.

## GATE 3 implementation and evidence

- Active owner: `spatialCityFacadeMaterial.js`; old hidden facade InstancedMesh/material/update/raycast runtime path is removed/disabled with zero active symbol matches.
- Coverage: 45/45 buildings, 3 facade batches, 147 parts; zero per-window meshes/lights/textures and zero added calls/triangles.
- World pitches: floors `0.245–0.29`, front bays `0.255–0.36`, side bays `0.32–0.41`; centered margins `0.07019–0.10465`; edge stretch/clipping count `0`.
- Final tuned LOD: normalized distance `18→34`, derivative `0.55→1.10`, smoothstep only; detailed aperture width `0.38–0.48` / height `0.23`; compact grouped aperture `0.28×0.10` in a doubled cell, density `22%`, energy `0.24`.
- Deterministic grouped lighting uses stable discrete IDs, no time/blinking; warm/cool thresholds `0.97/0.996`.
- Performance probe: 74.804 FPS, p95 13.4 ms, over-25-ms ratio `0.00267`; no console errors. The only warning is the existing renderer `useLegacyLights` deprecation.
- Motion capture: 17.16 seconds plus a separate 15.22-second four-frame sequence. No browser/server remains running.
- Frozen GATE 2 layout/hash, road/extents/clearance/graph, budgets, protected systems and global chrome remain unchanged. ESLint/build/validators: PASS.

Evidence:

- `evidence/gate3-facade-distant-1920x945-dpr1.png`;
- `evidence/gate3-facade-closeup-central.png`;
- `evidence/gate3-facade-closeup-rear.png`;
- `evidence/gate3-facade-oblique-after-motion-1920x945-dpr1.png`;
- `evidence/gate3-facade-slow-camera-17s-1920x945-dpr1.webm`;
- `evidence/gate3-motion-frame-25pct.png` through `gate3-motion-frame-100pct.png`;
- `evidence/gate3-before-after-distant-stacked.png`;
- `evidence/gate3-facade-runtime.json`.

The `gate3-initial-before-tuning-*` files are non-canonical diagnostic evidence only. Independent GATE 3 review is active; GATE 4 has not started.

## GATE 3 independent verdicts

| Reviewer | Verdict | Accepted | Blocking findings |
|---|---|---|---|
| TECH REVIEWER | FAIL | Legacy removal, sole owner, resource/budget/coverage/lifecycle invariants, detailed grid, AA, compile/runtime evidence | Grouped LOD clips incomplete edge cells for odd counts: 161/186 valid face orientations have an incomplete edge group and 104 lit clipped cells affect 33/45 buildings. Colour classification thresholds an LOD-mixed hash, producing 97 warm and 8 cool threshold crossings over 2,352 valid detailed cells. |
| VISUAL REVIEWER | FAIL | No visible z-fighting/moiré, palette control, frozen massing/hierarchy and protected/global invariants | Facades read as sparse oversized billboard rectangles with weak floor/bay rhythm; front/side proof is partial; edge clipping and continuous no-pop motion are not demonstrated. |

### GATE 3 correction requirements

- Exact far-group counts/margins/masking and an exhaustive non-hard-coded edge validator.
- Independent grouped/detailed endpoint colours with continuous contribution blending.
- Smaller apertures plus architectural floor/bay/section rhythm and restrained frame/reveal response; retain many dark cells and controlled neutral/warm/cool distribution.
- Dedicated edge/grazing close-ups for three families and denser continuous approach/retreat motion evidence.
- No regression to zero per-window resources, 16 calls / 6,632 scoped triangles, allWarm lifecycle, frozen GATE 2 plan/roads/protected systems or global chrome.

GATE 3 is not accepted. GATE 4 is locked and has not started. Correction pass 1 requires explicit user authorization.

The user authorized GATE 3 correction pass 1. Implementation is active only for the deduplicated facade/LOD findings; GATE 4 remains locked.

## GATE 3 correction pass 1 evidence

- Canonical stills: `gate3-facade-distant-1920x945-dpr1.png`, `gate3-facade-closeup-central.png`, `gate3-facade-closeup-rear.png`, `gate3-family-edge-closeup-office.png`, `gate3-family-edge-closeup-civic.png`, and `gate3-facade-oblique-after-motion-1920x945-dpr1.png`.
- Motion: `gate3-facade-slow-orbit-return-21s-1920x945-dpr1.webm` (17.048 s bounded slow orbit + 4.502 s spring return) and ten `gate3-motion-frame-010pct.png` … `100pct.png` samples over 16.508 s.
- Runtime: viewport 1920×945 / DPR 1; WebGL2 / NVIDIA RTX 3070 Ti; 375 frames; 75.003 FPS average; p95 13.4 ms; zero frames over 25 ms; no console errors.
- Exact facade audit: 45/45 buildings; 147 parts; 588 physical face directions; 4,041 aperture rectangles; 492 incomplete groups masked; clips/overlaps/stretch `0/0/0`; 2,352 continuity cases × 16 samples with zero failures.
- Distribution: detailed/grouped lit 29.93% / 30.12%; detailed neutral/warm/cool 96.64% / 2.89% / 0.47%; grouped 97.66% / 2.34% / 0%.
- Zero per-window meshes/lights/textures and zero texture uniforms. Frozen GATE 2 hash, 108 extents, minimum clearance 0.0435196714, graph, protected systems, chrome, allWarm, 16 calls / 6,632 triangles, lint and build remain accepted.
- Complete machine-readable record: `evidence/gate3-correction1-runtime.json`. Earlier `gate3-initial-*`, `gate3-pre-correction1-*`, and `gate3-correction1-pre-visual-tuning-*` files are diagnostic, non-canonical evidence.

Independent TECH and VISUAL re-review is active. GATE 4 remains locked.

## GATE 3 correction pass 1 — final independent verdicts

| Reviewer | Verdict | Accepted | Blocking finding |
|---|---|---|---|
| TECH REVIEWER | PASS | 588-face edge audit, 492 masked incomplete groups, clips/overlaps/stretch `0`, worst AA gap positive, validator/shader parity, 2,352×16 continuous LOD cases, sole owner/resources, lifecycle, frozen G2 and budgets | None. |
| VISUAL REVIEWER | FAIL | No clipping/stretch, z-fighting, moiré, flicker or visible LOD pop; palette, silhouettes, hierarchy and protected/global invariants pass | Screen result is still too sparse and flat: dark cells vanish, isolated light dashes read as decals, and family/front-side facade systems are not architecturally distinct. |

Second-failure diagnosis is complete. Logical lit occupancy is not a valid proxy for projected facade coverage; current dark-glass masks, coarse bay pitches, mostly shared profiles and part-relative distance LOD produce technically valid but visually empty facades. The measurable correction-pass-2 architecture is recorded in `PLAN.md`. Production is frozen pending explicit user authorization. GATE 4 remains locked.

The user authorized correction pass 2. Production work is limited to `spatialCityFacadeMaterial.js` and aggregate projected metrics in `spatialCityArchitecture.js`; frozen GATE 2 systems and GATE 4 remain locked.

## GATE 3 correction pass 2 evidence

- Runtime: `/capabilities/spatial-matrix`, viewport 1920×945, DPR1, canvas 3840×1890/client 1920×945, WebGL2, no console errors, only the existing `useLegacyLights` warning.
- Visual evidence: `gate3-correction2-facade-distant-1920x945-dpr1.png`, central/rear close-ups, office/civic edge close-ups, oblique and spring-return stills, ten 1920×945 motion frames, and `gate3-correction2-facade-slow-orbit-14s-960x473.webp` with 60 frames over 14.195 seconds.
- Exact source/projected metrics and frozen invariants are recorded in `evidence/gate3-correction2-runtime.json`.
- Preview listener/process and isolated browser were closed immediately after capture. Independent re-review is active; GATE 4 remains locked.

## GATE 3 correction pass 2 — final independent verdicts

| Reviewer | Verdict | Accepted | Blocking finding |
|---|---|---|---|
| TECH REVIEWER | FAIL | Family grids, grouped topology, edge/continuity, shader/LOD, attributes/resources, lifecycle, frozen/protected/budget/check invariants | Ledger area 1,360,106 px² vs true quad area about 1,051,298 px² and viewport-clipped visible area about 550,914 px²; worst edge-on over-weight about 113×. CPU cadence ignores section/grouped mask expansion: sampled detailed/grouped cadence about 79.31%/77.54%, above target. |
| VISUAL REVIEWER | PASS | All former visual blockers are resolved; motion/LOD and protected/global pixels remain stable | None visual. |

Correction pass 2 is not accepted because dual independent `PASS` is required. The next correction is limited to true viewport-clipped polygon weighting, shader-parity cadence masks, bounded cadence tuning, refreshed metrics/runtime/capture and re-review. GATE 4 remains locked pending explicit authorization.

The user authorized correction pass 3. Production remains limited to facade QA parity and the smallest necessary section/cadence constant tuning; GATE 4 stays locked.

## GATE 3 correction pass 3 evidence

- True viewport-clipped projection and exact shader-mask cadence metrics are recorded in `evidence/gate3-correction3-runtime.json`; all negative and acceptance tests pass.
- Runtime: 1920×945 DPR1, WebGL2 canvas 3840×1890/client 1920×945, no console errors, existing lights deprecation only.
- Same-environment hardware probe: 750 frames / 9,999.1 ms, 75.0068 FPS average, p95 13.4 ms, zero frames over 25 ms; RTX 3070 Ti / WebGL2. Correction-1 comparison is 75.0030 FPS.
- Visual: correction-3 distant/central/rear/office/civic/oblique/return stills, ten full-resolution motion frames and `gate3-correction3-facade-slow-orbit-16s-960x473.webp` with 60 frames over 16.351 seconds.
- Preview listener/process and isolated browser are closed. Independent re-review is active; GATE 4 remains locked.

## GATE 3 correction pass 3 — final independent verdicts

| Reviewer | Verdict | Accepted evidence |
|---|---|---|
| TECH REVIEWER | PASS | Projection/clipping, clipped metric ownership, cadence/shader parity, LOD/palette/topology, resources/lifecycle, frozen systems/budgets, lint/build and same-environment 75.0068 FPS probe. |
| VISUAL REVIEWER | PASS | Correction-3 still/close-up/motion evidence preserves all correction-2 visual passes with no shimmer, moiré, clipping, billboard reading or protected/global regression. |

GATE 3 is accepted. GATE 4 remains locked and has not started. Explicit user authorization is required before directed traffic work.

The user authorized GATE 4. TECH graph/scheduler acceptance must precede VISUAL appearance acceptance. GATE 5 remains locked.

## GATE 4 source evidence

- Canonical source ledger: `evidence/gate4-source-validation.json`.
- Physical graph remains 27/30/39/198 with zero unexpected crossings and 108 shared road extents.
- Directed layer: 14 routes, 10 roundabout routes, four exits, nine conflict zones, 20/20 tangent joins and 504 corner-cut checks with zero failures.
- Scheduler: 45 seconds, 2,700 steps, 20 fragments, 33 trips, three used exits, min gap 0.2 and zero spacing/order/conflict/teleport/visible-endpoint violations.
- Renderer: two instanced calls / 80 triangles, zero per-fragment resources; projected size and symmetric-shape targets pass.
- TECH graph review is active. Browser/server were not started; VISUAL review remains locked.

## GATE 4 TECH graph verdict

TECH REVIEWER: `FAIL`.

- Restricted canonical simulation passes but excludes all competing roundabout entries.
- Independent all-route stress deadlocks/starves; reservation hold exceeds 34 seconds at 45 seconds and 109 seconds at 120 seconds.
- Pixel halo misses target and projection acceptance does not assert its own ranges.
- Debug model allocates eagerly in normal sessions.
- All other graph/topology/renderer/lifecycle/frozen/protected checks pass.

The deduplicated correction scope is recorded in `PLAN.md`. No VISUAL capture/review was started. GATE 5 remains locked pending explicit correction authorization and a future TECH `PASS`.

The user authorized correction pass 1. Production is restricted to the TECH findings; visual capture remains prohibited until a new TECH graph verdict passes.

## GATE 2 correction pass 1 — independent verdicts

| Reviewer | Verdict | Accepted | Remaining blocker |
|---|---|---|---|
| TECH REVIEWER | FAIL | Frozen coordinates restored; one topology owner; complete 39-centerline validation; four entry + four exit connectors; six families; budgets; protected/global/lifecycle; evidence/checks | Building ID `6` overlaps explicit `top-2` junction cylinder by approximately `0.007485`. Centerline clearance does not cover the larger physical junction radius. |
| VISUAL REVIEWER | FAIL | Overall readability; all six families; constructive layers; structural rhythm; material distinction; silhouettes; selected hierarchy; physical roads; roundabout circulation; sidewalks/curbs/plazas; safe zone; protected/global | Same verified ID6/junction overlap violates the hard no-building-road-conflict criterion. All other visual correction criteria passed. |

### Second-failure architecture diagnosis

The physical road renderer and clearance validator do not share one complete extent model. Centerline clearance can return `conflicts=0` while an explicit junction disk intersects a building. Correction pass 2 must derive both rendering and validation from shared physical extents, preserve the frozen building layout, and repair the junction shape rather than masking or moving the building.

The user explicitly authorized correction pass 2. No GATE 3 work has started.

## GATE 2 correction pass 2

- Added one pure physical extent owner, `spatialCityRoadExtents.js`; the renderer and the rotated-footprint validator consume the same 108 exact extents.
- Extents: 30 road ribbons, 8 connector ribbons, 60 sidewalk/curb ribbons, 8 junction-arm polygons, 1 roundabout annulus and 1 roundabout island.
- The frozen masterplan remains 45/45 with rows SHA-256 `56f8f9534957e889f2afba3bc335f40bc1a2a1c7ca2641ded68042ca75c439d2`; ID 6 was not moved.
- Full physical-extent validation: `conflicts=0`, required epsilon `0.035`, minimum signed clearance `0.0435196714` (building 19 ↔ `sidewalk:center-2:3:left`).
- Former blocker: ID 6 ↔ `junction:top-2:compact-road-arm-patch` has 8 polygon vertices and signed clearance `0.1873593361`.
- Renderer/model counts match; 39/39 physical centerlines are mapped; 8/8 junctions are watertight. Graph remains 27 nodes / 30 edges / 39 centerlines / 198 segments with zero unexpected crossings and all entry/exit/attachment/join checks passing.
- Scoped architecture + roads: 16 calls / 6,632 triangles. Fixed-view probe: 75.005 FPS, p95 13.4 ms, zero frames over 25 ms; no console errors.
- Targeted ESLint and production build: PASS. Preview was loopback-only and is stopped; the isolated task browser/profile is closed.

Correction-2 evidence:

- `evidence/gate2-correction2-city-exact-1920x945-dpr1.png`;
- `evidence/gate2-correction2-road-oblique-1920x945-dpr1.png`;
- `evidence/gate2-correction2-roads-public-realm.png`;
- `evidence/gate2-correction2-roads-public-realm-inspection-brightened.png` — derived brightness aid only;
- `evidence/gate2-correction2-runtime.json`.

## GATE 2 correction pass 2 — independent verdicts

| Reviewer | Verdict | Accepted | Blocking finding |
|---|---|---|---|
| TECH REVIEWER | FAIL | Pure shared owner; independently reproduced 108 extents, 45-row hash, clearances, graph checks, lifecycle, protected scope, lint/build and budgets | Extent models the roundabout island as radius `0.17`, while `CylinderGeometry(1, 1.03, 1)` scaled by `0.17` renders a bottom radius of `0.1751`. The unvalidated `0.0051` overhang breaks exact renderer/validator ownership. |
| VISUAL REVIEWER | PASS | ID6/top-2 is visually clear; junction arms remain continuous; island/circulation/connections and public realm are readable; all architecture/protected/global invariants remain accepted | None visually. |

### Deduplicated remaining blocker

The physical extent inventory is complete by type and count, but one object's dimensions are not identical between model and renderer. A future correction must either use equal cylinder radii or model top/bottom radii explicitly and validate the maximum rendered radius; it must also add a geometry-to-extent assertion so count equality cannot hide another dimensional mismatch.

Because GATE 2 requires both independent verdicts to pass, GATE 2 remains failed. GATE 3 is locked and no GATE 3 work has started.

The user authorized continuation. Correction pass 3 is active and limited to making the roundabout island's rendered footprint exactly equal to its shared extent, adding an assertion that verifies dimensions rather than counts alone, rerunning proportional checks, and obtaining new independent verdicts. GATE 3 remains locked.

## GATE 2 correction pass 3

- Changed only `spatialCityRoadGeometry.js`: `CylinderGeometry(1, 1, 1, ...)` removes the unmodeled island taper.
- The build-time assertion reads actual geometry parameters and transform: extent/render top `0.17`, bottom `0.17`, maximum `0.17`, Y `[0, 0.095]`; `geometryExtentAssertionsMatch=true`.
- Physical extents remain 108; renderer/model counts match; conflicts `0`; minimum clearance `0.0435196714`; ID6/top-2 `0.1873593361`.
- Frozen plan remains 45/45 with SHA-256 `56f8f9534957e889f2afba3bc335f40bc1a2a1c7ca2641ded68042ca75c439d2`.
- Road graph remains 27 nodes / 30 edges / 39 centerlines / 198 segments with all checks passing.
- Targeted ESLint and production build: PASS. Fixed-view probe: 75.006 FPS, p95 13.4 ms, no frames over 25 ms, no console errors.

Correction-3 evidence:

- `evidence/gate2-correction3-city-exact-1920x945-dpr1.png`;
- `evidence/gate2-correction3-road-oblique-1920x945-dpr1.png`;
- `evidence/gate2-correction3-runtime.json`.

Preview is stopped and the isolated task browser is closed. Independent re-review is active; GATE 3 has not started.

## GATE 2 correction pass 3 — independent verdicts

| Reviewer | Verdict | Accepted | Blocking finding |
|---|---|---|---|
| TECH REVIEWER | FAIL | Actual island geometry independently measures as radius `0.17` in X/Z and Y `[0, 0.095]`; all GATE 2 physical/topology/frozen/protected/performance invariants pass | Assertion uses `Math.max(scale.x, scale.z)`, so either axis may shrink to `0.16` while `valid=true`; rendered `position.x/z` is not compared with `extent.center.x/z`. |
| VISUAL REVIEWER | PASS | Roundabout and all previously accepted correction-2 architecture/public-realm/protected criteria remain visually correct | None visually. |

### Deduplicated remaining blocker

The production geometry is now correct, but the required geometry-to-extent regression guard is incomplete. It must compare top-radius-X, top-radius-Z, bottom-radius-X and bottom-radius-Z independently with the modeled radius, compare mesh X/Z center with the extent center, and demonstrate failing negative tests for anisotropic scale and displaced center.

GATE 2 remains failed because dual independent `PASS` is required. GATE 3 remains locked and no GATE 3 work has started.

The user authorized correction pass 4. Scope is limited to independent top/bottom X/Z radius comparisons, XZ center comparison, explicit negative tests for both anisotropic scale directions and displaced center, proportional checks, and independent re-review. GATE 3 remains locked.

## GATE 2 correction pass 4

- Only the assertion implementation in `spatialCityRoadGeometry.js` changed; actual island geometry remains the correction-3 accepted circle.
- Positive measured fields: top X/Z `0.17/0.17`, bottom X/Z `0.17/0.17`, center XZ `(-0.62, 0.05)`, Y `[0, 0.095]`; all checks pass.
- Negative mutation matrix rejects: X-only shrink, Z-only shrink, X displacement, Z displacement, top-radius change, bottom-radius change, geometry-height change and Y displacement.
- Guard failure throws during road-system preparation. Extents `108`, clearance conflicts `0`, minimum `0.0435196714`, ID6/top-2 `0.1873593361`, frozen hash and graph metrics remain unchanged.
- Targeted ESLint and production build: PASS. No browser/server/perf run was needed because visible geometry did not change.

Correction-4 evidence: `evidence/gate2-correction4-assertion.json`. Correction-3 exact/oblique images remain the canonical visual evidence.

Independent re-review is active. GATE 3 has not started.

## Evidence inventory

| Evidence | Status |
|---|---|
| `evidence/gate0-baseline-city-exact-1920x945-dpr1.png` | AVAILABLE, verified 1920×945 |
| `evidence/gate0-baseline-city-1920x945-dpr1.png` | SECONDARY ONLY, in-app panel capture 1664×945 |
| `evidence/gate0-slow-camera-1920x945-dpr1.webm` | AVAILABLE |
| `evidence/gate0-performance-baseline.json` | AVAILABLE; raw environment plus three 30 s hardware runs |
| `evidence/gate1-blockout-city-exact-1920x945-dpr1.png` | AVAILABLE, verified 1920×945 |
| `evidence/gate1-blockout-reference-overlay-50.png` | AVAILABLE, 50% composition overlay |
| `evidence/gate1-correction1-blockout-city-exact-1920x945-dpr1.png` | AVAILABLE, correction pass 1 exact 1920×945 |
| `evidence/gate1-correction1-blockout-reference-overlay-50.png` | AVAILABLE, correction pass 1 50% overlay |
| `evidence/gate1-correction1-runtime.json` | AVAILABLE, runtime and geometric validator facts |
| `evidence/gate2-city-exact-1920x945-dpr1.png` | AVAILABLE, exact 1920×945 |
| `evidence/gate2-reference-overlay-50.png` | AVAILABLE, 50% reference overlay |
| `evidence/gate2-runtime.json` | AVAILABLE, runtime/topology/architecture/check facts |
| `evidence/gate2-correction1-city-exact-1920x945-dpr1.png` | AVAILABLE, correction exact 1920×945 |
| `evidence/gate2-correction1-road-oblique-1920x945-dpr1.png` | AVAILABLE, correction oblique 1920×945 |
| `evidence/gate2-correction1-runtime.json` | AVAILABLE, corrected topology/runtime/check facts |
| `evidence/gate2-correction2-city-exact-1920x945-dpr1.png` | AVAILABLE, correction-2 exact 1920×945 |
| `evidence/gate2-correction2-road-oblique-1920x945-dpr1.png` | AVAILABLE, correction-2 oblique 1920×945 |
| `evidence/gate2-correction2-roads-public-realm.png` | AVAILABLE, unmodified public-realm crop |
| `evidence/gate2-correction2-roads-public-realm-inspection-brightened.png` | AVAILABLE, derived inspection-only brightness aid |
| `evidence/gate2-correction2-runtime.json` | AVAILABLE, shared-extent/runtime/check facts |
| `evidence/gate2-correction3-city-exact-1920x945-dpr1.png` | AVAILABLE, correction-3 exact 1920×945 |
| `evidence/gate2-correction3-road-oblique-1920x945-dpr1.png` | AVAILABLE, correction-3 oblique 1920×945 |
| `evidence/gate2-correction3-runtime.json` | AVAILABLE, island geometry-to-extent assertion/runtime facts |
| `evidence/gate2-correction4-assertion.json` | AVAILABLE, field-level positive assertion and eight negative mutation cases |
| Current screenshot supplied by user | AVAILABLE |
| Target-quality reference supplied by user | AVAILABLE |
