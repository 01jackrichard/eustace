import { useState, useRef, useEffect } from 'react';
import { useNotesData } from '../hooks/useNotesData';
import { formatDistanceToNow } from 'date-fns';
import { Search, Plus, Folder, Pin, FileText, Trash2, Edit2, Archive, Loader2 } from 'lucide-react';
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

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<NoteFolder | null>(null);

  const handleNewNoteRef = useRef<() => void>(() => {});
  handleNewNoteRef.current = () => {
    const folderId = selectedFolderId !== 'all' && selectedFolderId !== 'pinned' && selectedFolderId !== 'unfiled' ? selectedFolderId : null;
    createNote(folderId).then(note => {
      if (note) navigate(`/notes/${note.id}`);
    });
  };

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

  const filteredNotes = notes.filter(n => {
    // Folders / Pinned / Unfiled
    if (selectedFolderId === 'pinned' && !n.is_pinned) return false;
    if (selectedFolderId === 'unfiled' && n.folder_id !== null) return false;
    if (selectedFolderId !== 'all' && selectedFolderId !== 'pinned' && selectedFolderId !== 'unfiled' && n.folder_id !== selectedFolderId) return false;

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const title = (n.title || '').toLowerCase();
      const content = (n.content || '').toLowerCase();
      const tags = n.tags || [];
      
      if (!title.includes(q) && !content.includes(q) && !tags.some(t => t.toLowerCase().includes(q))) {
        return false;
      }
    }

    return true;
  });

  const handleNewNote = async () => {
    const note = await createNote(selectedFolderId !== 'all' && selectedFolderId !== 'pinned' && selectedFolderId !== 'unfiled' ? selectedFolderId : null);
    if (note) {
      navigate(`/notes/${note.id}`);
    }
  };

  const handleNewFolder = () => {
    setEditingFolder(null);
    setIsFolderModalOpen(true);
  };

  const submitFolder = async (name: string) => {
    if (editingFolder) {
      await updateFolder(editingFolder.id, name);
    } else {
      await createFolder(name);
    }
  };

  const confirmDeleteFolder = async () => {
    if (deletingFolder) {
      await deleteFolder(deletingFolder.id);
      if (selectedFolderId === deletingFolder.id) setSelectedFolderId('all');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-textMuted gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row w-full h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-5rem)] overflow-hidden bg-[#050505] text-textMain">
      
      {/* Column 1: Folders / Filters Sidebar */}
      <div className={cn(
        "w-full lg:w-64 shrink-0 flex-col border-r border-border/40 bg-[#0A0A0A] overflow-y-auto hidden-scrollbar",
        id ? "hidden lg:flex" : "flex flex-col h-1/2 lg:h-full border-b lg:border-b-0"
      )}>
        <div className="p-4 flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-widest text-textMuted uppercase">Notes Workspace</h2>
          </div>

          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setSelectedFolderId('all')}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 text-left",
                selectedFolderId === 'all' ? "bg-[#111111] text-textMain border border-border/40 shadow-sm" : "text-textMuted hover:text-textMain hover:bg-[#111111]/50 border border-transparent"
              )}
            >
              <FileText size={16} className={selectedFolderId === 'all' ? "text-orange-500" : ""} /> All Notes
            </button>

            <button
              onClick={() => setSelectedFolderId('pinned')}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 text-left",
                selectedFolderId === 'pinned' ? "bg-[#111111] text-textMain border border-border/40 shadow-sm" : "text-textMuted hover:text-textMain hover:bg-[#111111]/50 border border-transparent"
              )}
            >
              <Pin size={16} className={selectedFolderId === 'pinned' ? "text-orange-500" : ""} /> Pinned
            </button>

            <button
              onClick={() => setSelectedFolderId('unfiled')}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 text-left",
                selectedFolderId === 'unfiled' ? "bg-[#111111] text-textMain border border-border/40 shadow-sm" : "text-textMuted hover:text-textMain hover:bg-[#111111]/50 border border-transparent"
              )}
            >
              <Archive size={16} className={selectedFolderId === 'unfiled' ? "text-orange-500" : ""} /> Unfiled
            </button>
          </nav>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-bold tracking-widest text-textMuted uppercase">Folders</h3>
              <button onClick={handleNewFolder} className="text-textMuted hover:text-orange-500 transition-colors">
                <Plus size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {folders.length === 0 ? (
                <span className="text-xs text-textMuted/50 px-1 py-1">No folders yet.</span>
              ) : (
                folders.map(f => (
                  <div key={f.id} className="group flex items-center relative">
                    <button
                      onClick={() => setSelectedFolderId(f.id)}
                      className={cn(
                        "flex-1 flex items-center gap-3 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 text-left truncate pr-16",
                        selectedFolderId === f.id ? "bg-[#111111] text-textMain border border-border/40 shadow-sm" : "text-textMuted hover:text-textMain hover:bg-[#111111]/50 border border-transparent"
                      )}
                    >
                      <Folder size={14} className={cn("shrink-0 opacity-70", selectedFolderId === f.id ? "text-orange-500 opacity-100" : "")} />
                      <span className="truncate">{f.name}</span>
                    </button>
                    {selectedFolderId === f.id && (
                      <div className="absolute right-1 flex items-center bg-[#111111] shadow-sm border border-border/50 rounded p-0.5">
                        <button
                          onClick={() => { setEditingFolder(f); setIsFolderModalOpen(true); }}
                          className="p-1 text-textMuted hover:text-textMain hover:bg-white/5 rounded"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => setDeletingFolder(f)}
                          className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Column 2: Notes List */}
      <div className={cn(
        "w-full lg:w-80 shrink-0 flex-col border-r border-border/40 bg-[#050505] overflow-y-auto hidden-scrollbar relative",
        id ? "hidden lg:flex" : "flex flex-col h-1/2 lg:h-full"
      )}>
        <div className="p-4 border-b border-border/40 bg-[#050505]/95 backdrop-blur z-10 sticky top-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase">List</h2>
            <button
              onClick={handleNewNote}
              className="p-1.5 bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white rounded-lg transition-colors"
              title="New Note"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search... (Ctrl+K)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#111111] border border-border/40 focus:border-orange-500/50 rounded-xl pl-9 pr-3 py-2 text-sm text-textMain placeholder-textMuted/50 outline-none transition-all"
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
                    {id === note.id && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-orange-500 rounded-r-full" />}
                    
                    <div className="flex items-start justify-between gap-2 mb-1 pl-1">
                      <h3 className={cn("text-sm font-semibold truncate", id === note.id ? "text-textMain" : "text-textMain/90")}>
                        {note.title || 'Untitled'}
                      </h3>
                      {note.is_pinned && <Pin size={12} className="text-orange-500 shrink-0 mt-0.5" />}
                    </div>
                    
                    {note.content && (
                      <p className="text-xs text-textMuted line-clamp-2 mb-3 pl-1 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                        {note.content.replace(/#|\*|\[|\]|`|-|>|_/g, '').trim()}
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

      {/* Column 3: Note Editor Outlet */}
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
              <Plus size={16} className="text-orange-500" /> New Note
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
