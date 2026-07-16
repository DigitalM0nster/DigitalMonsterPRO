import * as THREE from "three";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import DistortionEffectComponent from "./distortionEffect/DistortionEffectComponent.jsx";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { easing } from "maath";
import BlurEffectComponent from "./blurEffect/BlurEffectComponent.jsx";
import { useTexture } from "@react-three/drei";
import { useStore } from "@/store.jsx";
import { ROUTE_TRANSITION_EXIT_MS } from "@/config/routeTransition.js";
import { portfolioHubBloom } from "../models/portfolio/hub/portfolioHubConfig.js";
import { getPostProcessPassFlags } from "@/utils/getPostProcessPassFlags.js";
import PostProcessProfileReporter from "./PostProcessProfileReporter.jsx";
import { useModelsRenderScene } from "@/context/ModelsRenderContext.jsx";
import { usePresentModelsFrameRef } from "@/context/PresentModelsFrameContext.jsx";
import { renderComposerToTexture } from "../background/unifiedComposerRender.js";

/** Прозрачный clear: модели рендерятся в RT, фон уже на экране. */
function configureTransparentRenderPass(composer) {
	const renderPass = composer.passes[0];
	if (renderPass?.clearPass) {
		renderPass.clearPass.setClearFlags(true, true, false);
		renderPass.clearPass.overrideClearColor = new THREE.Color(0x000000);
		renderPass.clearPass.overrideClearAlpha = 0;
	}
}

function renderModelsComposerToBuffer(composer, delta, gl) {
	return renderComposerToTexture(composer, delta, gl);
}

function isDevQueryFlag(name) {
	if (!import.meta.env.DEV) {
		return false;
	}
	try {
		return new URLSearchParams(window.location.search).has(name);
	} catch {
		return false;
	}
}

// --- helpers: один раз описанный скролл-блюр, без дублирования и без чтения innerWidth в каждой ветке ---

function dampBlurPortfolioMainMobile(blendRef, blurRef, store, delta, blurMax) {
	const oc = store.openedCase;
	if (store.scroll < 0.01) {
		easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
		easing.damp(blurRef, "current", oc ? blurMax : 0.0, 0.5, delta);
	} else if (store.scroll < 0.5) {
		easing.damp(blendRef, "current", oc ? 0.66 : Math.min(store.scroll * 10, 0.66), 0.25, delta);
		easing.damp(blurRef, "current", oc ? blurMax : Math.min(store.scroll * 0.05, blurMax), 1, delta);
	} else {
		easing.damp(blurRef, "current", 0.0, 0.5, delta);
	}
}

function dampBlurPortfolioMainDesktop(blendRef, blurRef, store, delta) {
	if (store.scroll < 0.01) {
		easing.damp(blendRef, "current", 0.0, 0.25, delta);
		easing.damp(blurRef, "current", 0.0, 0.5, delta);
	} else if (store.scroll < 0.5) {
		easing.damp(blendRef, "current", Math.min(store.scroll * 10, 0.66), 0.25, delta);
		easing.damp(blurRef, "current", Math.min(store.scroll * 0.05, 0.0075), 1, delta);
	} else {
		easing.damp(blurRef, "current", 0.0, 0.5, delta);
	}
}

function dampBlurPortfolio03(blendRef, blurRef, store, delta, iw) {
	const oc = store.openedCase;
	const s = store.scroll;
	if (iw <= 480) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
		} else if (s < 0.95) {
			easing.damp(blendRef, "current", 0.975, 0.25, delta);
			easing.damp(blurRef, "current", 0.0075, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", 0.66, 0.25, delta);
		}
	} else if (iw <= 640) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
		} else if (s < 0.965) {
			easing.damp(blendRef, "current", 0.975, 0.25, delta);
			easing.damp(blurRef, "current", 0.0075, 1, delta);
		} else {
			easing.damp(blendRef, "current", 0.0, 0.25, delta);
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
		}
	} else if (iw <= 768) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
		} else if (s < 0.975) {
			easing.damp(blendRef, "current", 0.975, 0.25, delta);
			easing.damp(blurRef, "current", 0.0075, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", 0.66, 0.25, delta);
		}
	} else if (iw <= 980) {
		const scrollEnd = ((iw - 768) / (980 - 768)) * (0.79 - 0.73) + 0.73;
		if (s < 0.01) {
			easing.damp(blendRef, "current", 0.0, 0.25, delta);
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
		} else if (s < scrollEnd) {
			easing.damp(blendRef, "current", 0.975, 0.25, delta);
			easing.damp(blurRef, "current", 0.0075, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", 0.66, 0.25, delta);
		}
	} else if (iw <= 1280) {
		const scrollEnd = ((iw - 980) / (1280 - 980)) * (0.83 - 0.79) + 0.79;
		if (s < 0.01) {
			easing.damp(blendRef, "current", 0, 0.25, delta);
			easing.damp(blurRef, "current", 0, 0.5, delta);
		} else if (s < scrollEnd) {
			easing.damp(blendRef, "current", 0.976, 0.25, delta);
			easing.damp(blurRef, "current", 0.0075, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 1, delta);
			easing.damp(blendRef, "current", 0.66, 1, delta);
		}
	} else {
		if (s < 0.01) {
			easing.damp(blendRef, "current", 0, 0.25, delta);
			easing.damp(blurRef, "current", 0, 0.5, delta);
		} else if (s < 0.85) {
			easing.damp(blendRef, "current", Math.min(s * 10, 0.976), 0.25, delta);
			easing.damp(blurRef, "current", Math.min(s * 0.05, 0.0075), 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 1, delta);
			easing.damp(blendRef, "current", Math.min(s * 10, 0.66), 1, delta);
		}
	}
}

function dampBlurPortfolio04(blendRef, blurRef, bloom, store, delta, iw) {
	if (!bloom) return;
	const oc = store.openedCase;
	const s = store.scroll;

	easing.damp(bloom.luminanceMaterial, "threshold", 1.5, 1, delta);
	easing.damp(bloom.luminanceMaterial, "smoothing", 0.05, 0.1, delta);

	if (iw <= 480) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
		} else if (s < 0.95) {
			easing.damp(blendRef, "current", oc ? 0.975 : Math.min(s * 10, 0.66), 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : Math.min(s * 0.05, 0.0075), 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", oc ? 0.66 : Math.min(s * 10, 0.66), 0.25, delta);
		}
	} else if (iw <= 640) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
		} else if (s < 0.965) {
			easing.damp(blendRef, "current", oc ? 0.975 : Math.min(s * 10, 0.66), 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : Math.min(s * 0.05, 0.0075), 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", oc ? 0.66 : Math.min(s * 10, 0.66), 0.25, delta);
		}
	} else if (iw <= 768) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
			easing.damp(bloom, "intensity", 2, 1, delta);
		} else if (s < 0.975) {
			easing.damp(blendRef, "current", oc ? 0.975 : Math.min(s * 10, 0.66), 0.5, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : Math.min(s * 0.05, 0.0075), 0.5, delta);
			easing.damp(bloom, "intensity", 2, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", oc ? 0.66 : Math.min(s * 10, 0.66), 0.5, delta);
			easing.damp(bloom, "intensity", 2, 1, delta);
		}
	} else if (iw <= 980) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", 0.0, 0.25, delta);
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(bloom, "intensity", 2, 1, delta);
		} else if (s < 0.9) {
			easing.damp(blendRef, "current", Math.min(s * 10, 0.975), 0.25, delta);
			easing.damp(blurRef, "current", Math.min(s * 0.05, 0.0075), 1, delta);
			easing.damp(bloom, "intensity", 4, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", Math.min(s * 10, 0.6), 0.25, delta);
			easing.damp(bloom, "intensity", 4, 1, delta);
		}
	} else if (iw <= 1280) {
		easing.damp(bloom, "intensity", 2, 1, delta);
		if (s < 0.01) {
			easing.damp(blendRef, "current", 0, 0.25, delta);
			easing.damp(blurRef, "current", 0, 0.5, delta);
		} else if (s < 0.9) {
			easing.damp(blendRef, "current", Math.min(s * 10, 0.976), 0.5, delta);
			easing.damp(blurRef, "current", Math.min(s * 0.05, 0.0075), 0.5, delta);
		} else {
			easing.damp(blendRef, "current", Math.min(s * 10, 0.6), 1, delta);
			easing.damp(blurRef, "current", 0.0, 1, delta);
		}
	} else {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
			easing.damp(bloom, "intensity", 2, 1, delta);
		} else if (s < 0.9) {
			easing.damp(blendRef, "current", 0.975, 0.5, delta);
			easing.damp(blurRef, "current", 0.0075, 0.5, delta);
			easing.damp(bloom, "intensity", 2, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0, 0.5, delta);
			easing.damp(blendRef, "current", 0, 0.5, delta);
			easing.damp(bloom, "intensity", 2, 1, delta);
		}
	}
}

function dampBlurPortfolio05(blendRef, blurRef, bloom, store, delta, iw) {
	if (!bloom) return;
	const oc = store.openedCase;
	const s = store.scroll;

	easing.damp(bloom.luminanceMaterial, "threshold", 1, 1, delta);
	easing.damp(bloom.luminanceMaterial, "smoothing", 0.0, 0.1, delta);

	if (iw <= 640) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
		} else if (s < 0.95) {
			easing.damp(blurRef, "current", oc ? Math.min(s, 0.01) : 0, 0.5, delta);
			easing.damp(blendRef, "current", oc ? Math.min(s * 20, 0.99) : 0, 0.5, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", 0, 0.5, delta);
		}
	} else if (iw <= 768) {
		if (s < 0.01) {
			easing.damp(blendRef, "current", oc ? 0.66 : 0.0, 0.25, delta);
			easing.damp(blurRef, "current", oc ? 0.0075 : 0.0, 0.5, delta);
		} else if (s < 0.95) {
			easing.damp(blurRef, "current", oc ? Math.min(s, 0.01) : 0, 0.5, delta);
			easing.damp(blendRef, "current", oc ? Math.min(s * 20, 0.99) : 0, 0.5, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", 0, 0.5, delta);
		}
	} else if (iw <= 980) {
		if (s < 0.01) {
			easing.damp(blurRef, "current", 0.0, 0.75, delta);
			easing.damp(blendRef, "current", 0.0, 0.75, delta);
		} else if (s < 0.78) {
			easing.damp(blurRef, "current", 0.0075, 1, delta);
			easing.damp(blendRef, "current", 0.99, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0, 0.5, delta);
			easing.damp(blendRef, "current", 0, 0.5, delta);
		}
	} else if (iw <= 1280) {
		if (s < 0.01) {
			easing.damp(blurRef, "current", 0.0, 1, delta);
			easing.damp(blendRef, "current", 0.0, 1, delta);
		} else if (s < 0.74) {
			easing.damp(blurRef, "current", 0.0075, 1, delta);
			easing.damp(blendRef, "current", 0.99, 1, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 1, delta);
			easing.damp(blendRef, "current", 0.0, 1, delta);
		}
	} else {
		if (s < 0.01) {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", 0.0, 0.5, delta);
		} else if (s < 0.87) {
			easing.damp(blurRef, "current", 0.0075, 0.5, delta);
			easing.damp(blendRef, "current", 0.975, 0.5, delta);
		} else {
			easing.damp(blurRef, "current", 0.0, 0.5, delta);
			easing.damp(blendRef, "current", 0.0, 0.5, delta);
		}
	}
}

/** Bloom для главной портфолио: пороги по ширине канваса (как renderer.size). */
function dampBloomPortfolioListing(bloom, store, delta, rw) {
	if (!bloom) return;
	easing.damp(bloom.luminanceMaterial, "threshold", 1, 0.1, delta);
	easing.damp(bloom.luminanceMaterial, "smoothing", 0.0, 0.1, delta);
	const s = store.scroll;
	let target = 0;
	if (rw <= 480) {
		if (s < 0.67) target = 5;
	} else if (rw <= 640) {
		if (s < 0.79) target = 5;
	} else if (rw <= 768) {
		if (s < 0.84) target = 5;
	} else if (rw <= 980) {
		if (s < 0.84) target = 5;
	} else if (rw <= 1280) {
		if (s < 0.89) target = 5;
	} else if (rw <= 1440) {
		if (s < 0.88) target = 5;
	} else if (rw <= 1680) {
		if (s < 0.92) target = 5;
	} else if (s < 0.94) {
		target = 5;
	}
	easing.damp(bloom, "intensity", target, 0.1, delta);
}

export default function EffectComposerComponent(props) {
	const store = useStore();
	const { gl, size } = useThree();
	const modelsRenderScene = useModelsRenderScene();
	const splitPresent = Boolean(modelsRenderScene);
	const modelsFrameRef = usePresentModelsFrameRef();
	const mainComposerRef = useRef(null);
	const blurEffectRef = useRef();
	const distortionRef = useRef();
	const bloomRef = useRef();

	const texture = useTexture("/backgrounds/backgroundTexture2.jpg");
	const [textureColor, setTexturecolor] = useState("#000000");

	const [transition, setTransition] = useState(false);
	const bloomOnlyDebug = isDevQueryFlag("ppBloomOnly");
	const [passFlags, setPassFlags] = useState(() =>
		getPostProcessPassFlags({
			page: props.currentPage,
			transition: false,
			powerDistortion: 0,
			blurBlend: 0,
			blurRadius: 0,
		}),
	);
	const passFlagsRef = useRef(passFlags);
	passFlagsRef.current = passFlags;

	const renderPassConfiguredRef = useRef(false);
	const composerSizeRef = useRef({ w: 0, h: 0 });

	useLayoutEffect(() => {
		renderPassConfiguredRef.current = false;
	});

	useFrame(() => {
		const composer = mainComposerRef.current;
		if (!composer || renderPassConfiguredRef.current || composer.passes.length < 1) {
			return;
		}
		configureTransparentRenderPass(composer);
		renderPassConfiguredRef.current = true;
	});

	useLayoutEffect(() => {
		if (props.startApp !== true) {
			return;
		}
		setTransition(true);
		const id = setTimeout(() => {
			setTransition(false);
		}, ROUTE_TRANSITION_EXIT_MS);
		return () => clearTimeout(id);
	}, [props.teleportPage, props.startApp]);

	const blendFactorRef = useRef(0.0);
	const blurRadiusRef = useRef(0.0);
	const blurSetting = {
		blurRadius: blurRadiusRef,
		blendFactor: blendFactorRef,
		backgroundOpacity: 0.75,
	};

	const powerDistortionRef = useRef(0.0);
	const verticalBlocksNumberRef = useRef(0.0);
	const distortionSetting = {
		powerDistortion: powerDistortionRef,
		verticalBlocksNumber: verticalBlocksNumberRef,
	};

	const color = new THREE.Color(textureColor);

	useFrame((renderer, delta) => {
		const iw = window.innerWidth;
		const rw = renderer.size.width;
		const page = props.currentPage;
		const bloom = bloomRef.current;

		if (transition === true) {
			easing.damp(powerDistortionRef, "current", 0.3, 0.2, delta);
			easing.damp(verticalBlocksNumberRef, "current", 40, 1, delta);
		}
		if (transition === false) {
			easing.damp(powerDistortionRef, "current", 0.0, 0.5, delta);
			easing.damp(verticalBlocksNumberRef, "current", 40, 1, delta);
		}

		const aboutUsesCasePostProcess = page === "/about";
		if (!page.startsWith("/portfolio") && !aboutUsesCasePostProcess) {
			easing.damp(blurRadiusRef, "current", 0.0, 0.5, delta);
			easing.damp(blendFactorRef, "current", 0.0, 0.25, delta);
		} else if (page === "/portfolio" || aboutUsesCasePostProcess) {
			if (iw <= 768) {
				dampBlurPortfolioMainMobile(blendFactorRef, blurRadiusRef, store, delta, 0.0075);
			} else {
				dampBlurPortfolioMainDesktop(blendFactorRef, blurRadiusRef, store, delta);
			}
		} else if (page === "/portfolio/01") {
			if (iw <= 768) {
				dampBlurPortfolioMainMobile(blendFactorRef, blurRadiusRef, store, delta, 0.0075);
			} else {
				dampBlurPortfolioMainDesktop(blendFactorRef, blurRadiusRef, store, delta);
			}
		} else if (page === "/portfolio/02") {
			if (bloom) {
				easing.damp(bloom, "intensity", 1.5, 1, delta);
				easing.damp(bloom.luminanceMaterial, "threshold", 1.5, 0.5, delta);
				easing.damp(bloom.luminanceMaterial, "smoothing", 0.0, 0.1, delta);
			}
			if (iw <= 768) {
				dampBlurPortfolioMainMobile(blendFactorRef, blurRadiusRef, store, delta, 0.03);
			} else {
				dampBlurPortfolioMainDesktop(blendFactorRef, blurRadiusRef, store, delta);
			}
		} else if (page === "/portfolio/03") {
			dampBlurPortfolio03(blendFactorRef, blurRadiusRef, store, delta, iw);
		} else if (page === "/portfolio/04") {
			dampBlurPortfolio04(blendFactorRef, blurRadiusRef, bloom, store, delta, iw);
		} else if (page === "/portfolio/05") {
			dampBlurPortfolio05(blendFactorRef, blurRadiusRef, bloom, store, delta, iw);
		} else if (page === "/portfolio/06" || page === "/portfolio/07") {
			dampBlurPortfolio03(blendFactorRef, blurRadiusRef, store, delta, iw);
		}

		if (page === "/portfolio") {
			if (bloom) {
				easing.damp(bloom, "intensity", portfolioHubBloom.intensity, 0.12, delta);
				easing.damp(bloom.luminanceMaterial, "threshold", portfolioHubBloom.threshold, 0.1, delta);
				easing.damp(bloom.luminanceMaterial, "smoothing", portfolioHubBloom.smoothing, 0.1, delta);
			}
		} else if (page === "/portfolio/03") {
			if (bloom) {
				easing.damp(bloom, "intensity", 3, 1, delta);
				easing.damp(bloom.luminanceMaterial, "threshold", 1.0, 0.1, delta);
				easing.damp(bloom.luminanceMaterial, "smoothing", 1, 0.1, delta);
			}
		} else if (page === "/portfolio/05") {
			if (bloom) {
				easing.damp(bloom, "intensity", 1, 1, delta);
				easing.damp(bloom.luminanceMaterial, "threshold", 1.0, 0.5, delta);
				easing.damp(bloom.luminanceMaterial, "smoothing", 0.0, 0.1, delta);
			}
		} else if (page === "/contacts") {
			if (bloom) {
				easing.damp(bloom, "intensity", 2, 0.1, delta);
				easing.damp(bloom.luminanceMaterial, "threshold", 0.5, 0.1, delta);
				easing.damp(bloom.luminanceMaterial, "smoothing", 0.0, 0.1, delta);
			}
		}

		if (!bloomOnlyDebug) {
			const nextFlags = getPostProcessPassFlags({
				page,
				transition,
				powerDistortion: powerDistortionRef.current,
				blurBlend: blendFactorRef.current,
				blurRadius: blurRadiusRef.current,
			});
			const prev = passFlagsRef.current;
			if (
				prev.distortion !== nextFlags.distortion ||
				prev.blur !== nextFlags.blur
			) {
				passFlagsRef.current = nextFlags;
				// Нельзя setState прямо в useFrame — React ругается на обновление во время render drei
				queueMicrotask(() => setPassFlags(nextFlags));
			}
		}
	});

	// Модели → RT; на экран — ScreenFramePresenter (500)
	useFrame((_, delta) => {
		if (!splitPresent || !mainComposerRef.current || !modelsFrameRef) {
			return;
		}
		const composer = mainComposerRef.current;
		if (composerSizeRef.current.w !== size.width || composerSizeRef.current.h !== size.height) {
			composer.setSize(size.width, size.height);
			composerSizeRef.current = { w: size.width, h: size.height };
		}
		const texture = renderModelsComposerToBuffer(composer, delta, gl);
		if (texture) {
			modelsFrameRef.current = texture;
		}
	}, 1);

	const activePasses = bloomOnlyDebug
		? { distortion: false, blur: false, bloom: true }
		: passFlags;

	return (
		<>
			<EffectComposer
				ref={mainComposerRef}
				enabled={!splitPresent}
				disableNormalPass={splitPresent}
				stencilBuffer={false}
				scene={modelsRenderScene ?? undefined}
				autoClear={!splitPresent}
			>
				{/* Pass всегда в дереве: иначе при unified splitPresent mount через passFlags отстаёт на кадры и «телепорт» не виден */}
				<DistortionEffectComponent ref={distortionRef} {...distortionSetting} />
				{activePasses.blur && (
					<BlurEffectComponent
						ref={blurEffectRef}
						{...blurSetting}
						color={color}
						backgroundTexture={texture}
					/>
				)}
				<Bloom
					ref={bloomRef}
					mipmapBlur={store.graphicsBloomMipmap}
					levels={store.graphicsBloomLevels}
					radius={store.graphicsBloomRadius}
				/>
			</EffectComposer>
			<PostProcessProfileReporter
				page={props.currentPage}
				transition={transition}
				powerDistortionRef={powerDistortionRef}
				blendFactorRef={blendFactorRef}
				blurRadiusRef={blurRadiusRef}
				passFlags={activePasses}
			/>
		</>
	);
}
