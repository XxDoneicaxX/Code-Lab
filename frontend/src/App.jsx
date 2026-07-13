import { Navigate, Route, Routes } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import ClassroomsPage from "./pages/ClassroomsPage";
import PythonWorkspacePage from "./pages/PythonWorkspacePage";
import PinPage from "./pages/PinPage";
import GroupsPage from "./pages/GroupsPage";
import WorkspacePage from "./pages/WorkspacePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/workspace" element={<PythonWorkspacePage />} />
      <Route path="/classrooms" element={<ClassroomsPage />} />
      <Route path="/classrooms/:classroomId/pin" element={<PinPage />} />
      <Route path="/classrooms/:classroomId" element={<GroupsPage />} />
      <Route path="/classrooms/:classroomId/groups/:groupId" element={<WorkspacePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
