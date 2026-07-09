import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import { useStore } from "@/store";
import { easing } from "maath";

/** На 03/04/05 телефон скрыт — после скрытия можно не гонять позиции/дампы каждый кадр. */
const PHONE_HIDDEN_SUBPAGES = ["/portfolio/03", "/portfolio/04", "/portfolio/05", "/portfolio/06", "/portfolio/07"];

const DISPLAY_MAP_SWAP_MS = 650;

function freezeHiddenRoot(root) {
	if (!root) return;
	root.frustumCulled = false;
	root.matrixAutoUpdate = false;
	root.raycast = () => {};
}

function restoreRootForShow(root) {
	if (!root) return;
	root.frustumCulled = true;
	root.matrixAutoUpdate = true;
	delete root.raycast;
}

export default forwardRef(function PhoneMap(props, ref) {
	const store = useStore();
	const phoneModel = useGLTF("/models/case1/case1Phone.glb");
	const case1map = useTexture("/models/case1/case1PhoneMap.jpg");
	const case2map = useTexture("/models/case2/case2PhoneMap.jpg");
	const [transitionOut, setTransitionOut] = useState(false);
	const exitHideCompleteRef = useRef(false);
	/** Один отложенный hide по скроллу вместо setTimeout на каждый кадр (CPU п.3). */
	const scrollHideTimerRef = useRef(null);
	/** Одна отложенная смена map — раньше setTimeout(650) вызывался из каждого кадра, пока map не совпадал. */
	const displayMapSwapTimerRef = useRef(null);

	const clearDisplayMapSwapTimer = useCallback(() => {
		if (displayMapSwapTimerRef.current !== null) {
			clearTimeout(displayMapSwapTimerRef.current);
			displayMapSwapTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		phoneModel.materials.DisplayMat.mapIntensity = 1;
		phoneModel.materials.DisplayMat.color.r = 1;
		phoneModel.materials.DisplayMat.color.g = 1;
		phoneModel.materials.DisplayMat.color.b = 1;
		phoneModel.materials.DisplayMat.map = case1map;
		phoneModel.materials.DisplayMat.envMapIntensity = 0.15;
	}, []);

	useEffect(() => {
		setTransitionOut(true);
		setTimeout(() => {
			ref.current.scale.x = 1;
			ref.current.scale.y = 1;
			ref.current.scale.z = 1;
			setTransitionOut(false);
		}, 1100);
	}, [props.currentPage]);

	useEffect(() => {
		const onHiddenSubpage = PHONE_HIDDEN_SUBPAGES.includes(props.currentPage);
		if (!onHiddenSubpage) {
			exitHideCompleteRef.current = false;
			if (ref.current) {
				restoreRootForShow(ref.current);
			}
		}
	}, [props.currentPage]);

	// Смена URL — отменяем отложенную подмену текстуры, чтобы не применить чужую карту
	useEffect(() => {
		clearDisplayMapSwapTimer();
	}, [props.currentPage, clearDisplayMapSwapTimer]);

	useEffect(() => {
		return () => {
			if (scrollHideTimerRef.current !== null) {
				clearTimeout(scrollHideTimerRef.current);
				scrollHideTimerRef.current = null;
			}
			clearDisplayMapSwapTimer();
		};
	}, [clearDisplayMapSwapTimer]);

	useFrame((renderer, delta) => {
		if (!ref.current) {
			return;
		}

		const onHiddenSubpage = PHONE_HIDDEN_SUBPAGES.includes(props.currentPage);
		if (onHiddenSubpage && !ref.current.visible && exitHideCompleteRef.current && !transitionOut) {
			return;
		}

		const w = renderer.size.width;
		const p = props.currentPage;

		const clearScrollHideTimer = () => {
			if (scrollHideTimerRef.current !== null) {
				clearTimeout(scrollHideTimerRef.current);
				scrollHideTimerRef.current = null;
			}
		};

		// Видимость: портфолио / 02 и скрытые подстраницы переопределяют скролл; иначе — один таймер hide (CPU п.3)
		if (p === `/portfolio`) {
			clearScrollHideTimer();
			// Хаб: только плиты PortfolioHubModel, телефон не показываем
			ref.current.visible = false;
			return;
			const mat = phoneModel.materials.DisplayMat;
			if (mat.map !== case1map) {
				if (displayMapSwapTimerRef.current === null) {
					displayMapSwapTimerRef.current = setTimeout(() => {
						displayMapSwapTimerRef.current = null;
						mat.map = case1map;
					}, DISPLAY_MAP_SWAP_MS);
				}
			} else {
				clearDisplayMapSwapTimer();
			}
			easing.damp(phoneModel.materials.DisplayMat.color, "r", 10, 0.2, delta);
			easing.damp(phoneModel.materials.DisplayMat.color, "g", 10, 0.2, delta);
			easing.damp(phoneModel.materials.DisplayMat.color, "b", 10, 0.2, delta);
		} else if (p === `/portfolio/01`) {
			clearScrollHideTimer();
			ref.current.visible = true;
			const mat = phoneModel.materials.DisplayMat;
			if (mat.map !== case1map) {
				if (displayMapSwapTimerRef.current === null) {
					displayMapSwapTimerRef.current = setTimeout(() => {
						displayMapSwapTimerRef.current = null;
						mat.map = case1map;
					}, DISPLAY_MAP_SWAP_MS);
				}
			} else {
				clearDisplayMapSwapTimer();
			}
			easing.damp(phoneModel.materials.DisplayMat.color, "r", 10, 0.2, delta);
			easing.damp(phoneModel.materials.DisplayMat.color, "g", 10, 0.2, delta);
			easing.damp(phoneModel.materials.DisplayMat.color, "b", 10, 0.2, delta);
		} else if (p === `/portfolio/02`) {
			clearScrollHideTimer();
			ref.current.visible = true;
			const mat = phoneModel.materials.DisplayMat;
			if (mat.map !== case2map) {
				if (displayMapSwapTimerRef.current === null) {
					displayMapSwapTimerRef.current = setTimeout(() => {
						displayMapSwapTimerRef.current = null;
						mat.map = case2map;
					}, DISPLAY_MAP_SWAP_MS);
				}
			} else {
				clearDisplayMapSwapTimer();
			}
			easing.damp(phoneModel.materials.DisplayMat.color, "r", 8.5, 0.2, delta);
			easing.damp(phoneModel.materials.DisplayMat.color, "g", 8.5, 0.2, delta);
			easing.damp(phoneModel.materials.DisplayMat.color, "b", 8.5, 0.2, delta);
		} else if (PHONE_HIDDEN_SUBPAGES.includes(p)) {
			clearScrollHideTimer();
			ref.current.visible = false;
		} else {
			if (store.scroll > 0.4) {
				clearScrollHideTimer();
				ref.current.visible = true;
			} else if (scrollHideTimerRef.current === null) {
				scrollHideTimerRef.current = setTimeout(() => {
					scrollHideTimerRef.current = null;
					if (ref.current) {
						ref.current.visible = false;
					}
				}, 500);
			}
		}

		// Позиция/поворот: цепочка else if — выполняется только одна ветка по ширине (CPU п.2)
		if (w <= 480) {
			if (store.scroll < 0.67) {
				easing.damp3(ref.current.position, [0, -1 * (((w - 330) / (480 - 330)) * (28.5 - 27) + 27), 0.0], 0.0, delta);
				easing.damp3(ref.current.rotation, [-0.4, Math.PI + 0.6, Math.PI * 0.75], 0.35, delta);
			} else if (store.scroll >= 0.67 && store.scroll <= 0.89) {
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.35, delta);
			} else if (store.scroll > 0.89) {
				easing.damp3(ref.current.position, [0, -1 * (((w - 330) / (480 - 330)) * (28.5 - 27) + 27), 0.0], 0.0, delta);
				easing.damp3(ref.current.rotation, [-0.4, Math.PI + 0.6, Math.PI * 0.75], 0.35, delta);
			}
		} else if (w <= 640) {
			if (store.scroll < 0.8) {
				easing.damp3(ref.current.position, [((w - 480) / (640 - 480)) * (1.25 - 1.5) + 1.5, -33, 1.5], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, Math.PI + renderer.pointer.x * 0.6, Math.PI * 0.75], 0.35, delta);
			} else {
				easing.damp3(ref.current.position, [((w - 480) / (640 - 480)) * (1.25 - 1.5) + 1.5, store.scroll * -35, 1.5], 0.3, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.5, delta);
			}
		} else if (w <= 768) {
			if (store.scroll < 0.85) {
				easing.damp3(ref.current.position, [1.5, -35, 1.5], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, Math.PI + renderer.pointer.x * 0.6, Math.PI * 0.75], 0.35, delta);
			} else {
				easing.damp3(ref.current.position, [1.5, store.scroll * -35, 1.5], 0.3, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.5, delta);
			}
		} else if (w <= 980) {
			if (store.scroll < 0.85) {
				easing.damp3(ref.current.position, [1.5, -35, 1.5], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, Math.PI + renderer.pointer.x * 0.6, Math.PI * 0.75], 0.35, delta);
			} else {
				easing.damp3(ref.current.position, [1.5, store.scroll * -35, 1.5], 0.3, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.5, delta);
			}
		} else if (w <= 1280) {
			if (store.scroll < 0.9) {
				easing.damp3(ref.current.position, [1.5, -35, 1.5], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, Math.PI + renderer.pointer.x * 0.6, Math.PI * 0.75], 0.35, delta);
			} else {
				easing.damp3(ref.current.position, [1.5, store.scroll * -35, 1.5], 0.3, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.5, delta);
			}
		} else if (w <= 1440) {
			if (store.scroll < 0.89) {
				easing.damp3(ref.current.position, [0, -35, 2], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, Math.PI + renderer.pointer.x * 0.6, Math.PI * 0.75], 0.35, delta);
			} else {
				easing.damp3(ref.current.position, [0, store.scroll * -35.25, 2], 0.25, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.5, delta);
			}
		} else if (w <= 1680) {
			if (store.scroll < 0.93) {
				easing.damp3(ref.current.position, [0, -37, 2.5], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, Math.PI + renderer.pointer.x * 0.6, Math.PI * 0.75], 0.35, delta);
			} else {
				easing.damp3(ref.current.position, [0, store.scroll * -35, 2.5], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.25, delta);
			}
		} else {
			// (w - 1680) / (w - 1680) === 1 при w > 1680 → z = 1.25
			if (store.scroll < 0.94) {
				easing.damp3(ref.current.position, [0, -37, 1.25], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, Math.PI + renderer.pointer.x * 0.6, Math.PI * 0.75], 0.35, delta);
			} else {
				easing.damp3(ref.current.position, [0, store.scroll * -35, 1.25], 1, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * -0.4, renderer.pointer.x * 0.6, 0], 0.5, delta);
			}
		}
		if (transitionOut === true) {
			easing.damp3(ref.current.scale, [0, 0, 0], 0.25, delta);
		}

		// Не замораживаем во время transitionOut — иначе ломается анимация scale при смене маршрута
		if (onHiddenSubpage && ref.current && !ref.current.visible && !transitionOut && !exitHideCompleteRef.current) {
			exitHideCompleteRef.current = true;
			freezeHiddenRoot(ref.current);
		}
	});

	return (
		<>
			<group ref={ref}>
				<primitive object={phoneModel.scene} />
			</group>
		</>
	);
});
