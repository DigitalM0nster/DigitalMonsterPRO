import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Deliberately pinned: only the compilation lifecycle is backported from r158.
// ShaderChunks, source generation, lighting and colour management stay at r155.
const SOURCE_SHA256 = "6c3a6299b7ae2eb8f3a9ae83f05cf50d6b3ba58931c34033a8abfac6bcf4acba";
const digest = source => createHash("sha256").update(source).digest("hex");

/** Included verbatim in the generated Three module; no imports/outer bindings. */
export function waitForPrograms(programs, gl, cancelled, scene, nextTick = callback => setTimeout(callback, 10)) {
	return new Promise((resolve, reject) => {
		const check = () => {
			try {
				if (cancelled()) throw new DOMException("Shader preparation cancelled", "AbortError");
				for (const program of programs) {
					if (!program.program) throw new DOMException("Shader program disposed", "AbortError");
					if (!program.isReady()) continue;
					// LINK_STATUS and reflection are queried only AFTER non-blocking completion.
					if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
						throw new Error(`Shader preparation failed (${program.name}): ${gl.getProgramInfoLog(program.program)}`);
					}
					program.getUniforms();
					program.getAttributes();
					programs.delete(program);
				}
				if (programs.size === 0) resolve(scene);
				else nextTick(check);
			} catch (error) {
				reject(error);
			}
		};
		check();
	});
}

function replaceOnce(source, before, after) {
	if (source.split(before).length !== 2) throw new Error("Three parallel-compile patch anchor changed");
	return source.replace(before, after);
}

export function patchThreeParallelCompile(source) {
	if (digest(source) !== SOURCE_SHA256) {
		throw new Error("Three source changed: review the r155 parallel-compile backport before building");
	}
	let patched = source;
	const firstUseStart = source.indexOf("\t// check for link errors\n", source.indexOf("function WebGLProgram("));
	const firstUseEnd = source.indexOf("\t// set up caching for uniform locations", firstUseStart);
	const diagnostics = source.slice(firstUseStart, firstUseEnd);
	patched = replaceOnce(patched, diagnostics, `
	// r158-style lazy diagnostics: querying logs here would synchronously wait.
	let initialized = false;
	function onFirstUse(self) {
		if (initialized) return;
		initialized = true;
${diagnostics.replace("this.diagnostics =", "self.diagnostics =")}
	}
	const parallelCompile = renderer.extensions.has('KHR_parallel_shader_compile');
	if (parallelCompile) renderer.extensions.get('KHR_parallel_shader_compile');
	let ready = !parallelCompile;
	this.isReady = function () {
		if (!ready) ready = gl.getProgramParameter(program, 0x91B1);
		return ready;
	};

`);
	patched = replaceOnce(patched, "cachedUniforms = new WebGLUniforms( gl, program );", "onFirstUse(this);\n\t\t\tcachedUniforms = new WebGLUniforms( gl, program );");
	patched = replaceOnce(patched, "cachedAttributes = fetchAttributeLocations( gl, program );", "onFirstUse(this);\n\t\t\tcachedAttributes = fetchAttributeLocations( gl, program );");
	// A program can be disposed while compilation is still pending, before first use.
	patched = replaceOnce(patched, "bindingStates.releaseStatesOfProgram( this );", `if (!initialized) {
			gl.deleteShader(glVertexShader);
			gl.deleteShader(glFragmentShader);
		}
		bindingStates.releaseStatesOfProgram( this );`);
	const compileStart = patched.indexOf("\t\tthis.compile = function ( scene, camera ) {");
	const compileEnd = patched.indexOf("\t\t// Animation Loop", compileStart);
	const oldCompile = patched.slice(compileStart, compileEnd);
	let compile = oldCompile.replace("\n\n", "\n\n\t\t\tconst programs = new Set();\n");
	compile = compile.replaceAll("getProgram( material, scene, object );", "programs.add(getProgram( material, scene, object ));");
	compile = compile.replace("currentRenderState = null;", "currentRenderState = null;\n\t\t\treturn programs;");
	patched = replaceOnce(patched, oldCompile, compile + `
		this.compileAsync = function (scene, camera) {
			const programs = this.compile(scene, camera);
			return (${waitForPrograms.toString()})(programs, _gl,
				() => _parallelCompileDisposed || _isContextLost || _gl.isContextLost(), scene);
		};

`);
	patched = replaceOnce(patched, "let _isContextLost = false;", "let _isContextLost = false;\n\t\tlet _parallelCompileDisposed = false;");
	patched = replaceOnce(patched, "this.dispose = function () {\n\n\t\t\tcanvas.removeEventListener", "this.dispose = function () {\n\n\t\t\t_parallelCompileDisposed = true;\n\t\t\tcanvas.removeEventListener");
	patched = replaceOnce(patched, `\t\t\tconst progUniforms = program.getUniforms();
\t\t\tconst uniformsList = WebGLUniforms.seqWithValue( progUniforms.seq, uniforms );

\t\t\tmaterialProperties.currentProgram = program;
\t\t\tmaterialProperties.uniformsList = uniformsList;`, `\t\t\tmaterialProperties.currentProgram = program;
\t\t\tmaterialProperties.uniformsList = null;`);
	patched = replaceOnce(patched, "m_uniforms = materialProperties.uniforms;", `m_uniforms = materialProperties.uniforms;

			if (materialProperties.uniformsList === null) {
				materialProperties.uniformsList = WebGLUniforms.seqWithValue(p_uniforms.seq, m_uniforms);
			}`);
	return patched;
}

/** Exact Three alias for dev/prebundling AND production; npm package is untouched. */
export function prepareThreeParallelCompile(projectRoot) {
	const require = createRequire(path.join(projectRoot, "package.json"));
	const sourcePath = path.join(path.dirname(require.resolve("three")), "three.module.js");
	const source = patchThreeParallelCompile(readFileSync(sourcePath, "utf8"));
	const cache = path.join(projectRoot, "node_modules/.cache/digital-monster");
	const modulePath = path.join(cache, `three-r155-parallel-${digest(source).slice(0, 16)}.mjs`);
	mkdirSync(cache, { recursive: true });
	if (!existsSync(modulePath)) writeFileSync(modulePath, source);
	return modulePath;
}
