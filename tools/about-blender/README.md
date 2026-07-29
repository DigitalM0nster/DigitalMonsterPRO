# About — bake site transform FX into Blender

The site no longer applies Heart / Front / Back / OUTER_cell / PCB yaw in Three.js.
Mesh motion comes only from GLB clips. Use this bake when you need to port the
old site curves into your `.blend`, then re-export `AboutUsModel.glb`.

| FX (legacy site) | Blender targets |
| --- | --- |
| Heart spin (−225°, story 1→2) | shared `Heart*` parent |
| PCB yaw (−45°) | Empty `AboutPcbYaw` under `InsideLarge` |
| Front advance | `Front`, `FrontBackSide` |
| Back retreat | `Back`, `BackBackSide` |
| OUTER_cell scatter | `OUTER_cell*` |

Camera / model / lookAt already live in GLB (`AboutCameraAction`, `AboutModelAction`, `AboutLookAtAction`).

## Bake

1. Open the About `.blend`.
2. Scripting → Open [`about_site_fx_blender.py`](./about_site_fx_blender.py) → **Run Script**.
3. Params: [`aboutSiteFxBake.json`](./aboutSiteFxBake.json) (or embedded `DEFAULT_CFG` in the `.py`).
4. Timeline: frames **0…40** @ 24fps = story **0…4**.
5. Export glTF `.glb` with **Cameras** + **Animations** → `public/models/aboutModel/AboutUsModel.glb`.

The site scrubs **every** clip in the GLB on the story clock (`aboutGltfStoryAnimRig.js`).
