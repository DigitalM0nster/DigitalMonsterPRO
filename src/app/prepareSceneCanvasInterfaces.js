import { createContactsCanvasInterface } from "@/pages/contacts/createContactsCanvasInterface.js";
import { createAboutCanvasInterface } from "@/pages/about/createAboutCanvasInterface.js";
import { createFilmCanvasInterface } from "@/pages/portfolio/createFilmCanvasInterface.js";
import { createCraneCanvasInterface } from "@/pages/capabilities/createCraneCanvasInterface.js";

/** Composition only: route owners provide their prepared canvas interface. */
export async function prepareSceneCanvasInterfaces(sceneManager, renderer, scheduler) {
	for (const [id, create] of [["contacts", createContactsCanvasInterface], ["about", createAboutCanvasInterface],
		["portfolioHub", createFilmCanvasInterface], ["capabilities:mmk1", createCraneCanvasInterface]]) {
		const scene = sceneManager.getSceneById(id);
		if (!scene || sceneManager.disposed) continue;
		const ui = await create(renderer, scene);
		await ui.prepare(scheduler);
		if (sceneManager.disposed) { ui.dispose(); return; }
		scene.canvasInterface = ui;
	}
}
