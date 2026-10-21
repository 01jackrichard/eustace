import { SmoothInput } from '../components/ui/SmoothInput';
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import {
  LogOut,
  Loader2,
  Check,
  Download,
  Shield,
  FileText,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  User,
  Sliders,
  Palette,
  Keyboard,
  Clock,
  Bell,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { verifyCurrentPassword } from '../lib/reauth';
import { useSecurityVerification } from '../hooks/useSecurityVerification';
import { useNotifications } from '../hooks/useNotifications';
import { notificationService } from '../services/notificationService';
import { VerifyIdentityModal } from '../components/settings/VerifyIdentityModal';
import { DeleteAccountModal } from '../components/settings/DeleteAccountModal';

export function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('section') || 'account';
  const setActiveTab = useCallback((tab: string) => setSearchParams({ section: tab }), [setSearchParams]);

  // Security Verification Hook & State
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleAutoLock = useCallback(() => {
    toast('Security section locked due to inactivity or tab change.', {
      icon: '🔒',
      style: { background: '#111', color: '#ededed', border: '1px solid #333' }
    });
    // If user was viewing security, switch to account tab
    if (searchParams.get('section') === 'security') {
      setSearchParams({ section: 'account' });
    }
  }, [searchParams, setSearchParams]);

  const {
    isVerified,
    timeRemaining,
    isVerifying,
    verificationError,
    isEmailAuth,
    verify,
    confirmOAuthIdentity,
    lock,
    clearError
  } = useSecurityVerification({
    user,
    onAutoLock: handleAutoLock
  });

  // If on security tab but not verified, automatically redirect to account
  useEffect(() => {
    if (activeTab === 'security' && !isVerified) {
      setActiveTab('account');
      setIsVerifyModalOpen(true);
    }
  }, [activeTab, isVerified, setActiveTab]);

  // Notifications State
  const {
    permission,
    isSupported: notifSupported,
    isConfigured: notifConfigured,
    loading: notifLoading,
    requestPermissionAndEnable,
    disablePushNotifications
  } = useNotifications();
  const [testSending, setTestSending] = useState(false);
  const [prefs, setPrefs] = useState({
    push_notifications: true,
    task_reminders: true,
    message_notifications: true,
    friend_request_notifications: true,
    streak_reminders: true,
    system_notifications: true,
    email_notifications: false,
    productivity_reminders: true
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saveState, setSaveState] = useState<string | null>(null);

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  // Danger Zone / Export State
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const [
        profileRes,
        tasksRes,
        completionsRes,
        dailyRes,
        foldersRes,
        notesRes,
        messagesRes,
        friendshipsRes,
        prefsRes
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('tasks').select('*').eq('user_id', user.id),
        supabase.from('task_completions').select('*').eq('user_id', user.id),
        supabase.from('daily_data').select('*').eq('user_id', user.id),
        supabase.from('folders').select('*').eq('user_id', user.id),
        supabase.from('notes').select('*').eq('user_id', user.id),
        supabase.from('messages').select('*').eq('sender_id', user.id),
        supabase.from('friendships').select('*').or('requester_id.eq.' + user.id + ',addressee_id.eq.' + user.id),
        supabase.from('user_preferences').select('*').eq('user_id', user.id).single()
      ]);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        account: {
          id: user.id,
          email: user.email,
          profile: profileRes.data || null
        },
        preferences: prefsRes.data || null,
        tasks: tasksRes.data || [],
        completions: completionsRes.data || [],
        dailyLogs: dailyRes.data || [],
        folders: foldersRes.data || [],
        notes: notesRes.data || [],
        sentMessages: messagesRes.data || [],
        friendships: friendshipsRes.data || []
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eustace-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Your data export is ready.');
    } catch (err: any) {
      toast.error('Failed to export data: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    async function loadPrefs() {
      if (!user) return;
      setPrefsLoading(true);
      const { data } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).single();
      if (data) {
        setPrefs({
          push_notifications: data.push_notifications ?? true,
          task_reminders: data.task_reminders ?? true,
          message_notifications: data.message_notifications ?? true,
          friend_request_notifications: data.friend_request_notifications ?? true,
          streak_reminders: data.streak_reminders ?? true,
          system_notifications: data.system_notifications ?? true,
          email_notifications: data.email_notifications ?? false,
          productivity_reminders: data.productivity_reminders ?? true
        });
      } else {
        // Insert defaults
        await supabase.from('user_preferences').insert({ user_id: user.id });
      }
      setPrefsLoading(false);
    }
    loadPrefs();
  }, [user]);

  const updatePreference = async (key: string, value: boolean) => {
    if (!user) return;
    setSaveState('Saving...');
    setPrefs(p => ({ ...p, [key]: value }));
    const { error } = await supabase.from('user_preferences').update({ [key]: value }).eq('user_id', user.id);
    if (!error) {
      setSaveState('Saved');
      setTimeout(() => setSaveState(null), 2000);
    } else {
      setSaveState('Error saving');
      setPrefs(p => ({ ...p, [key]: !value })); // Revert on error
    }
  };

  const handleTabClick = (tabId: string) => {
    if (tabId === 'security') {
      if (!isVerified) {
        clearError();
        setIsVerifyModalOpen(true);
        return;
      }
    }
    setActiveTab(tabId);
  };

  const handleVerifySuccess = async (pwd: string) => {
    const ok = await verify(pwd);
    if (ok) {
      setIsVerifyModalOpen(false);
      setActiveTab('security');
      toast.success('Identity verified. Security unlocked.');
      return true;
    }
    return false;
  };

  const handleConfirmOAuth = () => {
    confirmOAuthIdentity();
    setIsVerifyModalOpen(false);
    setActiveTab('security');
    toast.success('Identity verified via OAuth.');
  };

  const handleUpdatePassword = async () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (isEmailAuth) {
      if (!currentPassword) {
        setPasswordError('Current password is required.');
        return;
      }
    }

    if (!newPassword) {
      setPasswordError('New password is required.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (isEmailAuth && currentPassword === newPassword) {
      setPasswordError('New password must be different from current password.');
      return;
    }

    setIsUpdatingPassword(true);

    try {
      // 1. Fresh verification of current password
      if (isEmailAuth) {
        const verifyResult = await verifyCurrentPassword(user, currentPassword);
        if (!verifyResult.success) {
          setPasswordError(verifyResult.error || 'Current password verification failed.');
          setIsUpdatingPassword(false);
          return;
        }
      }

      // 2. Submit password change to Supabase Auth
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast.success('Password updated successfully.');
        setTimeout(() => setPasswordSuccess(false), 4000);
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) return;
    setIsSendingResetEmail(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/settings?section=security`
      });
      if (error) {
        toast.error('Failed to send setup email: ' + error.message);
      } else {
        toast.success('Password setup email sent. Check your inbox.');
      }
    } catch (err: any) {
      toast.error('Error sending reset email: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleDeleteAccountWithReauth = async (pwd?: string): Promise<boolean> => {
    if (!user) return false;
    setIsDeleting(true);

    try {
      // 1. Fresh verification of current password for email accounts
      if (isEmailAuth && pwd) {
        const check = await verifyCurrentPassword(user, pwd);
        if (!check.success) {
          toast.error(check.error || 'Password verification failed.');
          setIsDeleting(false);
          return false;
        }
      }

      // 2. Client-side storage pre-cleanup attempt for avatar, cover, and message media
      try {
        const [avatarFiles, coverFiles, messageFiles] = await Promise.all([
          supabase.storage.from('profile-images').list('', { search: user.id }),
          supabase.storage.from('profile-covers').list('', { search: user.id }),
          supabase.storage.from('message-images').list('', { search: user.id })
        ]);
        const avatarNames = avatarFiles.data?.map(f => f.name) || [];
        const coverNames = coverFiles.data?.map(f => f.name) || [];
        const messageNames = messageFiles.data?.map(f => f.name) || [];
        if (avatarNames.length > 0) {
          await supabase.storage.from('profile-images').remove(avatarNames);
        }
        if (coverNames.length > 0) {
          await supabase.storage.from('profile-covers').remove(coverNames);
        }
        if (messageNames.length > 0) {
          await supabase.storage.from('message-images').remove(messageNames);
        }
      } catch (storageErr) {
        console.warn('[STORAGE_CLEANUP] Client storage cleanup warning:', storageErr);
      }

      // 3. Authoritative server-side account deletion cascade with server-side password verification
      const { error } = await supabase.rpc('delete_user_account', { p_password: pwd || null });
      if (error) {
        toast.error('Failed to delete account: ' + error.message);
        setIsDeleting(false);
        return false;
      } else {
        toast.success('Your account and data have been permanently deleted.');
        setIsDeleteModalOpen(false);
        await signOut();
        navigate('/');
        return true;
      }
    } catch (err: any) {
      toast.error('Error deleting account: ' + (err.message || 'Unknown error'));
      setIsDeleting(false);
      return false;
    }
  };

  const formatRemainingMinutes = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
  };

  const navGroups = [
    {
      title: 'GENERAL',
      items: [
        { id: 'account', label: 'Account', icon: User },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'preferences', label: 'Preferences', icon: Sliders },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard }
      ]
    },
    {
      title: 'PRIVACY & SECURITY',
      items: [
        { id: 'privacy', label: 'Data & Privacy', icon: Shield },
        {
          id: 'security',
          label: 'Security',
          icon: isVerified ? Unlock : Lock,
          isLocked: !isVerified
        }
      ]
    }
  ];

  return (
    <div className="max-w-5xl mx-auto w-full pt-12 md:pt-20 pb-32 px-4 md:px-8 animate-fade-in flex flex-col text-textMain">

      {/* Header */}
      <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/20">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Preferences & Security</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-textMain tracking-tight uppercase">Settings</h1>
          <p className="text-xs sm:text-sm font-medium text-textMuted mt-1">Manage your account identity, productivity preferences, and security controls.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saveState && (
            <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all">
              {saveState === 'Saved' && <Check size={12} />} {saveState}
            </span>
          )}
          {isVerified && (
            <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 px-3 py-1.5 rounded-lg text-xs font-medium text-accent">
              <Clock size={12} />
              <span>Unlocked ({formatRemainingMinutes(timeRemaining)})</span>
              <button
                type="button"
                onClick={lock}
                className="ml-1 text-[10px] font-bold uppercase tracking-wider text-textMuted hover:text-textMain underline"
              >
                Lock
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 md:gap-16 items-start">

        {/* Left Navigation */}
        <nav
          className="w-full md:w-60 shrink-0 flex flex-row md:flex-col gap-6 md:gap-8 overflow-x-auto md:overflow-visible pb-3 md:pb-0 no-scrollbar"
          aria-label="Settings sections"
        >
          {navGroups.map((group, i) => (
            <div key={i} className="flex flex-col gap-2 shrink-0">
              <span className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase px-3 hidden md:block">
                {group.title}
              </span>
              <div className="flex flex-row md:flex-col gap-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      className={cn(
                        "text-left px-3.5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-150 whitespace-nowrap flex items-center justify-between gap-2.5",
                        activeTab === item.id
                          ? "bg-accent/15 text-accent border border-accent/25 shadow-sm"
                          : "text-textMuted hover:text-textMain hover:bg-surface/80"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={14} className={activeTab === item.id ? "text-accent" : "text-textMuted"} />
                        <span>{item.label}</span>
                      </div>
                      {item.isLocked && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border/40 text-textMuted">
                          Locked
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="hidden md:block w-full h-px bg-border/20 my-1" />

          <button
            onClick={signOut}
            className="flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-xl text-xs font-bold tracking-wide text-red-400 hover:bg-red-400/10 hover:text-red-300 transition-colors duration-150 shrink-0 whitespace-nowrap"
          >
            <LogOut size={14} /> Log out
          </button>
        </nav>

        {/* Right Content */}
        <div className="flex-1 w-full min-w-0 flex flex-col">

          {/* TAB 1: ACCOUNT */}
          {activeTab === 'account' && (
            <div className="animate-fade-in space-y-8">
              <div>
                <h2 className="text-xl font-bold text-textMain tracking-tight">Account Identity</h2>
                <p className="text-xs text-textMuted mt-1">Manage your public persona and core profile details.</p>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-6 divide-y divide-border/20">
                {/* Avatar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 gap-4">
                  <div>
                    <span className="text-sm font-bold text-textMain block">Profile Picture</span>
                    <span className="text-xs text-textMuted">Your visual identity across personal views and friend hubs.</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-background overflow-hidden flex items-center justify-center shrink-0 border border-border/60">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-black text-textMuted">
                          {(profile?.display_name || profile?.full_name || 'U').substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <Link
                      to="/profile"
                      className="px-4 py-2 bg-surfaceHover border border-border/80 rounded-xl text-xs font-bold text-textMain hover:border-accent transition-colors"
                    >
                      Edit in Profile
                    </Link>
                  </div>
                </div>

                {/* Display Name */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-6 gap-4">
                  <div>
                    <span className="text-sm font-bold text-textMain block">Display Name</span>
                    <span className="text-xs text-textMuted">The name shown on your streaks and shared lists.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-textMain font-bold bg-background px-4 py-2 rounded-xl border border-border/40 sm:min-w-[180px]">
                      {profile?.display_name || profile?.full_name || 'Not configured'}
                    </div>
                    <Link
                      to="/profile"
                      className="px-3.5 py-2 bg-surfaceHover border border-border/80 rounded-xl text-xs font-bold text-textMain hover:border-accent transition-colors"
                    >
                      Change
                    </Link>
                  </div>
                </div>

                {/* Username */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-6 gap-4">
                  <div>
                    <span className="text-sm font-bold text-textMain block">Username</span>
                    <span className="text-xs text-textMuted">Your unique identifier handle.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-textMain font-mono font-bold bg-background px-4 py-2 rounded-xl border border-border/40 sm:min-w-[180px]">
                      @{profile?.username || 'user'}
                    </div>
                    <Link
                      to="/profile"
                      className="px-3.5 py-2 bg-surfaceHover border border-border/80 rounded-xl text-xs font-bold text-textMain hover:border-accent transition-colors"
                    >
                      Change
                    </Link>
                  </div>
                </div>

                {/* Email */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-6 gap-4">
                  <div>
                    <span className="text-sm font-bold text-textMain block">Email Address</span>
                    <span className="text-xs text-textMuted">Primary email address associated with your authentication session.</span>
                  </div>
                  <div className="text-sm font-mono text-textMain font-medium bg-background px-4 py-2 rounded-xl border border-border/40 opacity-80 sm:min-w-[200px]">
                    {user?.email || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Timezone & Localization */}
              <div className="bg-surface border border-border/60 rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-sm font-bold text-textMain block">Active Timezone</span>
                    <span className="text-xs text-textMuted">Used to accurately evaluate daily task completions and streaks.</span>
                  </div>
                  <div className="text-xs font-mono font-bold bg-background px-4 py-2 rounded-xl border border-border/40 text-accent">
                    {profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NOTIFICATIONS & PREFERENCES */}
          {(activeTab === 'notifications' || activeTab === 'preferences') && (
            <div className="animate-fade-in space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-textMain tracking-tight">Notifications</h2>
                  <p className="text-xs text-textMuted mt-1">Configure push alerts, task reminders, social updates, and progress nudges.</p>
                </div>
                {saveState && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent self-start sm:self-auto">
                    {saveState}
                  </span>
                )}
              </div>

              {/* Permission Denied Warning Box */}
              {permission === 'denied' && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-3">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-400" />
                  <div className="text-xs space-y-1">
                    <span className="font-bold block text-sm text-amber-200">Push Notifications are Blocked</span>
                    <p className="text-amber-300/90 leading-relaxed">
                      Your browser is currently blocking notifications from Eustace. To re-enable alerts:
                    </p>
                    <ol className="list-decimal list-inside space-y-0.5 pt-1 text-amber-200/90 font-medium">
                      <li>Click the tune / padlock icon next to the URL in your address bar.</li>
                      <li>Find <strong>Notifications</strong> and toggle it to <strong>Allow</strong>.</li>
                      <li>Refresh this page and toggle Push Notifications back on.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Main Notifications Container */}
              <div className="bg-surface border border-border/60 rounded-2xl p-6 space-y-8">
                {prefsLoading ? (
                  <div className="flex items-center gap-3 text-textMuted py-8">
                    <Loader2 size={16} className="animate-spin text-accent" />
                    <span className="text-xs font-medium">Loading preferences...</span>
                  </div>
                ) : (
                  <>
                    {/* MASTER TOGGLE: Push Notifications */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border/20 gap-4">
                      <div>
                        <span className="text-base font-bold text-textMain block flex items-center gap-2">
                          <Bell size={18} className="text-accent" /> Push Notifications
                        </span>
                        <span className="text-xs text-textMuted mt-0.5 block">
                          Receive timely notifications on this device even when Eustace is running in the background.
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={notifLoading || !notifSupported}
                        onClick={async () => {
                          if (prefs.push_notifications && permission === 'granted') {
                            await disablePushNotifications();
                            updatePreference('push_notifications', false);
                          } else {
                            const granted = await requestPermissionAndEnable();
                            if (granted) {
                              updatePreference('push_notifications', true);
                            }
                          }
                        }}
                        aria-pressed={prefs.push_notifications && permission === 'granted'}
                        aria-label="Toggle push notifications"
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0",
                          (prefs.push_notifications && permission === 'granted') ? "bg-accent" : "bg-border/60",
                          (notifLoading || !notifSupported) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm",
                            (prefs.push_notifications && permission === 'granted') ? "right-0.5" : "left-0.5"
                          )}
                        />
                      </button>
                    </div>

                    {/* SECTION 1: Tasks */}
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-bold tracking-[0.2em] text-textMuted uppercase">
                        Tasks
                      </h3>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 gap-4">
                        <div>
                          <span className="text-sm font-bold text-textMain block">Task Reminders</span>
                          <span className="text-xs text-textMuted">Receive scheduled alerts before your intentional tasks begin.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !prefs.task_reminders;
                            updatePreference('task_reminders', next);
                            updatePreference('productivity_reminders', next);
                          }}
                          aria-pressed={prefs.task_reminders}
                          aria-label="Toggle task reminders"
                          className={cn(
                            "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0",
                            prefs.task_reminders ? "bg-accent" : "bg-border/60"
                          )}
                        >
                          <div
                            className={cn(
                              "w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm",
                              prefs.task_reminders ? "right-0.5" : "left-0.5"
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    {/* SECTION 2: Social */}
                    <div className="space-y-4 pt-4 border-t border-border/20">
                      <h3 className="text-[11px] font-bold tracking-[0.2em] text-textMuted uppercase">
                        Social
                      </h3>
                      <div className="divide-y divide-border/10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-4">
                          <div>
                            <span className="text-sm font-bold text-textMain block">Messages</span>
                            <span className="text-xs text-textMuted">Alerts when friends send you direct messages.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updatePreference('message_notifications', !prefs.message_notifications)}
                            aria-pressed={prefs.message_notifications}
                            aria-label="Toggle message notifications"
                            className={cn(
                              "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0",
                              prefs.message_notifications ? "bg-accent" : "bg-border/60"
                            )}
                          >
                            <div
                              className={cn(
                                "w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm",
                                prefs.message_notifications ? "right-0.5" : "left-0.5"
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-4">
                          <div>
                            <span className="text-sm font-bold text-textMain block">Friend Requests</span>
                            <span className="text-xs text-textMuted">Get notified when someone connects with you or accepts your request.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updatePreference('friend_request_notifications', !prefs.friend_request_notifications)}
                            aria-pressed={prefs.friend_request_notifications}
                            aria-label="Toggle friend request notifications"
                            className={cn(
                              "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0",
                              prefs.friend_request_notifications ? "bg-accent" : "bg-border/60"
                            )}
                          >
                            <div
                              className={cn(
                                "w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm",
                                prefs.friend_request_notifications ? "right-0.5" : "left-0.5"
                              )}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3: Progress */}
                    <div className="space-y-4 pt-4 border-t border-border/20">
                      <h3 className="text-[11px] font-bold tracking-[0.2em] text-textMuted uppercase">
                        Progress
                      </h3>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 gap-4">
                        <div>
                          <span className="text-sm font-bold text-textMain block">Streak Reminders</span>
                          <span className="text-xs text-textMuted">Gentle nudges to log your tasks and preserve your daily productivity streak.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePreference('streak_reminders', !prefs.streak_reminders)}
                          aria-pressed={prefs.streak_reminders}
                          aria-label="Toggle streak reminders"
                          className={cn(
                            "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0",
                            prefs.streak_reminders ? "bg-accent" : "bg-border/60"
                          )}
                        >
                          <div
                            className={cn(
                              "w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm",
                              prefs.streak_reminders ? "right-0.5" : "left-0.5"
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    {/* SECTION 4: System */}
                    <div className="space-y-4 pt-4 border-t border-border/20">
                      <h3 className="text-[11px] font-bold tracking-[0.2em] text-textMuted uppercase">
                        System
                      </h3>
                      <div className="divide-y divide-border/10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-4">
                          <div>
                            <span className="text-sm font-bold text-textMain block">Important Updates</span>
                            <span className="text-xs text-textMuted">Critical account announcements and system notices.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updatePreference('system_notifications', !prefs.system_notifications)}
                            aria-pressed={prefs.system_notifications}
                            aria-label="Toggle important updates"
                            className={cn(
                              "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0",
                              prefs.system_notifications ? "bg-accent" : "bg-border/60"
                            )}
                          >
                            <div
                              className={cn(
                                "w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm",
                                prefs.system_notifications ? "right-0.5" : "left-0.5"
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-4">
                          <div>
                            <span className="text-sm font-bold text-textMain block">Email Notifications</span>
                            <span className="text-xs text-textMuted">Receive system updates and weekly summaries via email.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updatePreference('email_notifications', !prefs.email_notifications)}
                            aria-pressed={prefs.email_notifications}
                            aria-label="Toggle email notifications"
                            className={cn(
                              "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0",
                              prefs.email_notifications ? "bg-accent" : "bg-border/60"
                            )}
                          >
                            <div
                              className={cn(
                                "w-5 h-5 bg-background rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm",
                                prefs.email_notifications ? "right-0.5" : "left-0.5"
                              )}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 5: Verification & Diagnostics */}
                    <div className="pt-6 border-t border-border/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-bold text-textMain block">Device Diagnostics</span>
                        <span className="text-[11px] text-textMuted">
                          Push Status: <span className="text-accent font-semibold capitalize">{permission}</span>
                          {!notifConfigured && ' (Firebase env keys pending)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={testSending || !prefs.push_notifications}
                        onClick={async () => {
                          if (!user) return;
                          setTestSending(true);
                          try {
                            // Ensure device is registered before dispatching test
                            if (permission !== 'granted') {
                              const granted = await requestPermissionAndEnable();
                              if (!granted) {
                                setTestSending(false);
                                return;
                              }
                            } else {
                              await notificationService.registerDevice(user.id);
                            }

                            const { data: resData, error } = await supabase.functions.invoke('send-push-notification', {
                              body: {
                                userId: user.id,
                                type: 'system',
                                title: '🔔 Eustace',
                                body: 'Test push notification delivered successfully.',
                                data: { url: '/settings' }
                              }
                            });

                            if (error) {
                              toast.error('Failed to dispatch test notification');
                            } else if (resData?.deliveredDevices === 0) {
                              toast.error('Device token not active. Please tap the Push switch off and on.');
                            } else {
                              toast.success(`Test push notification delivered to ${resData?.deliveredDevices || 1} device(s)!`);
                            }
                          } catch (err: any) {
                            console.error('[Send Test Notification] Error:', err);
                            toast.error('Error dispatching test notification');
                          } finally {
                            setTestSending(false);
                          }
                        }}
                        className="px-4 py-2 bg-white/[0.06] hover:bg-white/10 border border-border/50 text-textMain text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {testSending ? 'Sending...' : 'Send Test Notification'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="animate-fade-in space-y-8">
              <div>
                <h2 className="text-xl font-bold text-textMain tracking-tight">Appearance & Theme</h2>
                <p className="text-xs text-textMuted mt-1">Eustace editorial visual design aesthetic.</p>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-6 divide-y divide-border/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 gap-4">
                  <div>
                    <span className="text-sm font-bold text-textMain block">Dark Monochrome Theme</span>
                    <span className="text-xs text-textMuted">High-contrast OLED palette designed for uninterrupted focus and low eye strain.</span>
                  </div>
                  <div className="px-4 py-2 bg-accent/15 border border-accent/30 text-accent rounded-xl text-xs font-bold uppercase tracking-wider cursor-default">
                    Active (Default)
                  </div>
                </div>

                <div className="pt-6">
                  <span className="text-xs font-bold uppercase tracking-widest text-textMuted block mb-2">Design Tokens</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-background border border-border/60 rounded-xl flex flex-col gap-1">
                      <span className="text-[10px] text-textMuted uppercase font-mono">Background</span>
                      <span className="font-bold text-textMain font-mono text-[11px]">#0a0a0a</span>
                    </div>
                    <div className="p-3 bg-surface border border-border/60 rounded-xl flex flex-col gap-1">
                      <span className="text-[10px] text-textMuted uppercase font-mono">Surface</span>
                      <span className="font-bold text-textMain font-mono text-[11px]">#111111</span>
                    </div>
                    <div className="p-3 bg-surfaceHover border border-border/60 rounded-xl flex flex-col gap-1">
                      <span className="text-[10px] text-textMuted uppercase font-mono">SurfaceHover</span>
                      <span className="font-bold text-textMain font-mono text-[11px]">#1a1a1a</span>
                    </div>
                    <div className="p-3 bg-background border border-accent/40 rounded-xl flex flex-col gap-1">
                      <span className="text-[10px] text-accent uppercase font-mono">Accent</span>
                      <span className="font-bold text-accent font-mono text-[11px]">#22c55e</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DATA & PRIVACY */}
          {activeTab === 'privacy' && (
            <div className="animate-fade-in space-y-8">
              <div>
                <h2 className="text-xl font-bold text-textMain tracking-tight">Data Portability & Privacy</h2>
                <p className="text-xs text-textMuted mt-1">Export your workspace archive and review data handling guarantees.</p>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-6 divide-y divide-border/20">
                {/* Data Export */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-6 gap-6">
                  <div className="space-y-1 max-w-lg">
                    <span className="text-sm font-bold text-textMain block">Export Your Personal Data Archive</span>
                    <p className="text-xs text-textMuted leading-relaxed">
                      Download a complete, machine-readable JSON archive of your account profile, tasks, completion history, daily habit logs, markdown notes, sent messages, and friendships in compliance with <strong>GDPR Article 20 (Right to data portability)</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={isExporting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-surfaceHover border border-border/80 rounded-xl text-xs font-bold text-textMain hover:border-accent hover:text-accent transition-colors disabled:opacity-50 shrink-0 shadow-sm"
                  >
                    <Download size={14} />
                    {isExporting ? 'Exporting Archive...' : 'Export JSON'}
                  </button>
                </div>

                {/* Privacy & Legal Notices */}
                <div className="pt-6 space-y-4">
                  <div className="flex items-center gap-2 text-xs text-textMuted">
                    <Shield size={14} className="text-accent" />
                    <span>Zero third-party telemetry, advertising pixels, or behavior tracking cookies.</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs font-medium">
                    <Link to="/privacy" className="text-textMuted hover:text-textMain transition-colors flex items-center gap-1.5 underline underline-offset-4">
                      <FileText size={13} />
                      Privacy Policy (Section 6)
                    </Link>
                    <Link to="/terms" className="text-textMuted hover:text-textMain transition-colors flex items-center gap-1.5 underline underline-offset-4">
                      <FileText size={13} />
                      Terms of Service
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY (PROTECTED) */}
          {activeTab === 'security' && isVerified && (
            <div className="animate-fade-in space-y-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-textMain tracking-tight">Security & Access</h2>
                  <p className="text-xs text-textMuted mt-1">Manage password credentials, active sessions, and account lifecycle.</p>
                </div>
                <button
                  type="button"
                  onClick={lock}
                  className="px-3.5 py-1.5 bg-surface border border-border/80 rounded-xl text-xs font-bold text-textMuted hover:text-textMain hover:border-textMuted transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Lock size={12} />
                  Lock Section
                </button>
              </div>

              {/* CHANGE PASSWORD */}
              <div className="bg-surface border border-border/60 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-textMain flex items-center gap-2">
                    <KeyRound size={16} className="text-accent" />
                    Change Account Password
                  </h3>
                  <p className="text-xs text-textMuted mt-0.5">
                    Update your account password with fresh verification of your current credentials.
                  </p>
                </div>

                {isEmailAuth ? (
                  <div className="space-y-4 max-w-md">
                    {/* Current Password */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="sec-current-pwd" className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                        Current Password
                      </label>
                      <div className="relative">
                        <SmoothInput
                          id="sec-current-pwd"
                          name="current-password"
                          type={showCurrentPassword ? 'text' : 'password'}
                          placeholder="Enter current password"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 pr-11 text-sm text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-accent transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain p-1 transition-colors"
                        >
                          {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* New Password */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="sec-new-pwd" className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                        New Password (minimum 6 characters)
                      </label>
                      <div className="relative">
                        <SmoothInput
                          id="sec-new-pwd"
                          name="new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="Enter new password"
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 pr-11 text-sm text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-accent transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain p-1 transition-colors"
                        >
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm New Password */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="sec-confirm-pwd" className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <SmoothInput
                          id="sec-confirm-pwd"
                          name="confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Re-enter new password"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 pr-11 text-sm text-textMain placeholder:text-textMuted/40 focus:outline-none focus:border-accent transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain p-1 transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {passwordError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl text-accent text-xs font-bold flex items-center gap-2">
                        <Check size={14} /> Password updated successfully.
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleUpdatePassword}
                      disabled={isUpdatingPassword}
                      className="px-5 py-2.5 bg-accent text-background rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-accentHover disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-accent/10"
                    >
                      {isUpdatingPassword ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Updating Password...
                        </>
                      ) : (
                        'Update Password'
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-lg">
                    <p className="text-xs text-textMuted leading-relaxed">
                      Your Eustace account authenticates via <strong>OAuth</strong>. Your credentials and multi-factor protections are handled directly by your identity provider. If you want to configure an email password, request a setup email below:
                    </p>
                    <button
                      type="button"
                      onClick={handleSendResetEmail}
                      disabled={isSendingResetEmail}
                      className="px-4 py-2 bg-surfaceHover border border-border/80 rounded-xl text-xs font-bold text-textMain hover:border-accent transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSendingResetEmail && <Loader2 size={13} className="animate-spin" />}
                      Send Password Setup Email
                    </button>
                  </div>
                )}
              </div>

              {/* SESSIONS */}
              <div className="bg-surface border border-border/60 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-sm font-bold text-textMain block">Active Browser Session</span>
                  <span className="text-xs text-textMuted">End your active authentication session and clear local session state.</span>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="px-4 py-2 bg-surfaceHover border border-border/80 rounded-xl text-xs font-bold text-red-400 hover:bg-red-400/10 hover:border-red-400 transition-colors shrink-0"
                >
                  Sign Out Everywhere
                </button>
              </div>

              {/* DANGER ZONE: ACCOUNT DELETION */}
              <div className="bg-surface border border-red-500/30 rounded-2xl p-6 space-y-4">
                <div>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-red-400 block mb-1">
                    Danger Zone
                  </span>
                  <h3 className="text-sm font-bold text-red-400">Permanently Delete Account</h3>
                  <p className="text-xs text-textMuted mt-1 max-w-xl leading-relaxed">
                    Immediately wipe your profile, tasks, completion logs, notes, messages, storage attachments, and Supabase credentials. This action cannot be reversed.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="px-5 py-2.5 bg-red-500/15 border border-red-500/40 rounded-xl text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/10"
                  >
                    Delete Account...
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div className="animate-fade-in space-y-8">
              <div>
                <h2 className="text-xl font-bold text-textMain tracking-tight">Keyboard Shortcuts</h2>
                <p className="text-xs text-textMuted mt-1">Accelerate your workflow with quick keybindings.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Application Shortcuts */}
                <div className="bg-surface border border-border/60 rounded-2xl p-6">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted mb-4 border-b border-border/20 pb-2">
                    Application Navigation
                  </h3>
                  <div className="flex flex-col gap-3.5">
                    {[
                      { label: 'Quick Switcher', keys: ['Ctrl/Cmd', 'O'] },
                      { label: 'Command Palette', keys: ['Ctrl/Cmd', 'P'] },
                      { label: 'New Task / Note', keys: ['Ctrl/Cmd', 'N'] },
                      { label: 'Open Settings', keys: ['Ctrl/Cmd', ','] },
                      { label: 'Productivity Graph', keys: ['Ctrl/Cmd', 'G'] },
                      { label: 'Back / Forward', keys: ['Ctrl/Cmd', 'Alt', '←/→'] }
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-textMain">{item.label}</span>
                        <div className="flex items-center gap-1.5">
                          {item.keys.map(k => (
                            <kbd key={k} className="bg-background text-textMain text-[10px] font-mono px-2 py-0.5 rounded-md border border-border/60 shadow-xs">
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Editor Shortcuts */}
                <div className="bg-surface border border-border/60 rounded-2xl p-6">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted mb-4 border-b border-border/20 pb-2">
                    Rich Text Editor
                  </h3>
                  <div className="flex flex-col gap-3.5">
                    {[
                      { label: 'Bold Selection', keys: ['Ctrl/Cmd', 'B'] },
                      { label: 'Italic Selection', keys: ['Ctrl/Cmd', 'I'] },
                      { label: 'Underline', keys: ['Ctrl/Cmd', 'U'] },
                      { label: 'Insert Link', keys: ['Ctrl/Cmd', 'K'] },
                      { label: 'Undo Change', keys: ['Ctrl/Cmd', 'Z'] },
                      { label: 'Redo Change', keys: ['Ctrl/Cmd', 'Shift', 'Z'] }
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-textMain">{item.label}</span>
                        <div className="flex items-center gap-1.5">
                          {item.keys.map(k => (
                            <kbd key={k} className="bg-background text-textMain text-[10px] font-mono px-2 py-0.5 rounded-md border border-border/60 shadow-xs">
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Verification Modal for Gating Security Access */}
      <VerifyIdentityModal
        isOpen={isVerifyModalOpen}
        userEmail={user?.email}
        isEmailAuth={isEmailAuth}
        isVerifying={isVerifying}
        errorMessage={verificationError}
        onVerify={handleVerifySuccess}
        onConfirmOAuth={handleConfirmOAuth}
        onCancel={() => setIsVerifyModalOpen(false)}
      />

      {/* Account Deletion Confirmation Modal */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        userEmail={user?.email}
        isEmailAuth={isEmailAuth}
        isDeleting={isDeleting}
        onDelete={handleDeleteAccountWithReauth}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}
