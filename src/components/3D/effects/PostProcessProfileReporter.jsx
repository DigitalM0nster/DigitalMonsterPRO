import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useStore } from "@/store.jsx";
import {
	estimateTotalPostPasses,
	getPostProcessPassFlags,
} from "@/utils/getPostProcessPassFlags.js";

const LOG_INTERVAL_MS = 2000;

function isPostProcessDebugEnabled() {
	if (!import.meta.env.DEV) {
		return false;
	}
	try {
		return new URLSearchParams(window.location.search).has("ppDebug");
	} catch {
		return false;
	}
}

/**
 * Dev: лог в консоль состояния постобработки (?ppDebug=1).
 * Вешать один раз внутрь основного Canvas.
 */
export default function PostProcessProfileReporter({
	page,
	transition,
	powerDistortionRef,
	blendFactorRef,
	blurRadiusRef,
	passFlags,
}) {
	const { gl } = useThree();
	const store = useStore();
	const lastLogRef = useRef(0);

	useEffect(() => {
		if (!isPostProcessDebugEnabled()) {
			return;
		}
		window.__ppSnapshot = () => {
			const flags =
				passFlags ??
				getPostProcessPassFlags({
					page,
					transition,
					powerDistortion: powerDistortionRef?.current ?? 0,
					blurBlend: blendFactorRef?.current ?? 0,
					blurRadius: blurRadiusRef?.current ?? 0,
				});
			const bloomPasses = estimateTotalPostPasses(
				flags,
				store.graphicsBloomLevels,
				store.graphicsBloomMipmap,
			);
			return {
				page,
				flags,
				bloomLevels: store.graphicsBloomLevels,
				bloomMipmap: store.graphicsBloomMipmap,
				bloomRadius: store.graphicsBloomRadius,
				estimatedFullscreenPasses: bloomPasses,
				dpr: gl.getPixelRatio(),
				tier: store.graphicsTier,
				render: { ...gl.info.render },
			};
		};
		console.info(
			"[ppDebug] Post-process profiler on. Call __ppSnapshot() in console. Params: ?perf=1 (r3f-perf), ?ppDebug=1 (this log)",
		);
		return () => {
			delete window.__ppSnapshot;
		};
	}, [gl, page, passFlags, store, transition, powerDistortionRef, blendFactorRef, blurRadiusRef]);

	useFrame(() => {
		if (!isPostProcessDebugEnabled()) {
			return;
		}
		const now = performance.now();
		if (now - lastLogRef.current < LOG_INTERVAL_MS) {
			return;
		}
		lastLogRef.current = now;

		const flags =
			passFlags ??
			getPostProcessPassFlags({
				page,
				transition,
				powerDistortion: powerDistortionRef?.current ?? 0,
				blurBlend: blendFactorRef?.current ?? 0,
				blurRadius: blurRadiusRef?.current ?? 0,
			});

		const snapshot = window.__ppSnapshot?.();
		console.table({
			page: snapshot.page,
			distortion: flags.distortion,
			blur: flags.blur,
			bloom: flags.bloom,
			estPasses: snapshot.estimatedFullscreenPasses,
			bloomLevels: snapshot.bloomLevels,
			dpr: snapshot.dpr.toFixed(2),
			tier: snapshot.tier,
			drawCalls: snapshot.render.calls,
			triangles: snapshot.render.triangles,
		});
	});

	return null;
}
