import { useFrame } from "@react-three/fiber";

/**
 * R3F в конце кадра вызывает gl.render(rootScene) — может затереть liquid-фон.
 * Подписчик с priority > 0 отключает этот вызов (см. @react-three/fiber render loop).
 */
export default function CanvasFrameLock() {
	useFrame(() => {}, 10_000);
	return null;
}
