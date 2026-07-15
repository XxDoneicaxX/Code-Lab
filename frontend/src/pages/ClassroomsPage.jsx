import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getToken, listClassrooms } from "../api/client";
import Button from "../components/Button";
import CenteredMessage from "../components/CenteredMessage";
import PixelAccents from "../components/PixelAccents";
import TileButton from "../components/TileButton";
import TopBar from "../components/TopBar";

export default function ClassroomsPage() {
  const navigate = useNavigate();
  const [classrooms, setClassrooms] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listClassrooms().then(setClassrooms).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const open = (classroom) => {
    // Skip the PIN page when this device already has a session for the room;
    // the backend still rejects expired tokens, which bounces back to the PIN.
    const target = getToken(classroom.id)
      ? `/classrooms/${classroom.id}`
      : `/classrooms/${classroom.id}/pin`;
    navigate(target);
  };

  if (error) {
    return (
      <CenteredMessage
        title="Can't reach the Code Lab server"
        detail={`${error} Make sure the backend is running, then try again.`}
        action={
          <Button variant="primary" onClick={load}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!classrooms) return <CenteredMessage title="Loading classrooms…" />;

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
        <TopBar crumbs={["Classroom Work"]} backTo={{ label: "Home", to: "/" }} />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-2xl font-bold text-ink">Classroom Work</h1>
          <p className="mt-1 text-ink/60">
            Pick your classroom to continue your in-class work or capstone project.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {classrooms.map((classroom, index) => (
              <TileButton
                key={classroom.id}
                badge={index + 1}
                title={classroom.name}
                onClick={() => open(classroom)}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
