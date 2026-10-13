import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  formatUsernameAsDisplayName,
  resolveProfileDisplayName,
  getProfileInitials,
  type Friendship,
} from '../hooks/useFriends';
import { FriendCard } from '../components/friends/FriendCard';
import { PendingRequestsSidebar } from '../components/friends/PendingRequestsSidebar';
import { PeopleYouMayKnowSidebar } from '../components/friends/PeopleYouMayKnowSidebar';
import { RequestsView } from '../components/friends/RequestsView';

describe('Friends Hub Data Logic & Refinement Tests', () => {
  // Mock data representing database rows
  const CURRENT_USER_ID = '139a8b3f-eaa6-4ea4-bb12-eaac7128ac7e';
  const CURRENT_USERNAME = 'jackrichardd';

  const ALL_PROFILES = [
    {
      id: '139a8b3f-eaa6-4ea4-bb12-eaac7128ac7e',
      username: 'jackrichardd',
      display_name: 'Jack',
      full_name: 'Jack',
      visibility: 'public',
    },
    {
      id: '1f9ca45e-5920-415d-b475-416c4cf0852c',
      username: 'jack',
      display_name: 'Jack Richard',
      full_name: 'Jack Richard',
      visibility: 'public',
    },
    {
      id: '491d0e1e-9cd7-45c4-a17d-aadceea2ac7e',
      username: '4btc',
      display_name: 'Emory Voss II Re',
      full_name: 'Emory Voss II Re',
      visibility: 'public',
    },
    {
      id: 'user-3-id',
      username: 'yoganathan',
      display_name: 'Yoganathan',
      full_name: 'Yoganathan',
      visibility: 'public',
    },
    {
      id: 'user-4-id',
      username: 'aravind',
      display_name: 'Aravind S',
      full_name: 'Aravind S',
      visibility: 'public',
    },
    {
      id: 'user-5-id',
      username: 'dinesh',
      display_name: 'Dinesh Kumar',
      full_name: 'Dinesh Kumar',
      visibility: 'public',
    },
  ];

  // Active relationships of current user
  const FRIENDSHIPS = [
    // Emory Voss is an accepted friend
    {
      id: 'rel-1',
      requester_id: CURRENT_USER_ID,
      addressee_id: '491d0e1e-9cd7-45c4-a17d-aadceea2ac7e',
      status: 'accepted',
    },
    // Yoganathan is an incoming pending request
    {
      id: 'rel-2',
      requester_id: 'user-3-id',
      addressee_id: CURRENT_USER_ID,
      status: 'pending',
    },
  ];

  // Logic under test: filter eligible suggested users
  const filterSuggestedProfiles = (
    currentUserId: string,
    currentUsername: string,
    rawProfiles: typeof ALL_PROFILES,
    friendships: typeof FRIENDSHIPS
  ) => {
    const excludedIds = new Set<string>([currentUserId]);
    friendships.forEach((f) => {
      if (f.status === 'accepted' || f.status === 'pending') {
        excludedIds.add(f.requester_id);
        excludedIds.add(f.addressee_id);
      }
    });

    return rawProfiles.filter((p) => {
      if (!p || !p.id || !p.username) return false;
      if (p.id === currentUserId) return false;
      if (excludedIds.has(p.id)) return false;
      if (currentUsername && p.username.toLowerCase() === currentUsername.toLowerCase()) return false;
      return true;
    });
  };

  it('strictly excludes the authenticated user from suggestions', () => {
    const eligible = filterSuggestedProfiles(CURRENT_USER_ID, CURRENT_USERNAME, ALL_PROFILES, FRIENDSHIPS);
    const hasSelf = eligible.some((p) => p.id === CURRENT_USER_ID);
    expect(hasSelf).toBe(false);
  });

  it('correctly handles different users who share similar or same display names by checking authoritative IDs', () => {
    // Current user is "Jack" (id: 139a8b3f-...).
    // Another user is "Jack Richard" (id: 1f9ca45e-...).
    // The separate user with a different ID MUST be eligible if not an existing friend or request
    const eligible = filterSuggestedProfiles(CURRENT_USER_ID, CURRENT_USERNAME, ALL_PROFILES, FRIENDSHIPS);
    const separateJack = eligible.find((p) => p.id === '1f9ca45e-5920-415d-b475-416c4cf0852c');
    expect(separateJack).toBeDefined();
    expect(separateJack?.username).toBe('jack');
  });

  it('strictly excludes existing accepted friends from People You May Know', () => {
    const eligible = filterSuggestedProfiles(CURRENT_USER_ID, CURRENT_USERNAME, ALL_PROFILES, FRIENDSHIPS);
    // Emory Voss (@4btc) is an accepted friend -> MUST NOT appear
    const emory = eligible.find((p) => p.username === '4btc');
    expect(emory).toBeUndefined();
  });

  it('strictly excludes users with pending incoming or outgoing requests from People You May Know', () => {
    const eligible = filterSuggestedProfiles(CURRENT_USER_ID, CURRENT_USERNAME, ALL_PROFILES, FRIENDSHIPS);
    // Yoganathan is a pending request -> MUST NOT appear
    const yoga = eligible.find((p) => p.username === 'yoganathan');
    expect(yoga).toBeUndefined();
  });

  it('calculates mutual friends accurately and never counts pending requests', () => {
    // Suppose Aravind is friends with Emory (accepted friend of current user)
    // and also friends with Yoganathan (pending request of current user).
    // Only accepted friends of current user count as mutual friends!
    const ACCEPTED_FRIEND_IDS = new Set(['491d0e1e-9cd7-45c4-a17d-aadceea2ac7e']); // Emory only
    const THIRD_PARTY_RELS = [
      { requester_id: 'user-4-id', addressee_id: '491d0e1e-9cd7-45c4-a17d-aadceea2ac7e', status: 'accepted' }, // with Emory
      { requester_id: 'user-4-id', addressee_id: 'user-3-id', status: 'accepted' }, // with Yoganathan (not accepted by currentUser)
    ];

    const calculateCandidateMutuals = (candidateId: string) => {
      return THIRD_PARTY_RELS.filter((r) => {
        if (r.status !== 'accepted') return false;
        const otherId = r.requester_id === candidateId ? r.addressee_id : r.requester_id;
        return ACCEPTED_FRIEND_IDS.has(otherId);
      }).length;
    };

    expect(calculateCandidateMutuals('user-4-id')).toBe(1); // 1 mutual (Emory), not 2!
    expect(calculateCandidateMutuals('user-5-id')).toBe(0); // 0 mutuals
  });

  it('sorts suggestions by mutual friends descending then username ascending', () => {
    const candidates = [
      { username: 'zebra', mutualCount: 1 },
      { username: 'alpha', mutualCount: 3 },
      { username: 'beta', mutualCount: 1 },
      { username: 'gamma', mutualCount: 0 },
    ];

    candidates.sort((a, b) => {
      if (b.mutualCount !== a.mutualCount) return b.mutualCount - a.mutualCount;
      return a.username.localeCompare(b.username);
    });

    expect(candidates.map((c) => c.username)).toEqual(['alpha', 'beta', 'zebra', 'gamma']);
  });

  it('verifies that online + offline counts partition total accepted friends correctly', () => {
    const friends = [
      { id: '1', profiles: { id: 'user-a' } },
      { id: '2', profiles: { id: 'user-b' } },
      { id: '3', profiles: { id: 'user-c' } },
    ];
    const onlineIds = new Set(['user-a', 'user-c']);

    const totalCount = friends.length;
    const onlineCount = friends.filter((f) => onlineIds.has(f.profiles.id)).length;
    const offlineCount = Math.max(0, totalCount - onlineCount);

    expect(onlineCount).toBe(2);
    expect(offlineCount).toBe(1);
    expect(onlineCount + offlineCount).toBe(totalCount);
  });

  describe('Bio Authenticity & Missing Bio Handling', () => {
    const sanitizeBio = (bio?: string | null) => {
      const clean = bio?.trim();
      return {
        cleanBio: clean,
        hasBio: Boolean(clean && clean.length > 0),
      };
    };

    it('retains authentic distinct bios mapped to individual user profile records', () => {
      const friendsList = [
        { id: 'rel-1', profiles: { id: 'u1', username: '4btc', bio: '~ 𝘤𝘰𝘧𝘧𝘦𝘦 𝘯 𝘤𝘰𝘯𝘧𝘪𝘥𝘦𝘯𝘤𝘦 ' } },
        { id: 'rel-2', profiles: { id: 'u2', username: 'jackrichardd', bio: 'Not all those who wander are lost.' } },
        { id: 'rel-3', profiles: { id: 'u3', username: 'yoga', bio: 'Yoga da' } },
        { id: 'rel-4', profiles: { id: 'u4', username: 'jack', bio: 'Admin' } },
      ];

      const mappedBios = friendsList.map((f) => ({
        id: f.profiles.id,
        username: f.profiles.username,
        ...sanitizeBio(f.profiles.bio),
      }));

      expect(mappedBios[0].cleanBio).toBe('~ 𝘤𝘰𝘧𝘧𝘦𝘦 𝘯 𝘤𝘰𝘯𝘧𝘪𝘥𝘦𝘯𝘤𝘦');
      expect(mappedBios[0].hasBio).toBe(true);

      expect(mappedBios[1].cleanBio).toBe('Not all those who wander are lost.');
      expect(mappedBios[1].hasBio).toBe(true);

      expect(mappedBios[2].cleanBio).toBe('Yoga da');
      expect(mappedBios[2].hasBio).toBe(true);

      expect(mappedBios[3].cleanBio).toBe('Admin');
      expect(mappedBios[3].hasBio).toBe(true);
    });

    it('strictly does not render any universal fallback quote for null, empty, or whitespace-only bios', () => {
      const noBioCases: (string | null | undefined)[] = [null, undefined, '', '   ', '\n\t  '];

      noBioCases.forEach((caseVal) => {
        const { cleanBio, hasBio } = sanitizeBio(caseVal);
        expect(hasBio).toBe(false);
        expect(cleanBio ?? '').not.toContain('Steady focus, day by day.');
        expect(cleanBio ?? '').not.toContain('Steady focus');
      });
    });

    it('resolves profiles correctly by matching each friendship otherId to its authoritative profile data', () => {
      const otherUserIds = ['id-user-1', 'id-user-2'];
      const directProfiles = [
        { id: 'id-user-1', username: 'alpha', bio: 'Building something cool', cover_image_url: 'https://img.com/1' },
        { id: 'id-user-2', username: 'beta', bio: null, cover_image_url: null },
      ];
      const rpcProfiles = [
        { id: 'id-user-1', current_streak: 5 },
        { id: 'id-user-2', current_streak: 0 },
      ];

      const directMap = new Map(directProfiles.map((p) => [p.id, p]));
      const rpcStreakMap = new Map(rpcProfiles.map((p) => [p.id, p.current_streak]));

      const resolved = otherUserIds.map((id) => {
        const direct = directMap.get(id);
        const base = direct!;
        return {
          ...base,
          bio: typeof direct?.bio !== 'undefined' ? direct.bio : null,
          current_streak: rpcStreakMap.get(id) ?? 0,
        };
      });

      expect(resolved[0].bio).toBe('Building something cool');
      expect(resolved[0].current_streak).toBe(5);

      expect(resolved[1].bio).toBeNull();
      expect(resolved[1].current_streak).toBe(0);
    });

    it('sanitizes bio updates during profile edits to convert whitespace or cleared strings to null', () => {
      const prepareUpdates = (userId: string, inputBio: string) => ({
        id: userId,
        bio: inputBio?.trim() ? inputBio.trim() : null,
      });

      expect(prepareUpdates('usr-1', '  New custom bio  ').bio).toBe('New custom bio');
      expect(prepareUpdates('usr-1', '   ').bio).toBeNull();
      expect(prepareUpdates('usr-1', '').bio).toBeNull();
    });
  });

  describe('Friend Display Name Resolution & Username Fallback Formatting', () => {
    it('always preserves an actual display_name when one exists without overwriting it', () => {
      expect(
        resolveProfileDisplayName({
          display_name: 'Emory Voss II Re',
          full_name: 'Emory Voss',
          username: '4btc',
        })
      ).toBe('Emory Voss II Re');

      expect(
        resolveProfileDisplayName({
          display_name: 'Jack Richard',
          full_name: null,
          username: 'jack',
        })
      ).toBe('Jack Richard');
    });

    it('uses full_name when display_name is null, empty, whitespace, or generic "Friend"', () => {
      // Matches real production profile rows where display_name is null and full_name holds the user's name
      expect(
        resolveProfileDisplayName({
          display_name: null,
          full_name: 'Sathish P E ',
          username: 'Sathish_420',
        })
      ).toBe('Sathish P E');

      expect(
        resolveProfileDisplayName({
          display_name: null,
          full_name: 'Alston Reuel. A',
          username: 'Zenertron',
        })
      ).toBe('Alston Reuel. A');

      expect(
        resolveProfileDisplayName({
          display_name: '',
          full_name: 'Richard',
          username: 'richard',
        })
      ).toBe('Richard');

      expect(
        resolveProfileDisplayName({
          display_name: 'Friend',
          full_name: 'Sathish P E',
          username: 'Sathish_420',
        })
      ).toBe('Sathish P E');
    });

    it('derives a clean, readable fallback name from username when both display_name and full_name are empty or null', () => {
      expect(formatUsernameAsDisplayName('SATHISH_420')).toBe('Sathish 420');
      expect(formatUsernameAsDisplayName('sathish_420')).toBe('Sathish 420');
      expect(formatUsernameAsDisplayName('ZENERTRON')).toBe('Zenertron');
      expect(formatUsernameAsDisplayName('RICHARD')).toBe('Richard');
      expect(formatUsernameAsDisplayName('@john.doe-99')).toBe('John Doe 99');

      expect(
        resolveProfileDisplayName({
          display_name: null,
          full_name: null,
          username: 'SATHISH_420',
        })
      ).toBe('Sathish 420');

      expect(
        resolveProfileDisplayName({
          display_name: '   ',
          full_name: '',
          username: 'ZENERTRON',
        })
      ).toBe('Zenertron');

      expect(
        resolveProfileDisplayName({
          display_name: null,
          full_name: undefined,
          username: 'RICHARD',
        })
      ).toBe('Richard');
    });

    it('falls back to "Friend" only when display_name, full_name, and username are all missing or generic "user"', () => {
      expect(resolveProfileDisplayName({ display_name: null, full_name: null, username: null })).toBe('Friend');
      expect(resolveProfileDisplayName({ display_name: '', full_name: '', username: 'user' })).toBe('Friend');
      expect(resolveProfileDisplayName(null)).toBe('Friend');
    });

    it('derives avatar initials from the resolved display name instead of generic "FR"', () => {
      expect(
        getProfileInitials({
          display_name: null,
          full_name: 'Alston Reuel. A',
          username: 'Zenertron',
        })
      ).toBe('AL');

      expect(
        getProfileInitials({
          display_name: null,
          full_name: null,
          username: 'SATHISH_420',
        })
      ).toBe('SA');

      expect(
        getProfileInitials({
          display_name: null,
          full_name: 'Richard',
          username: 'richard',
        })
      ).toBe('RI');
    });

    it('renders FriendCard with actual names, readable username fallbacks, avatars, online status, and actions', () => {
      const fullNameFriendship: Friendship = {
        id: 'f-sathish',
        requester_id: CURRENT_USER_ID,
        addressee_id: 'u-sathish',
        status: 'accepted',
        created_at: '2026-10-01T00:00:00Z',
        profiles: {
          id: 'u-sathish',
          username: 'Sathish_420',
          display_name: resolveProfileDisplayName({
            display_name: null,
            full_name: 'Sathish P E ',
            username: 'Sathish_420',
          }),
          full_name: 'Sathish P E',
          avatar_url: '',
          bio: null,
          current_streak: 3,
        },
      };

      const usernameFallbackFriendship: Friendship = {
        id: 'f-zenertron',
        requester_id: CURRENT_USER_ID,
        addressee_id: 'u-zenertron',
        status: 'accepted',
        created_at: '2026-10-02T00:00:00Z',
        profiles: {
          id: 'u-zenertron',
          username: 'ZENERTRON',
          display_name: resolveProfileDisplayName({
            display_name: null,
            full_name: null,
            username: 'ZENERTRON',
          }),
          full_name: '',
          avatar_url: 'https://example.com/zenertron-avatar.webp',
          bio: 'Focused every day',
          current_streak: 7,
        },
      };

      const htmlFullNameCard = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(FriendCard, {
            friendship: fullNameFriendship,
            isOnline: true,
            viewMode: 'grid',
            onMessage: vi.fn(),
            onRemoveFriend: vi.fn(),
          })
        )
      );

      expect(htmlFullNameCard).toContain('Sathish P E');
      expect(htmlFullNameCard).toContain('@Sathish_420');
      expect(htmlFullNameCard).not.toContain('>Friend<');
      expect(htmlFullNameCard).toContain('Message');

      const htmlAvatarAndFallbackCard = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(FriendCard, {
            friendship: usernameFallbackFriendship,
            isOnline: false,
            viewMode: 'list',
            onMessage: vi.fn(),
            onRemoveFriend: vi.fn(),
          })
        )
      );

      expect(htmlAvatarAndFallbackCard).toContain('Zenertron');
      expect(htmlAvatarAndFallbackCard).toContain('@ZENERTRON');
      expect(htmlAvatarAndFallbackCard).toContain('https://example.com/zenertron-avatar.webp');
      expect(htmlAvatarAndFallbackCard).toContain('Focused every day');
      expect(htmlAvatarAndFallbackCard).not.toContain('>Friend<');
    });

    it('renders PendingRequestsSidebar, PeopleYouMayKnowSidebar, and RequestsView with resolved names and existing actions', () => {
      const pendingReq: Friendship = {
        id: 'req-richard',
        requester_id: 'u-richard',
        addressee_id: CURRENT_USER_ID,
        status: 'pending',
        created_at: '2026-10-03T00:00:00Z',
        profiles: {
          id: 'u-richard',
          username: 'richard',
          display_name: '',
          full_name: 'Richard',
          avatar_url: '',
          bio: null,
        },
      };

      const sidebarHtml = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(PendingRequestsSidebar, {
            incomingRequests: [pendingReq],
            onAccept: vi.fn(),
            onDecline: vi.fn(),
            onViewAll: vi.fn(),
          })
        )
      );
      expect(sidebarHtml).toContain('Richard');
      expect(sidebarHtml).toContain('@richard');
      expect(sidebarHtml).not.toContain('>Friend<');

      const requestsViewHtml = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(RequestsView, {
            incomingRequests: [pendingReq],
            outgoingRequests: [],
            onAccept: vi.fn(),
            onDecline: vi.fn(),
            onCancel: vi.fn(),
          })
        )
      );
      expect(requestsViewHtml).toContain('Richard');
      expect(requestsViewHtml).toContain('Accept');
      expect(requestsViewHtml).toContain('Decline');

      const suggestedHtml = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(PeopleYouMayKnowSidebar, {
            suggestedUsers: [
              {
                id: 'u-sathish',
                username: 'SATHISH_420',
                display_name: '',
                full_name: '',
                avatar_url: '',
                mutualCount: 2,
              },
            ],
            onAddFriend: vi.fn(),
            onViewAll: vi.fn(),
            requestedUserIds: new Set<string>(),
          })
        )
      );
      expect(suggestedHtml).toContain('Sathish 420');
      expect(suggestedHtml).toContain('@SATHISH_420');
      expect(suggestedHtml).toContain('Add');
    });
  });
});
