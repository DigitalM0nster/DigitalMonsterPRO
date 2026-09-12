import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("arc slots resolve children once, sleep empty, and reactivate after content changes", () => {
	let source = readFileSync(new URL("./SiteArcDomNav.jsx", import.meta.url), "utf8")
		.replace(/\r\n/g, "\n")
		.replace(/^import[\s\S]*?;\s*$/gm, "").replace("export default function", "function");
	// Exercise the component's real callbacks; JSX and React scheduling are not
	// needed to verify ownership of fixed children and the empty-slot cache.
	source = source.slice(0, source.indexOf("\n\treturn (\n\t\t<div ref={hostRef}"))
		+ "\nreturn { itemRefCallbacks, syncDom, onHoverSnake };\n}";
	let queries = 0;
	class Element {
		constructor() {
			this.style = { setProperty() {} };
			this.dataset = {};
			this.classList = { toggle() {} };
		}
	}
	class Canvas extends Element { constructor() { super(); this.width = 1; this.height = 1; } }
	const host = new Element();
	let firstRef = true;
	let items = [];
	const hovered = [];
	const component = vm.runInNewContext(`${source}\nSiteArcDomNav({})`, {
		useRef(value) { const current = firstRef ? host : value; firstRef = false; return { current }; },
		useCallback: fn => fn, useMemo: fn => fn(), useEffect() {}, useLayoutEffect() {},
		useLocation: () => ({ pathname: "/" }), useSnapshot: () => ({}), store: {},
		window: { innerWidth: 1440, innerHeight: 900 }, HTMLCanvasElement: Canvas, HTMLElement: Element,
		styles: { itemActive: "active" }, SITE_ARC_DISPLAY_FONT: "Test", SITE_ARC_TEXT_COLOR: "white",
		getSiteArcViewportOpacity: () => 1,
		buildSiteArcNavLayout: () => ({ items, activeColor: "cyan" }),
		syncSiteArcNavSnakeLines() {}, playSiteArcNavSnakeHover: id => hovered.push(id),
		paintSiteArcNavSnakeDomLabel(canvas) {
			canvas.width = 80; canvas.height = 20;
			canvas.style.width = "80px"; canvas.style.height = "20px";
			return { width: 80 };
		},
	});
	const elements = component.itemRefCallbacks.map((ref) => {
		const el = new Element();
		el.num = new Canvas(); el.titles = [new Canvas(), new Canvas()]; el.hit = new Element();
		el.querySelector = selector => { queries++; return selector.includes("num") ? el.num : el.hit; };
		el.querySelectorAll = () => { queries++; return el.titles; };
		ref(el);
		return el;
	});
	assert.equal(queries, 48);
	const show = count => {
		items = Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, chapterNum: String(i), title: `Title ${i}`, x: 100, y: i * 30, labelGap: 20, opacity: 1 }));
		component.syncDom();
	};
	show(5);
	// Detect even redundant writes to an already-empty slot.
	let emptyWrites = 0;
	for (const el of elements.slice(5)) {
		el.style = new Proxy(el.style, { set(target, key, value) { emptyWrites++; target[key] = value; return true; } });
	}
	for (let i = 0; i < 60; i++) component.syncDom();
	assert.equal(emptyWrites, 0); assert.equal(queries, 48);
	show(8);
	assert.equal(elements[7].hidden, false); assert.equal(elements[7].num.width, 80);
	component.onHoverSnake(7); assert.deepEqual(hovered, ["item-7"]);
	show(2);
	assert.equal(elements[7].hidden, true); assert.equal(elements[7].num.width, 1);
	assert.equal(elements[7].dataset.projectId, ""); assert.equal(elements[7].hit.style.width, "0px");
	component.onHoverSnake(7); assert.equal(hovered.length, 1);
	show(8);
	assert.equal(elements[7].hidden, false); assert.equal(elements[7].titles[0].width, 80);
	assert.notEqual(elements[7].hit.style.width, "0px");
	component.itemRefCallbacks[7](null);
	component.syncDom(); component.onHoverSnake(7);
	assert.equal(queries, 48); assert.equal(hovered.length, 1);
});
