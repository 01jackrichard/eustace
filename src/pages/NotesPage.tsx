import { SmoothInput } from '../components/ui/SmoothInput';
import { useState, useRef, useEffect } from 'react';
import { useNotesData } from '../hooks/useNotesData';
import { formatDistanceToNow } from 'date-fns';
import { Search, Plus, Folder, Pin, FileText, Trash2, Edit2, Archive, Loader2, ChevronDown } from 'lucide-react';
import { Link, useNavigate, Outlet, useParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { FolderModal, ConfirmModal } from '../components/NotesModals';
import { useDebounce } from '../hooks/useDebounce';
import type { NoteFolder } from '../hooks/useNotesData';

export function NotesPage() {
  const { notes, folders, loading, createNote, createFolder, updateFolder, deleteFolder } = useNotesData();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | 'all' | 'pinned' | 'unfiled'>('all');
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const viewDropdownRef = useRef<HTMLDivElement>(null);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<NoteFolder | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(event.target as Node)) {
        setIsViewDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNewNoteRef = useRef<() => void>(() => {});
  useEffect(() => { handleNewNoteRef.current = () => { createNote(selectedFolderId !== 'all' && selectedFolderId !== 'pinned' && selectedFolderId !== 'unfiled' ? selectedFolderId : null).then(newNote => { if (newNote) navigate(`/notes/${newNote.id}`); }); }; });

  const handleNewNote = () => handleNewNoteRef.current();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewNoteRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const debouncedSearch = useDebounce(search, 300);

  const filteredNotes = notes.filter(note => {
    const searchLower = debouncedSearch.toLowerCase();
    const matchesSearch = note.title?.toLowerCase().includes(searchLower) || 
                          note.content?.toLowerCase().includes(searchLower) ||
                          note.tags?.some(tag => tag.toLowerCase().includes(searchLower));
    if (!matchesSearch) return false;

    if (selectedFolderId === 'pinned') return note.is_pinned;
    if (selectedFolderId === 'unfiled') return !note.folder_id;
    if (selectedFolderId !== 'all') return note.folder_id === selectedFolderId;
    return true;
  });

  const submitFolder = async (name: string) => {
    if (editingFolder) {
      await updateFolder(editingFolder.id, name);
      setEditingFolder(null);
    } else {
      await createFolder(name);
    }
    setIsFolderModalOpen(false);
  };

  const confirmDeleteFolder = async () => {
    if (deletingFolder) {
      await deleteFolder(deletingFolder.id);
      if (selectedFolderId === deletingFolder.id) setSelectedFolderId('all');
      setDeletingFolder(null);
    }
  };

  if (loading && notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#050505]">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const getDropdownLabel = () => {
    if (selectedFolderId === 'all') return 'All Notes';
    if (selectedFolderId === 'pinned') return 'Pinned';
    if (selectedFolderId === 'unfiled') return 'Unfiled';
    const folder = folders.find(f => f.id === selectedFolderId);
    return folder ? folder.name : 'All Notes';
  };

  const getDropdownIcon = () => {
    if (selectedFolderId === 'all') return <FileText size={16} />;
    if (selectedFolderId === 'pinned') return <Pin size={16} />;
    if (selectedFolderId === 'unfiled') return <Archive size={16} />;
    return <Folder size={16} />;
  };

  return (
    <div className="flex flex-1 h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] overflow-hidden bg-[#050505] rounded-3xl border border-border/40 shadow-2xl">
      {/* Unified Column: View Switcher & Notes List */}
      <div className={cn(
        "w-full lg:w-80 shrink-0 flex-col border-r border-border/40 bg-[#050505] overflow-y-auto hidden-scrollbar relative",
        id ? "hidden lg:flex" : "flex flex-col h-1/2 lg:h-full"
      )}>
        <div className="p-4 border-b border-border/40 bg-[#050505]/95 backdrop-blur z-10 sticky top-0 flex flex-col gap-3">
          
          {/* Header View Switcher */}
          <div className="flex items-center justify-between">
            <div className="relative" ref={viewDropdownRef}>
              <button
                onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#111111] hover:bg-[#1a1a1a] border border-border/40 rounded-xl transition-all"
              >
                <span className="text-accent">{getDropdownIcon()}</span>
                <span className="text-sm font-bold tracking-wide text-textMain">{getDropdownLabel()}</span>
                <ChevronDown size={14} className="text-textMuted ml-1" />
              </button>

              {isViewDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-[#111111] border border-border/40 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col">
                  <div className="p-2 flex flex-col gap-1">
                    <button onClick={() => { setSelectedFolderId('all'); setIsViewDropdownOpen(false); }} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors", selectedFolderId === 'all' ? "bg-white/5 text-textMain" : "text-textMuted hover:text-textMain hover:bg-white/5")}>
                      <FileText size={14} /> All Notes
                    </button>
                    <button onClick={() => { setSelectedFolderId('pinned'); setIsViewDropdownOpen(false); }} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors", selectedFolderId === 'pinned' ? "bg-white/5 text-textMain" : "text-textMuted hover:text-textMain hover:bg-white/5")}>
                      <Pin size={14} /> Pinned
                    </button>
                    <button onClick={() => { setSelectedFolderId('unfiled'); setIsViewDropdownOpen(false); }} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors", selectedFolderId === 'unfiled' ? "bg-white/5 text-textMain" : "text-textMuted hover:text-textMain hover:bg-white/5")}>
                      <Archive size={14} /> Unfiled
                    </button>
                  </div>
                  
                  <div className="border-t border-border/30 p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between px-3 py-1 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-textMuted">Folders</span>
                      <button onClick={() => { setEditingFolder(null); setIsFolderModalOpen(true); setIsViewDropdownOpen(false); }} className="text-textMuted hover:text-accent transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                    {folders.map(f => (
                      <div key={f.id} className="group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5">
                        <button 
                          onClick={() => { setSelectedFolderId(f.id); setIsViewDropdownOpen(false); }}
                          className={cn("flex items-center gap-3 flex-1 text-left truncate", selectedFolderId === f.id ? "text-textMain" : "text-textMuted hover:text-textMain")}
                        >
                          <Folder size={14} className={selectedFolderId === f.id ? "text-accent" : ""} />
                          <span className="truncate">{f.name}</span>
                        </button>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                           <button onClick={(e) => { e.stopPropagation(); setEditingFolder(f); setIsFolderModalOpen(true); setIsViewDropdownOpen(false); }} className="p-1 text-textMuted hover:text-textMain hover:bg-white/10 rounded"><Edit2 size={12}/></button>
                           <button onClick={(e) => { e.stopPropagation(); setDeletingFolder(f); setIsViewDropdownOpen(false); }} className="p-1 text-red-500 hover:bg-red-500/10 rounded"><Trash2 size={12}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleNewNote}
              className="p-1.5 bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg transition-colors"
              title="New Note"
            >
              <Plus size={16} />
            </button>
          </div>
          
          <div className="relative mt-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <SmoothInput
              ref={searchInputRef}
              type="text"
              placeholder="Search... (Ctrl+K)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#111111] border border-border/40 focus:border-accent/50 rounded-xl pl-9 pr-3 py-2 text-sm text-textMain placeholder-textMuted/50 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8 text-textMuted">
              <p className="text-sm mb-4">No notes found.</p>
              <button onClick={handleNewNote} className="px-4 py-1.5 border border-border/40 rounded-lg text-xs font-bold text-textMain hover:border-textMuted transition-all">
                Create Note
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredNotes.map(note => {
                const folder = folders.find(f => f.id === note.folder_id);
                return (
                  <Link
                    key={note.id}
                    to={`/notes/${note.id}`}
                    className={cn(
                      "group flex flex-col p-4 border-b border-border/10 hover:bg-[#111111]/60 transition-colors relative",
                      id === note.id ? "bg-[#111111]" : ""
                    )}
                  >
                    {id === note.id && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-r-full" />}
                    
                    <div className="flex items-start justify-between gap-2 mb-1 pl-1">
                      <h3 className={cn("text-sm font-semibold truncate", id === note.id ? "text-textMain" : "text-textMain/90")}>
                        {note.title || 'Untitled'}
                      </h3>
                      {note.is_pinned && <Pin size={12} className="text-accent shrink-0 mt-0.5" />}
                    </div>
                    
                    {note.content && (
                      <p className="text-xs text-textMuted line-clamp-2 mb-3 pl-1 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                        {note.content.replace(/<[^>]*>?/gm, '').trim()}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-textMuted/50 pl-1 mt-auto font-medium">
                      <span>{formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}</span>
                      {folder && <span className="flex items-center gap-1"><Folder size={10} /> {folder.name}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Editor Outlet */}
      <div className={cn(
        "flex-1 flex-col bg-[#050505] overflow-y-auto relative hidden-scrollbar",
        !id ? "hidden lg:flex" : "flex"
      )}>
        {id ? (
          <Outlet />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
            <div className="w-16 h-16 mb-4 rounded-2xl bg-[#111111] flex items-center justify-center text-textMuted border border-border/20 shadow-sm">
              <FileText size={32} className="opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-textMain mb-2 tracking-tight">No Note Selected</h3>
            <p className="text-sm text-textMuted max-w-sm mb-6 leading-relaxed">
              Select a note from the list or create a new one to start writing.
            </p>
            <button
              onClick={handleNewNote}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#111111] hover:bg-[#1a1a1a] border border-border/40 text-textMain rounded-xl text-sm font-bold tracking-wide transition-all shadow-sm"
            >
              <Plus size={16} className="text-accent" /> New Note
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onSubmit={submitFolder}
        initialName={editingFolder?.name || ''}
        title={editingFolder ? 'Rename Folder' : 'New Folder'}
        submitText={editingFolder ? 'Save' : 'Create Folder'}
      />

      <ConfirmModal
        isOpen={!!deletingFolder}
        onClose={() => setDeletingFolder(null)}
        onConfirm={confirmDeleteFolder}
        title="Delete Folder?"
        message="The folder will be removed.\nNotes inside it will remain in All Notes."
        confirmText="Delete Folder"
      />
    </div>
  );
}
