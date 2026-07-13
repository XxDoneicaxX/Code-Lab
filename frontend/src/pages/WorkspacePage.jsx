import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { clearToken, getToken, getWorkspace, saveProject } from "../api/client";
import Button from "../components/Button";
import CenteredMessage from "../components/CenteredMessage";
import PythonEditor from "../components/PythonEditor";
import SaveIndicator from "../components/SaveIndicator";
import TopBar from "../components/TopBar";
import { useAutosave } from "../hooks/useAutosave";

export default function WorkspacePage() {
  const { classroomId, groupId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [workspace, setWorkspace] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const redirectToPin = useCallback(() => {
    clearToken(classroomId);
    navigate(`/classrooms/${classroomId}/pin`, {
      replace: true,
      state: { from: location.pathname },
    });
  }, [classroomId, navigate, location.pathname]);

  const save = useCallback(
    (code, opts) => saveProject(classroomId, groupId, code, opts),
    [classroomId, groupId]
  );
  const autosave = useAutosave({ save, onAuthError: redirectToPin });
  const { reset: resetAutosave } = autosave;

  useEffect(() => {
    if (!getToken(classroomId)) {
      redirectToPin();
      return;
    }
    let cancelled = false;
    getWorkspace(classroomId, groupId)
      .then((data) => {
        if (cancelled) return;
        resetAutosave(data.project.code);
        setWorkspace(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) redirectToPin();
        else setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [classroomId, groupId, redirectToPin, resetAutosave]);

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
  if (!workspace) return <CenteredMessage title="Loading project…" />;

  return (
    <div className="flex h-screen flex-col bg-app-bg">
      <TopBar
        crumbs={[workspace.classroom.name, workspace.group.name]}
        backTo={{ label: "Return to Classroom", to: `/classrooms/${classroomId}` }}
        right={<SaveIndicator status={autosave.status} savedAt={autosave.savedAt} />}
      />
      <PythonEditor
        defaultValue={workspace.project.code}
        onChange={autosave.notifyChange}
        persistence={{ onSaveNow: autosave.saveNow }}
      />
    </div>
  );
}
