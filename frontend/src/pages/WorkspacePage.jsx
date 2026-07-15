import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  clearToken,
  createFile,
  deleteFile,
  getAssetBytes,
  getFileContent,
  getToken,
  listFiles,
  renameFile,
  saveFileContent,
  uploadAsset,
} from "../api/client";
import Button from "../components/Button";
import CenteredMessage from "../components/CenteredMessage";
import FileExplorer from "../components/FileExplorer";
import PythonEditor from "../components/PythonEditor";
import SaveIndicator from "../components/SaveIndicator";
import TopBar from "../components/TopBar";
import { useAutosave } from "../hooks/useAutosave";

export default function WorkspacePage() {
  const { classroomId, groupId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [tree, setTree] = useState(null); // { classroom, group, root_id, files }
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeFileContent, setActiveFileContent] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const redirectToPin = useCallback(() => {
    clearToken(classroomId);
    navigate(`/classrooms/${classroomId}/pin`, {
      replace: true,
      state: { from: location.pathname },
    });
  }, [classroomId, navigate, location.pathname]);

  const save = useCallback(
    (content, opts) => saveFileContent(classroomId, groupId, activeFileId, content, opts),
    [classroomId, groupId, activeFileId]
  );
  const autosave = useAutosave({ save, onAuthError: redirectToPin });
  const { reset: resetAutosave, saveNow: flushAutosave } = autosave;

  const openFile = useCallback(
    async (fileId) => {
      setActiveFileId(fileId);
      setActiveFileContent(null); // shows the "Loading file…" state
      const data = await getFileContent(classroomId, groupId, fileId);
      resetAutosave(data.content);
      setActiveFileContent(data.content);
    },
    [classroomId, groupId, resetAutosave]
  );

  const loadTree = useCallback(
    async (preferredFileId) => {
      const data = await listFiles(classroomId, groupId);
      setTree(data);
      const stillExists = preferredFileId != null && data.files.some((f) => f.id === preferredFileId);
      const mainFile = data.files.find((f) => !f.is_directory && f.name === "main.py");
      const nextId = stillExists ? preferredFileId : (mainFile?.id ?? null);
      if (nextId != null && nextId !== activeFileId) await openFile(nextId);
      else if (nextId == null) {
        setActiveFileId(null);
        setActiveFileContent(null);
      }
    },
    [classroomId, groupId, activeFileId, openFile]
  );

  useEffect(() => {
    if (!getToken(classroomId)) {
      redirectToPin();
      return;
    }
    let cancelled = false;
    listFiles(classroomId, groupId)
      .then(async (data) => {
        if (cancelled) return;
        setTree(data);
        const mainFile = data.files.find((f) => !f.is_directory && f.name === "main.py");
        if (mainFile) await openFile(mainFile.id);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) redirectToPin();
        else setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally runs once per group — file switches are handled by
    // openFile/loadTree, not by re-running this whole-tree load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, groupId, redirectToPin]);

  const handleSelectFile = async (file) => {
    if (file.id === activeFileId) return;
    await flushAutosave(); // don't lose in-flight edits to the file we're leaving
    await openFile(file.id);
  };

  const handleCreate = async (parentId, name, isDirectory) => {
    await createFile(classroomId, groupId, { name, isDirectory, parentId });
    await loadTree(activeFileId);
  };

  const handleRename = async (file, name) => {
    await renameFile(classroomId, groupId, file.id, name);
    await loadTree(activeFileId);
  };

  const handleDelete = async (file) => {
    await deleteFile(classroomId, groupId, file.id);
    await loadTree(file.id === activeFileId ? null : activeFileId);
  };

  const handleUploadAsset = async (parentId, file) => {
    await uploadAsset(classroomId, groupId, parentId, file);
    await loadTree(activeFileId);
  };

  // Materializes every other file/asset in the project into Pyodide's
  // filesystem before Run, so `import helper` or
  // `pygame.image.load("assets/sprite.png")` work. Each node's path is
  // derived by walking parent_id up to the (unlisted) root.
  const getProjectManifest = useCallback(async () => {
    const byId = new Map(tree.files.map((f) => [f.id, f]));
    const pathFor = (fileId) => {
      const parts = [];
      let node = byId.get(fileId);
      while (node) {
        parts.unshift(node.name);
        node = node.parent_id != null ? byId.get(node.parent_id) : undefined;
      }
      return parts.join("/");
    };

    const textNodes = tree.files.filter((f) => !f.is_directory && !f.content_type);
    const assetNodes = tree.files.filter((f) => !f.is_directory && f.content_type);

    const [files, assets] = await Promise.all([
      Promise.all(
        textNodes.map(async (node) => ({
          path: pathFor(node.id),
          content: (await getFileContent(classroomId, groupId, node.id)).content,
        }))
      ),
      Promise.all(
        assetNodes.map(async (node) => ({
          path: pathFor(node.id),
          bytes: await getAssetBytes(classroomId, groupId, node.id),
        }))
      ),
    ]);
    return { files, assets };
  }, [classroomId, groupId, tree]);

  if (loadError) {
    return (
      <CenteredMessage
        title="Couldn't load this project"
        detail={loadError}
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!tree) return <CenteredMessage title="Loading project…" />;

  const activeFile =
    activeFileId != null && activeFileContent != null
      ? {
          id: activeFileId,
          name: tree.files.find((f) => f.id === activeFileId)?.name ?? "",
          content: activeFileContent,
        }
      : null;

  // Capstone groups get the full file-explorer Codespace (multiple
  // files/folders, uploaded assets). In-Class saves are simple single-file
  // work saved from the Python Workspace — they always open main.py
  // directly, with no explorer to browse away from it, so they look and
  // feel like the ephemeral Workspace but with real autosave.
  const isCapstone = tree.group.kind === "capstone";

  return (
    <div className="flex h-screen flex-col bg-app-bg">
      <TopBar
        crumbs={[tree.classroom.name, tree.group.name]}
        backTo={{ label: "Return to Classroom", to: `/classrooms/${classroomId}` }}
        right={<SaveIndicator status={autosave.status} savedAt={autosave.savedAt} />}
      />
      <PythonEditor
        activeFile={activeFile}
        onChangeContent={autosave.notifyChange}
        getProjectManifest={getProjectManifest}
        persistence={{ onSaveNow: autosave.saveNow }}
        sidebar={
          isCapstone && (
            <FileExplorer
              rootId={tree.root_id}
              files={tree.files}
              activeFileId={activeFileId}
              onSelectFile={handleSelectFile}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              onUploadAsset={handleUploadAsset}
            />
          )
        }
      />
    </div>
  );
}
