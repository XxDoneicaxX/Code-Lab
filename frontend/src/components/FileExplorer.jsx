import { useEffect, useMemo, useRef, useState } from "react";

import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import Dialog from "./Dialog";

const ASSET_ACCEPT = ".png,.jpg,.jpeg,.webp,.wav,.mp3";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AUDIO_TYPES = new Set(["audio/wav", "audio/mpeg"]);

const ICONS = {
  ".py": "🐍",
  ".png": "🖼️",
  ".jpg": "🖼️",
  ".jpeg": "🖼️",
  ".webp": "🖼️",
  ".wav": "🔊",
  ".mp3": "🔊",
};

function iconFor(name, isDirectory, isOpen) {
  if (isDirectory) return isOpen ? "📂" : "📁";
  const dot = name.lastIndexOf(".");
  return ICONS[dot === -1 ? "" : name.slice(dot).toLowerCase()] ?? "📄";
}

function resolveTargetFolderId(selectedId, byId, rootId) {
  const node = selectedId == null ? null : byId.get(selectedId);
  if (!node) return rootId;
  return node.is_directory ? node.id : (node.parent_id ?? rootId);
}

/** Every directory in the project, labeled with its full path from root, for
 * the Move dialog's destination picker. */
function folderOptions(files, byId, rootId) {
  const pathFor = (id) => {
    const parts = [];
    let node = byId.get(id);
    while (node && node.id !== rootId) {
      parts.unshift(node.name);
      node = node.parent_id == null ? undefined : byId.get(node.parent_id);
    }
    return parts.length ? parts.join("/") : "(Project root)";
  };
  const dirs = files
    .filter((f) => f.is_directory)
    .map((f) => ({ id: f.id, label: pathFor(f.id) }));
  dirs.sort((a, b) => a.label.localeCompare(b.label));
  return [{ id: rootId, label: "(Project root)" }, ...dirs];
}

function triggerBrowserDownload(bytes, filename, contentType) {
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Fetches an asset's bytes once and shows it inline — an <img> for images,
 * an <audio> player for sound — plus a Download button. Loads lazily (only
 * once this dialog is open) since most assets in a project are never
 * previewed in a given session. */
function AssetPreviewDialog({ node, onFetchBytes, onClose }) {
  const [state, setState] = useState({ status: "loading" }); // | {status:"ready", url, bytes} | {status:"error", message}

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    onFetchBytes(node.id)
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: node.content_type }));
        setState({ status: "ready", url: objectUrl, bytes });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [node, onFetchBytes]);

  return (
    <Dialog title={node.name} onClose={onClose}>
      <div className="mt-4 flex flex-col items-center gap-3">
        {state.status === "loading" && <p className="text-sm text-ink/60">Loading…</p>}
        {state.status === "error" && (
          <p className="text-sm font-medium text-red-600">{state.message}</p>
        )}
        {state.status === "ready" && IMAGE_TYPES.has(node.content_type) && (
          <img
            src={state.url}
            alt={node.name}
            className="max-h-80 max-w-full rounded-lg border border-border-subtle object-contain"
          />
        )}
        {state.status === "ready" && AUDIO_TYPES.has(node.content_type) && (
          <audio controls src={state.url} className="w-full" />
        )}
        <div className="mt-1 flex w-full justify-end gap-2">
          <Button variant="neutral" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled={state.status !== "ready"}
            onClick={() =>
              state.status === "ready" &&
              triggerBrowserDownload(state.bytes, node.name, node.content_type)
            }
          >
            Download
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Destination-folder picker for Move. */
function MoveDialog({ node, options, initialParentId, busy, error, onSubmit, onClose }) {
  const [parentId, setParentId] = useState(initialParentId);
  return (
    <Dialog title={`Move "${node.name}"`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit(parentId);
        }}
        className="mt-4 flex flex-col gap-3"
      >
        <label className="text-sm font-medium text-ink/70">
          Destination folder
          <select
            autoFocus
            value={parentId}
            onChange={(event) => setParentId(Number(event.target.value))}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/30"
          >
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="neutral" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Moving…" : "Move"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Inline single-text-field dialog for New File / New Folder / Rename. */
function NameDialog({ title, submitLabel, initialValue = "", busy, error, onSubmit, onClose }) {
  const [name, setName] = useState(initialValue);
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (trimmed && !busy) onSubmit(trimmed);
        }}
        className="mt-4 flex flex-col gap-3"
      >
        <input
          autoFocus
          type="text"
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/30"
        />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="neutral" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * VS Code-style file tree for a classroom Codespace. Displays `files` (a
 * flat list, each with a `parent_id`) as a nested tree rooted at `rootId`.
 * New File / New Folder / Upload Asset target whichever folder is selected
 * (or its parent, if a file is selected) — falling back to the project root.
 */
export default function FileExplorer({
  rootId,
  files,
  activeFileId,
  onSelectFile,
  onCreate,
  onRename,
  onDelete,
  onUploadAsset,
  onMove,
  onFetchAssetBytes,
}) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(null); // { parentId, isDirectory } | null
  const [renaming, setRenaming] = useState(null); // file | null
  const [deleting, setDeleting] = useState(null); // file | null
  const [moving, setMoving] = useState(null); // file | null
  const [previewing, setPreviewing] = useState(null); // file | null
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const fileInputRef = useRef(null);

  const byId = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      if (!map.has(f.parent_id)) map.set(f.parent_id, []);
      map.get(f.parent_id).push(f);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [files]);

  const selectedNode = selectedId == null ? null : byId.get(selectedId);
  const targetFolderId = resolveTargetFolderId(selectedId, byId, rootId);

  const toggleFolder = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (node) => {
    setSelectedId(node.id);
    if (node.is_directory) toggleFolder(node.id);
    else if (node.content_type) setPreviewing(node); // assets aren't editable text — preview instead
    else onSelectFile(node);
  };

  const runAction = async (action) => {
    setBusy(true);
    setFormError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setFormError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (name) => {
    const ok = await runAction(() => onCreate(creating.parentId, name, creating.isDirectory));
    if (ok) setCreating(null);
  };

  const handleRename = async (name) => {
    const ok = await runAction(() => onRename(renaming, name));
    if (ok) setRenaming(null);
  };

  const handleDelete = async () => {
    const ok = await runAction(() => onDelete(deleting));
    if (ok) {
      if (selectedId === deleting.id) setSelectedId(null);
      setDeleting(null);
    }
  };

  const handleMove = async (parentId) => {
    const ok = await runAction(() => onMove(moving, parentId));
    if (ok) setMoving(null);
  };

  const handleDownload = async (node) => {
    setDownloading(true);
    try {
      const bytes = await onFetchAssetBytes(node.id);
      triggerBrowserDownload(bytes, node.name, node.content_type);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleUploadChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    await runAction(() => onUploadAsset(targetFolderId, file));
  };

  const renderNode = (node, depth) => {
    const isOpen = node.is_directory && !collapsedIds.has(node.id);
    return (
      <li key={node.id}>
        <button
          type="button"
          onClick={() => handleSelect(node)}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition-colors ${
            node.id === activeFileId
              ? "bg-accent-soft font-medium text-ink"
              : node.id === selectedId
                ? "bg-app-bg text-ink"
                : "text-ink/70 hover:bg-app-bg hover:text-ink"
          }`}
        >
          <span aria-hidden="true">{iconFor(node.name, node.is_directory, isOpen)}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {node.is_directory && isOpen && (
          <ul>
            {(childrenByParent.get(node.id) ?? []).map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border-subtle bg-surface">
      <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle p-2">
        <Button
          variant="neutral"
          className="!px-2 !py-1 text-xs"
          onClick={() => setCreating({ parentId: targetFolderId, isDirectory: false })}
        >
          + File
        </Button>
        <Button
          variant="neutral"
          className="!px-2 !py-1 text-xs"
          onClick={() => setCreating({ parentId: targetFolderId, isDirectory: true })}
        >
          + Folder
        </Button>
        <Button
          variant="neutral"
          className="!px-2 !py-1 text-xs"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ASSET_ACCEPT}
          className="hidden"
          onChange={handleUploadChosen}
        />
        <Button
          variant="neutral"
          className="!px-2 !py-1 text-xs"
          disabled={!selectedNode}
          onClick={() => selectedNode && setRenaming(selectedNode)}
        >
          Rename
        </Button>
        <Button
          variant="neutral"
          className="!px-2 !py-1 text-xs"
          disabled={!selectedNode}
          onClick={() => selectedNode && setMoving(selectedNode)}
        >
          Move
        </Button>
        {selectedNode?.content_type && (
          <Button
            variant="neutral"
            className="!px-2 !py-1 text-xs"
            disabled={downloading}
            onClick={() => handleDownload(selectedNode)}
          >
            {downloading ? "Downloading…" : "Download"}
          </Button>
        )}
        <Button
          variant="danger-outline"
          className="!px-2 !py-1 text-xs"
          disabled={!selectedNode}
          onClick={() => selectedNode && setDeleting(selectedNode)}
        >
          Delete
        </Button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {(childrenByParent.get(rootId) ?? []).map((node) => renderNode(node, 0))}
      </ul>

      {creating && (
        <NameDialog
          title={creating.isDirectory ? "New Folder" : "New File"}
          submitLabel="Create"
          busy={busy}
          error={formError}
          onSubmit={handleCreate}
          onClose={() => {
            setCreating(null);
            setFormError(null);
          }}
        />
      )}
      {renaming && (
        <NameDialog
          title={`Rename "${renaming.name}"`}
          submitLabel="Save Name"
          initialValue={renaming.name}
          busy={busy}
          error={formError}
          onSubmit={handleRename}
          onClose={() => {
            setRenaming(null);
            setFormError(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message={
            deleting.is_directory
              ? "This will also delete everything inside this folder."
              : "This file will be permanently deleted."
          }
          confirmLabel="Delete"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
      {moving && (
        <MoveDialog
          node={moving}
          options={folderOptions(files, byId, rootId).filter((opt) => opt.id !== moving.id)}
          initialParentId={moving.parent_id ?? rootId}
          busy={busy}
          error={formError}
          onSubmit={handleMove}
          onClose={() => {
            setMoving(null);
            setFormError(null);
          }}
        />
      )}
      {previewing && (
        <AssetPreviewDialog
          node={previewing}
          onFetchBytes={onFetchAssetBytes}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
