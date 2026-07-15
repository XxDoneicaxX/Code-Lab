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

# Many pygame/pygbag entry points schedule their game loop with
# asyncio.ensure_future(main()) / asyncio.create_task(main()) — or, for
# desktop-style code, asyncio.run(main()) — as the last line of the module,
# rather than a top-level \`await\`. runPythonAsync() only awaits the module
# body itself, so once that line schedules the task the module is finished
# from Python's point of view and runPythonAsync() resolves immediately —
# even though the actual game loop hasn't run a single frame yet. Left
# alone, that races our JS wrapper into treating the game as already
# "done" while it's still genuinely rendering in the background: Stop
# stops responding, and the canvas/keyboard state tracking goes stale.
# Track whatever gets scheduled here so the JS side can explicitly await
# it after the module body finishes running.
_pending_task = None
_original_ensure_future = asyncio.ensure_future
_original_create_task = asyncio.create_task

def _tracking_ensure_future(coro_or_future, **kwargs):
    global _pending_task
    _pending_task = _original_ensure_future(coro_or_future, **kwargs)
    return _pending_task

def _tracking_create_task(coro, **kwargs):
    global _pending_task
    _pending_task = _original_create_task(coro, **kwargs)
    return _pending_task

asyncio.ensure_future = _tracking_ensure_future
asyncio.create_task = _tracking_create_task

# asyncio.run(main()) is completely standard outside a browser, but
# runPythonAsync() already runs student code inside its own active event
# loop, so the real asyncio.run() raises "cannot be called from a running
# event loop" the instant it's reached — a confusing failure for a pattern
# students didn't write wrong. Schedule it instead (tracked, as above) when
# a loop is already running, so desktop-style code just works unmodified.
_original_run = asyncio.run

def _browser_safe_run(coro, *args, **kwargs):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = None
    if loop is not None and loop.is_running():
        return asyncio.ensure_future(coro)
    return _original_run(coro, *args, **kwargs)

asyncio.run = _browser_safe_run
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
let gameActive = false;

// The first time pygame.init() runs, Emscripten/SDL2 registers its own
// keydown/keyup/keypress listeners directly on `document` (confirmed via
// instrumentation — not scoped to the canvas), and never removes them.
// They also aren't re-registered on later runs (SDL_Init() is a no-op once
// already initialized), so they can't simply be torn down after each run —
// that would leave the *next* game with no keyboard input at all. Once
// installed they sit there for the rest of the page's life, which is why
// typing (and browser shortcuts like copy/paste, since a keydown listener
// anywhere in the chain can cancel the browser's default action) stops
// working everywhere after a game has run, until a full reload tears down
// the whole JS runtime.
//
// Fix: register our own bubble-phase listener on `document` here, at
// module load — guaranteed to run before pygame ever starts, so it's first
// in document's listener list for these event types. When no game is
// currently running, stopImmediatePropagation() stops SDL's listener from
// ever firing (and therefore from cancelling the browser's default action),
// without affecting the editor — whatever element has focus already
// handled the event in the target phase, earlier in dispatch — and without
// calling preventDefault() ourselves, so normal typing/copy/paste proceed.
if (typeof document !== "undefined") {
  const gateSdlKeyboardCapture = (event) => {
    if (!gameActive) event.stopImmediatePropagation();
  };
  document.addEventListener("keydown", gateSdlKeyboardCapture);
  document.addEventListener("keyup", gateSdlKeyboardCapture);
  document.addEventListener("keypress", gateSdlKeyboardCapture);
}

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
  gameActive = true;

  let namespace = null;
  try {
    materializeManifest(py, manifest);
    namespace = py.globals.get("dict")();
    // runPythonAsync executes code like exec(), which never sets __file__ —
    // real script runs do. Students commonly locate their assets folder via
    // os.path.dirname(os.path.abspath(__file__)), so without this it's a
    // NameError before the game even starts. "main.py" matches the relative
    // paths materializeManifest() writes files/assets at, so path math
    // relative to it (e.g. joining "assets") resolves the same either way.
    namespace.set("__file__", "main.py");
    // Without this, __name__ defaults to "builtins" (Pyodide's exec fallback,
    // not "__main__" like a real script run) — so the extremely common
    // `if __name__ == "__main__": ...` entry-point idiom silently never
    // executes. No error, no output, the script just finishes instantly,
    // which looks exactly like "runs then stops in under a second" with
    // nothing ever drawn to the canvas.
    namespace.set("__name__", "__main__");
    await py.runPythonAsync(code, { globals: namespace });
    // The module body finishing doesn't mean the game is done — code that
    // schedules its loop via ensure_future/create_task/run (see
    // STOP_BOOTSTRAP) only *starts* it here. Wait for that tracked task too,
    // so "done"/"stopped"/"error" reflect when the game actually finishes.
    // Awaited directly as a PyProxy rather than via a second
    // runPythonAsync() call — Pyodide's single WebLoop rejects a nested
    // eval_code_async() trying to await a task from an earlier one
    // ("Task cannot await on itself").
    const pendingTask = py.globals.get("_pending_task");
    if (pendingTask) {
      try {
        await pendingTask;
      } finally {
        pendingTask.destroy();
        py.runPython("_pending_task = None");
      }
    }
    return { outcome: "done" };
  } catch (err) {
    if (currentRunStopRequested) return { outcome: "stopped" };
    return { outcome: "error", message: friendlyTraceback(err.message) };
  } finally {
    gameActive = false;
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
