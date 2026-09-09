# City traffic and surfaces

The export uses Blender Z-up coordinates, mapped to Three.js as `(x, z, -y)`.
Prepare the model, materials, reflection map and traffic buffers under `readyPromise`.
Runtime animation changes existing uniforms; route leave/return retains resources.

## Roads and movement

- Both roundabouts have five complete counterclockwise lanes at radii 10.6, 11.3,
  12, 12.7 and 13.4. Tangent entry/exit branches join those lanes; vehicle itineraries
  continue through intermediate exits. No isolated inner traffic circles.
- Quintic approach curves and prepared bend-speed profiles prevent abrupt changes
  in heading and speed. The east junction uses common lane mouths, 0.38-unit lane
  spacing, a 0.9-unit median, entry markings and subdued dashed guides internally.
  Crossing paths stay inside the junction, away from its approach tapers.
- Western streets now join a shared outer arterial. Sixteen western and sixteen
  northern clipped ports continue through the extended city. The west arterial
  has seven lanes, 0.55-unit spacing and a 0.9-unit median. Each shared guide draws
  once. Traffic ends beyond the old boundary, at the northern fog margin.
- The crossroads at (-113, -67) now supports all 16 entry/exit combinations:
  straight, left, right and U-turn from every arm. Ten new complete itineraries
  fill the missing movements, with 1.6-unit U-turn radii and matched tangents.
  A new southbound lane joins the existing northern corridor and western arterial;
  the southern departure continues to the model boundary. No journey starts or
  stops inside the junction. All crossing fleets share the offline schedule.
  Solid light guides fade through the junction instead of outlining only the old
  turns. Approach/departure endpoints also fade, using prepared opacity attributes.
- Four far-roundabout approach regions now use tangent-continuous splices. The
  two pointed outline hairpins near (42, 44) are reconnected as south-to-east and
  west-to-south movements; two full block routes preserve the neighbouring streets.
  The southern approach near (85, 43) no longer contains a short angular jog.
- Another 24 eastern and 34 southern itinerary endpoints continue to X≈320 and
  Y=-286. The same extensions update vehicle paths, guide curves and dark pavement.
- Version 16 contains 57 itineraries, 57 original street edges, 70 ring ports and
  101 guide ribbons (10 full circles, 57 approaches, 34 streets). The asphalt retains
  its approved dark material; new corridors have matching dark pavement.
- 49 itineraries use a regenerated offline periodic merge schedule: 664 vehicles,
  a common 24-second headway and oriented clearance envelopes of 0.64 × 0.34 city units.
  This avoids queues, body intersections and runtime neighbour searches. Speed
  scales shared time, without increasing CPU simulation substeps.
- The left-city density pass raises time-averaged scheduled occupancy in the
  target sector from 138.72 to 170.81 vehicles (+23%). It increases selected route
  fleets and reschedules their phases offline, preserving the clearance envelope.
  Stored base counts prevent repeated passes from compounding the increase.
- The remaining eight itineraries retain prepared motion with paired overtaking
  on suitable straights. Passing is disabled on narrow shared approaches. Smooth
  bounded phases keep forward movement positive and return pairs to their lanes.
- **Still pending:** reactive overtaking that detects an arbitrary slower vehicle,
  chooses a free adjacent lane and returns after passing. Prepared paired movement
  is a visual approximation, not that completed behaviour.

## Architecture, windows and materials

- 25 buildings were relocated from behind the camera and 373 shared distant
  instances added, including 280 extra buildings in the side and southern sectors
  exposed by orbit. Placement leaves road corridors clear. All additions reuse
  three reduced-geometry prototypes. Terrain bounds are approximately
  (-399, -301)–(328, 429); camera, fog and orbit limits are unchanged by this extension.
- Both islands have planting, paths, a basin, a sculpture and blue accents. Shared
  emissive materials and local shader spill illuminate them without point lights
  or shadow-map passes.
- Ordinary panes remain 0.13 × 0.16 city units, relative to a 0.422-unit car body.
  Bay/floor pitch is 0.28 / 0.34 regardless of instance scale. Only 3.5–14% of
  eligible rooms are lit on each floor. The palette is approximately 84% cool
  blue, 14% white and 2% warm yellow, assigned to stable neighbouring-room groups.
  Luminance is matched to the original blue shades to preserve bloom balance.
  Warm emission uses a pale yellow with strong green content, avoiding the former
  orange/red cast after bloom and display conversion.
- Blender authors three shared coordinate layers: `CityWindows` is the atlas mask,
  `CityFacadeMetric` is face-local distance, and `CityFacadeCellSize` gives source
  cell dimensions. This replaces the smoothed tangent projection that distorted
  windows on curved walls. Export no longer needs MikkTSpace tangents.
- Full-pane mask checks keep openings within eligible facades. Window coordinates
  are cleared on sloping/horizontal triangles after triangulation. Collapsed
  imported triangles are removed. The authoring pass asserts that no nonvertical
  face retains window coordinates; ledges, roofs, plinths and trim stay excluded.
- Building seeds are quantized before room hashes. Interpolated float noise no
  longer turns illuminated panes into sparkling grain. Windows are part of the
  wall shader, with no coplanar window overlay meshes.
- Switched-on panes use HDR emission 3.0–3.8 with bounded variation. A fully resolved
  lit pane clears the bloom threshold at the default intensity; subpixel coverage
  and fog still attenuate distant light. `windowIntensity` changes one uniform.
- Ordinary unlit glazing uses 0.20–0.28 roughness and a shared static environment map. IBL
  reflection is masked to glass; masonry does not acquire a glossy coating.
- The two selected offices are now authored separately. The distant `A / west
  shoulder tower` uses three offset volumes inspired by City of Capitals, with
  mineral piers and glazed bands covering 57.1% of its vertical surfaces. The
  closer `A / west midrise` is a chamfered, tapering office tower inspired by [OKO](https://www.som.com/projects/oko-tower/);
  97.7% of its vertical surfaces are glass. Roofing/crowns stay opaque. The source
  audits find no road obstruction, glass roofs or residential window-atlas cells
  on either office; other buildings retain their existing material roles.
- `cityOfficeGlass.js` is independent of the residential window shader. A physical
  0.28 x 0.36 city-unit bay/storey grid supplies filtered mullions, with no extra
  frame meshes. Office lighting uses suites of six neighbouring panes along a
  storey, sparse floor occupancy, cool/neutral whites and rare pale warm accents.
  Dim rooms and narrow ceiling lights preserve pane divisions instead of emitting
  solid HDR bars across the entire suite. Lighting uses the existing intensity
  uniform; there is no per-frame occupancy update or point light per window.
  Subpixel panes retain the average room/ceiling coverage instead of losing their
  lighting at the overview camera distance.
- Office glass uses neutral dielectric reflection, 0.035 roughness and a shared
  frozen cubemap of the actual neighbouring architecture. Pixel-footprint mipmaps
  retain sharp reflected structure. Roughness is not averaged with subpixel metal
  mullions, which previously made distant/oblique glass look frosted. Local box
  projection accounts for the facade position inside the office cluster and avoids
  treating reflected windows as infinitely distant enlarged imagery. The bounds
  cover the surrounding block rather than tightly enclosing the two offices,
  preserving a moderate reflection scale. The probe uses a dark navy night sky,
  without the previous bright evening horizon. During capture, the older synthetic
  environment contribution is reduced to 15% and restored before each yield. The probe
  excludes HDR window lamps to prevent oversized bright squares in its low-resolution
  representation. It is an approximation of static surroundings, not ray tracing.
- Broad rooftop boxes are mineral mechanical rooms with membrane roofs. Only
  small ventilation stacks/caps, pipes and antennae use the metal material.
  Equipment is classified in the shared Blender prototypes, so every instance
  receives the correction. Upward roof surfaces use the roof material regardless
  of their original imported material slot.
- Roof/detail meshes contained coincident faces and invalid equipment n-gons.
  Resolve rooftop triangles first, then cut coplanar overlaps into non-overlapping
  faces while preserving material roles. The two reported prototypes have zero
  overlapping rooftop face pairs in the final geometry audit. This is a geometry
  repair, not a depth-offset workaround.
- Walls use matte mineral variation; roofs have filtered aggregate relief and
  coating seams. Static contact occlusion is baked into shared vertex colours.
  Curved walls retain their shape while hard architectural corners split normals.
- The extra procedural frames/reveals were removed: pane size, light occupancy
  and the approved cool palette stay unchanged. Selected facade families retain
  floor-aligned panel joints and restrained panel tone variation.
- Shared PBR shaders distinguish rough mineral walls, denser stone/cladding,
  dark roof membrane and brushed metal. Fine relief affects the lighting normal;
  roughness and subtle weathering affect each material independently. Glass stays
  excluded from mineral relief. Roof laps apply to upward faces, while broad
  rooftop rooms keep mineral walls. No new building geometry is required.
- A hemisphere fill replaces the uniform ambient light: roofs face the sky,
  while undersides receive a darker ground tint. The light count is unchanged;
  these details add no window meshes or shadow passes.

## Inspection controls

- The existing city panel opens with **0**. Light/body/fog colours and intensities
  are stored in `cityTrafficConfig.js`; controls update prepared uniforms.
- DEV flight: **Включить полёт**, WASD, Space up, Alt down, Shift faster. Click the
  scene for mouse look; Escape releases the mouse. Opening the panel releases it
  too. **Вернуть общий вид** restores the composition; leaving disables flight.
- Overview LMB drag reuses the site's bounded orbit: horizontal ±25 degrees and
  vertical ±10 degrees, with damped movement and return. Other scenes retain their
  existing limits. Flight disables the orbit to avoid two camera controllers
  operating together. No per-frame target vector allocation.

## Resource budget and verification

- District hover: `CityDistrictHighlight` uses offline road-bounded contours from
  `author_city_districts.py`. Large street blocks are spatially partitioned into
  **85 compact quarters, each containing 4 or 5 buildings** (396 total). The split
  minimizes within-group spread, rounds platform corners, separates adjacent
  platforms and excludes carriageways. Small isolated remainders and the distant
  background stay decorative. Authoring asserts no platform overlap or road overlap.
- Hovering either a building or its ground platform selects the whole district.
  A prepared blue HDR rim blooms above softly illuminated paving; enter/leave
  uses damped uniforms. SceneManager's pointer ownership gates picking, including
  chrome blockers, drag and hex Y-bands. No new input listeners or point lights.
- All platform effects share one mesh/material draw: **17,080 triangles**, with
  picking against prepared building boxes/ground contours at most 30 times per
  second. The **1,490,273-byte JSON** (211,081 bytes with gzip) is fetched and
  geometry warmed under the preloader. Runtime hover changes 87 uniform values;
  no mesh/texture creation.
- `cityParkDistricts.js` adds the two authored ROUNDABOUT stone islands to the
  prepared selection data (85 quarters + 2 gardens). The rings stay within radius
  7.36, inside the traffic lanes starting at 10.6. A restrained turquoise outline
  remains visible at rest and brightens on hover, with a soft paving wash. Both
  the alleys and centre monuments select the garden; the road is excluded.
  These 720 triangles join the existing platform draw, without another material,
  light, asset download or change to Blender geometry.
- `cityDistrictWindows.js` assigns district IDs once per building instance and
  supplies the same focus uniforms to ordinary and office window shaders. Only
  occupied panes brighten, smoothly reaching **1.65x** their existing intensity.
  Window colour, placement and occupancy remain unchanged. GPU instancing stays
  enabled; there are no per-window lights or runtime attribute uploads.
- `CityDistrictHud` reuses the sphere's shared `createSceneHudAtlas`, glyph-order
  map and reversible `advanceHudSnake` shader reveal. Seven prepared variants cover
  five architectural profiles and the Beacon/Orbit gardens in three locales.
  Editorial names and three-line neighbourhood descriptions give each type a
  sense of place. Profiles come from the authored glass-building tag and actual
  height proportions; the count and relative-height infographic use real model
  data. Gardens show their four paths and a schematic circular plan. There are
  no invented areas, floor counts or construction statuses. The atlas is
  capped to the device texture limit, with no per-quarter textures or hover paints.
  Its 320×224 card follows the picked building/platform point, with a
  short leader. Placement changes sides near screen edges, reserves space for
  site chrome and follows smoothly within a quarter. Fast selection changes fade
  the old card before showing new content. Resize repositions the card immediately.
  Narrow screens use the free upper band so the card does not cross the navigation
  arc; its leader still tracks the picked point.
- Leader motion uses the owned viewport pointer every render frame, independently
  of the 30 Hz district pick. Its continuous spring state and line endpoints are
  never pixel-rounded; only the final text pose snaps for sharpness. Inactive,
  chrome-blocked and drag input still clear selection through SceneManager.
  Description rows use prepared 14 px MazzardM Regular with normal tracking and
  higher contrast; Manifold headings remain unchanged. Both fonts load before
  atlas preparation. Browser motion QA tracked all 59 pointer changes exactly,
  with no extra texture/buffer uploads or shader creation; 9 targeted tests pass.
- Capability HUDs use one compose gate: sharp screen overlays after bloom while
  settled, scene-owned meshes during hex transitions. The city card and leader
  add two bounded quads while showing; an invisible idle card skips its overlay.
- The long vertical tower shaft accents were removed from both Blender and GLB.
  The authoring pipeline also removes them before subsequent exports.
- District QA: actual office→residential→left menu hover, rapid selection reversal,
  full warm and route return pass. No WebGL errors or `texImage2D`/`bufferData`/
  `createProgram` calls while hovering; platform/HUD resources retain identity
  on return. Frame interval median **13.3 ms**, p95 **14.1 ms** on the
  previously documented desktop. Targeted picking/fade/lifecycle tests pass.
- A real backward/forward wheel transition city↔sphere preserves each HUD's
  screen/models ownership. At 390×844 the district card fits within the viewport.
  Disposal releases its three atlas textures and two quad geometries exactly once.

- GLB: **1,317,648 bytes**, Draco compression, `EXT_mesh_gpu_instancing`, three
  required window UV channels. Hidden Blender traffic-preview geometry is omitted.
- Three loads **69 model mesh primitives**, including **33 InstancedMesh** primitives;
  **816,265 instance-expanded triangles** (before the office rebuild: 820,205).
  District platforms add one prepared draw beyond the GLB model.
- **123,077 atlas cells / 843 prototype facade panels**. Shared 1024² R8 window
  atlas: **112,212 bytes** RLE transfer, **1 MiB** GPU storage. Decode/upload happens
  once; there are no per-window meshes or lights.
- Ordinary windows retain their shared **384 x 512 half-float PMREM (~1.5 MiB)**.
  Offices share one **six-face 256-square RGBA16F cubemap (~4 MiB including mips)**.
  Its six capture draws run one per frame under `readyPromise`, with renderer state
  restored before each yield. After Start there are no capture draws, transparent
  passes or cube-camera updates. Projection and Fresnel run in the existing
  material draw. Both reflection targets are disposed with the city.
- One shared **128² RGBA8 surface-detail texture** packs aggregate, roughness,
  weathering and brushed-metal detail: 64 KiB pixels, approximately 85 KiB with
  mipmaps. Deterministic generation happens once under the loader. Two filtered
  lookups replace repeated 3D procedural noise calculations; small-scale relief
  fades with pixel footprint. The texture is reused on route return and included
  in the city's deduplicated disposal. No per-frame texture updates.
- Blender normals are prepared; `normalsPrepared: true` avoids runtime normal
  conversion. The older-export fallback remains. Spatial instance batch splitting
  was evaluated and rejected for this view because it substantially raised draw
  counts for modest triangle savings.
- Focused tests cover ring closure and entry/exit continuity, junction geometry,
  outer-road continuation, lane spacing, all 16 crossroads movements, two minutes of movement without body
  intersections or stops, and a complete merge period at 25-ms intervals with
  maximum authored car size. Speed 1/3 retains the same geometry and route texture.
- Final browser check: Chrome / RTX 3070 Ti / ANGLE D3D11, 1920 × 1080, 75 Hz.
  With the revised surface shaders, frame interval median **13.3 / 13.3 ms** at
  speeds 1 and 3; p95 **14.3 / 14.0 ms**. Before the office changes the medians
  were also 13.3 / 13.3 ms. Disjoint-timer GPU medians were **4.80 / 4.65 ms** for
  the rendered frame, not a mobile benchmark or an isolated material-pass timing.
  Instrumentation recorded zero `texImage2D` / `bufferData` calls during motion.
  Model, traffic, window atlas and reflection target retained identity on return.
- No shader errors. Close views checked curved windows, dark/reflected glass,
  lit panes, rooftop rooms/vents and the repaired equipment from both sides.
  LMB orbit reached 25 degrees and returned; keyboard/pointer-lock flight passed.
  Both vertical extremes reached 10 degrees and returned. Focused controller tests
  cover both signs, release-click suppression, flight/scene reset and unchanged
  default limits for other scenes.
  Both ±25° orbit extremes, the two reported far-road bends, and the new eastern
  and southern districts were inspected in the expanded model. The repeated
  road/building obstruction audit found zero hits.
- A separate `?fullWarm=1` browser run also completed without shader errors;
  flight, orbit, resource retention and zero motion-time uploads were verified
  after the full preparation path, not only the fast DEV preloader.
  The left-menu cursor remained visible on buttons and in the gaps; pointer
  departure cleared the menu hover state.
- The office update is checked after full warm, with opposite facade views,
  environment-on/off and box-projection comparisons, drag/flight and page return. Both offices retain
  their shared reflection target on return. Instrumentation records zero cubemap
  capture draws after Start, and disposal releases the office target exactly once.
- This is not a claim of universal maximum optimisation or a low-end GPU profile.

## Rebuild

Source folder: `C:/Users/psych/OneDrive/Документы/BlenderModels/DigitalMonsterCity`.
Final authored model: `Night_City_Final/City_Night_Final.blend`.

1. Blender: `export_closed_roundabouts.py` loads `Connected_Lanes_Night`; uses
   `compact_roundabout_ports.py`, `closed_roundabout_network.py`,
   `join_near_east_arm.py`, `smooth_east_junction.py`, `resolve_east_junction.py`
   and `extend_city_arterials.py`, then `complete_west_crossroads.py`,
   `refine_far_approaches.py` and `extend_city_edges.py`.
2. Node: `schedule_closed_roundabouts.mjs` prepares the periodic merge schedule;
   run it again with `--left-density` for the approved regional traffic increase.
3. Blender: `build_city_windows_and_distance.py` uses `extend_city_background.py`,
   `author_city_windows.py` and `author_city_surfaces.py`.
4. Copy `City_Night_Final.glb`, `City_FlowPaths.json`, `City_WindowMask.bin` together
   from `Night_City_Final` to `public/models/posibility5/city-approved.glb`,
   `city-flow-paths.json`, `city-window-mask.bin` respectively.

Blender contains material roles and authored facade coordinates. Procedural
surface detail, reflections and night-window lighting are implemented in Three.js.

Verification command:
`node --test src/three/scenes/capabilities/city/cityTrafficMotion.test.js src/three/scenes/capabilities/city/cityWindowShader.test.js`.
