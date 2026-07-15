import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

import Button from "./Button";
import OutputConsole from "./OutputConsole";
import { usePythonExecution } from "../hooks/usePythonExecution";
import { useTheme } from "../hooks/useTheme";

const ARROW_AND_SPACE_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "Spacebar",
]);

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 15,
  tabSize: 4,
  scrollBeyondLastLine: false,
  wordWrap: "on",
  automaticLayout: true,
};

const STATUS_LABEL = {
  loading: "Loading…",
  ready: "Ready",
  running: "Running…",
  failed: "Unavailable",
};

const STATUS_DOT = {
  loading: "bg-amber-400",
  ready: "bg-emerald-500",
  running: "bg-emerald-500 animate-pulse",
  failed: "bg-red-500",
};

/**
 * Reusable browser Python editor: Monaco + Pyodide execution + output console.
 * Used as-is by both the unsaved Python Workspace and the persistent
 * Classroom Codespace — persistence (Save button, Ctrl+S) is opt-in via the
 * `persistence` prop so this component has no idea whether a database exists.
 *
 * Two editing modes:
 * - Legacy single-file: pass `defaultValue`/`onChange` (Python Workspace).
 * - Multi-file: pass `activeFile` ({id, name, content} | null while loading)
 *   and `onChangeContent` (the classroom Codespace's file explorer). The
 *   Monaco instance is remounted (via `key`) whenever the active file id
 *   changes, since Monaco's `defaultValue` only applies once per mount.
 *
 * `sidebar` is an optional slot rendered to the left of the editor (the file
 * explorer). `getProjectManifest`, if provided, is awaited before Run and
 * materializes the rest of the project's files/assets into Pyodide's
 * filesystem so sibling imports and asset loading work.
 *
 * `extraActions` is a slot in the toolbar for later additions (e.g. an
 * "Ask Bit" button) without changing this component or either caller.
 * `tip` renders an optional callout below the editor.
 *
 * Layout is a side-by-side editor/output split above the `lg` breakpoint,
 * stacked (editor over output) below it for phones and small tablets.
 */
export default function PythonEditor({
  defaultValue,
  onChange,
  activeFile,
  onChangeContent,
  getProjectManifest,
  sidebar,
  persistence,
  extraActions,
  tip,
}) {
  const isMultiFile = activeFile !== undefined;
  const codeRef = useRef(defaultValue ?? "");
  const runner = usePythonExecution();
  const { theme } = useTheme();
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  // Monaco's `defaultValue` only applies at mount; switching files remounts
  // the editor (see `key` below), so resync the run/save buffer here rather
  // than waiting for Monaco's own onChange to fire.
  useEffect(() => {
    if (isMultiFile) codeRef.current = activeFile?.content ?? "";
    // Intentionally keyed on the file id only — content is read once per
    // switch, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiFile, activeFile?.id]);

  const handleEditorChange = (value) => {
    codeRef.current = value ?? "";
    if (isMultiFile) onChangeContent?.(codeRef.current);
    else onChange?.(codeRef.current);
  };

  const handleRun = useCallback(async () => {
    const manifest = await getProjectManifest?.();
    runner.run(codeRef.current, manifest);
  }, [runner, getProjectManifest]);

  // Monaco commands capture their callback once at mount; route through refs
  // so they always call the latest handlers.
  const saveNowRef = useRef(persistence?.onSaveNow);
  saveNowRef.current = persistence?.onSaveNow;
  const runHandlerRef = useRef(handleRun);
  runHandlerRef.current = handleRun;

  const handleEditorMount = (editor, monaco) => {
    if (persistence) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveNowRef.current?.());
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runHandlerRef.current());
    editor.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column });
    });
  };

  // Catch Ctrl+S when focus is outside the editor (e.g. after clicking Run).
  useEffect(() => {
    if (!persistence) return;
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNowRef.current?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [persistence]);

  const monacoTheme = theme === "dark" ? "vs-dark" : "vs";

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {runner.status === "running" ? (
          <Button variant="danger" onClick={runner.stop}>
            ⏹ Stop
          </Button>
        ) : (
          <Button variant="run" onClick={handleRun} disabled={runner.status !== "ready"}>
            {runner.status === "loading"
              ? "Loading Python…"
              : runner.status === "failed"
                ? "Python unavailable"
                : "▶ Run"}
          </Button>
        )}
        {persistence && (
          <Button variant="secondary" onClick={persistence.onSaveNow}>
            Save
          </Button>
        )}
        {extraActions}
        <span className="ml-auto hidden text-xs text-ink/40 sm:block">
          {runner.status === "running"
            ? runner.pendingInput
              ? "Waiting for input…"
              : "Running…"
            : runner.status === "loading"
              ? "Python is loading — the first start can take a few seconds"
              : persistence
                ? "Ctrl+Enter runs · Ctrl+S saves"
                : "Ctrl+Enter runs"}
        </span>
      </div>

      <div className="flex min-h-[60vh] flex-1 flex-col gap-3 lg:min-h-0 lg:flex-row">
        {sidebar && <div className="flex w-full shrink-0 lg:w-56">{sidebar}</div>}
        <div className="flex min-h-[40vh] flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-sm lg:min-h-0 lg:w-1/2">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <span className="flex items-center gap-1.5 rounded-md bg-app-bg px-2.5 py-1 text-xs font-medium text-ink">
              <span aria-hidden="true">🐍</span> {isMultiFile ? (activeFile?.name ?? "…") : "main.py"}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            {isMultiFile && !activeFile ? (
              <div className="flex h-full items-center justify-center text-sm text-ink/60">
                Loading file…
              </div>
            ) : (
              <Editor
                key={isMultiFile ? activeFile.id : "single"}
                height="100%"
                defaultLanguage="python"
                theme={monacoTheme}
                defaultValue={isMultiFile ? activeFile.content : defaultValue}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                options={EDITOR_OPTIONS}
                loading={<span className="text-sm text-ink/60">Loading editor…</span>}
              />
            )}
          </div>
          <div className="flex items-center gap-3 border-t border-border-subtle px-3 py-1.5 text-xs text-ink/50">
            <span>
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[runner.status]}`} />
              Python 3 (Pyodide)
            </span>
          </div>
        </div>

        <div className="flex min-h-[30vh] flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-sm lg:min-h-0 lg:w-1/2">
          <div className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5">
            {[
              { id: "output", label: "Output" },
              { id: "canvas", label: "Canvas" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => runner.setActiveTab(tab.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  runner.activeTab === tab.id
                    ? "bg-accent-soft text-ink"
                    : "text-ink/50 hover:bg-app-bg hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Both panes stay mounted; only CSS visibility toggles, so a
              running game's canvas/context is never lost on tab switch. */}
          <div className={`min-h-0 flex-1 ${runner.activeTab === "output" ? "flex flex-col" : "hidden"}`}>
            <OutputConsole
              entries={runner.output}
              pendingInput={runner.pendingInput}
              onSubmitInput={runner.submitInput}
              className="min-h-0 flex-1"
            />
          </div>
          <div
            className={`min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-black p-3 ${
              runner.activeTab === "canvas" ? "flex" : "hidden"
            }`}
          >
            <canvas
              ref={runner.canvasRef}
              width={480}
              height={360}
              tabIndex={0}
              onKeyDown={(event) => {
                if (ARROW_AND_SPACE_KEYS.has(event.key)) event.preventDefault();
              }}
              className="max-h-full max-w-full rounded border border-white/10 outline-none focus:border-accent"
              style={{ imageRendering: "pixelated" }}
            />
            <p className="text-center text-xs text-white/50">
              {runner.pygameRunning
                ? "Click inside the canvas to use keyboard controls."
                : "Run a Python game to preview it here."}
            </p>
          </div>

          <div className="flex items-center gap-3 border-t border-border-subtle px-3 py-1.5 text-xs text-ink/50">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[runner.status]}`} />
              {runner.status === "running" && runner.pendingInput
                ? "Waiting for input…"
                : STATUS_LABEL[runner.status]}
            </span>
            <span className="ml-auto">Python 3 (Pyodide)</span>
          </div>
        </div>
      </div>

      {tip && (
        <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-4 shadow-sm">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg"
            aria-hidden="true"
          >
            💡
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Tip</p>
            <p className="text-sm text-ink/60">{tip}</p>
          </div>
        </div>
      )}
    </main>
  );
}
