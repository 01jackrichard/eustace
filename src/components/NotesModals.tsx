import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { X, Loader2 } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface border border-border/60 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <h3 className="text-xs font-bold tracking-widest text-textMuted uppercase">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-textMuted hover:text-textMain hover:bg-surfaceHover rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function FolderModal({
  isOpen,
  onClose,
  onSubmit,
  initialName = '',
  title = 'New Folder',
  submitText = 'Create Folder'
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  initialName?: string;
  title?: string;
  submitText?: string;
}) {
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onSubmit(name.trim());
    setLoading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-textMain">Folder name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain placeholder-textMuted outline-none focus:border-accent transition-colors"
            placeholder="e.g. Projects"
            disabled={loading}
          />
        </div>
        <div className="flex items-center justify-end gap-3 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 bg-textMain text-background rounded-lg text-sm font-bold tracking-wide hover:bg-textMain/90 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Delete',
  isDestructive = true
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  isDestructive?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-textMain leading-relaxed whitespace-pre-wrap">{message}</p>
        <div className="flex items-center justify-end gap-3 mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold tracking-wide transition-colors",
              isDestructive
                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                : "bg-textMain text-background hover:bg-textMain/90"
            )}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function MoveFolderModal({
  isOpen,
  onClose,
  onMove,
  folders,
  currentFolderId
}: {
  isOpen: boolean;
  onClose: () => void;
  onMove: (folderId: string | null) => Promise<void>;
  folders: { id: string, name: string }[];
  currentFolderId: string | null;
}) {
  const [loading, setLoading] = useState(false);

  const handleMove = async (folderId: string | null) => {
    setLoading(true);
    await onMove(folderId);
    setLoading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Move To Folder">
      <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
        <button
          disabled={loading}
          onClick={() => handleMove(null)}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full",
            currentFolderId === null
              ? "bg-surfaceHover text-textMain border border-border/40"
              : "text-textMuted hover:text-textMain hover:bg-surfaceHover border border-transparent"
          )}
        >
          <div className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 border-current">
            {currentFolderId === null && <div className="w-2 h-2 rounded-full bg-current" />}
          </div>
          No folder
        </button>
        {folders.map(f => (
          <button
            key={f.id}
            disabled={loading}
            onClick={() => handleMove(f.id)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full",
              currentFolderId === f.id
                ? "bg-surfaceHover text-textMain border border-border/40"
                : "text-textMuted hover:text-textMain hover:bg-surfaceHover border border-transparent"
            )}
          >
            <div className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 border-current">
              {currentFolderId === f.id && <div className="w-2 h-2 rounded-full bg-current" />}
            </div>
            {f.name}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function EditTagsModal({
  isOpen,
  onClose,
  onSave,
  initialTags
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void>;
  initialTags: string[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTags(initialTags || []);
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialTags]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const newTag = input.trim().replace(/^#/, '');
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
    }
    setInput('');
  };

  const removeTag = (tToRemove: string) => {
    setTags(tags.filter(t => t !== tToRemove));
  };

  const handleSave = async () => {
    setLoading(true);
    await onSave(tags);
    setLoading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Tags">
      <div className="flex flex-col gap-4">
        <form onSubmit={handleAdd} className="flex flex-col gap-2">
          <label className="text-sm font-medium text-textMain">Add tag</label>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain placeholder-textMuted outline-none focus:border-accent transition-colors"
            placeholder="e.g. idea (press Enter)"
            disabled={loading}
          />
        </form>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 bg-surfaceHover px-2 py-1 rounded-md text-xs font-medium text-textMain border border-border/50">
                #{tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="text-textMuted hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textMain transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-textMain text-background rounded-lg text-sm font-bold tracking-wide hover:bg-textMain/90 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save Tags
          </button>
        </div>
      </div>
    </Modal>
  );
}
