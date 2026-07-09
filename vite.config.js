import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(projectRoot, "src"),
		},
	},
	// Vite 8 по умолчанию minify CSS через lightningcss; у нас большой legacy-CSS — esbuild стабильнее
	build: {
		cssMinify: "esbuild",
	},
});
