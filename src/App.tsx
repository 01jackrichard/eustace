import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { CalendarPage } from './pages/CalendarPage';
import { TasksPage } from './pages/TasksPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { NotesPage } from './pages/NotesPage';
import { NoteEditorPage } from './pages/NoteEditorPage';
import { FriendsPage } from './pages/FriendsPage';
import { ProfilePage } from './pages/ProfilePage';
import { PublicProfilePage } from './pages/PublicProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { Toaster } from 'react-hot-toast';
import { PWAReloadPrompt } from './components/PWAReloadPrompt';
import { InstallPrompt } from './components/InstallPrompt';

function App() {
  return (
    <>
      <Toaster position="bottom-center" toastOptions={{
        style: { background: '#1c1c1c', color: '#fff', border: '1px solid #333' }
      }} />
      <InstallPrompt />
      <PWAReloadPrompt />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/notes/:id" element={<NoteEditorPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/u/:username" element={<PublicProfilePage />} />
        {/* Fallbacks */}
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default App;



