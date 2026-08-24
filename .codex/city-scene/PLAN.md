# Interactive 3D City — gated execution plan

Status: `GATE 5 — IN PROGRESS`

## Workflow

| Gate | Scope | Entry condition | Exit condition | Status |
|---|---|---|---|---|
| 0 | Materials, isolated baseline, performance baseline, source/system audit, architecture decision | Full brief/source/images available | Required evidence complete; source audit/replacement list; independent VISUAL + TECH PASS | PASS |
| 1 | Deterministic grey composition blockout | GATE 0 PASS | VISUAL + TECH PASS; QA camera/seed frozen | PASS |
| 2 | 5–7 architecture families and physical road/public-realm geometry | GATE 1 PASS | VISUAL + TECH PASS | PASS |

## GATE 2 independent review result

Both independent reviewers returned `FAIL`. The user explicitly authorized correction pass 1. GATE 3 remains locked.

Merged correction scope for a future user-authorized GATE 2 retry:

1. Restore the two GATE 1-frozen footprints changed at `(0.25, 1.25)` and `(-1.55, -1.35)`; adapt graph/geometry around the accepted masterplan and rerun clearance evidence.
2. Remove the legacy `ROAD_ROUTE_POINTS` / CatmullRom / hard-coded junction / old road-builder topology owner from production, or derive every compatibility view exclusively from `spatialCityRoadGraph.js`.
3. Materialize both entry and exit tangent connectors as physical road geometry; validate attachment to approaches/annulus.
4. Extend topology validation to all produced edge, entry, exit and circulation segments; allow only declared joins; verify tangency for both entry and exit.
5. Raise neutral graphite material/fill readability so every family, base/main/setback/roof/technical layer and structural rhythm is visually provable without windows, emissive facades or Bloom.
6. Separate body/glass/podium/roof values and response; strengthen horizontal podiums, setbacks, articulated tops and elongated forms while preserving the frozen footprints.
7. Make road slabs, curbs, sidewalks, plazas, roundabout circulation/island and at least three tangent approaches physically legible at the QA view; add top/oblique debug evidence.
8. Preserve left safe zone, selected hierarchy, protected highway/crane, global chrome, camera/seed, allWarm lifecycle and GATE 2-only scope.

GATE 3 remains locked.

## GATE 2 correction pass 1 re-review result

Both reviewers returned `FAIL` on one remaining hard geometry conflict. All earlier GATE 2 source/topology and visual-readability blockers passed.

Architecture diagnosis required by the second-failure rule:

- The current clearance contract validates rotated building footprints against centerline corridors only.
- `spatialCityRoadGeometry.js` can create wider explicit physical extents—currently the junction disk radius `0.48`—that are not represented in that contract.
- Building ID `6` at `(-4.75, 2.75)` overlaps the `top-2` junction disk at `(-5.7, 3.62)` by approximately `0.007485` in XZ and also overlaps it vertically.
- Darkness/materials are no longer the blocker; hiding the conflict visually is forbidden.

Required correction-pass-2 architecture:

1. Introduce one pure physical public-realm extent model owned by the road system: road ribbons, sidewalk/curb envelopes, explicit junction patches, entry/exit connectors, roundabout circulation and island extents.
2. Consume that same extent model in both renderer and building-clearance validation; do not duplicate numeric junction radii in validation.
3. Preserve the frozen building footprint. Reshape/reduce/union the `top-2` junction patch around the road arms instead of moving ID 6.
4. Validate positive clearance against every rendered physical extent and expose the closest pair/signed clearance in evidence.
5. Recapture only the affected road/public-realm evidence plus exact QA still; preserve all correction-1 visual passes and protected systems.

The user explicitly authorized correction pass 2. GATE 3 remains locked.

## GATE 2 correction pass 2 implementation

- One pure `SPATIAL_CITY_ROAD_EXTENT_MODEL` now owns all 108 rendered physical public-realm extents and is consumed by both geometry construction and building-clearance validation.
- The frozen 45-row masterplan is unchanged (`SHA-256 56f8f9534957e889f2afba3bc335f40bc1a2a1c7ca2641ded68042ca75c439d2`); building ID `6` remains at `(-4.75, 2.75)`.
- Eight topology-derived junction arm polygons replace the oversized junction disks. The `top-2` patch is explicitly identified as `compact-road-arm-patch`.
- Full physical-extent validation reports `conflicts=0`; minimum signed clearance is `0.0435196714` against epsilon `0.035`; ID 6 to `top-2` signed clearance is `0.1873593361`.
- All 39 physical centerlines are mapped, all eight junctions are watertight, renderer/model extent counts match, and the road-graph checks remain clean.
- Scoped architecture + roads remain at 16 calls and decrease to 6,632 triangles. Targeted ESLint and production build pass.
- Exact, oblique, public-realm crop and runtime evidence were refreshed. The inspection-brightened crop is explicitly a derived visibility aid, not the canonical render.

## GATE 2 correction pass 2 — independent verdicts

| Reviewer | Verdict | Accepted | Remaining blocker |
|---|---|---|---|
| TECH REVIEWER | FAIL | Pure extent owner; 108-item inventory; independently reproduced clearances/hash/counts/topology; frozen masterplan; junction mapping; lifecycle/protected scope; budgets/checks | Roundabout island is validated as radius `0.17`, but renderer uses a tapered cylinder whose bottom radius is `0.1751`. Count equality does not prove geometric equality. |
| VISUAL REVIEWER | PASS | ID6/top-2 fix; road-arm continuity; roundabout/readable public realm; six families; hierarchy; safe zone; protected highway/crane; global chrome; no visible geometry conflict | None visually. |

GATE 2 does not pass because dual independent `PASS` is required. A future user-authorized correction must make the island's rendered and validated footprint identical (equal cylinder radii, or explicit maximum physical radius in the model plus an assertion). GATE 3 remains locked and has not started.

The user authorized continuation. Correction pass 3 is limited to the exact roundabout-island renderer/extent mismatch, a geometry-to-extent assertion, proportional checks/evidence, and independent re-review. GATE 3 remains locked.

## GATE 2 correction pass 3 implementation

- Only `spatialCityRoadGeometry.js` changed: the island cylinder now has equal top/bottom radii.
- A build-time geometry-to-extent assertion reads actual `CylinderGeometry.parameters`, mesh scale and position before mount.
- Extent/render match: top radius `0.17`, bottom radius `0.17`, maximum radius `0.17`, Y range `[0, 0.095]`; assertion `true`.
- Full extent/clearance/topology checks remain clean; frozen 45-row hash remains unchanged; scoped budget stays 16 calls / 6,632 triangles.
- Targeted ESLint and production build pass. Exact/oblique/runtime evidence was refreshed at the frozen viewport; loopback preview and isolated browser are stopped.

## GATE 2 correction pass 3 — independent verdicts

| Reviewer | Verdict | Accepted | Remaining blocker |
|---|---|---|---|
| TECH REVIEWER | FAIL | Actual island geometry now exactly matches the modeled circle and Y range; extents/clearance/hash/graph/scope/lifecycle/budgets/checks pass | The regression assertion collapses X/Z scale with `Math.max`, so an ellipse `0.16×0.17` can pass, and it does not verify the rendered XZ center against the extent center. |
| VISUAL REVIEWER | PASS | Island/circulation/entries/exits; ID6/top-2; road continuity; six families/hierarchy; safe zone; protected highway/crane; chrome; no hard visible deviations | None visually. |

GATE 2 still lacks dual `PASS`. A future user-authorized correction must compare top/bottom radii independently on X and Z and compare mesh XZ position with the extent center, including negative tests. GATE 3 remains locked and has not started.

The user authorized continuation. Correction pass 4 is strictly limited to completing the island geometry-to-extent regression assertion and its independent negative cases; no visible scene work or GATE 3 scope is authorized.

## GATE 2 correction pass 4 implementation

- Only `spatialCityRoadGeometry.js` changed; rendered geometry and visible scene output are unchanged from correction pass 3.
- The assertion now compares top/bottom radii independently on X and Z, the XZ center, and the Y range using actual geometry parameters and mesh transform.
- Positive case passes. Eight deterministic negative mutations are all rejected with the expected failed fields: both anisotropic scale directions, X shift, Z shift, top radius, bottom radius, height and Y shift.
- The mutation guard executes during road-system preparation and throws if any negative case is missed.
- Extent/clearance/topology/frozen/budget invariants, targeted ESLint and production build remain clean.
- Assertion evidence is recorded in `evidence/gate2-correction4-assertion.json`; correction-3 visual evidence is reused because pass 4 has no visible production change. No browser/server was started.

## GATE 2 correction pass 4 — independent verdicts

| Reviewer | Verdict | Independent acceptance evidence |
|---|---|---|
| TECH REVIEWER | PASS | Independently reproduced actual island radii/Y range, all eight field assertions, positive case and eight negative mutations; verified immutable production mesh, 108 extents, clearance/hash/graph, lifecycle, budgets, lint/build and protected scope. |
| VISUAL REVIEWER | PASS | Confirmed assertion-only scope preserves the accepted island/circulation/connectors, ID6/top-2 clearance, public realm, six families, hierarchy, safe zone, protected highway/crane, chrome and absence of hard visible deviations. |

GATE 2 is accepted with dual independent `PASS`. The frozen GATE 2 state includes the 45-row masterplan hash, single road graph/extent ownership, six architecture families, physical public realm, exact island geometry assertion and mandatory mutation matrix. GATE 3 remains locked until explicit user authorization.
| 3 | Stable procedural facades/windows and distance LOD | GATE 2 PASS | Static/distant/motion evidence; VISUAL + TECH PASS | CORRECTION PASS 1 IN PROGRESS |
| 4 | Directed lane graph, conflict-safe roundabouts, thin-line light flows | GATE 3 PASS | TECH graph PASS first, then VISUAL PASS | PASS |
| 5 | Remove old city card/points; anchored markers + one glass DOM HUD | GATE 4 PASS | Complete desktop/touch/occlusion/placement evidence; both PASS | IN PROGRESS |
| 6 | Final light, depth, bloom hierarchy, interaction/transition regression | GATE 5 PASS | Both PASS and no protected/global regressions | LOCKED |
| 7 | Three final performance runs, final visual score, evidence handoff | GATE 6 PASS | Both PASS; ≥90/100; performance thresholds met | LOCKED |

## GATE 3 active scope

1. Remove the old unstable facade/window runtime path rather than layering a second system over it.
2. Create `spatialCityFacadeMaterial.js` as the sole facade owner: integrated procedural near/mid facades with world-space floor/bay metrics, independent front/side counts, derivative antialiasing, and no coplanar window planes or per-window resources.
3. Add a lower-frequency distant LOD before windows become sub-pixel, with a stable crossfade and no visible pop.
4. Keep lighting grouped and restrained: many dark floors, mostly neutral white, sparse warm, rare cool; no television-noise random blinking.
5. Build/compile/warm once under the existing preloader path; runtime may update only retained uniforms. No ordinary post-Start mesh/material/texture/program allocation.
6. Preserve the frozen GATE 2 plan, road/public-realm geometry, highway/crane, camera/seed, global chrome and transition lifecycle.
7. Produce fixed-view close-up, distant view and at least 10 seconds of slow-camera motion, plus source/runtime metrics proving zero per-window meshes/lights/draw calls and no z-fighting/LOD concealment tricks.

GATE 4 remains locked.

## GATE 3 implementation and evidence

- Added `spatialCityFacadeMaterial.js` as the sole active facade owner and integrated it into the retained GATE 2 architecture batches.
- Removed the active hidden legacy facade mesh/material allocation, its seven attributes, hover uniform updates and hidden-building raycaster path from runtime.
- Facades cover 45/45 buildings through 3 existing batches / 147 parts with zero per-window meshes, lights, textures or added draw calls.
- World-space floor/front/side pitches are computed from final part dimensions; side counts are independent; centered margins and `fwidth` AA prevent edge stretching/clipping.
- Near/mid and grouped far LOD use smooth distance plus derivative blending with no hard switch or time-dependent noise. An initial capture exposed oversized far apertures; a shader-only tuning pass moved LOD to `18→34`, reduced grouped aperture/energy/density and preserved budgets.
- Architecture + roads remain 16 calls / 6,632 triangles; frozen plan/hash, roads/extents, protected highway/crane, camera/seed, chrome and transition lifecycle remain unchanged.
- Canonical evidence includes distant and close-up stills, a 17.16-second slow-camera WebM, a 15.22-second four-frame sequence, before/after tuning comparison and runtime/source metrics. Browser console has no errors; fixed-view probe is 74.80 FPS with p95 13.4 ms.
- Loopback preview and both isolated capture profiles are stopped.

Independent TECH and VISUAL review is active. GATE 4 remains locked.

## GATE 3 independent verdicts

| Reviewer | Verdict | Accepted | Blocking findings |
|---|---|---|---|
| TECH REVIEWER | FAIL | Legacy runtime removal; sole owner; zero per-window resources; aligned attributes/coverage; detailed grid; transforms/AA; continuous opacity LOD; lifecycle/allWarm; compile/runtime evidence; frozen budgets/invariants | Far grouped grid clips incomplete edge groups on odd bay/floor counts (104 lit clipped cells across 33/45 buildings); hard-coded `edgeWindowStretchCount=0` is not validated. LOD-interpolated hash is thresholded for warm/cool, creating discrete colour crossings/pop. |
| VISUAL REVIEWER | FAIL | No evident z-fighting/moiré; palette; six families/hierarchy; roads/protected/chrome | Floor/bay rhythm is not convincingly visible; windows remain too sparse, large and billboard-like; side independence is only partial; edge clipping and no-pop behaviour are not proven; motion evidence is too sparse for hard stability acceptance. |

### Deduplicated GATE 3 correction scope

1. Give the far grouped LOD its own integer group counts and centered margins; mask incomplete edge groups rather than clipping them. Add an exhaustive validator over every facade part/orientation and report real edge coverage.
2. Classify grouped and detailed endpoint colours independently, then blend complete colour-energy contributions continuously. Never apply a hard warm/cool threshold to an LOD-interpolated hash.
3. Rework facade rhythm without changing frozen massing: smaller architectural apertures, clear floor/bay cadence, restrained shader reveals/frames and deterministic floor/section grouping. Increase modular readability while keeping most cells dark and avoiding billboard blocks.
4. Preserve zero per-window resources, three retained facade batches, budgets, allWarm lifecycle and every frozen/protected GATE 2 invariant.
5. Re-capture dedicated grazing front/side edge close-ups for at least three families, close/distant stills, a continuous slow approach/retreat WebM and a denser frame strip that can prove no clipping, flicker, moiré or LOD colour/opacity pop.

GATE 4 remains locked. GATE 3 correction pass 1 requires explicit user authorization.

The user authorized GATE 3 correction pass 1. The merged correction scope above is active; GATE 4 remains locked.

## GATE 3 correction pass 1 implementation and evidence

- The far LOD now has independent integer group counts, centered margins, and explicit masking of 492 incomplete 2×2 edge cells. The exhaustive physical-face audit covers 147 parts / 588 face directions / 4,041 aperture rectangles and reports zero clips, overlaps, or stretched edge cells.
- Detailed and grouped light colours are classified at their endpoints. The shader linearly blends complete RGB-energy contributions; 2,352 cases × 16 samples report zero continuity failures and zero interpolated-hash thresholds.
- Facade cells now include deterministic glass recess, restrained frame/reveal, floor and bay seams, family-specific apertures, and stable panel variation. Detailed/grouped lit density is 29.93% / 30.12%; roughly 70% remain dark. Neutral light dominates, with sparse warm and rare cool accents.
- The sole facade owner still covers 45/45 buildings in three retained batches, with zero per-window meshes, lights, textures, texture uniforms, or added draws. Architecture + roads remain 16 calls / 6,632 triangles.
- Frozen camera, seed, 45-row masterplan hash, road graph/extents/clearance, protected highway/crane, global chrome and allWarm lifecycle remain unchanged. Facade validators, targeted ESLint and production build pass.
- Canonical correction evidence: distant/central/rear/office-edge/civic-edge/oblique stills, a 21-second slow-orbit-and-return WebM, ten dense frames over 16.508 seconds, and `evidence/gate3-correction1-runtime.json`.
- The isolated preview and capture profiles are stopped. TECH and VISUAL independent re-review is active. GATE 4 remains locked.

## GATE 3 correction pass 1 — independent verdicts

| Reviewer | Verdict | Accepted | Remaining blocker |
|---|---|---|---|
| TECH REVIEWER | PASS | Independent grouped-grid bounds/masking, validator-shader parity, continuous endpoint RGB-energy LOD, packed attributes, sole facade owner/resources, lifecycle/allWarm, frozen G2, protected scope, budgets and checks | None technical. |
| VISUAL REVIEWER | FAIL | Edge clipping/stretch, motion/LOD/surface stability, restrained palette, six silhouettes/hierarchy, frozen roads/highway/crane/chrome | Facades remain visually sparse graphite monoliths with isolated luminous dashes; floor/bay/section rhythm, family-specific layouts, front/side differentiation and non-toy material depth are not convincing. |

### Required second-failure architecture correction

The occupancy metric counts logical endpoints rather than projected visible facade pixels. Current lit apertures cover only about 3.4% of a cell in common office profiles, so 30% logical occupancy produces roughly 1% luminous facade area. Dark recesses cover only 10–12%, leaving most pixels as one graphite plane. Coarse pitches leave small masses with 1–3 bays; front/side profiles differ mainly by pitch; part-relative distance LOD groups small podium/setback parts too early; flat colour masks cannot communicate inset glass or material depth.

Correction pass 2, if explicitly authorized, is limited to the facade owner and aggregate QA metrics:

1. Introduce distinct front/side profiles for all six families, with smaller world-space pitches and measurable bay/floor minima at the frozen camera.
2. Build each shader cell from broad dark glass, analytic inset/reveal, mullions, spandrel/floor band, small luminous aperture and analytic normal/bevel response—still integrated, with no facade planes or per-window resources.
3. Target dark-glass area 32–55%, total cadence coverage 55–75%, luminous aperture area 6–12% of a lit cell, projected lit coverage 2.5–5.5%, and at least 68% dark cells.
4. Replace part-relative distance grouping with derivative screen-cell LOD: smooth transition around 1.4–3.0 pixels per cell; preserve stable endpoint IDs and linear contribution blending.
5. Add projected-area-weighted occupancy/cell-pixel metrics; require dominant fronts with at least 3 bays, selected tower 4–6 bays and 20+ floors, office/civic 4–8 bays, at least 90% usable main-volume orientations with 2×2 cells, and at least 20% front/side profile divergence for five of six families.
6. Preserve edge clips/overlaps/stretch `0`, continuity failures `0`, 16 calls / 6,632 triangles, zero per-window resources, frozen G2, protected elements and allWarm.

GATE 3 remains failed. GATE 4 is locked. No correction-pass-2 production work is authorized yet.

The user authorized GATE 3 correction pass 2. Implementation is active only for the recorded facade-owner and aggregate-QA scope. GATE 4 remains locked.

## GATE 3 correction pass 2 implementation and evidence

- Six front/side facade profiles now own separate pitch, glass/light proportions, mullions, spandrels and section rhythm. The frozen selected tower resolves to 4×23 cells; all office/civic dominant fronts have 4–8 bays; all 134 usable main orientations meet at least 2×2 cells.
- The integrated shader uses broad dark glass, analytic inset/reveal/bevel, mullions, spandrels, section pauses, panel response and a smaller luminous aperture. There are still no facade planes, per-window resources, texture uniforms, added draws or geometry.
- LOD is derivative screen-cell based: grouped below 1.4 px/cell, detailed above 3 px/cell, with independent stable endpoints and linear colour-energy blending.
- The exhaustive audit covers 4,674 cells / 16,515 rectangles; 519 incomplete groups are masked; clips/overlaps/stretch and 7,686 continuity failures are all zero.
- Projected QA at the frozen camera: dark glass 46.691%, cadence 73.245%, detailed/grouped visible light 2.951%/2.904%, about 70% dark cells, controlled neutral/warm/cool palette; all acceptance targets pass.
- Frozen G2/protected/allWarm/budget invariants remain unchanged. Validators, targeted ESLint and production build pass.
- Canonical evidence includes 1920×945 DPR1 distant/return/oblique stills, central/rear and office/civic edge close-ups, ten full-resolution motion frames and a 60-frame 14.195-second animated motion artifact. The loopback preview and isolated browser are stopped.

Independent TECH and VISUAL re-review is active. GATE 4 remains locked.

## GATE 3 correction pass 3 — final independent verdicts

| Reviewer | Verdict | Independent acceptance |
|---|---|---|
| TECH REVIEWER | PASS | Four-corner viewport-clipped projection and all negative cases; exclusive clipped-area weights; exact CPU/shader cadence; continuous LOD/palette; facade topology/resources/lifecycle; frozen/protected/budgets/checks; correction-3 hardware probe 75.0068 FPS, p95 13.4 ms, zero frames over 25 ms. |
| VISUAL REVIEWER | PASS | Floor/bay/section cadence; dark-glass readability; six family languages; front/side independence; non-toy depth; palette/grouping; edge stability; 16-second motion/LOD stability; hierarchy and protected/global pixels. |

GATE 3 is accepted with dual independent `PASS`. Its frozen state includes the integrated procedural facade owner, six front/side profiles, derivative screen-cell LOD, exact viewport-clipped projected QA, shader-parity cadence masks, zero per-window resources, preserved allWarm lifecycle and the correction-3 canonical evidence. GATE 4 remains locked until explicit user authorization.

The user authorized GATE 4. Implementation is active only for the shared directed lane model, conflict-safe scheduler and local thin-line light fragments. GATE 5 remains locked.

## GATE 4 implementation and source validation

- `spatialCityRoadGraph.js` now owns 14 directed route tables, 10 roundabout traversals, four exit choices, nine conflict zones and debug lane/direction/connector data, all derived from the canonical physical centerlines.
- New `spatialCityTraffic.js` owns a deterministic ordered scheduler, exclusive reservations, fog-hidden route staging, a two-call instanced capsule renderer and source/debug validators. `SpatialCityWorld.js` only constructs, updates and exposes metrics; two dead legacy local-flow references were removed.
- A 45-second / 2,700-step simulation with 20 fragments completes 33 trips, uses three exits, observes a 0.2 minimum gap and reports zero spacing, ordering, conflict, teleport, visible-spawn or visible-despawn violations.
- QA projection reports 4.043–9.138 px length, 0.650–1.171 px core and 1.734–3.124 px halo. The shader has symmetric soft ends and no taper, head/tail, comet or block path.
- Normal runtime adds two instanced calls / 80 triangles and zero per-fragment resources. `?cityTrafficDebug=1` prepares the lane/arrow/connector/arc/conflict debug batches only in QA mode.
- Protected highway traffic remains 620 and unchanged; G2/G3, crane, camera/seed/chrome/transitions/allWarm are preserved. Source validators, targeted ESLint and production build pass.

Independent TECH graph review is active. VISUAL review and GATE 5 remain locked until TECH `PASS`.

## GATE 4 TECH graph verdict

TECH REVIEWER returned `FAIL`. Accepted: single graph ownership, route geometry/tangency/corner checks, restricted canonical simulation facts, symmetric capsule shape, two-call instanced renderer, allWarm lifecycle, frozen/protected scope and checks.

Blocking findings:

1. Production assignments use only routes `{0,1,2,5,6,10}` and every roundabout fragment enters from the west. The restricted scenario avoids competing entries. An all-route mixed-entry simulation deadlocks: four trips/two exits in 45 seconds, 16/20 fragments never complete and one reservation remains held for more than 34 seconds (more than 109 seconds in a 120-second stress run).
2. The validator does not assert bounded wait/reservation time, per-fragment completion, deadlock or starvation. Runtime must exercise multiple entry approaches and representative exit choices.
3. Projected halo is 1.734–3.124 px, outside the 2–3 px target, and the projection validator does not enforce length/core/halo bounds.
4. `SPATIAL_CITY_TRAFFIC_DEBUG_MODEL` is eagerly allocated at module load despite query-gated debug geometry, so normal runtime debug allocations are not zero.

### GATE 4 correction pass 1 scope

If explicitly authorized:

- replace the whole-roundabout reservation/deadlocking stop logic with conflict regions/stop lines and deterministic priority that guarantees a reservation owner a clear exit;
- mount and validate representative mixed entry approaches, all graph-level exit choices and at least three completed exits;
- add 45-second and longer stress assertions for maximum wait/reservation duration, every-fragment progress/completion, deadlock and starvation;
- lazily build every debug table/geometry only inside `cityTrafficDebug=1`;
- make length/core/halo projection bounds executable acceptance tests and tune/compensate foreshortening to 4–10 / approximately 1 / 2–3 px;
- preserve the accepted graph geometry, two-call instancing, protected highway, frozen G2/G3 and allWarm; rerun TECH before any VISUAL capture.

GATE 4 remains failed. VISUAL review and GATE 5 are locked. Correction pass 1 is not authorized yet.

The user authorized GATE 4 correction pass 1. Work is limited to mixed-entry scheduler liveness, lazy debug ownership and executable projection bounds. VISUAL review and GATE 5 remain locked until TECH `PASS`.

### GATE 4 correction pass 1 — independent TECH verdict

TECH REVIEWER returned `FAIL`. Runtime behavior itself passed canonical 45 s and 120 s mixed-entry runs plus reversed-priority and simultaneous-spawn adversarial runs. The remaining blocker is acceptance independence: the minimum-gap validator shares the mutable scheduler constant, and FIFO / clear-exit guarantees are not mutation-resistant or covered by constructed contention tests. The canonical source ledger is also stale.

The user's instruction to continue authorizes correction pass 2. Scope is restricted to immutable acceptance thresholds, FIFO request/grant-order evidence, constructed smallest-ticket and blocked-exit tests, negative bypass mutations, ledger regeneration, lint/build and a new independent TECH review. VISUAL review and GATE 5 remain locked until TECH `PASS`.

The user subsequently granted standing authorization to continue without further confirmations until the complete gated task is finished. Gate order and independent TECH/VISUAL exit criteria remain mandatory; later gates unlock automatically only after the preceding gate passes.

### GATE 4 correction pass 2 — architecture diagnosis after repeat TECH FAIL

Runtime scheduling, liveness, immutable gap acceptance, telemetry, projection, resources and protected scope pass. The repeat failure is isolated to constructed policy tests that bypass the production decision path: blocked-exit supplies literal booleans, while FIFO contention hard-codes a single expected owner/ticket. This permits malicious policy mutations to pass the QA helper even though production would regress.

Correction pass 3 is automatically authorized by the user's standing instruction. Architectural rule: production reservation eligibility/grant policy has one callable owner used by both runtime and constructed QA; tests create real route/state blockers and issue real reservation requests through that owner. Expected FIFO winner is derived from request data/telemetry, and at least two permutations must produce different winners. Mutating the real exit-clear detector or a winner-specific policy must fail. No other scheduler, renderer, graph, facade, protected or visual scope may change. VISUAL review remains locked pending TECH `PASS`.

### GATE 4 correction pass 3 — independent TECH verdict

TECH REVIEWER returned `FAIL` on one remaining parity seam: the production wrapper still accepts an injectable policy, so the runtime call site can be mutated independently from the positive blocked-exit QA call while descriptive parity counters remain true. Real blocker geometry, derived FIFO permutations and all runtime simulations pass.

Correction pass 4 is automatically authorized. Scope is limited to making the production wrapper non-injectable and permanently bound to the production policy, routing runtime and positive blocked-exit QA through that fixed wrapper, moving negative policy injection to a separate QA-only harness below/outside the wrapper, and adding an enforceable wrapper-call parity/source mutation guard. VISUAL review remains locked.

### GATE 4 correction pass 4 — independent TECH verdict

TECH REVIEWER returned `FAIL` because the new wrapper contract uses `Function.prototype.toString()` with unminified identifiers and whitespace. The Vite build succeeds syntactically, but the minified production bundle makes the contract false and traffic-system creation throws. The fixed source wrapper, real blocked-exit case, FIFO cases and all simulations otherwise pass.

Correction pass 5 is automatically authorized. Remove all source-string/introspection acceptance. Enforce the shared decision boundary with minification-safe private production/test capabilities plus executable counters/invariants; direct owner access without the correct capability must fail. Validate the actual built/minified artifact behavior before TECH review. No visual, graph, renderer or protected scope may change.

### GATE 4 correction pass 5 — independent TECH verdict

TECH REVIEWER: `PASS`. The capability boundary is executable and minification-safe; independent minified-artifact execution creates the real traffic system and passes 45 s / 120 s / adversarial / projection / runtime-boundary validation. All eight negative mutations are caught, normal traffic remains two instanced calls / 80 triangles, and frozen/protected invariants pass. Runtime and VISUAL evidence are now unlocked; GATE 5 remains locked until VISUAL `PASS`.

Runtime/visual evidence captured at 1920×945 DPR 1 on WebGL2 / NVIDIA RTX 3070 Ti. The 15-second isolated probe measured 68.39 FPS average, 15.1 ms p95, 15.7 ms maximum and zero frames over 25 ms; console errors were zero. Normal/debug stills and 15-second normal/debug motion evidence are available. Preview and isolated browser contexts are closed. Independent VISUAL review is active.

### GATE 4 independent VISUAL verdict

VISUAL REVIEWER returned `FAIL`. Local traffic is technically present but practically invisible in the normal canonical still and 15-second crops; its shape and continuous directed motion therefore cannot be visually accepted. Debug conflict rings are visible, while lane directions/connectors/roundabout arcs are too faint. Protected highway, G3 facades, crane and chrome remain accepted.

Correction pass 6 is automatically authorized by the user's standing instruction. Scope is limited to the existing local-traffic core/halo contrast, emissive/opacity and a small road-surface depth offset, plus debug-only line/connector/arc contrast and directional markers. Preserve the accepted 7 px length / 1 px core / 2.7 px halo, two instanced calls / 80 triangles, scheduler/graph/roads, global bloom, protected highway, buildings, crane and chrome. Rerun TECH invariants, then recapture and obtain a new VISUAL verdict.

### GATE 4 visual correction pass 6 — TECH re-check verdict

TECH REVIEWER returned `FAIL` on two acceptance/runtime parity blockers. The shader retains visible additive alpha at full fog while CPU QA classifies NDC-visible endpoints beyond `fogFar` as hidden; staging can therefore pop. The 16-snapshot run currently covers all 14 routes, but acceptance only requires four and does not catch removal of a route. Shape, depth lift, resources, scheduler, debug counts and protected scope pass.

Correction pass 7 is automatically authorized. Use one exact fog visibility envelope in shader and CPU QA that preserves mid-city readability but reaches discard/zero by `fogFar`; add an NDC-visible far-endpoint negative. Require exactly 14/14 route IDs with missing-ID reporting and a one-route-offscreen negative. Preserve pass-6 near/mid colors, geometry, lift, debug, scheduler and protected systems. VISUAL capture remains locked pending TECH `PASS`.

Pass 7 received independent TECH `PASS`. Recaptured exact normal/debug frames and a 15-second normal motion sequence at 1920×945 DPR 1. Hardware probe: 68.54 FPS average, p95 15.2 ms, max 15.6 ms, zero frames over 25 ms, console errors zero. Debug topology is visibly stronger; independent VISUAL re-review is active. Preview and browser contexts are closed.

### GATE 4 pass 7 VISUAL verdict

VISUAL REVIEWER returned `FAIL`. Debug topology contrast is substantially improved, but normal local roads still appear empty and no fragment can be tracked. Exact 7/1/2.7 px dimensions and source coverage do not produce visible pixels. Required normal-view target: at least six simultaneously distinguishable fragments across at least three routes; core approximately 45–60 sRGB levels above adjacent pavement and halo approximately 10–18 levels, without changing geometry or protected highway.

Correction pass 8 is automatically authorized. First diagnose actual pixel contribution, instance orientation and depth/occlusion against pass-7 evidence; then modify only normal local-traffic core/halo output and, if proven necessary, the existing minimal road-relative lift. Preserve exact dimensions, symmetric falloff, routes/scheduler, debug topology, roads, global bloom, buildings and protected systems. TECH and visual recapture remain mandatory.

### GATE 4 visual correction pass 8 — dual independent verdict

TECH REVIEWER: `PASS`. The root cause was a negative per-instance determinant that reversed the `PlaneGeometry` winding while the materials remained `FrontSide`; Three.js cannot flip `frontFace` per `instanceMatrix`. The corrected lateral basis produces positive determinants, preserves position/size/routes/shader energy, and catches the legacy mirrored mutation. All scheduler, capability, projection, fog, resource, build, minified-artifact and protected invariants pass.

VISUAL REVIEWER: `PASS`. Exact normal, crop, 15-second motion, contact-sheet, overlay and debug evidence show readable, trackable cyan-white capsules across central roads, circulation and exits. The fragments retain the approved 7/1/2.7 px symmetric form, remain subordinate to the protected highway, and introduce no visible pop, comet shape, hierarchy regression or performance issue. Current isolated probe: 74.94 FPS average, p95 13.5 ms, one frame over 25 ms, console errors zero.

GATE 4 is accepted with dual independent `PASS`. GATE 5 is automatically active under the user's standing authorization. Scope is limited to physical removal of the old city-specific card/markers/listeners/bridge paths and their replacement with 3–6 anchored hotspots, one reusable glass DOM HUD, imperative ref projection/occlusion/placement, desktop/touch interaction semantics and allWarm-safe retained resources. Global chrome and frozen GATE 1–4 systems remain protected.

## GATE 3 correction pass 2 — independent verdicts

| Reviewer | Verdict | Accepted | Remaining blocker |
|---|---|---|---|
| TECH REVIEWER | FAIL | Six family/front-side profiles and adaptive grids; grouped topology/edge/continuity audit; integrated shader and derivative LOD; packed attributes; sole owner/lifecycle; frozen G2/protected/budgets/checks | Projected area uses `|widthVector|×|heightVector|` instead of real clipped screen-space polygon area, overweighting edge-on/offscreen faces. Cadence acceptance omits section-boundary and grouped mask expansion, hiding real detailed/grouped cadence near 79.31%/77.54%, above the 75% maximum. |
| VISUAL REVIEWER | PASS | Floor/bay/section cadence, visible dark cells, six family languages, front/side independence, non-toy material depth, edge stability, palette/grouping, motion/LOD stability, silhouettes/hierarchy and protected/global invariants | None visual. |

### Deduplicated correction pass 3 scope

If explicitly authorized, correction pass 3 is a narrow QA-parity correction:

1. Project all four corners of each facing facade, compute true screen-space polygon area, clip to the frozen 1920×945 viewport, and use the clipped area for every visible density/coverage/palette weight.
2. Add deterministic negative tests for almost edge-on, wholly offscreen and partially clipped faces.
3. Reproduce actual detailed section-boundary masks and grouped frame/internal-band masks in the CPU cadence audit.
4. Tune section/frame/profile constants only as needed so true detailed and grouped cadence both remain within 55–75%, preserving the already accepted visual language.
5. Regenerate projected metrics/evidence, rerun validators/lint/build and add a same-environment runtime probe because fragment work is richer than correction 1.
6. Preserve zero edge/continuity/resource errors, 16 calls / 6,632 triangles, frozen G2, protected systems and allWarm; recapture only the affected canonical/motion evidence before independent re-review.

GATE 3 remains failed. GATE 4 is locked. Correction pass 3 is not authorized yet.

The user authorized GATE 3 correction pass 3. Work is limited to the recorded QA-parity correction; GATE 4 remains locked.

## GATE 3 correction pass 3 implementation and evidence

- Projected QA now uses all four facing-face corners, shoelace polygon area and Sutherland–Hodgman clipping to the frozen 1920×945 viewport. Unclipped area is 1,051,298.451 px²; clipped visible area is 550,913.988 px²; 232 faces are visible, 9 partial and 53 fully offscreen.
- Deterministic edge-on/offscreen/partial/113→1 weighting negative tests pass.
- CPU cadence exactly mirrors detailed section-boundary and grouped frame/internal-band shader masks. Detailed/grouped cadence is 74.596%/73.358%; frame-only response is 31.236%/38.965%.
- Only grouped classification constants changed visually. True clipped detailed/grouped lit is 28.866%/30.838%, dark 71.134%/69.162%, visible light 2.993%/3.180%, with controlled palette; all targets pass.
- Frozen facade/edge/continuity/resource/G2/protected/allWarm/budget invariants, lint and build remain clean.
- Canonical evidence was refreshed at 1920×945 DPR1: fixed/oblique/return stills, close-ups, ten full-resolution motion frames and 60-frame 16.351-second animated motion. Preview/browser are stopped; no console errors.
- A correction-3 same-environment 10-second hardware probe records 75.0068 FPS, p95 13.4 ms and zero frames over 25 ms versus correction-1 75.0030 FPS; no measurable regression. The loopback server and isolated profile are closed.

Independent TECH and VISUAL re-review is active. GATE 4 remains locked.

## GATE 0 work order

1. Orchestrator verifies all local inputs and creates canonical control documents.
2. Orchestrator starts the user-authorized loopback-only preview and uses only isolated in-app/headless browser contexts.
3. IMPLEMENTER performs a read-only source audit and proposes the concrete replacement architecture/file ownership. Production edits remain forbidden.
4. VISUAL REVIEWER independently checks the isolated baseline at 1920×945 DPR 1 and records composition defects against current/reference.
5. TECH REVIEWER independently verifies isolated hardware/perf feasibility and audits runtime/preloader/lifecycle risks.
6. Orchestrator records baseline camera/seed, screenshot, slow-camera capture, three 30-second baseline runs, system map, and replacement list.
7. Both reviewers issue independent GATE 0 verdicts. Only dual `PASS` unlocks GATE 1.

## Current blocker audit

- Full gated brief: AVAILABLE.
- Original brief: AVAILABLE.
- Current-state screenshot: AVAILABLE.
- Target reference: AVAILABLE.
- Full workspace source: AVAILABLE.
- User-authorized localhost preview: AVAILABLE at `127.0.0.1:4184`, loopback only.
- Hardware-accelerated isolated runtime: VERIFIED, NVIDIA RTX 3070 Ti / Direct3D11.
- Baseline screenshot, slow-camera video, three performance runs: AVAILABLE.

The user explicitly removed the cloud-only blocker and authorized the isolated localhost procedure. GATE 0 received independent `PASS` from both VISUAL REVIEWER and TECH REVIEWER. GATE 1 is unlocked for IMPLEMENTER only; all later gates remain locked.

## Frozen implementation architecture

TECH REVIEWER confirmed the retained single-renderer/allWarm lifecycle and rejected the current monolithic synchronous city build, path-array roads, random traffic, insufficiently isolated highway, and old city-card runtime. The implementation ownership below is frozen before GATE 1.

### Source ownership

- `spatialCityPlan.js`: deterministic `QA_SEED`, district parcels, protected safe zones, building-family parameters, public-realm footprints, interaction-anchor metadata. Pure data; no Three.js allocation.
- `spatialCityArchitecture.js`: staged creation of merged static city masses and instanced repeated modules; 5–7 building families; no facade/window decisions hidden inside placement loops.
- `spatialCityFacadeMaterial.js`: integrated near/mid procedural facade, world-space floors/bays, derivative AA, controlled lighting groups, distance LOD. No window meshes or coplanar shells.
- `spatialCityRoadGraph.js`: directed nodes, road edges, lane centerlines, turn connectors, roundabout arcs, conflict zones, and route tables. Pure deterministic data shared by geometry and traffic.
- `spatialCityRoadGeometry.js`: physical road surfaces, explicit junction/roundabout meshes, curbs, sidewalks, islands, plazas, and parcel edges built only from `spatialCityRoadGraph.js`.
- `spatialCityTraffic.js`: compact instanced/GPU thin-line renderer plus bounded CPU scheduler for ordered lane occupancy, minimum distance, route choice, and conflict reservations.
- `spatialCityProtectedHighway.js`: extracted, frozen owner of the current foreground highway path, deck, materials, uniforms, supports, and traffic. Extraction may change ownership only; matched output is mandatory.
- `spatialCityProtectedCrane.js`: adapter around the borrowed crane clone/material isolation and construction attachment; preserve existing transforms, materials, animation, and borrowed-geometry disposal rules.
- `spatialCityInteractionBridge.js`: small imperative bridge for 3D anchors, visibility/occlusion, selection and DOM refs; no per-frame React state.
- `SpatialCityHud.jsx` plus local module: one reusable glass panel, marker hit targets/connectors, touch bottom sheet, and ref-based `translate3d` updates. The current old card implementation is replaced, not layered underneath.
- `SpatialCityWorld.js`: orchestration/lifecycle facade only: prepare chunks, attach prepared groups, update uniforms/dynamic systems, resize, interaction delegation, and dispose. It must stop owning all generators in one file.
- `spatialCityQaMetrics.js` (development-only, tree-shaken or explicit QA flag): frame-interval/CPU/GPU-query collection, renderer stats, traffic counts, environment/GPU facts, and deterministic evidence metadata. It must not run in ordinary production sessions.

### Chunked preloader preparation

1. Pure deterministic plan and graph generation.
2. Protected highway/crane ownership isolation with identical output.
3. City blockout/static architecture batches.
4. Public-realm and physical road batches.
5. Facade material/LOD and traffic buffers.
6. Interaction anchors/HUD resources.
7. Between each material batch or substantial geometry batch, yield through the existing preloader breath mechanism.
8. Resolve the city `readyPromise` only after all resources exist; then allow existing `warmupPrograms`, real capability variant draws, bloom/compositor dry run, and hex-pair warmup.
9. After Start, ordinary scroll/hex/hover/selection may update only transforms, uniforms, visibility, lane state, and DOM transforms.

### Traffic scheduler

- Every fragment owns a complete directed route and current lane-relative distance.
- Lane occupancy remains ordered; integration clamps progress to the predecessor minus required world-space gap.
- Junction/roundabout conflict zones use bounded reservations with deterministic priority and release on exit.
- Route choice happens before entry to a connector; fragments cannot change path mid-junction.
- Shader receives route sample/segment, distance, lane offset, and appearance attributes. Geometry is constant-width with symmetric soft ends; no head/tail computation.

### Initial measurable budgets

The same-environment GATE 0 baseline is 62.36 draw calls/frame, 296,535 triangles/frame, and 920 traffic fragments (300 mutable local-road + 620 protected-highway). Working budgets for later gates are:

- target ≤69 draw calls/frame and ≤326,200 triangles/frame at the fixed QA view unless a reviewer approves an evidence-backed tradeoff;
- keep the protected 620 highway fragments unchanged; local directed traffic starts at 300 and may change only with recorded visible-count/performance evidence;

- zero per-window meshes/lights/draw calls;
- zero per-traffic-fragment meshes;
- one reusable DOM panel;
- no per-frame React render from projected anchors;
- no geometry/material/texture/program allocation after Start;
- no additional full-screen postprocess pass for city hierarchy;
- no performance acceptance without the three fixed 30-second isolated-browser runs and raw environment/renderer/count evidence.

## Gate correction protocol

- Findings are merged into one prioritized list: P0 hard fail/blocker, P1 gate criterion, P2 polish.
- IMPLEMENTER resolves the full list in one pass; reviewers re-check independently.
- Second failure at one gate triggers architecture diagnosis and plan revision before more code.

## GATE 1 independent review result

Both reviewers returned `FAIL`. The user explicitly authorized the first correction pass. GATE 2 remains locked.

Merged correction scope for a future user-authorized GATE 1 retry:

1. Replace center-distance road rejection with rotated-footprint-aware clearance against the local road-bed corridor, including `ROAD_BED_HALF_WIDTH` and epsilon; resolve all four measured incursions and recapture evidence.
2. Raise neutral matte-grey blockout readability, especially for rear/peripheral masses, without enabling windows, city bloom noise, or final materials.
3. Strengthen district grouping: connected low/wide podium groups, denser active midground quarter, balanced rear business cluster, controlled peripheral gaps.
4. Make the muted physical road/parcel skeleton legible in the comparison still so conflicts can be visually audited; keep local traffic and neon decoration off.
5. Preserve the accepted left safe zone, selected-tower hierarchy, protected highway/crane output, global chrome, deterministic camera/seed and GATE 1-only scope.

Historical state after the first review: GATE 2 remained locked and `QA_CAMERA` / `QA_SEED` were not yet frozen because GATE 1 had not passed.

Correction pass 1 subsequently received independent `PASS` from both TECH REVIEWER and VISUAL REVIEWER. The current canonical state is:

- `QA_CAMERA`: position `(11.9, 7.35, 14.3)`, target `(-1.35, -0.62, -0.2)`, FOV `39`;
- `QA_SEED`: `0xD1617A1`;
- GATE 1: `PASS`;
- GATE 2: `IN PROGRESS`, explicitly authorized by the user.
