/*
 * Main-thread pygame-ce execution.
 *
 * Pyodide's SDL/canvas compatibility layer only renders correctly against a
 * real, attached <canvas> element on the main thread. A Web Worker has no
 * DOM access at all, and OffscreenCanvas (the only thing a Worker *can* be
 * given) was confirmed to hang instead of render — so unlike the rest of
 * this app's Python execution, pygame programs cannot run in the Worker
 * that protects the page from a runaway `while True`.
 *
 * That trade-off means Stop can't be a hard `worker.terminate()` here.
 * Instead, every browser-friendly pygame loop already has to call
 * `await asyncio.sleep(...)` once per frame (a blocking loop would freeze
 * the tab regardless of Stop) — so `asyncio.sleep` is transparently patched
 * to check a stop flag and raise on each frame, unwinding the loop on
 * demand without the student writing any extra code for it.
 */

const PYODIDE_VERSION = "v0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

const STOP_BOOTSTRAP = `
import asyncio

class _StopRequested(Exception):
    pass

_stop_requested = False
_original_sleep = asyncio.sleep

async def _coop_sleep(delay=0):
    if _stop_requested:
        raise _StopRequested("Program stopped")
    await _original_sleep(delay)
    # Re-check after the await: Stop is likely to land while suspended here,
    # and catching it now (instead of only at the top of the *next* frame's
    # sleep call) avoids drawing one extra frame after Stop was clicked.
    if _stop_requested:
        raise _StopRequested("Program stopped")

asyncio.sleep = _coop_sleep
`;

let scriptLoadingPromise = null;
function loadPyodideScript() {
  if (window.loadPyodide) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;
  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${PYODIDE_URL}pyodide.js`;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Couldn't load Pyodide."));
    document.head.appendChild(script);
  });
  return scriptLoadingPromise;
}

let pyodide = null;
let loadPromise = null;
let currentRunStopRequested = false;

async function ensureRuntime({ onStdout, onStderr }) {
  if (pyodide) return pyodide;
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadPyodideScript();
      const py = await window.loadPyodide({ indexURL: PYODIDE_URL });
      py.setStdout({ batched: onStdout });
      py.setStderr({ batched: onStderr });
      await py.loadPackage("pygame-ce");
      // Opt-in flag Pyodide's own docs describe as needed for SDL-based
      // packages — see https://pyodide.org/en/stable/usage/sdl.html.
      py._api._skip_unwind_fatal_error = true;
      await py.runPythonAsync(STOP_BOOTSTRAP);
      pyodide = py;
      return py;
    })().catch((err) => {
      loadPromise = null; // allow retrying after a failed load
      throw err;
    });
  }
  return loadPromise;
}

// Pyodide tracebacks include its own internal frames; show from the
// student's code (the "<exec>" frame) onward — mirrors pyodide-worker.js.
function friendlyTraceback(message) {
  const lines = String(message).split("\n");
  const start = lines.findIndex((line) => line.includes('File "<exec>"'));
  if (start === -1) return String(message);
  return ["Traceback (most recent call last):", ...lines.slice(start)].join("\n");
}

// Loading Pyodide/pygame-ce on the main thread can fail for reasons outside
// the student's control — most commonly a school content filter or browser
// extension blocking eval()/WASM, which Pyodide's startup needs. Whatever
// the cause, this always surfaces as a clear message instead of the Run
// button silently doing nothing (see the CSP-blocked-eval incident this
// message is written for).
function friendlyLoadError(err) {
  const detail = err?.message || String(err);
  return (
    "Couldn't start the pygame runtime. This device's security settings " +
    "(often a school content filter or browser extension) may be blocking " +
    "it — try a different computer or browser profile.\n\n" +
    `Technical detail: ${detail}`
  );
}

// Writes a multi-file project's other files and uploaded assets into
// Pyodide's virtual filesystem — mirrors materializeManifest() in
// pyodide-worker.js (duplicated rather than shared: this runs on the main
// thread, that's a classic Worker script, and the helper is a few lines).
function materializeManifest(py, manifest) {
  if (!manifest) return;
  // py.FS.mkdirTree is unreliable in this Pyodide build (creates a
  // directory that then fails ENOENT on any read/write) — create each path
  // segment individually with plain mkdir instead, which works correctly.
  const ensureDirFor = (path) => {
    const slash = path.lastIndexOf("/");
    if (slash === -1) return;
    let current = "";
    for (const part of path.slice(0, slash).split("/")) {
      current = current ? `${current}/${part}` : part;
      try {
        py.FS.mkdir(current);
      } catch (err) {
        if (err?.errno !== py.ERRNO_CODES.EEXIST) throw err;
      }
    }
  };
  for (const f of manifest.files ?? []) {
    ensureDirFor(f.path);
    py.FS.writeFile(f.path, f.content);
  }
  for (const a of manifest.assets ?? []) {
    ensureDirFor(a.path);
    py.FS.writeFile(a.path, new Uint8Array(a.bytes));
  }
}

/**
 * Runs pygame code against the given <canvas>. Resolves with:
 *   { outcome: "done" }                 — program finished on its own
 *   { outcome: "stopped" }              — requestPygameStop() was called
 *   { outcome: "error", message }       — a real exception in student code
 */
export async function runPygame(code, canvas, { onStdout, onStderr }, manifest) {
  let py;
  try {
    py = await ensureRuntime({ onStdout, onStderr });
    py.canvas.setCanvas2D(canvas);
  } catch (err) {
    return { outcome: "error", message: friendlyLoadError(err) };
  }

  currentRunStopRequested = false;
  py.globals.set("_stop_requested", false);

  let namespace = null;
  try {
    materializeManifest(py, manifest);
    namespace = py.globals.get("dict")();
    await py.runPythonAsync(code, { globals: namespace });
    return { outcome: "done" };
  } catch (err) {
    if (currentRunStopRequested) return { outcome: "stopped" };
    return { outcome: "error", message: friendlyTraceback(err.message) };
  } finally {
    if (namespace) namespace.destroy();
  }
}

export function requestPygameStop() {
  currentRunStopRequested = true;
  if (pyodide) pyodide.globals.set("_stop_requested", true);
}

export function resetPygameCanvas(canvas) {
  const ctx = canvas?.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
