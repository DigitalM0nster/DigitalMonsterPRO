import test from "node:test";
import assert from "node:assert/strict";
import { createLocaleTransition } from "./createLocaleTransition.js";

test("immutable full cycles coalesce requests in disappearance and appearance", async () => {
	let shown = "ru"; const events = [], gates = [];
	const controller = createLocaleTransition({ getLocale: () => shown,
		commit: locale => { events.push(`commit:${locale}`); shown = locale; },
		animate: to => new Promise(resolve => gates.push({ to, resolve })),
		afterCommit: async () => {}, phaseChanged: (phase, target) => events.push(`${phase}:${target}`),
	});
	const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
	const done = controller.request("en"); await flush();
	controller.request("zh"); controller.request("ru");
	assert.equal(shown,"ru"); assert.equal(controller.target,"en");
	gates.shift().resolve(); await flush(); assert.equal(shown,"en");
	controller.request("zh"); controller.request("ru");
	gates.shift().resolve(); await flush(); assert.equal(controller.target,"ru");
	gates.shift().resolve(); await flush(); assert.equal(shown,"ru");
	gates.shift().resolve(); await done;
	assert.deepEqual(events.filter(e=>e.startsWith("commit:")),["commit:en","commit:ru"]);
	assert.equal(controller.phase,"idle");
	await controller.request("ru"); assert.equal(gates.length,0);
});

test("unmount releases effect barrier and a newly mounted owner enters current locale", async () => {
	let shown="ru", entered;
	const controller=createLocaleTransition({getLocale:()=>shown,commit:locale=>{shown=locale;},animate:async()=>{},afterCommit:async()=>{controller.register({appear:locale=>{entered=locale;}});}});
	const remove=controller.register({disappear:()=>new Promise(()=>{})});
	const done=controller.request("zh"); await Promise.resolve(); remove(); await done;
	assert.equal(entered,"zh"); assert.equal(controller.phase,"idle");
});

test("a route mounted during appearance joins the barrier before the next cycle", async () => {
	let shown = "ru", release, mounted = false;
	const late = new Promise(resolve => { release = resolve; });
	const controller = createLocaleTransition({ getLocale: () => shown, commit: locale => { shown = locale; }, animate: async () => {}, afterCommit: async () => {} });
	controller.register({ appear: () => {
		if (!mounted) { mounted = true; controller.register({ appear: () => late }); }
	} });
	const done = controller.request("en");
	for (let i = 0; i < 30; i++) await Promise.resolve();
	controller.request("zh");
	assert.equal(controller.phase, "appearing"); assert.equal(shown, "en");
	release(); await done;
	assert.equal(shown, "zh"); assert.equal(controller.phase, "idle");
});
