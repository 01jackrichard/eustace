import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useNotesData, type Note } from '../hooks/useNotesData';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { ArrowLeft, Pin, MoreVertical, Folder, Trash2, Tag, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ConfirmModal, MoveFolderModal, EditTagsModal } from '../components/NotesModals';

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, folders, updateNote, deleteNote, loading } = useNotesData();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showMenu, setShowMenu] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initializedRef = useRef<string | null>(null);
  const latestTitleRef = useRef('');
  const latestContentRef = useRef('');

  useEffect(() => {
    latestTitleRef.current = title;
  }, [title]);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (loading) return;
    const found = notes.find(n => n.id === id);
    if (found) {
      setNote(found);
      if (initializedRef.current !== id) {
        setTitle(found.title);
        setContent(found.content || '');
        latestTitleRef.current = found.title;
        latestContentRef.current = found.content || '';
        initializedRef.current = id ?? null;
      }
    } else {
      navigate('/notes', { replace: true });
    }
  }, [id, loading, notes, navigate]);

  // Handle auto-resize of textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = '0px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = scrollHeight + 'px';
    }
  }, [content, isEditing]);

  // Debounced Save
  const triggerSave = (newTitle: string, newContent: string) => {
    setSaveState('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!id) return;
      setSaveState('saving');
      const success = await updateNote(id, { title: newTitle.trim() || 'Untitled', content: newContent }, false);
      setSaveState(success ? 'saved' : 'unsaved');
    }, 1000);
  };

  // Flush on unmount to prevent data loss
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (id && (latestTitleRef.current || latestContentRef.current)) {
        updateNote(id, { 
          title: latestTitleRef.current.trim() || 'Untitled', 
          content: latestContentRef.current 
        }, false);
      }
    };
  }, [id, updateNote]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (id) {
          setSaveState('saving');
          updateNote(id, { title: latestTitleRef.current.trim() || 'Untitled', content: latestContentRef.current }, false).then(success => {
            setSaveState(success ? 'saved' : 'unsaved');
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [id, updateNote]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    triggerSave(newTitle, latestContentRef.current);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    triggerSave(latestTitleRef.current, newContent);
  };

  const handleTogglePin = async () => {
    if (!note) return;
    await updateNote(note.id, { is_pinned: !note.is_pinned });
  };

  const handleDelete = async () => {
    if (!note) return;
    await deleteNote(note.id);
    navigate('/notes');
  };

  const handleCheckboxToggle = (index: number, checked: boolean) => {
    if (!note) return;

    let currentIdx = 0;
    const lines = content.split('\n');
    const newLines = lines.map(line => {
      if (line.trim().startsWith('- [ ] ') || line.trim().startsWith('- [x] ') || line.trim().startsWith('- [X] ')) {
        if (currentIdx === index) {
          const match = line.match(/^(\s*- \[)[ xX](\] .*)$/);
          if (match) {
            currentIdx++;
            return `${match[1]}${checked ? 'x' : ' '}${match[2]}`;
          }
        }
        currentIdx++;
      }
      return line;
    });

    const newContent = newLines.join('\n');
    setContent(newContent);
    triggerSave(title, newContent);
  };

  if (loading || !note) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-textMuted">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  // Find backlinks (notes that link to this note's title)
  const backlinks = notes.filter(n =>
    n.id !== note.id &&
    note.title &&
    n.content?.toLowerCase().includes(`[[${note.title.toLowerCase()}]]`)
  );

  return (
    <div className="animate-fade-in max-w-3xl mx-auto w-full pb-32 pt-4 md:pt-8 px-4 md:px-0" onClick={() => setShowMenu(false)}>

      {/* Top Bar */}
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/notes')}
            className="p-2 -ml-2 text-textMuted hover:text-textMain transition-colors rounded-lg hover:bg-surface/50"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-textMuted/70">
            {saveState === 'saving' && <span className="text-accent animate-pulse">Saving...</span>}
            {saveState === 'saved' && <span>Saved</span>}
            {saveState === 'unsaved' && <span>Unsaved changes</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          <button
            onClick={handleTogglePin}
            className={cn(
              "p-2 rounded-lg transition-colors",
              note.is_pinned ? "text-accent bg-accent/10" : "text-textMuted hover:text-textMain hover:bg-surface/50"
            )}
            title={note.is_pinned ? "Unpin" : "Pin"}
          >
            <Pin size={16} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-2 text-textMuted hover:text-textMain transition-colors rounded-lg hover:bg-surface/50"
          >
            <MoreVertical size={16} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border/40 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-textMuted/50 border-b border-border/30 mb-1">
                Created {format(new Date(note.created_at), 'MMM d, yyyy')}
              </div>
              <button onClick={() => setIsMoveModalOpen(true)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-textMuted hover:text-textMain hover:bg-border/30 transition-colors">
                <Folder size={14} /> Move Folder
              </button>
              <button onClick={() => setIsTagsModalOpen(true)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-textMuted hover:text-textMain hover:bg-border/30 transition-colors">
                <Tag size={14} /> Edit Tags
              </button>
              <div className="h-px w-full bg-border/30 my-1" />
              <button onClick={() => setIsDeleteModalOpen(true)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors">
                <Trash2 size={14} /> Delete Note
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex flex-col gap-6">
        <textarea
          value={title}
          onChange={handleTitleChange}
          placeholder="Note Title"
          rows={1}
          className="w-full bg-transparent text-4xl md:text-5xl font-bold tracking-tight text-textMain placeholder-textMuted/30 outline-none resize-none leading-[1.2]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!isEditing) setIsEditing(true);
              setTimeout(() => textareaRef.current?.focus(), 50);
            }
          }}
        />

        {isEditing ? (
          <div className="relative group">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder="Write freely..."
              className="w-full min-h-[50vh] bg-transparent text-base md:text-lg leading-relaxed text-textMain placeholder-textMuted/30 outline-none resize-none overflow-hidden font-sans"
              autoFocus
              onBlur={() => setIsEditing(false)}
            />
            {/* Minimal shortcut hint */}
            <div className="absolute -bottom-8 right-0 opacity-0 group-focus-within:opacity-100 transition-opacity text-[10px] font-bold tracking-widest text-textMuted/50 uppercase">
              ESC to preview
            </div>
          </div>
        ) : (
          <div
            className="min-h-[50vh] cursor-text"
            onClick={() => setIsEditing(true)}
          >
            {!content.trim() ? (
              <span className="text-textMuted/30 text-lg">Write freely...</span>
            ) : (
              <MarkdownRenderer
                content={content}
                notesList={notes.map(n => ({ id: n.id, title: n.title }))}
                onCheckboxToggle={handleCheckboxToggle}
                className="text-lg"
              />
            )}
          </div>
        )}
      </div>

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <div className="mt-24 pt-8 border-t border-border/20 animate-in fade-in">
          <h3 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-4">Linked From</h3>
          <div className="flex flex-col gap-2">
            {backlinks.map(b => (
              <Link
                key={b.id}
                to={`/notes/${b.id}`}
                className="group flex items-center justify-between p-3 rounded-lg bg-surface/30 hover:bg-surface border border-transparent hover:border-border/40 transition-colors"
              >
                <span className="text-sm font-medium text-textMain group-hover:text-accent transition-colors truncate">
                  {b.title}
                </span>
                <span className="text-xs text-textMuted/50">
                  {format(new Date(b.updated_at), 'MMM d')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Note?"
        message="This note will be permanently deleted."
        confirmText="Delete Note"
      />

      <MoveFolderModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        onMove={async (folderId) => { await updateNote(note.id, { folder_id: folderId }); }}
        folders={folders}
        currentFolderId={note.folder_id}
      />

      <EditTagsModal
        isOpen={isTagsModalOpen}
        onClose={() => setIsTagsModalOpen(false)}
        onSave={async (tags) => { await updateNote(note.id, { tags }); }}
        initialTags={note.tags || []}
      />

    </div>
  );
}
