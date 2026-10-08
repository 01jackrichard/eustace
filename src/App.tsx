import { lazy, Suspense, type ComponentType } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './components/Layout';
import { Toaster } from 'react-hot-toast';
import { PWAReloadPrompt } from './components/PWAReloadPrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

function safeLazy<T extends ComponentType<any>>(importFn: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error: any) {
      const isChunkError =
        error?.message?.includes('dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.name === 'ChunkLoadError';

      if (isChunkError && !sessionStorage.getItem('eustace_chunk_reload')) {
        sessionStorage.setItem('eustace_chunk_reload', 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}

const Landing = safeLazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })));
const Login = safeLazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Signup = safeLazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })));
const AuthCallback = safeLazy(() => import('./pages/AuthCallback').then(m => ({ default: m.AuthCallback })));
const Dashboard = safeLazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const CalendarPage = safeLazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
const TasksPage = safeLazy(() => import('./pages/TasksPage').then(m => ({ default: m.TasksPage })));
const AnalyticsPage = safeLazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const NotesPage = safeLazy(() => import('./pages/NotesPage').then(m => ({ default: m.NotesPage })));
const NoteEditorPage = safeLazy(() => import('./pages/NoteEditorPage').then(m => ({ default: m.NoteEditorPage })));
const FriendsPage = safeLazy(() => import('./pages/FriendsPage').then(m => ({ default: m.FriendsPage })));
const ProfilePage = safeLazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const PublicProfilePage = safeLazy(() => import('./pages/PublicProfilePage').then(m => ({ default: m.PublicProfilePage })));
const SettingsPage = safeLazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PrivacyPage = safeLazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const TermsPage = safeLazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-accent" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="bottom-center" toastOptions={{
        style: { background: '#1c1c1c', color: '#fff', border: '1px solid #333' }
      }} />
      <InstallPrompt />
      <PWAReloadPrompt />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />

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
    </ErrorBoundary>
  );
}

export default App;




