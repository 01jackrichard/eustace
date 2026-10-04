import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loader2, Upload, User, Check, X, Camera } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { cn } from '../lib/utils';

interface EditProfileModalProps {
  onClose: () => void;
}

export function EditProfileModal({ onClose }: EditProfileModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || profile?.full_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  // Visibility mode has been completely removed as a product requirement
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState(profile?.cover_image_url || '');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverLoading, setCoverLoading] = useState(false);

  const debouncedUsername = useDebounce(username, 500);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  const isDirty = 
    username !== (profile?.username || '') ||
    displayName !== (profile?.display_name || profile?.full_name || '') ||
    bio !== (profile?.bio || '') ||

    avatarUrl !== (profile?.avatar_url || '') ||
    coverUrl !== (profile?.cover_image_url || '');

  const validateUsername = (u: string) => {
    if (!u) return false;
    const regex = /^[a-z0-9_]{3,20}$/;
    return regex.test(u);
  };

  useEffect(() => {
    async function checkUsername() {
      if (!debouncedUsername) {
        setUsernameStatus('idle');
        return;
      }
      if (debouncedUsername === profile?.username) {
        setUsernameStatus('idle');
        return;
      }
      if (!validateUsername(debouncedUsername)) {
        setUsernameStatus('invalid');
        return;
      }
      setUsernameStatus('checking');
      const { data } = await supabase.from('profiles').select('id').eq('username', debouncedUsername).single();
      if (data && data.id !== user?.id) {
        setUsernameStatus('taken');
      } else {
        setUsernameStatus('available');
      }
    }
    checkUsername();
  }, [debouncedUsername, profile?.username, user?.id]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    const file = e.target.files[0];
    setCoverLoading(true);
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}-cover-${Math.random()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('profile-covers').upload(filePath, file);
    if (uploadError) {
      setErrorMessage(uploadError.message);
      setCoverLoading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('profile-covers').getPublicUrl(filePath);
    setCoverUrl(publicUrl);
    setCoverLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    const file = e.target.files[0];
    setAvatarLoading(true);
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}-${Math.random()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file);
    if (uploadError) {
      setErrorMessage(uploadError.message);
      setAvatarLoading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('profile-images').getPublicUrl(filePath);
    setAvatarUrl(publicUrl);
    setAvatarLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (username && !validateUsername(username)) return setUsernameStatus('invalid');
    if (usernameStatus === 'taken') return;
    setSaving(true);
    setSaveStatus('saving');
    setErrorMessage(null);
    const updates = {
      id: user.id,
      username: username || null,
      display_name: displayName,
      full_name: displayName,
      avatar_url: avatarUrl,
      cover_image_url: coverUrl,
      bio,
      visibility: 'public',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').upsert(updates);
    if (error) {
      setErrorMessage(error.message || JSON.stringify(error));
      setSaveStatus('error');
    } else {
      await refreshProfile();
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 1000);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-surface border border-border/40 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        <div className="flex items-center justify-between p-6 border-b border-border/30">
          <h2 className="text-sm font-bold tracking-widest text-textMain uppercase">Edit Profile</h2>
          <button onClick={onClose} className="p-2 text-textMuted hover:text-textMain transition-colors"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-10">
          
          {/* Cover Section */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase">Cover Image</span>
            <div 
              className="relative w-full h-32 md:h-48 rounded-xl bg-surface border border-border/60 overflow-hidden flex items-center justify-center cursor-pointer group transition-all hover:border-textMuted/40"
              onClick={() => !coverLoading && coverInputRef.current?.click()}
            >
              {coverLoading ? (
                <Loader2 className="animate-spin text-textMuted" size={24} />
              ) : coverUrl ? (
                <>
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover transition-opacity group-hover:opacity-30" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={20} className="text-textMain mb-1" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center text-textMuted/50 group-hover:text-textMain transition-colors">
                   <Upload size={20} className="mb-2" />
                   <span className="text-[10px] font-bold tracking-widest uppercase">Upload Cover</span>
                </div>
              )}
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={coverLoading} />
            </div>
            {coverUrl && (
              <div className="flex justify-end mt-1">
                <button onClick={() => setCoverUrl('')} className="text-[10px] font-bold tracking-widest text-textMuted hover:text-red-400 uppercase transition-colors">Remove Cover</button>
              </div>
            )}
          </div>

          {/* Avatar Section */}
          <div className="flex items-center gap-6">
            <div 
              onClick={() => !avatarLoading && fileInputRef.current?.click()}
              className="group relative w-20 h-20 rounded-2xl bg-background border border-border/60 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer transition-all hover:border-textMuted/40"
            >
              {avatarLoading ? (
                <Loader2 className="animate-spin text-textMuted" size={20} />
              ) : avatarUrl ? (
                <>
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover transition-opacity group-hover:opacity-30" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={16} className="text-textMain mb-1" />
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-black text-textMuted/30 uppercase tracking-tighter group-hover:opacity-0 transition-opacity">
                    {displayName ? displayName.substring(0, 2) : <User size={24} />}
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Upload size={16} className="text-textMuted mb-1" />
                  </div>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarLoading} />
            </div>
            
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase">Profile Picture</span>
              <div className="flex items-center gap-4">
                <button onClick={() => fileInputRef.current?.click()} className="text-xs font-semibold text-textMain hover:text-white transition-colors">Upload</button>
                {avatarUrl && <button onClick={() => setAvatarUrl('')} className="text-xs font-semibold text-textMuted hover:text-red-400 transition-colors">Remove</button>}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Display Name</label>
              <input 
                type="text"
                className="w-full bg-transparent border-b border-border/30 pb-2 text-lg font-bold text-textMain focus:outline-none focus:border-accent transition-colors"
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 relative">
              <label className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Username</label>
              <div className="relative w-full">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-textMuted font-bold">@</span>
                <input 
                  type="text"
                  className={cn(
                    "w-full bg-transparent border-b border-border/30 pb-2 pl-6 text-lg font-bold text-textMain focus:outline-none transition-colors",
                    usernameStatus === 'taken' || usernameStatus === 'invalid' ? "border-red-500 focus:border-red-500" : "focus:border-accent"
                  )}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
              </div>
              <div className="absolute -bottom-5 left-0 flex items-center gap-2">
                {usernameStatus === 'checking' && <span className="text-[9px] font-bold tracking-widest text-textMuted uppercase"><Loader2 size={10} className="animate-spin inline mr-1" /> Checking...</span>}
                {usernameStatus === 'available' && <span className="text-[9px] font-bold tracking-widest text-accent uppercase"><Check size={10} className="inline mr-1" /> Available</span>}
                {usernameStatus === 'taken' && <span className="text-[9px] font-bold tracking-widest text-red-500 uppercase"><X size={10} className="inline mr-1" /> Taken</span>}
                {usernameStatus === 'invalid' && <span className="text-[9px] font-bold tracking-widest text-red-500 uppercase"><X size={10} className="inline mr-1" /> Invalid format</span>}
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Bio</label>
                <span className={cn("text-[9px] font-mono", bio.length > 150 ? "text-red-400" : "text-textMuted/50")}>{bio.length} / 160</span>
              </div>
              <textarea 
                className="w-full bg-background border border-border/30 rounded-lg p-3 text-sm font-medium text-textMain focus:outline-none focus:border-textMuted transition-colors resize-none"
                value={bio} rows={3} maxLength={160} onChange={(e) => setBio(e.target.value)}
              />
            </div>


            
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs font-bold font-mono">{errorMessage}</div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border/30 flex items-center justify-between bg-background">
          <div className="text-[9px] font-bold tracking-widest uppercase text-textMuted">
            {isDirty && saveStatus === 'idle' ? <span className="text-yellow-500 animate-pulse">Unsaved Changes</span> : 'Up to date'}
          </div>
          <button 
            onClick={handleSave} disabled={!isDirty || saving || !username || usernameStatus === 'taken' || usernameStatus === 'invalid'}
            className="py-2 px-6 bg-textMain text-background hover:bg-white text-[10px] font-bold tracking-widest uppercase rounded disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {saveStatus === 'saving' ? <Loader2 size={12} className="animate-spin" /> : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}
