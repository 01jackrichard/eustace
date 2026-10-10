import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useNotesData, type Note } from '../hooks/useNotesData';
import { supabase } from '../lib/supabase';
import { RichTextEditor } from '../components/RichTextEditor';
import TextareaAutosize from 'react-textarea-autosize';
import { ArrowLeft, Pin, MoreVertical, Folder, Trash2, Tag, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ConfirmModal, MoveFolderModal, EditTagsModal } from '../components/NotesModals';
import toast from 'react-hot-toast';

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, folders, updateNote, deleteNote } = useNotesData();

  const [note, setNote] = useState<Note | null>(null);
  const [noteLoading, setNoteLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

      const [showMenu, setShowMenu] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveGenerationRef = useRef(0);
  const latestTitleRef = useRef('');
  const latestContentRef = useRef('');

  useEffect(() => {
    latestTitleRef.current = title;
  }, [title]);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!id) return;
    let active = true;

    async function fetchSingleNote() {
      setNoteLoading(true);
      const { data: singleNote, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .single();

      if (!active) return;
      if (error || !singleNote) {
        toast.error('Note not found or deleted');
        navigate('/notes', { replace: true });
        return;
      }

      setNote(singleNote as Note);
      setTitle(singleNote.title);
      setContent(singleNote.content || '');
      latestTitleRef.current = singleNote.title;
      latestContentRef.current = singleNote.content || '';
      setNoteLoading(false);
    }

    fetchSingleNote();
    return () => { active = false; };
  }, [id, navigate]);
  // Debounced Save
  const triggerSave = (newTitle: string, newContent: string) => {
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const currentGen = ++saveGenerationRef.current;

    saveTimeoutRef.current = setTimeout(async () => {
      if (!id || currentGen !== saveGenerationRef.current) return;
      
      await updateNote(id, { title: newTitle.trim() || 'Untitled', content: newContent }, false);
      if (currentGen === saveGenerationRef.current) {
        
      }
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
        const currentGen = ++saveGenerationRef.current;
        if (id) {
          
          updateNote(id, { title: latestTitleRef.current.trim() || 'Untitled', content: latestContentRef.current }, false).then(() => {
            if (currentGen === saveGenerationRef.current) {
              
            }
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [id, updateNote]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    triggerSave(newTitle, latestContentRef.current);
  };

  
  const handleTogglePin = async () => {
    if (!note) return;
    const newPinned = !note.is_pinned;
    setNote({ ...note, is_pinned: newPinned });
    await updateNote(note.id, { is_pinned: newPinned });
  };

  const handleDelete = async () => {
    if (!note) return;
    await deleteNote(note.id);
    navigate('/notes');
  };

  
  if (noteLoading || !note) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-textMuted flex-1 h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
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
    <div className="animate-fade-in w-full h-full flex flex-col px-4 md:px-8 lg:px-12 py-4 md:py-8 lg:py-10" onClick={() => setShowMenu(false)}>

      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8 lg:mb-12 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/notes')}
            className="p-2 -ml-2 text-textMuted hover:text-textMain transition-colors rounded-lg hover:bg-[#111111] lg:hidden"
          >
            <ArrowLeft size={18} />
          </button>
          
        </div>

        <div className="flex items-center gap-2 relative">
          <button
            onClick={handleTogglePin}
            className={cn(
              "p-2 rounded-lg transition-colors",
              note.is_pinned ? "text-orange-500 bg-orange-500/10" : "text-textMuted hover:text-textMain hover:bg-[#111111]"
            )}
            title={note.is_pinned ? "Unpin" : "Pin"}
          >
            <Pin size={16} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-2 text-textMuted hover:text-textMain transition-colors rounded-lg hover:bg-[#111111]"
          >
            <MoreVertical size={16} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[#111111] border border-border/40 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-textMuted/50 border-b border-border/30 mb-1">
                Created {format(new Date(note.created_at), 'MMM d, yyyy')}
              </div>
              <button onClick={() => setIsMoveModalOpen(true)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-textMuted hover:text-textMain hover:bg-white/5 transition-colors">
                <Folder size={14} /> Move Folder
              </button>
              <button onClick={() => setIsTagsModalOpen(true)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-textMuted hover:text-textMain hover:bg-white/5 transition-colors">
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
      <div className="flex flex-col gap-6 flex-1 pb-32 w-full">
        <TextareaAutosize
          value={title}
          onChange={handleTitleChange}
          placeholder="Note Title"
          className="w-full bg-transparent text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-textMain placeholder-textMuted/30 outline-none resize-none leading-tight border-none p-0 focus:ring-0"
        />
        
        {/* Tags UI */}
        {note?.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {note.tags.map(tag => (
              <span key={tag} className="flex items-center gap-1 bg-orange-500/10 text-orange-500 px-2.5 py-1 rounded-md text-xs font-semibold">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <RichTextEditor 
          content={content} 
          onChange={(newContent) => {
            setContent(newContent);
            triggerSave(title, newContent);
          }} 
        />
        
        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="mt-16 pt-8 border-t border-border/20 animate-in fade-in">
            <h3 className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-4">Linked From</h3>
            <div className="flex flex-col gap-2">
              {backlinks.map(b => (
                <Link
                  key={b.id}
                  to={`/notes/${b.id}`}
                  className="group flex items-center justify-between p-3 rounded-xl bg-[#111111]/50 hover:bg-[#111111] border border-transparent hover:border-border/40 transition-colors"
                >
                  <span className="text-sm font-medium text-textMain group-hover:text-orange-500 transition-colors truncate">
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
      </div>

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
        onMove={async (folderId) => { 
          if (!note) return;
          setNote({ ...note, folder_id: folderId });
          await updateNote(note.id, { folder_id: folderId }); 
        }}
        folders={folders}
        currentFolderId={note.folder_id}
      />

      <EditTagsModal
        isOpen={isTagsModalOpen}
        onClose={() => setIsTagsModalOpen(false)}
        onSave={async (tags) => { 
          if (!note) return;
          setNote({ ...note, tags });
          await updateNote(note.id, { tags }); 
        }}
        initialTags={note.tags || []}
      />

    </div>
  );
}
