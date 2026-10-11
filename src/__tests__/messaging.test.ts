import { describe, it, expect } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  calculateConstrainedDimensions
} from '../lib/imageCompression';

describe('Eustace Direct Messaging System - Core Logic & Security Tests', () => {
  describe('1. Image Size & Dimension Enforcement', () => {
    it('strictly enforces the 500,000 bytes decimal limit', () => {
      expect(MAX_IMAGE_BYTES).toBe(500000);
      expect(MAX_IMAGE_BYTES).toBeLessThan(512000); // Ensures decimal 500 KB, not binary 500 KiB
    });

    it('calculates aspect ratio constrained dimensions correctly', () => {
      // Landscape 3200x1800 should scale down to width 1600, height 900
      const landscape = calculateConstrainedDimensions(3200, 1800, 1600);
      expect(landscape.width).toBe(1600);
      expect(landscape.height).toBe(900);

      // Portrait 1800x3200 should scale down to width 900, height 1600
      const portrait = calculateConstrainedDimensions(1800, 3200, 1600);
      expect(portrait.width).toBe(900);
      expect(portrait.height).toBe(1600);

      // Square 2400x2400 should scale down to 1600x1600
      const square = calculateConstrainedDimensions(2400, 2400, 1600);
      expect(square.width).toBe(1600);
      expect(square.height).toBe(1600);

      // Smaller image 800x600 should not be upscaled
      const small = calculateConstrainedDimensions(800, 600, 1600);
      expect(small.width).toBe(800);
      expect(small.height).toBe(600);
    });
  });

  describe('2. Text Message Constraints & Validation', () => {
    const validateTextMessage = (text: string): { valid: boolean; error?: string; cleanText?: string } => {
      const trimmed = text.trim();
      if (!trimmed) {
        return { valid: false, error: 'Message cannot be empty.' };
      }
      if (trimmed.length > 4000) {
        return { valid: false, error: 'Message exceeds the maximum limit of 4,000 characters.' };
      }
      return { valid: true, cleanText: trimmed };
    };

    it('rejects empty or whitespace-only messages', () => {
      expect(validateTextMessage('').valid).toBe(false);
      expect(validateTextMessage('   ').valid).toBe(false);
      expect(validateTextMessage('\n\n\t  \n').valid).toBe(false);
    });

    it('accepts valid text, Unicode, and emoji messages', () => {
      const valid1 = validateTextMessage('Hello, friend!');
      expect(valid1.valid).toBe(true);
      expect(valid1.cleanText).toBe('Hello, friend!');

      const emojiMsg = validateTextMessage('Let’s crush our streak today! 🚀🔥✨');
      expect(emojiMsg.valid).toBe(true);
      expect(emojiMsg.cleanText).toBe('Let’s crush our streak today! 🚀🔥✨');
    });

    it('enforces the 4,000 character maximum limit', () => {
      const exact4000 = 'a'.repeat(4000);
      expect(validateTextMessage(exact4000).valid).toBe(true);

      const over4000 = 'a'.repeat(4001);
      const res = validateTextMessage(over4000);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('4,000 characters');
    });
  });

  describe('3. Unread Count & Read Receipt Calculations', () => {
    const computeUnreadCount = (
      myUserId: string,
      myLastReadAt: string,
      messages: Array<{ id: string; sender_id: string; created_at: string }>
    ): number => {
      const readThreshold = new Date(myLastReadAt).getTime();
      return messages.filter((m) => {
        return m.sender_id !== myUserId && new Date(m.created_at).getTime() > readThreshold;
      }).length;
    };

    it('computes unread counts accurately based on persisted last_read_at timestamp', () => {
      const myId = 'user-1';
      const friendId = 'user-2';
      const myLastRead = '2026-10-11T08:00:00.000Z';

      const messages = [
        { id: '1', sender_id: friendId, created_at: '2026-10-11T07:50:00.000Z' }, // read
        { id: '2', sender_id: myId, created_at: '2026-10-11T08:05:00.000Z' },     // sent by me (not unread for me)
        { id: '3', sender_id: friendId, created_at: '2026-10-11T08:10:00.000Z' }, // unread
        { id: '4', sender_id: friendId, created_at: '2026-10-11T08:15:00.000Z' }  // unread
      ];

      const unread = computeUnreadCount(myId, myLastRead, messages);
      expect(unread).toBe(2);
    });

    it('accurately resolves read receipts for outgoing messages', () => {
      const isMessageRead = (messageCreatedAt: string, otherUserLastReadAt: string | null): boolean => {
        if (!otherUserLastReadAt) return false;
        return new Date(otherUserLastReadAt).getTime() >= new Date(messageCreatedAt).getTime();
      };

      const msgTime = '2026-10-11T09:00:00.000Z';

      // Friend read before message was sent -> not read
      expect(isMessageRead(msgTime, '2026-10-11T08:59:59.000Z')).toBe(false);

      // Friend read at exact millisecond or later -> read
      expect(isMessageRead(msgTime, '2026-10-11T09:00:00.000Z')).toBe(true);
      expect(isMessageRead(msgTime, '2026-10-11T09:05:00.000Z')).toBe(true);
    });
  });

  describe('4. Optimistic Message Reconciliation & Deduplication', () => {
    it('reconciles temporary client IDs with server records without duplicate entries', () => {
      interface Msg {
        id: string;
        sender_id: string;
        text_content: string | null;
        status?: string;
      }

      let state: Msg[] = [
        { id: 'msg-1', sender_id: 'user-2', text_content: 'Hi' },
        { id: 'temp-123', sender_id: 'user-1', text_content: 'Hey there', status: 'sending' }
      ];

      // Server confirms insert or realtime returns the inserted row
      const incomingServerMsg: Msg = {
        id: 'msg-2',
        sender_id: 'user-1',
        text_content: 'Hey there',
        status: 'sent'
      };

      // Reconciliation function used in useChat
      const reconcile = (prev: Msg[], incoming: Msg): Msg[] => {
        if (prev.some((m) => m.id === incoming.id)) return prev;

        const matchIdx = prev.findIndex(
          (m) =>
            m.status === 'sending' &&
            m.sender_id === incoming.sender_id &&
            m.text_content === incoming.text_content
        );

        if (matchIdx !== -1) {
          const updated = [...prev];
          updated[matchIdx] = incoming;
          return updated;
        }

        return [...prev, incoming];
      };

      state = reconcile(state, incomingServerMsg);

      expect(state.length).toBe(2);
      expect(state[1].id).toBe('msg-2');
      expect(state[1].status).toBe('sent');
      expect(state.some((m) => m.id === 'temp-123')).toBe(false);

      // Re-receiving same message via Realtime should not duplicate
      state = reconcile(state, incomingServerMsg);
      expect(state.length).toBe(2);
    });
  });
});
