/*
 * Runs Python via Pyodide inside a Web Worker so long-running programs never
 * freeze the page, and a stuck program can be force-stopped by terminating
 * the worker (the app then spawns a fresh one).
 *
 * input() is a genuine synchronous block: this thread calls Atomics.wait()
 * and pauses until the main thread writes a response into a shared buffer
 * and calls Atomics.notify(). That requires the page to be cross-origin
 * isolated (COOP/COEP — see vite.config.js and the production deploy notes
 * in README.md). If isolation isn't available for some reason, input()
 * fails with a clear message instead of hanging the worker forever.
 */

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

const INPUT_BUFFER_BYTES = 4096; // max UTF-8 bytes a single input() call can return
const HEADER_INT32S = 2; // [0] signal (0=waiting, 1=response ready), [1] response byte length
const SIGNAL_INDEX = 0;
const LENGTH_INDEX = 1;

const canBlockInput = typeof self.crossOriginIsolated !== "undefined" && self.crossOriginIsolated;

let signalView = null; // Int32Array over the shared header
let dataView = null; // Uint8Array over the shared response bytes

function createInputBuffer() {
  if (!canBlockInput) return null;
  const headerBytes = HEADER_INT32S * 4;
  const sab = new SharedArrayBuffer(headerBytes + INPUT_BUFFER_BYTES);
  signalView = new Int32Array(sab, 0, HEADER_INT32S);
  dataView = new Uint8Array(sab, headerBytes, INPUT_BUFFER_BYTES);
  return sab;
}

function blockingInput(prompt) {
  if (!canBlockInput) {
    throw new Error("input() needs a cross-origin isolated page, which isn't active here.");
  }
  Atomics.store(signalView, SIGNAL_INDEX, 0);
  postMessage({ type: "input_request", prompt: String(prompt ?? "") });
  Atomics.wait(signalView, SIGNAL_INDEX, 0); // blocks this worker thread only
  const length = Atomics.load(signalView, LENGTH_INDEX);
  // TextDecoder.decode() rejects views backed by a SharedArrayBuffer, so
  // copy the bytes into a plain (non-shared) buffer first.
  const copy = new Uint8Array(length);
  copy.set(dataView.subarray(0, length));
  return new TextDecoder().decode(copy);
}

const BOOTSTRAP = `
import ast
import builtins

def _input(prompt=""):
    try:
        return _blocking_input(str(prompt))
    except Exception:
        raise RuntimeError(
            "input() isn't available in this session. Set your values in the code instead!"
        )

builtins.input = _input

def _detect_pygame_import(source):
    """AST-based: only real import statements count, never mentions of
    "pygame" inside comments, strings, or variable names. Never raises —
    a Run must never hang waiting on this; worst case it just falls back
    to the regular (non-pygame) execution path."""
    try:
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                if any(alias.name.split(".")[0] == "pygame" for alias in node.names):
                    return True
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module.split(".")[0] == "pygame":
                    return True
        return False
    except Exception:
        return False
`;

let pyodide = null;

const ready = (async () => {
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });
  pyodide.setStdout({ batched: (text) => postMessage({ type: "stdout", text }) });
  pyodide.setStderr({ batched: (text) => postMessage({ type: "stderr", text }) });
  pyodide.globals.set("_blocking_input", blockingInput);
  await pyodide.runPythonAsync(BOOTSTRAP);
  postMessage({ type: "ready", inputBuffer: createInputBuffer() });
})().catch((err) => {
  pyodide = null;
  postMessage({ type: "fatal", text: String(err) });
});

// Pyodide tracebacks include its own internal frames; show from the student's
// code (the "<exec>" frame) onward.
function friendlyTraceback(message) {
  const lines = String(message).split("\n");
  const start = lines.findIndex((line) => line.includes('File "<exec>"'));
  if (start === -1) return String(message);
  return ["Traceback (most recent call last):", ...lines.slice(start)].join("\n");
}

// Writes a multi-file project's other files (siblings a program might
// `import`) and uploaded assets into Pyodide's virtual filesystem, so
// `import helper` or `open("assets/sprite.png")` work the same way they
// would if this were a real folder of files.
function materializeManifest(manifest) {
  if (!manifest) return;
  // pyodide.FS.mkdirTree is unreliable in this Pyodide build (creates a
  // directory that then fails ENOENT on any read/write) — create each path
  // segment individually with plain mkdir instead, which works correctly.
  const ensureDirFor = (path) => {
    const slash = path.lastIndexOf("/");
    if (slash === -1) return;
    let current = "";
    for (const part of path.slice(0, slash).split("/")) {
      current = current ? `${current}/${part}` : part;
      try {
        pyodide.FS.mkdir(current);
      } catch (err) {
        if (err?.errno !== pyodide.ERRNO_CODES.EEXIST) throw err;
      }
    }
  };
  for (const f of manifest.files ?? []) {
    ensureDirFor(f.path);
    pyodide.FS.writeFile(f.path, f.content);
  }
  for (const a of manifest.assets ?? []) {
    ensureDirFor(a.path);
    pyodide.FS.writeFile(a.path, new Uint8Array(a.bytes));
  }
}

self.onmessage = async (event) => {
  const { type, code, requestId, manifest } = event.data;

  if (type === "detect_pygame") {
    await ready;
    const result = pyodide ? pyodide.globals.get("_detect_pygame_import")(code) : false;
    postMessage({ type: "pygame_detected", requestId, result });
    return;
  }

  if (type !== "run") return;
  await ready;
  if (!pyodide) return;

  // A fresh namespace per run, so deleted code stops "working" after deletion.
  let namespace = null;
  try {
    materializeManifest(manifest);
    namespace = pyodide.globals.get("dict")();
    await pyodide.runPythonAsync(code, { globals: namespace });
    postMessage({ type: "done" });
  } catch (err) {
    postMessage({ type: "error", text: friendlyTraceback(err.message) });
  } finally {
    if (namespace) namespace.destroy();
  }
};
