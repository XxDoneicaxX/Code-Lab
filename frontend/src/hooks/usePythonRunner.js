import { useCallback, useEffect, useRef, useState } from "react";

const WORKER_URL = "/pyodide-worker.js";
const MAX_OUTPUT_LINES = 2000;
const FLUSH_INTERVAL_MS = 50;

const SIGNAL_INDEX = 0;
const LENGTH_INDEX = 1;
const HEADER_BYTES = 8; // two Int32 slots

/**
 * Drives the Pyodide Web Worker.
 *
 * status: "loading" (Pyodide downloading) | "ready" | "running" | "failed"
 * output: [{ kind: "stdout" | "stderr" | "system" | "input-echo", text? }]
 * pendingInput: { prompt } | null — set while the worker is blocked inside
 *   input(), waiting for submitInput() to be called.
 *
 * Output is buffered and flushed every 50ms so a tight print() loop doesn't
 * re-render React thousands of times per second, and capped at
 * MAX_OUTPUT_LINES so it can't eat the tab's memory. stop() terminates the
 * worker (the only way to kill an infinite loop, and the only way to bail
 * out of a stuck input() prompt) and boots a fresh one.
 *
 * input() is bridged via a SharedArrayBuffer: the worker thread genuinely
 * blocks on Atomics.wait() until submitInput() writes the response and
 * calls Atomics.notify() — this requires the page to be cross-origin
 * isolated (see vite.config.js).
 */
export function usePythonRunner() {
  const workerRef = useRef(null);
  const statusRef = useRef("loading");
  const bufferRef = useRef([]);
  const flushTimerRef = useRef(null);
  const hasOutputRef = useRef(false);
  const inputBufferRef = useRef(null); // { signalView, dataView } | null
  const pendingInputRef = useRef(null);
  const pendingDetectionsRef = useRef(new Map()); // requestId -> resolve, for detectPygame()
  const detectionIdRef = useRef(0);
  const [status, setStatus] = useState("loading");
  const [output, setOutput] = useState([]);
  const [pendingInput, setPendingInputState] = useState(null);

  const setPendingInput = useCallback((value) => {
    pendingInputRef.current = value;
    setPendingInputState(value);
  }, []);

  const setStatusBoth = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const enqueueEntry = useCallback((entry) => {
    hasOutputRef.current = true;
    bufferRef.current.push(entry);
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const chunk = bufferRef.current;
      bufferRef.current = [];
      setOutput((prev) => {
        if (prev.length > MAX_OUTPUT_LINES) return prev; // already truncated
        const merged = prev.concat(chunk);
        if (merged.length <= MAX_OUTPUT_LINES) return merged;
        return merged.slice(0, MAX_OUTPUT_LINES).concat({
          kind: "system",
          text: "⚠ Output limit reached — press Stop if your program is stuck, or Clear Output.",
        });
      });
    }, FLUSH_INTERVAL_MS);
  }, []);

  const enqueue = useCallback((kind, text) => enqueueEntry({ kind, text }), [enqueueEntry]);

  const startWorker = useCallback(() => {
    workerRef.current?.terminate();
    setStatusBoth("loading");
    setPendingInput(null);
    inputBufferRef.current = null;
    const worker = new Worker(WORKER_URL);
    worker.onmessage = (event) => {
      const msg = event.data;
      switch (msg.type) {
        case "ready":
          if (msg.inputBuffer) {
            inputBufferRef.current = {
              signalView: new Int32Array(msg.inputBuffer, 0, 2),
              dataView: new Uint8Array(msg.inputBuffer, HEADER_BYTES),
            };
          }
          setStatusBoth("ready");
          break;
        case "stdout":
          enqueue("stdout", msg.text);
          break;
        case "stderr":
          enqueue("stderr", msg.text);
          break;
        case "input_request":
          setPendingInput({ prompt: msg.prompt });
          break;
        case "done":
          setStatusBoth("ready");
          break;
        case "error":
          enqueue("stderr", msg.text);
          setStatusBoth("ready");
          break;
        case "fatal":
          enqueue(
            "system",
            `Python couldn't load (${msg.text}). Check the internet connection and refresh the page.`
          );
          setStatusBoth("failed");
          break;
        case "pygame_detected": {
          const resolve = pendingDetectionsRef.current.get(msg.requestId);
          if (resolve) {
            pendingDetectionsRef.current.delete(msg.requestId);
            resolve(msg.result);
          }
          break;
        }
        default:
          break;
      }
    };
    workerRef.current = worker;
  }, [enqueue, setPendingInput, setStatusBoth]);

  useEffect(() => {
    startWorker();
    return () => {
      workerRef.current?.terminate();
      clearTimeout(flushTimerRef.current);
    };
  }, [startWorker]);

  // Asks the worker's already-loaded Python interpreter whether `code`
  // contains a real `import pygame` (AST-based — see pyodide-worker.js).
  const detectPygame = useCallback((code) => {
    return new Promise((resolve) => {
      if (statusRef.current !== "ready" || !workerRef.current) {
        resolve(false);
        return;
      }
      const requestId = ++detectionIdRef.current;
      pendingDetectionsRef.current.set(requestId, resolve);
      workerRef.current.postMessage({ type: "detect_pygame", code, requestId });
    });
  }, []);

  const run = useCallback(
    (code, manifest) => {
      if (statusRef.current !== "ready" || !workerRef.current) return;
      setStatusBoth("running");
      workerRef.current.postMessage({ type: "run", code, manifest });
    },
    [setStatusBoth]
  );

  const stop = useCallback(() => {
    if (statusRef.current !== "running") return;
    enqueue("system", "⏹ Program stopped. Python is restarting…");
    startWorker();
  }, [enqueue, startWorker]);

  const submitInput = useCallback(
    (value) => {
      const buf = inputBufferRef.current;
      const prompt = pendingInputRef.current?.prompt;
      if (!buf || prompt == null) return;
      setPendingInput(null);
      enqueueEntry({ kind: "input-echo", prompt, value });
      const bytes = new TextEncoder().encode(value);
      const length = Math.min(bytes.length, buf.dataView.length);
      buf.dataView.set(bytes.subarray(0, length));
      Atomics.store(buf.signalView, LENGTH_INDEX, length);
      Atomics.store(buf.signalView, SIGNAL_INDEX, 1);
      Atomics.notify(buf.signalView, SIGNAL_INDEX, 1);
    },
    [enqueueEntry, setPendingInput]
  );

  const clear = useCallback(() => {
    bufferRef.current = [];
    hasOutputRef.current = false;
    setOutput([]);
  }, []);

  return {
    status,
    output,
    pendingInput,
    run,
    stop,
    clear,
    submitInput,
    detectPygame,
    pushOutput: enqueue, // lets other execution modes (pygame) share this same Output feed
  };
}
