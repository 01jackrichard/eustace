import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ProtectedLayout } from './components/Layout';
import { NotificationProvider } from './hooks/useNotifications';
import { Toaster } from 'react-hot-toast';
import { PWAReloadPrompt } from './components/PWAReloadPrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { CookieConsent } from './components/CookieConsent';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { Loader2 } from 'lucide-react';

function safeLazy<T extends ComponentType<any>>(importFn: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const component = await importFn();
      sessionStorage.removeItem('eustace_chunk_reload');
      return component;
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
const ChatPage = safeLazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })));
const TranscendPage = safeLazy(() => import('./pages/TranscendPage').then(m => ({ default: m.TranscendPage })))
const ProfilePage = safeLazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const PublicProfilePage = safeLazy(() => import('./pages/PublicProfilePage').then(m => ({ default: m.PublicProfilePage })));
const SettingsPage = safeLazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PrivacyPage = safeLazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const TermsPage = safeLazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));
const NotFoundPage = safeLazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-accent" />
    </div>
  );
}

function useDynamicDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname;
    let title = 'Eustace — Personal Productivity & Focus';

    if (pathname === '/') {
      title = 'Eustace — Personal Productivity & Focus';
    } else if (pathname === '/dashboard') {
      title = 'Dashboard — Eustace';
    } else if (pathname === '/tasks') {
      title = 'Daily Tasks — Eustace';
    } else if (pathname === '/calendar') {
      title = 'Calendar — Eustace';
    } else if (pathname.startsWith('/notes')) {
      title = 'Notes — Eustace';
    } else if (pathname === '/analytics') {
      title = 'Analytics — Eustace';
    } else if (pathname === '/friends') {
      title = 'Friends — Eustace';
    } else if (pathname.startsWith('/chat')) {
      title = 'Chat — Eustace';
    } else if (pathname === '/transcend') {
      title = 'Transcend — Eustace';
    } else if (pathname === '/settings') {
      title = 'Settings — Eustace';
    } else if (pathname === '/profile') {
      title = 'Profile — Eustace';
    } else if (pathname.startsWith('/u/')) {
      title = 'Public Profile — Eustace';
    } else if (pathname === '/login') {
      title = 'Log In — Eustace';
    } else if (pathname === '/signup') {
      title = 'Sign Up — Eustace';
    } else if (pathname === '/privacy') {
      title = 'Privacy Policy — Eustace';
    } else if (pathname === '/terms') {
      title = 'Terms of Service — Eustace';
    } else {
      title = '404 Not Found — Eustace';
    }

    document.title = title;
  }, [location.pathname]);
}

function App() {
  useGlobalShortcuts();
  useDynamicDocumentTitle();
  return (
    <ErrorBoundary>
      <NotificationProvider>
      <Toaster position="bottom-center" toastOptions={{
        style: { background: '#1c1c1c', color: '#fff', border: '1px solid #333' }
      }} />
      <InstallPrompt />
      <PWAReloadPrompt />
      <CookieConsent />
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
            <Route path="/notes" element={<NotesPage />}>
              <Route path=":id" element={<NoteEditorPage />} />
            </Route>
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/chat/:friendId" element={<ChatPage />} />
            <Route path="/transcend" element={<TranscendPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;




