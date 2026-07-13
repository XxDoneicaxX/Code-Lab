import { useNavigate } from "react-router-dom";

import BitMascot from "../components/BitMascot";
import Button from "../components/Button";
import PixelAccents from "../components/PixelAccents";
import TopBar from "../components/TopBar";

const OPTIONS = [
  {
    icon: "💻",
    title: "Python Workspace",
    description: "Practice Python freely in a temporary coding workspace. Nothing is saved.",
    action: "Open Workspace",
    to: "/workspace",
  },
  {
    icon: "🏫",
    title: "Classroom Projects",
    description: "Continue your classroom capstone projects. Projects are saved online.",
    action: "Open Classroom Projects",
    to: "/classrooms",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-app-bg">
      <PixelAccents />
      <div className="relative z-10 flex min-h-screen flex-col">
        <TopBar showNav={false} />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 py-16 text-center">
          <BitMascot className="h-16 w-16" />
          <h1 className="mt-6 text-4xl font-extrabold text-ink sm:text-5xl">
            Welcome to <span className="text-accent">BIT Code Lab</span>
          </h1>
          <p className="mt-3 text-ink/60">Practice Python, or continue your classroom project.</p>

          <div className="mt-12 grid w-full gap-5 sm:grid-cols-2">
            {OPTIONS.map((option) => (
              <section
                key={option.to}
                className="flex flex-col items-start rounded-2xl border border-border-subtle bg-surface p-6 text-left shadow-sm"
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-2xl"
                  aria-hidden="true"
                >
                  {option.icon}
                </span>
                <h2 className="mt-4 text-lg font-semibold text-ink">{option.title}</h2>
                <p className="mt-1 text-sm text-ink/60">{option.description}</p>
                <Button
                  variant="soft"
                  className="mt-5 w-full text-center"
                  onClick={() => navigate(option.to)}
                >
                  {option.action} →
                </Button>
              </section>
            ))}
          </div>

          <p className="mt-16 flex items-center gap-2 text-sm text-ink/50">
            <span aria-hidden="true">💜</span> Built for students. Made for creativity.
          </p>
        </main>
      </div>
    </div>
  );
}
