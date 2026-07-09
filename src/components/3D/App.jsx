import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import CanvasRoutes from "../Routes/CanvasRoutes.jsx";
import { useState } from "react";
import { PerformanceMonitor } from "@react-three/drei";
import { useStore } from "@/store.jsx";
import { Perf } from "r3f-perf";
import { applyLegacyLightingMode } from "@/three/renderer/configureWebGLRenderer.js";
import ModelsRenderBridge from "./background/ModelsRenderBridge.jsx";
import CanvasFrameLock from "./background/CanvasFrameLock.jsx";

function isPerfOverlayEnabled() {
	if (!import.meta.env.DEV) {
		return false;
	}
	try {
		return new URLSearchParams(window.location.search).has("perf");
	} catch {
		return false;
	}
}

export default function App(props) {
	const store = useStore();
	const cap = store.graphicsDprCap;
	const floor = store.graphicsDprFloor ?? 1;
	const [dpr, setDpr] = useState(store.graphicsDpr ?? cap);

	const onInclineDpr =
		store.graphicsTier === "low" ? 1 : store.graphicsTier === "medium" ? Math.min(1.25, cap) : Math.min(2, cap);
	const onDeclineDpr =
		store.graphicsTier === "low" ? 0.85 : store.graphicsTier === "medium" ? 0.95 : Math.max(1.5, floor);

	return (
		<div className="canvasParent">
			<Canvas
				eventPrefix={"client"}
				eventSource={document.querySelector("#root")}
				camera={{ fov: 40, position: [0, 0, 9], near: 0.1, far: 150 }}
				dpr={Math.min(Math.max(dpr, floor), cap)}
				shadows={false}
				gl={{
					alpha: false,
					antialias: store.graphicsAntialias,
					powerPreference: store.graphicsPowerPreference,
				}}
				onCreated={({ gl }) => {
					applyLegacyLightingMode(gl);
					gl.outputColorSpace = THREE.SRGBColorSpace;
					gl.setClearColor(0x000000, 1);
				}}
			>
				{isPerfOverlayEnabled() && <Perf className="perfPanel" position="top-left" />}
				<PerformanceMonitor onIncline={() => setDpr(onInclineDpr)} onDecline={() => setDpr(onDeclineDpr)} />
				<CanvasFrameLock />
				<ModelsRenderBridge
					currentPage={props.currentPage}
					models={
						<CanvasRoutes
							startApp={props.startApp}
							rendered={props.rendered}
							setRendered={props.setRendered}
							currentPage={props.currentPage}
							teleportPage={props.teleportPage}
						/>
					}
				/>
			</Canvas>
		</div>
	);
}
