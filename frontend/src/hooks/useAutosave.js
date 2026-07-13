import { useCallback, useEffect, useRef, useState } from "react";

const AUTOSAVE_DELAY_MS = 5000;
const RETRY_DELAY_MS = 10000;

/**
 * Debounced autosave with stale-response protection.
 *
 * Every save captures a sequence number and the edit counter at send time:
 * - responses from superseded requests are discarded (seq check), and
 * - a response only flips the indicator to "saved" if no edits happened
 *   while the request was in flight (counter check),
 * so a slow, stale save response can never masquerade as "all saved".
 *
 * Also flushes pending changes (with fetch keepalive) when the tab is hidden
 * or closed — important on Chromebooks that get slammed shut mid-edit.
 */
export function useAutosave({ save, onAuthError }) {
  const [state, setState] = useState({ status: "saved", savedAt: null });
  const valueRef = useRef(null);
  const changeCounterRef = useRef(0);
  const savedCounterRef = useRef(0);
  const seqRef = useRef(0);
  const timerRef = useRef(null);

  const runSave = useCallback(
    async ({ keepalive = false } = {}) => {
      clearTimeout(timerRef.current);
      if (valueRef.current == null) return;
      const seq = ++seqRef.current;
      const counter = changeCounterRef.current;
      setState((s) => ({ ...s, status: "saving" }));
      try {
        await save(valueRef.current, { keepalive });
        if (seq !== seqRef.current) return; // a newer save is in flight
        savedCounterRef.current = counter;
        if (changeCounterRef.current === counter) {
          setState({ status: "saved", savedAt: new Date() });
        }
        // else: the user typed while saving; the rescheduled timer saves again
      } catch (err) {
        if (seq !== seqRef.current) return;
        if (err?.status === 401) {
          onAuthError?.(err);
          return;
        }
        setState((s) => ({ ...s, status: "error" }));
        timerRef.current = setTimeout(runSave, RETRY_DELAY_MS);
      }
    },
    [save, onAuthError]
  );

  const notifyChange = useCallback(
    (value) => {
      valueRef.current = value;
      changeCounterRef.current += 1;
      setState((s) => (s.status === "dirty" ? s : { ...s, status: "dirty" }));
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runSave, AUTOSAVE_DELAY_MS);
    },
    [runSave]
  );

  const saveNow = useCallback(() => runSave(), [runSave]);

  // Called once the initial code is loaded, so manual Save works immediately.
  const reset = useCallback((value) => {
    valueRef.current = value;
    changeCounterRef.current = 0;
    savedCounterRef.current = 0;
    seqRef.current += 1; // invalidate any in-flight response
    clearTimeout(timerRef.current);
    setState({ status: "saved", savedAt: null });
  }, []);

  const flush = useCallback(() => {
    if (valueRef.current == null) return;
    if (changeCounterRef.current === savedCounterRef.current) return;
    runSave({ keepalive: true });
  }, [runSave]);

  useEffect(() => {
    const onPageHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timerRef.current);
      flush(); // save pending edits when navigating away within the app
    };
  }, [flush]);

  return { status: state.status, savedAt: state.savedAt, notifyChange, saveNow, reset };
}
