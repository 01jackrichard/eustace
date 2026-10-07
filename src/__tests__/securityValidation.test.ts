import { describe, it, expect } from 'vitest';

describe('Security Validation & State Integrity', () => {
  describe('File Upload Validator (MED-01)', () => {
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

    const validateImageFile = (file: { type: string; size: number }) => {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.';
      }
      if (file.size > MAX_FILE_SIZE) {
        return 'File size exceeds 5MB limit. Please choose a smaller image.';
      }
      return null;
    };

    it('accepts valid JPEG, PNG, WebP, and GIF images within 5MB', () => {
      expect(validateImageFile({ type: 'image/jpeg', size: 1024 * 500 })).toBeNull();
      expect(validateImageFile({ type: 'image/png', size: 1024 * 1024 * 2 })).toBeNull();
      expect(validateImageFile({ type: 'image/webp', size: 1024 * 200 })).toBeNull();
      expect(validateImageFile({ type: 'image/gif', size: 1024 * 1024 * 4.9 })).toBeNull();
    });

    it('rejects files larger than 5MB', () => {
      const error = validateImageFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 });
      expect(error).toContain('File size exceeds 5MB limit');
    });

    it('rejects dangerous MIME types such as SVG, HTML, and executables', () => {
      expect(validateImageFile({ type: 'image/svg+xml', size: 1024 })).toContain('Invalid file type');
      expect(validateImageFile({ type: 'text/html', size: 1024 })).toContain('Invalid file type');
      expect(validateImageFile({ type: 'application/x-msdownload', size: 1024 })).toContain('Invalid file type');
      expect(validateImageFile({ type: 'application/javascript', size: 1024 })).toContain('Invalid file type');
    });
  });

  describe('Search Query Constraints (MED-02)', () => {
    const sanitizeAndValidateSearchQuery = (query: string): { isValid: boolean; cleaned: string } => {
      const cleaned = query.trim().toLowerCase().replace(/^@+/, '');
      return {
        isValid: cleaned.length >= 2,
        cleaned
      };
    };

    it('rejects single character or empty queries', () => {
      expect(sanitizeAndValidateSearchQuery('').isValid).toBe(false);
      expect(sanitizeAndValidateSearchQuery('   ').isValid).toBe(false);
      expect(sanitizeAndValidateSearchQuery('a').isValid).toBe(false);
      expect(sanitizeAndValidateSearchQuery('@').isValid).toBe(false);
    });

    it('accepts and cleans valid queries of 2 or more characters', () => {
      const res = sanitizeAndValidateSearchQuery(' @Alice ');
      expect(res.isValid).toBe(true);
      expect(res.cleaned).toBe('alice');
    });
  });

  describe('Friendship State Transition Machine (CRIT-01, HIGH-03)', () => {
    type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

    const validateTransition = (
      op: 'INSERT' | 'UPDATE',
      currentStatus: FriendshipStatus | null,
      targetStatus: FriendshipStatus,
      isRequester: boolean
    ): { allowed: boolean; reason?: string } => {
      if (op === 'INSERT') {
        if (targetStatus !== 'pending') {
          return { allowed: false, reason: 'Friendship requests must be initiated in pending status.' };
        }
        return { allowed: true };
      }

      if (currentStatus === 'pending') {
        if (isRequester) {
          return targetStatus === 'cancelled'
            ? { allowed: true }
            : { allowed: false, reason: 'Requester can only cancel pending request.' };
        } else {
          return ['accepted', 'declined'].includes(targetStatus)
            ? { allowed: true }
            : { allowed: false, reason: 'Addressee can only accept or decline.' };
        }
      }

      if (['declined', 'cancelled'].includes(currentStatus || '')) {
        if (isRequester && targetStatus === 'pending') {
          return { allowed: true };
        }
        return { allowed: false, reason: `Cannot change status after it has been ${currentStatus}.` };
      }

      return { allowed: false, reason: 'Invalid transition.' };
    };

    it('blocks direct insertion of status=accepted on creation (CRIT-01)', () => {
      const result = validateTransition('INSERT', null, 'accepted', true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('must be initiated in pending status');
    });

    it('allows insertion with status=pending', () => {
      const result = validateTransition('INSERT', null, 'pending', true);
      expect(result.allowed).toBe(true);
    });

    it('allows addressee to accept or decline pending request', () => {
      expect(validateTransition('UPDATE', 'pending', 'accepted', false).allowed).toBe(true);
      expect(validateTransition('UPDATE', 'pending', 'declined', false).allowed).toBe(true);
    });

    it('blocks requester from accepting their own request', () => {
      const result = validateTransition('UPDATE', 'pending', 'accepted', true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Requester can only cancel');
    });

    it('allows requester to re-request after being declined or cancelled (HIGH-03)', () => {
      expect(validateTransition('UPDATE', 'declined', 'pending', true).allowed).toBe(true);
      expect(validateTransition('UPDATE', 'cancelled', 'pending', true).allowed).toBe(true);
    });

    it('blocks illegal status mutations from accepted state', () => {
      expect(validateTransition('UPDATE', 'accepted', 'pending', true).allowed).toBe(false);
      expect(validateTransition('UPDATE', 'accepted', 'declined', false).allowed).toBe(false);
    });
  });

  describe('Profile Visibility Evaluation (HIGH-01)', () => {
    const isProfileVisible = (
      profileVisibility: 'public' | 'friends' | 'private',
      isOwner: boolean,
      isFriend: boolean
    ): boolean => {
      if (isOwner) return true;
      if (profileVisibility === 'public') return true;
      if (profileVisibility === 'friends' && isFriend) return true;
      return false;
    };

    it('allows owner to see their own profile regardless of visibility', () => {
      expect(isProfileVisible('private', true, false)).toBe(true);
      expect(isProfileVisible('friends', true, false)).toBe(true);
      expect(isProfileVisible('public', true, false)).toBe(true);
    });

    it('allows public profiles to be seen by anyone', () => {
      expect(isProfileVisible('public', false, false)).toBe(true);
    });

    it('allows friends-only profiles to be seen only by accepted friends', () => {
      expect(isProfileVisible('friends', false, true)).toBe(true);
      expect(isProfileVisible('friends', false, false)).toBe(false);
    });

    it('blocks private profiles from strangers and non-owners', () => {
      expect(isProfileVisible('private', false, false)).toBe(false);
      expect(isProfileVisible('private', false, true)).toBe(false);
    });
  });
});
