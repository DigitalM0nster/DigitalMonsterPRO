# Interactive 3D City — canonical specification

Status: `GATE 5 — IN PROGRESS`  
Created: 2026-08-13  
Owner: Orchestrator

This document is the sole source of truth for the city-scene task. It consolidates the original brief, the final gated brief, the current-state screenshot, and the target-quality reference. When they conflict, the final gated brief wins.

## Inputs

- Final gated brief: `C:/Users/psych/OneDrive/Рабочий стол/codex-3d-city-hud-task-final.txt`
- Original brief: `C:/Users/psych/.codex/attachments/3d2ff7e1-5728-49e3-b157-37ae048f5a36/pasted-text.txt`
- Current-state screenshot: `C:/Users/psych/AppData/Local/Temp/codex-clipboard-b33e99f7-174d-4d25-9d01-06ae477a0d2c.png`
- Target-quality reference: `C:/Users/psych/OneDrive/Изображения/Картинки/DIGITAL MONSTER/Возможности/3.png`
- Source workspace: `C:/websites/develope/DigitalMonsterPRO`
- Required validation surface: user-authorized isolated localhost preview bound only to `127.0.0.1`, using the Codex in-app browser or a Playwright-owned headless profile. Ordinary user browsers/profiles/tabs/cookies are forbidden. External bind, publication, and deployment remain forbidden.

## Roles and ownership

- Orchestrator owns only `.codex/city-scene/SPEC.md`, `PLAN.md`, `QA.md`, evidence coordination, gate decisions, issue deduplication, and final acceptance.
- IMPLEMENTER is the only role allowed to modify production code.
- VISUAL REVIEWER is read-only and independently judges visual evidence against this spec and the reference.
- TECH REVIEWER is read-only and independently judges architecture, runtime correctness, source removal, and performance.
- Exactly these three subagents are used. No reviewer may approve their own implementation.
- No production change begins until GATE 0 is complete. Every later gate needs independent `PASS` from both reviewers before advancing.
- Reviewer reports begin with exactly `PASS`, `FAIL`, or `BLOCKED` and include a table: point, status, evidence, deviation, required fix.

## Product goal

Replace the toy-like collection of procedural boxes with a coherent, premium, large-scale futuristic architectural masterplan. The city must have legible districts, architectural variety, believable scale, stable facades, a physically coherent road network, restrained futuristic traffic-light flows, controlled selective glow, atmospheric depth, and an elegant city-specific interactive HUD.

The reference is a quality and composition guide, not a literal layout or HTML template. Preserve the current page-wide HTML composition, copy, left menu, top HUD, right arc navigation, scrolling, and scene transitions.

## Protected elements

The following must be visually and functionally unchanged before/after:

1. The large glowing foreground highway: geometry, position, scale, material, glow, animation, and screen placement.
2. The crane and its construction assembly: geometry, transforms, material, animation, and composition placement.
3. Existing global page HTML and chrome, route/scroll/hex-transition mechanics, and non-city interactions.

If protected elements share generators, materials, or shaders with mutable city systems, isolate them before changing the shared system. Final evidence must explicitly confirm that highway and crane are unchanged.

## Deliberate overrides of the original brief

- The original city information card and original city interaction points must be physically removed/disabled at runtime and replaced by the GATE 5 glass HUD and anchored hotspots below.
- Local-road traffic is not a comet, dash, droplet, tapered streak, or head/tail pulse. It is a tiny thin-line fragment with nearly constant width and symmetric soft ends as defined in GATE 4.

## Runtime and preloader architecture

- Preserve the imperative Three.js owner and existing scene lifecycle.
- Static deterministic city resources are built under the preloader curtain and retained; runtime ordinary motion/hover/selection must not allocate, dispose, or rebuild meshes, materials, textures, render targets, or programs.
- Prefer merged static geometry for unique static forms, `InstancedMesh`/instanced buffers for true repeated modules, shared materials, procedural/compact facade data, and distance LOD.
- Runtime work is limited to dynamic transforms, uniforms, lane state, interaction state, visibility, and bounded DOM transforms.
- No mesh, draw call, light, or high-cost material per window or per traffic fragment.
- No sustained idle full-scene keepalive for an inactive scene.
- New resources participate in `readyPromise`, warm scene draws, program warmup, and disposal contracts.
- Maintain deterministic seed and camera for all comparison evidence.

## GATE 0 — baseline and source audit

Required before production changes:

1. Open the current scene in the user-authorized isolated localhost preview.
2. Set viewport to 1920×945 and DPR 1.
3. Record `BASELINE_CAMERA`: position, target, FOV.
4. Record `BASELINE_SEED`.
5. Save a baseline screenshot.
6. Save at least 10 seconds of slow camera movement.
7. Capture baseline performance using the protocol below.
8. Locate and document: city composition/building generator, building archetypes, facade/window generator and LOD, local-road geometry, foreground highway owner, old road-particle system, Bloom/compositor/AA/tone-mapping/color-space/exposure, crane owner, selection/hover/card bridge, route/hex lifecycle, warmup/disposal.
9. List systems that will be physically deleted/replaced rather than cosmetically hidden.
10. Choose the concrete performance architecture and file ownership before coding.

If the authorized isolated preview, browser evidence, current/reference images, full source, or hardware-accelerated environment is unavailable, the gate is `BLOCKED`, never assumed `PASS`.

## GATE 1 — deterministic grey blockout

- Temporarily disable windows, traffic, Bloom, and decorative city HUD 3D.
- Build a deterministic grey blockout that establishes: calm left text safe zone; foreground low/wide/medium blocks; active midground quarter; selected tower; taller rear business cluster; dark dissolving periphery; protected highway; coherent local roads and roundabouts; protected crane.
- Compare from the identical camera with current/reference/final and a 50% overlay.
- Visual acceptance: readable foreground/midground/background; buildings grouped into districts; selected tower hierarchy; reference-like density without copying; left text remains readable; no random uniform box scatter; no building-road conflicts; protected elements match.
- On `PASS`, freeze `QA_CAMERA` and `QA_SEED` for all later gates.

## GATE 2 — architecture and physical roads

### Architecture

- Provide 5–7 recognizable but related archetype families, including at least: podium tower, stepped residential block, elongated office block, vertical-rib tower, low civic/commercial building, and articulated corner/top building.
- Most buildings read as base/podium + main volume + one/two meaningful setbacks + roof/parapet + technical rooftop volume.
- Use facade frames, belts, ribs/panels, structural bays, restrained chamfers, and roof/service details only when they explain construction and floor rhythm.
- Vary silhouette, footprint, height, setback, roof, and facade rhythm; do not merely scale one box on Y.
- Use graphite concrete/composite, restrained architectural glass without heavy transmission, distinct roof/facade/podium materials, moderate roughness, weak reflections, cyan only for functional accents.

### Roads and public realm

- All local roads are physical, dark, constant-width surfaces derived from the same route/lane data used by traffic.
- They follow blocks, never pass through buildings, never randomly cross or overlap, and join through explicit junction or roundabout geometry.
- Add sidewalks, curbs, islands, plazas/parcel boundaries, and convincing building contact with ground.
- Roundabouts have a physical central island, circulation surface, tangent entries/exits, one direction, and at least three connections.
- The elevated/foreground highway keeps its protected geometry and look; where new supporting context is allowed, use credible piers/railings and do not turn it into a toy neon ribbon.
- Forbidden: local-road `TubeGeometry`, coplanar glowing ribbons pretending to be roads, vertical X/Y bends, accidental X crossings, or polygon-offset camouflage for broken topology.

## GATE 3 — facades and windows

- Physically remove/disable the old unstable window/facade system from runtime.
- Do not use separate coplanar window planes, duplicated coplanar shells, or non-uniformly scaled child window grids.
- Generate floors and bays after final dimensions using stable world-space floor/module sizes. Edge windows cannot stretch or clip. Side counts are computed independently.
- Near/mid facades use an integrated procedural facade shader or equivalent physically separated stable facade modules with `fwidth`/derivative antialiasing.
- Distant facades switch to a lower-frequency LOD/emissive mask before windows become sub-pixel. No visible LOD pop.
- Lighting groups are controlled: many dark floors, mostly neutral-white windows, few warm windows, rare cool accents, never television noise.
- Acceptance evidence: static close-up, distant view, and at least 10 seconds of slow camera motion. Any flicker, moiré, z-fighting, stretched floors/windows, or LOD popping is a hard fail.
- Bloom, FXAA, blur, or polygon offset cannot be used to hide broken facade geometry.

## GATE 4 — directed lane graph and thin light flows

### Lane graph

- TECH REVIEWER validates the directed lane graph before VISUAL REVIEWER judges appearance.
- Road surfaces, lane centerlines, connectors, junctions, roundabout arcs, and traffic are derived from one shared graph/path model.
- Each traffic fragment belongs to a directed lane, follows its tangent continuously, respects a minimum following distance, does not pass, collide, teleport, spawn visibly mid-road, cut corners, or cross a conflict point simultaneously.
- Roundabout routes enter tangentially, circulate in the single direction, choose from multiple exits, and leave tangentially. Observe at least 15 seconds, 10 fragments, and 3 exits.
- Save a debug view with lane colors, arrows/directions, connectors, roundabout arcs, and conflict zones.

### Light fragment appearance

- Local road fragment: approximately 4–10 px long at QA view.
- Highway fragment: approximately 8–18 px long where applicable without changing the protected highway system.
- Bright core: approximately 1 px; halo: approximately 2–3 px.
- Tiny thin-line fragment, almost constant width, symmetric soft ends, restrained brightness, selective bloom.
- Forbidden hard-fail shapes: round head, pointed/tapered head, long tail, droplet, sperm/comet, dash/road-marking block, large rectangle, random free particle, or all traffic taking the same exit.

## GATE 5 — 3D-anchored hotspots and compact glass HUD

### Replacement scope

- Physically remove/disable the old city info card, old city interaction-point rendering, listeners, CSS, and runtime bridge paths. Do not merely hide them.
- Keep global page HTML/chrome unchanged. Replace only city-specific interaction UI.

### Markers

- Exactly 3–6 hotspots anchored to meaningful 3D objects/areas, projected every frame with `translate3d` without React state updates per frame.
- Occlusion and viewport checks prevent markers for hidden/offscreen objects from floating over the scene; occlusion may be throttled.
- Visual sizes: 16–22 px idle, 24–30 px hover, 2–3 px core dot, 1 px ring, 36–44 px hit target.
- White/cyan restrained hierarchy; no huge targets, thick neon, icons, many rotating rings, aggressive pulsing, or equal brightness everywhere.

### States and timing

- States: `IDLE`, `HOVER`, `ACTIVE/PINNED`, `EXIT`.
- Marker transition 180–250 ms; connector 220–320 ms; panel 250–400 ms.
- Motion is smooth and restrained: no bounce, pop, teleport, or multi-turn rotation.
- Hovering highlights only the target object/quarter subtly; no full cyan fill, global bloom jump, or scale pop.

### Panel

- One reusable DOM panel, 260–340 px wide, padding 18–24 px, radius 14–20 px.
- Elegant smoky glass: subtle blur, thin border/highlight, restrained cyan edge near the anchor, minimal dividers, short connector. Not a generic rectangle, game/military HUD, or cyberpunk control panel.
- Real content: object ID such as `Q-01`, name, 2–3 metrics, status, and action. Typography remains crisp; cyan is accent only.
- Placement chooses among four quadrants around the anchor, avoids left menu/text, top HUD, right arc, and bottom safe zone, stays inside a 24–32 px viewport margin, and keeps the connector short.
- Stable hover region includes marker hit area, connector, panel, and an invisible 20–24 px corridor. Close delay 120–200 ms, cancelled on re-entry. Only one panel can be open.
- Click pins/activates current selection; outside click closes. Existing scene selection/action semantics remain connected.
- Desktop supports hover/click. Touch: first tap opens, second performs action, outside closes. Small screens use an elegant bottom glass sheet.
- WebGL owns anchors, raycast/occlusion, object highlight, and optional subtle beam; DOM owns marker hit target, connector, text, and panel. No WebGL text blur.
- No layout thrash or per-marker heavy blur; runtime remains within performance thresholds.

## GATE 6 — final lighting, depth, and complete interaction regression

- Visual hierarchy: selected tower > active quarter > central architecture > traffic > distant city.
- City is dark graphite but readable and volumetric; windows mainly neutral white with sparse warm/cool groups; cyan is functional.
- Add soft cool ambience, directional/rim light, restrained reflected cyan near active district, AO/contact at bases, and fog/atmospheric perspective for distant clusters.
- Bloom is selective: weak secondary infrastructure, stronger flows/quarter boundary, strongest selected tower/vertical beam. Never wash the whole city blue.
- Distant city is softer and darker; foreground/midground/background remain separated.
- Recheck hover, hit targets, connector corridor, object highlight, pin/outside close, touch, right arc, left/top chrome, scroll, hex transitions, leave/return, and preloader warmth.
- Runtime must contain neither the old card nor old marker system.

## GATE 7 — performance and final acceptance

### Fixed test environment

- Same isolated localhost environment, hardware/browser/GPU, hardware acceleration verified.
- Viewport 1920×945, DPR 1, frozen `QA_CAMERA` and `QA_SEED`.
- Warm for 15 seconds before measurement.
- Three 30-second runs: (1) idle; (2) slow camera movement; (3) maximum visible traffic with hover/HUD active.
- Record environment/browser/GPU, frame intervals, CPU frame work, GPU timer query if supported, FPS, draw calls, triangles, and visible particle/traffic counts.

### Performance thresholds

- Average FPS ≥ 59.
- p95 delivered-frame interval ≤ 20 ms.
- Frames over 25 ms ≤ 1%.
- No recurring consecutive approximately 33.3 ms or slower frames.
- p95 CPU frame work ≤ 12 ms.
- p95 GPU time ideally ≤ 14 ms when reliable timer queries are available.
- No more than 10% performance regression from the GATE 0 baseline on the same environment.
- Software renderer, disabled hardware acceleration, missing metrics, or changing environment is `BLOCKED`, not `FAIL` or `PASS`.

### Visual score

- City composition: 18.
- Architecture: 14.
- Roads/highway context: 13.
- Windows/facades: 10.
- Light flows/lane behavior: 15.
- Light/depth: 10.
- HUD: 12.
- Crane: 3.
- Global UI/interactions: 5.
- Final `PASS` requires no hard fail, total ≥ 90/100, every category ≥ 80%, all performance thresholds, and independent `PASS` from both reviewers.

## Evidence contract

Store under `.codex/city-scene/evidence/`:

- baseline/current, reference, and final at 1920×945 DPR 1;
- 50% blockout/reference overlay;
- facade close-up, distant view, and slow-camera facade video;
- ≥10 s baseline camera video;
- ≥15 s roundabout video covering 10 fragments and 3 exits;
- highway/protected-element comparison video or matched stills;
- lane-graph debug view;
- three baseline and three final performance run logs;
- camera, target, FOV, DPR, seed, browser/GPU/hardware information;
- draw calls, triangles, traffic counts;
- changed-files list, physically deleted/replaced systems list, and reviewer verdicts.

## Correction loop

At each gate:

1. IMPLEMENTER supplies evidence and changed-system notes.
2. VISUAL REVIEWER and TECH REVIEWER independently inspect the authorized isolated preview and evidence.
3. Orchestrator deduplicates findings into P0/P1/P2.
4. IMPLEMENTER fixes every finding in one coherent pass.
5. Both reviewers re-review.
6. After two failed reviews at the same gate, stop cosmetic tweaking, diagnose the architecture, update `PLAN.md`, and replace the defective system.

No gate may be marked complete from source inspection alone when visual/runtime evidence is required. A missing authorized isolated preview or missing required evidence keeps the task `BLOCKED`.
