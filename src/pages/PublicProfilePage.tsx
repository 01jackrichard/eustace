import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePublicProductivityData } from '../hooks/usePublicProductivityData';
import { ContributionGraph } from '../components/ContributionGraph';
import { cn } from '../lib/utils';

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailedError, setDetailedError] = useState<any>(null);
  const { user } = useAuth();
  const [friendship, setFriendship] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'about'>('overview');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const { data: productivityData } = usePublicProductivityData(profile?.id || '', currentYear);


  useEffect(() => {
    async function fetchPublicProfile() {
      if (!username) return;

      const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '');
      console.log('[PROFILE] username requested:', username);
      console.log('[PROFILE] authenticated user id:', user?.id);
      console.log('[PROFILE] normalized username:', cleanUsername);

      const { data, error } = await supabase.rpc('get_profile_by_username', { target_username: cleanUsername });

      const profileData = data && data.length > 0 ? data[0] : null;

      console.log('[PROFILE] profile data:', profileData);
      if (error) {
        console.error('[PROFILE] profile error:', error);
        console.error('[PROFILE] profile error code:', error.code);
        console.error('[PROFILE] profile error message:', error.message);
      }

      if (error) {
        setDetailedError(error);
        setError(true);
        setLoading(false);
      } else if (!profileData) {
        setError(true);
        setLoading(false);
      } else {
        setProfile(profileData);
        if (user && user.id !== profileData.id) {
          fetchFriendship(profileData.id);
        }
        setLoading(false);
      }
    }

    fetchPublicProfile();
  }, [username, user]);

  const fetchFriendship = async (targetId: string) => {
    if (!user) return;
    // Column is addressee_id (not addressee_id) — matches actual DB schema
    const { data } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .neq('status', 'cancelled')
      .neq('status', 'declined');

    if (data) {
      const rel = data.find(f => f.requester_id === targetId || f.addressee_id === targetId);
      setFriendship(rel || null);
    }
  };

  useEffect(() => {
    if (!user || !profile) return;
    const channel = supabase.channel('public_profile_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${user.id}` }, () => fetchFriendship(profile.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` }, () => fetchFriendship(profile.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, profile]);

  const handleAddFriend = async () => {
    if (!user || !profile) return;
    setActionLoading(true);
    // Insert uses addressee_id — matches actual DB schema
    await supabase.from('friendships').insert({ requester_id: user.id, addressee_id: profile.id, status: 'pending' });
    await fetchFriendship(profile.id);
    setActionLoading(false);
  };

  const handleAccept = async () => {
    if (!friendship) return;
    setActionLoading(true);
    await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendship.id);
    await fetchFriendship(profile.id);
    setActionLoading(false);
  };

  const getStatus = () => {
    if (user?.id === profile?.id) return 'you';
    if (!friendship) return 'none';
    if (friendship.status === 'accepted') return 'friends';
    if (friendship.status === 'pending') {
      return friendship.requester_id === user?.id ? 'sent' : 'received';
    }
    return 'none';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-textMuted gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-[10px] tracking-widest uppercase font-bold">Loading Profile</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-6 animate-fade-in max-w-lg mx-auto">
        <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted">Error</div>
        <h1 className="text-3xl md:text-5xl font-black text-textMain tracking-tighter uppercase">
          {detailedError ? 'Database Error' : 'User Not Found'}
        </h1>
        <p className="text-textMuted text-sm mb-4">
          {detailedError
            ? `The database returned an error: ${detailedError.message}. Make sure you have run the required SQL migration.`
            : `The profile @${username} does not exist.`}
        </p>

        {detailedError && (
          <div className="text-left w-full bg-surfaceDark border border-border/30 p-4 rounded text-xs font-mono text-textMuted/70 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(detailedError, null, 2)}
          </div>
        )}

        <Link to="/friends" className="text-[10px] font-bold tracking-widest text-textMain uppercase hover:text-accent transition-colors flex items-center gap-2 mt-4">
          <ArrowLeft size={14} /> Back to Friends
        </Link>
      </div>
    );
  }

  const currentStatus = getStatus();



  const displayName = profile.display_name || profile.full_name || 'Anonymous User';

  return (
    <div className="w-full min-h-screen pb-32 animate-fade-in relative">

      {/* 1. PROFILE HEADER */}
      <div className="w-full h-48 md:h-64 bg-surface border-b border-border/30 relative overflow-hidden flex items-center justify-center">
        {profile.cover_image_url ? (
          <img src={profile.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface to-background flex items-center justify-center">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.03) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 -mt-16 md:-mt-24 relative z-10 flex flex-col">

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8 mb-8 md:mb-12">
          {/* 2. LARGE AVATAR */}
          <div className="flex items-end gap-6 md:gap-8">
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-3xl bg-background border-4 border-background overflow-hidden flex items-center justify-center shrink-0 shadow-2xl">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-surface flex items-center justify-center text-4xl md:text-6xl font-black text-textMuted/30 uppercase tracking-tighter">
                  {displayName.substring(0, 2)}
                </div>
              )}
            </div>

            {/* 3. IDENTITY */}
            <div className="flex flex-col gap-1 md:gap-2 mb-2 md:mb-6">
              <h1 className="text-3xl md:text-5xl font-black text-textMain tracking-tighter leading-none break-words max-w-[280px] md:max-w-[400px]">
                {displayName}
              </h1>
              <h2 className="text-xs md:text-sm font-bold tracking-[0.2em] text-textMuted uppercase">
                @{profile.username}
              </h2>
            </div>
          </div>

          {/* 4. ACTIONS */}
          <div className="flex flex-wrap items-center gap-3 mb-2 md:mb-6">
            {user && (
              <>
                {currentStatus === 'you' && (
                  <Link
                    to="/profile"
                    className="py-2.5 px-6 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold tracking-[0.2em] uppercase rounded-full transition-colors flex items-center gap-2"
                  >
                    Edit Profile
                  </Link>
                )}
                {currentStatus === 'friends' && (
                  <span className="py-2.5 px-6 bg-accent/5 border border-accent/30 text-accent text-[10px] font-bold tracking-[0.2em] uppercase rounded-full flex items-center gap-2">
                    <Check size={14} /> Friends
                  </span>
                )}
                {currentStatus === 'sent' && (
                  <span className="py-2.5 px-6 border border-border/40 text-textMuted text-[10px] font-bold tracking-[0.2em] uppercase rounded-full opacity-60">
                    Request Sent
                  </span>
                )}
                {currentStatus === 'received' && (
                  <button
                    onClick={handleAccept}
                    disabled={actionLoading}
                    className="py-2.5 px-6 bg-accent text-background hover:bg-accent/90 text-[10px] font-bold tracking-[0.2em] uppercase rounded-full transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Accept Request
                  </button>
                )}
                {currentStatus === 'none' && (
                  <button
                    onClick={handleAddFriend}
                    disabled={actionLoading}
                    className="py-2.5 px-6 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold tracking-[0.2em] uppercase rounded-full transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : 'Add Friend'}
                  </button>
                )}
              </>
            )}
            {!user && (
              <Link
                to="/signup"
                className="py-2.5 px-6 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold tracking-[0.2em] uppercase rounded-full transition-colors flex items-center gap-2"
              >
                Join Eustace
              </Link>
            )}
          </div>
        </div>

        {/* 5. TABS */}
        <div className="flex items-center gap-8 border-b border-border/20 mb-10 pt-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "pb-4 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative",
              activeTab === 'overview' ? "text-textMain" : "text-textMuted hover:text-textMain/80"
            )}
          >
            Overview
            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-textMain" />}
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={cn(
              "pb-4 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative",
              activeTab === 'about' ? "text-textMain" : "text-textMuted hover:text-textMain/80"
            )}
          >
            About
            {activeTab === 'about' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-textMain" />}
          </button>
        </div>

        {/* 6. CONTENT */}
        <div className="max-w-2xl">
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-12">
              <div className="text-sm md:text-base font-medium text-textMain/80 leading-relaxed italic">
                {profile.bio ? `"${profile.bio}"` : "This user hasn't set a bio yet."}
              </div>

              <div className="flex flex-col gap-6 mt-4 mb-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-1">PRODUCTIVITY ACTIVITY</h2>
                    <p className="text-sm font-bold text-textMain tracking-tight">Your year in one view.</p>
                  </div>
                  <div className="bg-[#101010] border border-border/40 rounded-lg px-4 py-[5px] flex items-center gap-3 shadow-inner w-max">
                    <span className="text-sm font-bold text-textMain">{currentYear}</span>
                    <div className="flex flex-col">
                      <button onClick={() => setCurrentYear(y => y + 1)} className="text-textMuted hover:text-textMain leading-none text-[8px] p-0.5">▲</button>
                      <button onClick={() => setCurrentYear(y => y - 1)} className="text-textMuted hover:text-textMain leading-none text-[8px] p-0.5">▼</button>
                    </div>
                  </div>
                </div>

                {productivityData ? (
                  <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
                    <ContributionGraph
                      year={currentYear}
                      data={productivityData}
                      onDayClick={() => {}}
                    />
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-textMuted/50" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6 mt-4">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Recent Activity</span>
                <div className="p-8 border border-border/20 rounded-2xl bg-surface/30 flex items-center justify-center text-center">
                  <span className="text-xs font-medium text-textMuted/60">
                    Activity feed is empty.
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-textMuted">Bio</span>
                <span className="text-sm font-medium text-textMain/90 leading-relaxed">
                  {profile.bio || "No bio set."}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
