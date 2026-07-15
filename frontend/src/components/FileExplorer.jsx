import { useMemo, useRef, useState } from "react";

import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import Dialog from "./Dialog";

const ASSET_ACCEPT = ".png,.jpg,.jpeg,.webp,.wav,.mp3";

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
}) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(null); // { parentId, isDirectory } | null
  const [renaming, setRenaming] = useState(null); // file | null
  const [deleting, setDeleting] = useState(null); // file | null
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
    else if (!node.content_type) onSelectFile(node); // assets aren't editable text
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
    </div>
  );
}
