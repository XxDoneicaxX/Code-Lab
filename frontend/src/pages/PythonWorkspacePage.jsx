import PythonEditor from "../components/PythonEditor";
import TopBar from "../components/TopBar";

const STARTER_CODE = `# Practice Python here — nothing you write is saved.
# Refresh or close this page any time for a fresh start.
`;

export default function PythonWorkspacePage() {
  return (
    <div className="flex h-screen flex-col bg-app-bg">
      <TopBar crumbs={["Python Workspace"]} backTo={{ label: "Home", to: "/" }} />
      <PythonEditor
        defaultValue={STARTER_CODE}
        tip="This workspace is temporary and won't be saved. Use Classroom Projects to save your work and continue later."
      />
    </div>
  );
}
