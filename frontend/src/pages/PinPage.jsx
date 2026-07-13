import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { listClassrooms, setToken, verifyPin } from "../api/client";
import PixelAccents from "../components/PixelAccents";
import TopBar from "../components/TopBar";

export default function PinPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [classroomName, setClassroomName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listClassrooms()
      .then((all) =>
        setClassroomName(all.find((c) => String(c.id) === classroomId)?.name ?? "Classroom")
      )
      .catch(() => setClassroomName("Classroom"));
  }, [classroomId]);

  const submit = useCallback(
    async (value) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await verifyPin(classroomId, value);
        setToken(classroomId, result.token);
        navigate(location.state?.from ?? `/classrooms/${classroomId}`, { replace: true });
      } catch (err) {
        setError(err.message);
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [busy, classroomId, navigate, location.state]
  );

  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    setError(null);
    if (digits.length === 4) submit(digits);
  };

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
      <PixelAccents variant="hero" />
      <div className="relative z-10">
        <TopBar crumbs={[classroomName || "…"]} />
        <main className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
          <h1 className="text-2xl font-bold text-ink">{classroomName || "Classroom"}</h1>
          <p className="mt-1 text-ink/60">Ask your teacher for the 4-digit PIN.</p>
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Classroom PIN"
            placeholder="••••"
            value={pin}
            onChange={handleChange}
            disabled={busy}
            className="mt-8 w-44 rounded-xl border border-white/50 bg-surface/40 py-3 text-center font-mono text-3xl tracking-[0.4em] text-ink shadow-xl shadow-black/10 backdrop-blur-xl outline-none focus:border-accent focus:ring-4 focus:ring-accent/30 disabled:opacity-50"
          />
          {busy && <p className="mt-3 text-sm text-ink/60">Checking…</p>}
          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
          <Link
            to="/classrooms"
            className="mt-8 text-sm font-medium text-ink/70 hover:text-ink hover:underline"
          >
            ← All classrooms
          </Link>
        </main>
      </div>
    </div>
  );
}
