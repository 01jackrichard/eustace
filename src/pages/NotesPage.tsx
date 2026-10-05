import { useState, useRef, useEffect } from 'react';
import { useNotesData } from '../hooks/useNotesData';
import { formatDistanceToNow } from 'date-fns';
import { Search, Plus, Folder, Pin, FileText, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Loader2, Edit2 } from 'lucide-react';
import { FolderModal, ConfirmModal } from '../components/NotesModals';
import type { NoteFolder } from '../hooks/useNotesData';

export function NotesPage() {
  const { notes, folders, loading, createNote, createFolder, updateFolder, deleteFolder } = useNotesData();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | 'all' | 'pinned'>('all');

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<NoteFolder | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewNote();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const filteredNotes = notes.filter(n => {
    // Folders / Pinned
    if (selectedFolderId === 'pinned' && !n.is_pinned) return false;
    if (selectedFolderId !== 'all' && selectedFolderId !== 'pinned' && n.folder_id !== selectedFolderId) return false;

    // Search
    if (search) {
      const q = search.toLowerCase();
      if (!n.title.toLowerCase().includes(q) && !n.content.toLowerCase().includes(q) && !n.tags.some(t => t.toLowerCase().includes(q))) {
        return false;
      }
    }

    return true;
  });

  const handleNewNote = async () => {
    const note = await createNote(selectedFolderId !== 'all' && selectedFolderId !== 'pinned' ? selectedFolderId : null);
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
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full gap-8 animate-fade-in w-full max-w-6xl mx-auto pb-16 md:pb-0 pt-4 md:pt-8 px-4 md:px-0">
      {/* Sidebar Organization Pane */}
      <div className="w-full md:w-56 shrink-0 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase">Notes</h2>
        </div>

        <nav className="flex flex-col gap-1">
          <button
            onClick={() => setSelectedFolderId('all')}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-left",
              selectedFolderId === 'all' ? "bg-surface text-textMain shadow-sm border border-border/40" : "text-textMuted hover:text-textMain hover:bg-surface/50 border border-transparent"
            )}
          >
            <FileText size={16} /> All Notes
          </button>

          <button
            onClick={() => setSelectedFolderId('pinned')}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-left",
              selectedFolderId === 'pinned' ? "bg-surface text-textMain shadow-sm border border-border/40" : "text-textMuted hover:text-textMain hover:bg-surface/50 border border-transparent"
            )}
          >
            <Pin size={16} /> Pinned
          </button>
        </nav>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-bold tracking-widest text-textMuted uppercase">Folders</h3>
            <button onClick={handleNewFolder} className="text-textMuted hover:text-textMain transition-colors">
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
                      "flex-1 flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 text-left truncate pr-16",
                      selectedFolderId === f.id ? "bg-surface text-textMain shadow-sm border border-border/40" : "text-textMuted hover:text-textMain hover:bg-surface/50 border border-transparent"
                    )}
                  >
                    <Folder size={14} className="shrink-0 opacity-70" />
                    <span className="truncate">{f.name}</span>
                  </button>
                  {selectedFolderId === f.id && (
                    <div className="absolute right-1 flex items-center opacity-0 group-hover:opacity-100 transition-opacity bg-surface shadow-sm border border-border/50 rounded p-0.5">
                      <button
                        onClick={() => { setEditingFolder(f); setIsFolderModalOpen(true); }}
                        className="p-1 text-textMuted hover:text-textMain hover:bg-surfaceHover rounded"
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

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search notes, tags... (Ctrl+K)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface/50 border border-border/40 focus:border-border/80 focus:bg-surface rounded-xl pl-10 pr-4 py-2.5 text-sm text-textMain placeholder-textMuted/50 outline-none transition-all"
            />
          </div>
          <button
            onClick={handleNewNote}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-textMain text-background rounded-lg text-sm font-bold tracking-wide hover:bg-textMain/90 hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
          >
            <Plus size={16} /> New Note
          </button>
        </div>

        {filteredNotes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 border border-dashed border-border/30 rounded-2xl bg-surface/20">
            {search ? (
              <>
                <h4 className="text-sm font-bold tracking-widest text-textMuted uppercase mb-2">No Notes Found</h4>
                <p className="text-textMuted text-sm">Try adjusting your search.</p>
              </>
            ) : (
              <>
                <h4 className="text-sm font-bold tracking-widest text-textMuted uppercase mb-2">Nothing Written Yet</h4>
                <p className="text-textMuted text-sm mb-6">One thought is enough to begin.</p>
                <button onClick={handleNewNote} className="px-5 py-2 bg-surface border border-border/40 rounded-lg text-sm font-bold text-textMain hover:border-textMuted transition-all">
                  Create Note
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredNotes.map(note => {
              const folder = folders.find(f => f.id === note.folder_id);
              return (
                <Link
                  key={note.id}
                  to={`/notes/${note.id}`}
                  className="group flex flex-col p-4 rounded-xl bg-surface/30 hover:bg-surface/80 border border-transparent hover:border-border/40 transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="text-lg font-semibold text-textMain group-hover:text-accent transition-colors truncate">
                      {note.title || 'Untitled'}
                    </h3>
                    {note.is_pinned && <Pin size={14} className="text-accent shrink-0 mt-1" />}
                  </div>

                  <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-xs text-textMuted">
                    {folder && (
                      <span className="flex items-center gap-1.5 text-textMuted/80">
                        <Folder size={12} /> {folder.name}
                      </span>
                    )}
                    <span className="text-textMuted/50">
                      Updated {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                    </span>

                    {note.tags && note.tags.length > 0 && (
                      <div className="flex items-center gap-2">
                        {note.tags.map(tag => (
                          <span key={tag} className="flex items-center text-[10px] font-bold tracking-wider uppercase bg-border/20 px-1.5 py-0.5 rounded text-textMuted/70">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
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
