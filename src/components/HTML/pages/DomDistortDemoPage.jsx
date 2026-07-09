import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "@/css/demo/domDistortDemo.scss";

/**
 * Референс: HTML-текст + прозрачный WebGL canvas сверху (overlay).
 * Чистый Three.js — см. demos/domDistort/createDomDistortScene.js
 */
export default function DomDistortDemoPage() {
	const sourceRef = useRef(null);
	const canvasRef = useRef(null);
	const viewportRef = useRef(null);
	const [loadError, setLoadError] = useState(null);
	const [sceneReady, setSceneReady] = useState(false);

	useEffect(() => {
		let scene;
		let cancelled = false;

		const onCaptureError = (err) => {
			console.error("[DomDistortDemo]", err);
			if (!cancelled) {
				setLoadError(err?.message || "Ошибка захвата DOM в текстуру.");
			}
		};

		const timerId = setTimeout(() => {
			(async () => {
				try {
					const { createDomDistortScene } = await import(
						"@/demos/domDistort/createDomDistortScene.js"
					);
					if (cancelled || !sourceRef.current || !canvasRef.current) return;

					scene = createDomDistortScene({
						canvas: canvasRef.current,
						sourceElement: sourceRef.current,
						onReady: () => {
							if (cancelled) return;
							setSceneReady(true);
							viewportRef.current?.classList.add("distortReady");
						},
						onError: onCaptureError,
					});
				} catch (err) {
					onCaptureError(err);
				}
			})();
		}, 200);

		return () => {
			cancelled = true;
			clearTimeout(timerId);
			scene?.dispose();
		};
	}, []);

	return (
		<div className="page demo domDistortDemo">
			<div className="demoHeader">
				<div className="demoTitle">Референс: искажение HTML-текста</div>
				<div className="demoHint">
					DOM подложка + WebGL canvas сверху. Текстура только с буквами (прозрачный фон), подложка блока
					статична. Двигайте мышь по области — ripple. Код:{" "}
					<code className="demoCode">src/demos/domDistort/</code>
				</div>
				<Link className="demoBackLink" to="/">
					← На главную
				</Link>
				{loadError && <div className="demoError">{loadError}</div>}
			</div>

			<section className="demoScene">
				<div
					ref={viewportRef}
					className={["distortViewport", sceneReady && "distortReady"].filter(Boolean).join(" ")}
				>
					<div ref={sourceRef} className="distortSource">
						<div className="distortSampleTitle">DigitalMonster</div>
						<div className="distortSampleText">Двигайте мышь — ripple на canvas</div>
					</div>
					<canvas ref={canvasRef} className="distortCanvas" />
					<div className="distortStatus">
						{sceneReady ? "WebGL поверх HTML · текстура готова" : "Захват DOM…"}
					</div>
				</div>
			</section>
		</div>
	);
}
