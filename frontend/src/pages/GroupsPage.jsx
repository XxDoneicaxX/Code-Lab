import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  clearToken,
  createGroup,
  deleteGroup,
  getToken,
  listGroups,
  renameGroup,
} from "../api/client";
import Button from "../components/Button";
import CenteredMessage from "../components/CenteredMessage";
import ConfirmDialog from "../components/ConfirmDialog";
import GroupNameDialog from "../components/GroupNameDialog";
import PixelAccents from "../components/PixelAccents";
import TopBar from "../components/TopBar";
import { formatLastSaved } from "../utils/formatDate";

const SECTIONS = [
  {
    kind: "in_class",
    heading: "In-Class Work",
    subheading: "Your personal practice files from class.",
    createLabel: "+ New Practice File",
    emptyTitle: "No practice files yet.",
    emptyDetail: 'Click "+ New Practice File" to start one.',
    createTitle: "New Practice File",
    deleteMessage: "This practice file will be permanently deleted.",
    openLabel: "Open",
  },
  {
    kind: "capstone",
    heading: "Capstone Groups",
    subheading: "Teacher-managed team projects for the week.",
    createLabel: "+ Create Group",
    emptyTitle: "No capstone groups have been created yet.",
    emptyDetail: "Create a group to begin.",
    createTitle: "Create Group",
    deleteMessage: "This will also delete the group's saved capstone project.",
    openLabel: "Open Codespace",
  },
];

export default function GroupsPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [classroom, setClassroom] = useState(null);
  const [groupsByKind, setGroupsByKind] = useState(null);
  const [error, setError] = useState(null);
  const [creatingKind, setCreatingKind] = useState(null);
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const redirectToPin = useCallback(() => {
    clearToken(classroomId);
    navigate(`/classrooms/${classroomId}/pin`, {
      replace: true,
      state: { from: location.pathname },
    });
  }, [classroomId, navigate, location.pathname]);

  useEffect(() => {
    if (!getToken(classroomId)) {
      redirectToPin();
      return;
    }
    Promise.all(SECTIONS.map((section) => listGroups(classroomId, section.kind)))
      .then(([inClass, capstone]) => {
        setClassroom(inClass.classroom);
        setGroupsByKind({ in_class: inClass.groups, capstone: capstone.groups });
      })
      .catch((err) => {
        if (err.status === 401 || err.status === 403) redirectToPin();
        else setError(err.message);
      });
  }, [classroomId, redirectToPin]);

  const handleCreate = async (name) => {
    setBusy(true);
    setFormError(null);
    try {
      const group = await createGroup(classroomId, name, creatingKind);
      setGroupsByKind((prev) => ({
        ...prev,
        [creatingKind]: [...prev[creatingKind], group],
      }));
      setCreatingKind(null);
    } catch (err) {
      if (err.status === 401 || err.status === 403) return redirectToPin();
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (name) => {
    setBusy(true);
    setFormError(null);
    try {
      const updated = await renameGroup(classroomId, renamingGroup.id, name);
      setGroupsByKind((prev) => ({
        ...prev,
        [updated.kind]: prev[updated.kind].map((g) => (g.id === updated.id ? updated : g)),
      }));
      setRenamingGroup(null);
    } catch (err) {
      if (err.status === 401 || err.status === 403) return redirectToPin();
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteGroup(classroomId, deletingGroup.id);
      setGroupsByKind((prev) => ({
        ...prev,
        [deletingGroup.kind]: prev[deletingGroup.kind].filter((g) => g.id !== deletingGroup.id),
      }));
      setDeletingGroup(null);
    } catch (err) {
      if (err.status === 401 || err.status === 403) return redirectToPin();
      setDeletingGroup(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <CenteredMessage
        title="Couldn't load this classroom"
        detail={error}
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!groupsByKind) return <CenteredMessage title="Loading classroom…" />;

  return (
    <div className="relative min-h-screen overflow-hidden bg-app-bg">
      <div
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-accent/15 blur-3xl"
        aria-hidden="true"
      />
      <PixelAccents variant="page" />
      <div className="relative z-10">
        <TopBar
          crumbs={[classroom.name]}
          backTo={{ label: "All Classrooms", to: "/classrooms" }}
        />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-bold text-ink">{classroom.name}</h1>

          {SECTIONS.map((section) => {
            const groups = groupsByKind[section.kind];
            return (
              <section key={section.kind} className="mt-10">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{section.heading}</h2>
                    <p className="mt-1 text-sm text-ink/60">{section.subheading}</p>
                  </div>
                  <Button variant="primary" onClick={() => setCreatingKind(section.kind)}>
                    {section.createLabel}
                  </Button>
                </div>

                {groups.length === 0 ? (
                  <div className="mt-4 rounded-2xl border-2 border-dashed border-white/50 bg-surface/30 p-10 text-center backdrop-blur-xl">
                    <p className="font-medium text-ink">{section.emptyTitle}</p>
                    <p className="mt-1 text-sm text-ink/60">{section.emptyDetail}</p>
                  </div>
                ) : (
                  <ul className="mt-4 flex flex-col gap-3">
                    {groups.map((group) => (
                      <li
                        key={group.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/50 bg-surface/40 p-5 shadow-xl shadow-black/10 backdrop-blur-xl transition-all hover:border-accent hover:bg-surface/60 hover:shadow-2xl"
                      >
                        <div>
                          <p className="font-semibold text-ink">{group.name}</p>
                          <p className="mt-1 text-sm text-ink/60">
                            Last saved: {formatLastSaved(group.last_saved)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="primary"
                            onClick={() => navigate(`/classrooms/${classroomId}/groups/${group.id}`)}
                          >
                            {section.openLabel}
                          </Button>
                          <Button variant="neutral" onClick={() => setRenamingGroup(group)}>
                            Rename
                          </Button>
                          <Button variant="danger-outline" onClick={() => setDeletingGroup(group)}>
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </main>
      </div>

      {creatingKind && (
        <GroupNameDialog
          title={SECTIONS.find((s) => s.kind === creatingKind).createTitle}
          submitLabel="Create"
          busy={busy}
          error={formError}
          onSubmit={handleCreate}
          onClose={() => {
            setCreatingKind(null);
            setFormError(null);
          }}
        />
      )}

      {renamingGroup && (
        <GroupNameDialog
          title="Rename"
          submitLabel="Save Name"
          initialValue={renamingGroup.name}
          busy={busy}
          error={formError}
          onSubmit={handleRename}
          onClose={() => {
            setRenamingGroup(null);
            setFormError(null);
          }}
        />
      )}

      {deletingGroup && (
        <ConfirmDialog
          title={`Delete "${deletingGroup.name}"?`}
          message={SECTIONS.find((s) => s.kind === deletingGroup.kind).deleteMessage}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setDeletingGroup(null)}
        />
      )}
    </div>
  );
}
