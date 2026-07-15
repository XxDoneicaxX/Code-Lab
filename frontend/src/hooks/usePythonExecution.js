import { useCallback, useRef, useState } from "react";

import { requestPygameStop, resetPygameCanvas, runPygame } from "../lib/pygameRuntime";
import { usePythonRunner } from "./usePythonRunner";

/**
 * Unified Python execution: routes each Run between the existing Worker
 * (safe for ordinary code — hard-killable, supports genuine blocking
 * input()) and the main-thread pygame runtime (the only configuration
 * that actually renders — see pygameRuntime.js), based on an AST check of
 * the code about to run. This is the one thing both PythonWorkspacePage
 * and the classroom Codespace should use instead of usePythonRunner
 * directly, so pygame support isn't tied to either page.
 *
 * `canvasRef` is created here and must be attached to the <canvas> the
 * caller renders for the Canvas tab — it stays mounted across tab
 * switches so a running game's state/context is never lost.
 */
export function usePythonExecution() {
  const workerRunner = usePythonRunner();
  const canvasRef = useRef(null);
  const pygameRunningRef = useRef(false);
  const [pygameRunning, setPygameRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("output");

  const stopPreviousGame = useCallback(() => {
    if (!pygameRunningRef.current) return;
    requestPygameStop();
    if (canvasRef.current) resetPygameCanvas(canvasRef.current);
  }, []);

  const run = useCallback(
    async (code, getManifest) => {
      if (workerRunner.status !== "ready" || pygameRunningRef.current) return;
      workerRunner.clear(); // each Run starts with a clean Output, like a normal IDE

      let manifest;
      if (getManifest) {
        try {
          manifest = await getManifest();
        } catch (err) {
          // A failure fetching sibling files/assets must surface, not just
          // leave Run looking like it did nothing.
          workerRunner.pushOutput("stderr", `Couldn't load project files: ${err.message}`);
          return;
        }
      }

      const needsPygame = await workerRunner.detectPygame(code);

      if (!needsPygame) {
        stopPreviousGame();
        pygameRunningRef.current = false;
        setPygameRunning(false);
        setActiveTab("output"); // rule 12: plain code after a game returns to Output
        workerRunner.run(code, manifest);
        return;
      }

      setActiveTab("canvas"); // rule 4: auto-switch when the code imports pygame
      if (canvasRef.current) resetPygameCanvas(canvasRef.current);
      pygameRunningRef.current = true;
      setPygameRunning(true);

      const result = await runPygame(
        code,
        canvasRef.current,
        {
          onStdout: (text) => workerRunner.pushOutput("stdout", text), // rule 8
          onStderr: (text) => workerRunner.pushOutput("stderr", text),
        },
        manifest
      );

      pygameRunningRef.current = false;
      setPygameRunning(false);
      if (result.outcome === "error") {
        workerRunner.pushOutput("stderr", result.message);
        setActiveTab("output"); // rule 7: exceptions surface in Output
      } else if (result.outcome === "stopped" && canvasRef.current) {
        // Belt-and-suspenders: the immediate clear in stopPreviousGame() can
        // still be followed by one in-flight frame finishing its draw
        // before the cooperative check unwinds the loop.
        resetPygameCanvas(canvasRef.current);
      }
      // "done" and "stopped" stay on the Canvas tab (rule 11).
    },
    [workerRunner, stopPreviousGame]
  );

  const stop = useCallback(() => {
    if (pygameRunningRef.current) {
      stopPreviousGame();
    } else {
      workerRunner.stop();
    }
  }, [workerRunner, stopPreviousGame]);

  return {
    status: pygameRunning ? "running" : workerRunner.status,
    output: workerRunner.output,
    pendingInput: workerRunner.pendingInput,
    run,
    stop,
    submitInput: workerRunner.submitInput,
    activeTab,
    setActiveTab, // rule 3: manual switching is always allowed
    canvasRef,
    pygameRunning,
  };
}
