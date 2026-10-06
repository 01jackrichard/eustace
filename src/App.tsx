import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './components/Layout';
import { Toaster } from 'react-hot-toast';
import { PWAReloadPrompt } from './components/PWAReloadPrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { Loader2 } from 'lucide-react';

const Landing = lazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
const TasksPage = lazy(() => import('./pages/TasksPage').then(m => ({ default: m.TasksPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const NotesPage = lazy(() => import('./pages/NotesPage').then(m => ({ default: m.NotesPage })));
const NoteEditorPage = lazy(() => import('./pages/NoteEditorPage').then(m => ({ default: m.NoteEditorPage })));
const FriendsPage = lazy(() => import('./pages/FriendsPage').then(m => ({ default: m.FriendsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage').then(m => ({ default: m.PublicProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-accent" />
    </div>
  );
}

function App() {
  return (
    <>
      <Toaster position="bottom-center" toastOptions={{
        style: { background: '#1c1c1c', color: '#fff', border: '1px solid #333' }
      }} />
      <InstallPrompt />
      <PWAReloadPrompt />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/callback" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Public Profile accessible to both anonymous visitors and authenticated users */}
          <Route path="/u/:username" element={<PublicProfilePage />} />

          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:id" element={<NoteEditorPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;



