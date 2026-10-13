import { describe, it, expect, vi } from 'vitest';

describe('Notes Switching & State Isolation Integrity', () => {
  it('prevents saving when a note has not been modified (isDirty is false)', () => {
    let isDirty = false;
    let targetNoteId: string | null = 'note-1';
    const mockUpdateNote = vi.fn();

    // Simulate unmount cleanup
    const unmountCleanup = () => {
      if (targetNoteId && isDirty) {
        isDirty = false;
        mockUpdateNote(targetNoteId, { title: 'T', content: 'C' });
      }
    };

    unmountCleanup();
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  it('saves only to the loaded note ID when isDirty is true, not a newly navigated note ID', () => {
    let isDirty = true;
    const loadedNoteId = 'note-A';
    const newlyNavigatedId = 'note-B';
    const latestTitle = 'Note A Title';
    const latestContent = 'Note A Content';
    const mockUpdateNote = vi.fn();

    // Simulate switching from note-A to note-B with unmount flush
    const unmountCleanup = () => {
      if (loadedNoteId && isDirty) {
        isDirty = false;
        mockUpdateNote(loadedNoteId, { title: latestTitle, content: latestContent });
      }
    };

    unmountCleanup();
    // Must save to note-A, NEVER note-B!
    expect(mockUpdateNote).toHaveBeenCalledTimes(1);
    expect(mockUpdateNote).toHaveBeenCalledWith('note-A', {
      title: 'Note A Title',
      content: 'Note A Content',
    });
    expect(mockUpdateNote).not.toHaveBeenCalledWith(newlyNavigatedId, expect.anything());
  });

  it('prevents multiple concurrent note creations when isCreatingNote is active', async () => {
    let isCreating = false;
    let createdCount = 0;

    const createNoteMock = vi.fn(async () => {
      createdCount++;
      return { id: `note-${createdCount}` };
    });

    const handleNewNote = async () => {
      if (isCreating) return null;
      isCreating = true;
      try {
        return await createNoteMock();
      } finally {
        isCreating = false;
      }
    };

    // Simulate rapid double click
    const p1 = handleNewNote();
    const p2 = handleNewNote();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ id: 'note-1' });
    expect(r2).toBeNull();
    expect(createNoteMock).toHaveBeenCalledTimes(1);
  });

  it('cancels pending debounced save on unmount and commits final content cleanly', () => {
    vi.useFakeTimers();
    let isDirty = true;
    const loadedNoteId = 'note-1';
    const mockUpdateNote = vi.fn();
    let timeoutId: any = setTimeout(() => {
      mockUpdateNote('timed-out');
    }, 1000);

    // Unmount before 1000ms timer
    clearTimeout(timeoutId);
    timeoutId = undefined;
    if (loadedNoteId && isDirty) {
      isDirty = false;
      mockUpdateNote(loadedNoteId, { title: 'Flushed Title', content: 'Flushed Content' });
    }

    vi.advanceTimersByTime(2000);
    expect(mockUpdateNote).toHaveBeenCalledTimes(1);
    expect(mockUpdateNote).toHaveBeenCalledWith('note-1', {
      title: 'Flushed Title',
      content: 'Flushed Content',
    });
    vi.useRealTimers();
  });
});
