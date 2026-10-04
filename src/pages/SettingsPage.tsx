import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { LogOut, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const activeTab = searchParams.get('section') || 'account';
  const setActiveTab = (tab: string) => setSearchParams({ section: tab });

  // Notifications State
  const [prefs, setPrefs] = useState({
    email_notifications: false,
    friend_request_notifications: true,
    productivity_reminders: true
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saveState, setSaveState] = useState<string | null>(null);

  // Security State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Danger Zone State
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function loadPrefs() {
      if (!user) return;
      setPrefsLoading(true);
      const { data } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).single();
      if (data) {
        setPrefs({
          email_notifications: data.email_notifications,
          friend_request_notifications: data.friend_request_notifications,
          productivity_reminders: data.productivity_reminders
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

  const handleUpdatePassword = async () => {
    if (!password) { setPasswordError('Password is required.'); return; }
    if (password !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    if (password.length < 6) { setPasswordError('Password must be at least 6 characters.'); return; }
    
    setIsUpdatingPassword(true);
    setPasswordError('');
    setPasswordSuccess(false);
    
    const { error } = await supabase.auth.updateUser({ password });
    
    setIsUpdatingPassword(false);
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSuccess(true);
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    // Since Supabase requires a service role or edge function to delete a user account,
    // we alert the user exactly as instructed when it cannot safely be implemented client-side.
    alert("Account deletion requires backend configuration (e.g. Edge Function with Service Role). Please run the provided SQL function or contact support to complete this action.");
    setIsDeleting(false);
  };

  const navGroups = [
    {
      title: 'GENERAL',
      items: [
        { id: 'account', label: 'Account' },
        { id: 'appearance', label: 'Appearance' },
        { id: 'notifications', label: 'Notifications' }
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { id: 'profile', label: 'Profile' },
        { id: 'security', label: 'Security' }
      ]
    }
  ];

  return (
    <div className="max-w-5xl mx-auto w-full pt-12 md:pt-24 pb-32 px-4 md:px-8 animate-fade-in flex flex-col">
      
      {/* Header */}
      <div className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-textMain tracking-tighter uppercase mb-2">Settings</h1>
          <p className="text-sm font-medium text-textMuted">Manage your Eustace account and preferences.</p>
        </div>
        {saveState && (
          <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 px-3 py-1.5 rounded flex items-center gap-2 transition-all">
            {saveState === 'Saved' && <Check size={12} />} {saveState}
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-12 md:gap-24 items-start">
        
        {/* Left Nav */}
        <nav className="w-full md:w-56 shrink-0 flex flex-row md:flex-col gap-4 md:gap-8 overflow-x-auto md:overflow-visible pb-4 md:pb-0 custom-scrollbar">
          {navGroups.map((group, i) => (
            <div key={i} className="flex flex-col gap-3 shrink-0">
              <span className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase px-3 hidden md:block">{group.title}</span>
              <div className="flex flex-row md:flex-col gap-1">
                {group.items.map(item => {
                  if (item.id === 'profile') {
                    return (
                      <Link
                        key={item.id}
                        to="/profile"
                        className="text-left px-4 py-2 md:px-3 md:py-2 rounded-md text-sm font-medium transition-colors duration-200 text-textMain hover:bg-surface/50 whitespace-nowrap"
                      >
                        {item.label}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={cn(
                        "text-left px-4 py-2 md:px-3 md:py-2 rounded-md text-sm font-medium transition-colors duration-200 whitespace-nowrap",
                        activeTab === item.id 
                          ? "bg-accent/10 text-accent font-bold" 
                          : "text-textMain hover:bg-surface/50 hover:text-textMain"
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          
          <div className="hidden md:block w-full h-px bg-border/20 my-2" />
          
          <button 
            onClick={signOut}
            className="flex items-center gap-2 text-left px-4 py-2 md:px-3 rounded-md text-sm font-bold text-red-400 hover:bg-red-400/10 transition-colors duration-200 shrink-0 whitespace-nowrap"
          >
            <LogOut size={16} /> Log out
          </button>
        </nav>

        {/* Right Content */}
        <div className="flex-1 w-full flex flex-col">
          
          {activeTab === 'account' && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-textMain mb-2">Account</h2>
              <p className="text-sm text-textMuted mb-10">Manage your account information.</p>
              
              <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted mb-4 border-b border-border/20 pb-2">Profile</h3>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-textMain">Avatar</span>
                  <span className="text-xs font-medium text-textMuted">Your public profile picture.</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-border/20 overflow-hidden flex items-center justify-center shrink-0 border border-border/30">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-textMuted">{(profile?.display_name || profile?.full_name || 'U').substring(0,2).toUpperCase()}</span>
                    )}
                  </div>
                  <Link to="/profile" className="px-4 py-2 bg-surface border border-border/30 rounded text-xs font-bold text-textMain hover:border-accent transition-colors">Change</Link>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-textMain">Display name</span>
                  <span className="text-xs font-medium text-textMuted">Your visible name on Eustace.</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-textMain font-bold bg-surface px-4 py-2 rounded border border-border/20 md:min-w-[200px]">{profile?.display_name || profile?.full_name || 'Not set'}</div>
                  <Link to="/profile" className="px-4 py-2 bg-surface border border-border/30 rounded text-xs font-bold text-textMain hover:border-accent transition-colors">Change</Link>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-textMain">Username</span>
                  <span className="text-xs font-medium text-textMuted">Your unique Eustace handle.</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-textMain font-bold bg-surface px-4 py-2 rounded border border-border/20 md:min-w-[200px]">@{profile?.username}</div>
                  <Link to="/profile" className="px-4 py-2 bg-surface border border-border/30 rounded text-xs font-bold text-textMain hover:border-accent transition-colors">Change</Link>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-textMain">Email</span>
                  <span className="text-xs font-medium text-textMuted">The email address tied to your account.</span>
                </div>
                <div className="text-sm text-textMain font-bold bg-surface px-4 py-2 rounded border border-border/20 md:min-w-[200px] opacity-70 cursor-not-allowed">{user?.email}</div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-textMain mb-2">Appearance</h2>
              <p className="text-sm text-textMuted mb-10">Eustace visual settings.</p>

              <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted mb-4 border-b border-border/20 pb-2">Theme</h3>

              <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-textMain">Dark</span>
                  <span className="text-xs font-medium text-textMuted">Eustace uses a dark editorial interface designed for focused work.</span>
                </div>
                <div className="flex gap-2">
                  <div className="px-6 py-2 bg-accent/10 border border-accent rounded text-xs font-bold text-accent cursor-default">Selected</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-textMain mb-2">Notifications</h2>
              <p className="text-sm text-textMuted mb-10">Choose what we update you about.</p>

              {prefsLoading ? (
                <div className="flex items-center gap-3 text-textMuted py-8">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs font-medium">Loading preferences...</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-textMain">Email notifications</span>
                      <span className="text-xs font-medium text-textMuted">Receive Eustace updates by email when email delivery is available.</span>
                    </div>
                    <button 
                      onClick={() => updatePreference('email_notifications', !prefs.email_notifications)}
                      className={cn("w-10 h-5 rounded-full relative transition-colors duration-200", prefs.email_notifications ? "bg-accent" : "bg-border/30")}
                    >
                      <div className={cn("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-200", prefs.email_notifications ? "right-0.5" : "left-0.5")} />
                    </button>
                  </div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-textMain">Friend requests</span>
                      <span className="text-xs font-medium text-textMuted">Get notified when someone adds you.</span>
                    </div>
                    <button 
                      onClick={() => updatePreference('friend_request_notifications', !prefs.friend_request_notifications)}
                      className={cn("w-10 h-5 rounded-full relative transition-colors duration-200", prefs.friend_request_notifications ? "bg-accent" : "bg-border/30")}
                    >
                      <div className={cn("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-200", prefs.friend_request_notifications ? "right-0.5" : "left-0.5")} />
                    </button>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-textMain">Productivity reminders</span>
                      <span className="text-xs font-medium text-textMuted">Nudges to keep your streak alive.</span>
                    </div>
                    <button 
                      onClick={() => updatePreference('productivity_reminders', !prefs.productivity_reminders)}
                      className={cn("w-10 h-5 rounded-full relative transition-colors duration-200", prefs.productivity_reminders ? "bg-accent" : "bg-border/30")}
                    >
                      <div className={cn("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-200", prefs.productivity_reminders ? "right-0.5" : "left-0.5")} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}



          {activeTab === 'security' && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-textMain mb-2">Security</h2>
              <p className="text-sm text-textMuted mb-10">Keep your account safe and manage access.</p>

              <div className="flex flex-col py-6 border-b border-border/10 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-textMain mb-4">Change Password</span>
                  <div className="flex flex-col gap-4 max-w-sm">
                    <input 
                      type="password" 
                      placeholder="New password" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-surface border border-border/30 rounded-md px-4 py-2 text-sm text-textMain focus:outline-none focus:border-accent"
                    />
                    <input 
                      type="password" 
                      placeholder="Confirm new password" 
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-surface border border-border/30 rounded-md px-4 py-2 text-sm text-textMain focus:outline-none focus:border-accent"
                    />
                    {passwordError && <span className="text-xs font-bold text-red-400">{passwordError}</span>}
                    {passwordSuccess && <span className="text-xs font-bold text-accent">Password updated successfully.</span>}
                    <button 
                      onClick={handleUpdatePassword} 
                      disabled={isUpdatingPassword}
                      className="px-4 py-2 bg-accent text-background rounded-md text-xs font-bold transition-colors w-max hover:bg-accentHover disabled:opacity-50"
                    >
                      {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-border/10 gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-textMain">Sessions</span>
                  <span className="text-xs font-medium text-textMuted">Log out of your current session.</span>
                </div>
                <div className="flex gap-4">
                  <button onClick={signOut} className="px-4 py-2 bg-surface border border-border/30 rounded text-xs font-bold text-textMain hover:text-red-400 hover:border-red-400 transition-colors">Log out</button>
                  
                </div>
              </div>

              <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-red-500 mt-16 mb-4 border-b border-red-500/20 pb-2">Danger Zone</h3>
              
              <div className="flex flex-col md:flex-row md:items-start justify-between py-6 gap-4">
                <div className="flex flex-col max-w-sm">
                  <span className="text-sm font-bold text-red-400 mb-1">Delete account</span>
                  <span className="text-xs font-medium text-textMuted">Permanently delete your Eustace account and all associated data. This action cannot be undone.</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase text-textMuted tracking-wider">Type DELETE to confirm</span>
                    <input 
                      type="text" 
                      placeholder="DELETE" 
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      className="w-full bg-surface border border-border/30 rounded-md px-4 py-2 text-sm text-textMain focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => setDeleteConfirmText('')}
                      className="px-4 py-2 bg-surface border border-border/30 rounded text-[10px] font-bold tracking-[0.2em] text-textMuted hover:text-textMain transition-colors uppercase"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleDeleteAccount} 
                      disabled={isDeleting || deleteConfirmText !== 'DELETE'} 
                      className="px-6 py-2 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-bold tracking-[0.2em] text-red-400 hover:bg-red-500 hover:text-white transition-colors uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Account'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
