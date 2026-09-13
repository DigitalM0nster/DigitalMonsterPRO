import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { prepareThreeParallelCompile } from "./tools/three/parallelCompile.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	// Доступ с телефона в той же локальной сети; Vite печатает адрес Network.
	server: {
		host: "0.0.0.0",
		port: 5173,
		strictPort: true,
	},
	preview: {
		host: "0.0.0.0",
		port: 4173,
		strictPort: true,
	},
	resolve: {
		alias: [
			{ find: "@", replacement: path.resolve(projectRoot, "src") },
			{ find: /^three$/, replacement: prepareThreeParallelCompile(projectRoot) },
		],
	},
	// Vite 8 по умолчанию minify CSS через lightningcss; у нас большой legacy-CSS — esbuild стабильнее
	build: {
		cssMinify: "esbuild",
	},
});
