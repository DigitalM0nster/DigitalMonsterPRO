const FBX_DEV_HINTS = [
	{
		match: "more than 4 skinning weights",
		hint: "В Blender: Armature → Limit Total (4 веса на вершину) перед экспортом FBX.",
	},
	{
		match: "Polygons with more than four sides",
		hint: "В Blender: выделить меш → Ctrl+T (Triangulate Faces) перед экспортом FBX.",
	},
];

/**
 * FBXLoader пишет шумные warn при типичных моделях из Blender.
 * Подавляем известные сообщения и один раз подсказываем, что поправить в экспорте.
 */
export async function loadFbxQuiet(loader, url) {
	const originalWarn = console.warn;
	const seen = new Set();

	console.warn = (...args) => {
		const message = String(args[0] ?? "");

		for (const entry of FBX_DEV_HINTS) {
			if (!message.includes(entry.match)) {
				continue;
			}

			if (!seen.has(entry.match)) {
				seen.add(entry.match);
				if (import.meta.env.DEV) {
					console.info(`[FBX] ${message}\n→ ${entry.hint}`);
				}
			}

			return;
		}

		originalWarn(...args);
	};

	try {
		return await loader.loadAsync(url);
	} finally {
		console.warn = originalWarn;
	}
}
