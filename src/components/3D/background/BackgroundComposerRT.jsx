import { Suspense, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import BackgroundEffects from "./BackgroundEffects.jsx";
import {
	configureBackgroundRenderPass,
	renderComposerToTexture,
	unifiedBackgroundScene,
} from "./unifiedComposerRender.js";

/**
 * Liquid → RT. enabled={false} — только ручной render.
 */
export default function BackgroundComposerRT({ currentPage, textureRef }) {
	const { gl, size } = useThree();
	const composerRef = useRef(null);
	const sizeRef = useRef({ w: 0, h: 0 });

	useLayoutEffect(() => {
		const composer = composerRef.current;
		if (composer) {
			configureBackgroundRenderPass(composer);
			composer.autoRenderToScreen = false;
			composer.setSize(size.width, size.height);
			sizeRef.current = { w: size.width, h: size.height };
		}
	}, [currentPage, size.width, size.height]);

	useFrame((_, delta) => {
		const composer = composerRef.current;
		if (!composer || !textureRef || composer.passes.length < 2) {
			return;
		}

		// setSize в useEffect опаздывает на cold start — задаём до render
		if (sizeRef.current.w !== size.width || sizeRef.current.h !== size.height) {
			composer.setSize(size.width, size.height);
			sizeRef.current = { w: size.width, h: size.height };
		}

		const texture = renderComposerToTexture(composer, delta, gl);
		if (texture) {
			textureRef.current = texture;
		}
	}, -15);

	return (
		<EffectComposer
			ref={composerRef}
			enabled={false}
			scene={unifiedBackgroundScene}
			disableNormalPass
			multisampling={0}
			stencilBuffer={false}
		>
			<Suspense fallback={null}>
				<BackgroundEffects currentPage={currentPage} />
			</Suspense>
		</EffectComposer>
	);
}
