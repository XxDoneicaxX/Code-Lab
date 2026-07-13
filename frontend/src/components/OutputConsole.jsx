import { useEffect, useRef } from "react";

const COLORS = {
  stdout: "text-ink",
  stderr: "text-red-600",
  system: "italic text-ink/40",
};

export default function OutputConsole({ entries, pendingInput, onSubmitInput, className = "" }) {
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, pendingInput]);

  useEffect(() => {
    if (pendingInput) inputRef.current?.focus();
  }, [pendingInput]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmitInput?.(inputRef.current?.value ?? "");
  };

  return (
    <div
      ref={scrollRef}
      className={`overflow-y-auto px-4 py-3 font-mono text-sm leading-6 ${className}`}
    >
      {entries.length === 0 && !pendingInput ? (
        <p className="text-ink/40">Press Run to see your program's output here.</p>
      ) : (
        entries.map((entry, index) =>
          entry.kind === "input-echo" ? (
            <div key={index} className="whitespace-pre-wrap break-words text-ink">
              {entry.prompt}
              <span className="text-accent">{entry.value}</span>
            </div>
          ) : (
            <div
              key={index}
              className={`whitespace-pre-wrap break-words ${COLORS[entry.kind] ?? COLORS.stdout}`}
            >
              {entry.text || " "}
            </div>
          )
        )
      )}
      {pendingInput && (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-1 text-ink">
          <span className="whitespace-pre-wrap break-words">{pendingInput.prompt}</span>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            aria-label="Program input"
            className="min-w-16 flex-1 border-b border-accent bg-transparent text-accent outline-none"
          />
        </form>
      )}
    </div>
  );
}
