import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export interface NoteFolder {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  folder_id: string | null;
  tags: string[];
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export function useNotesData() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [notesRes, foldersRes] = await Promise.all([
        supabase.from('notes').select('*').order('updated_at', { ascending: false }),
        supabase.from('folders').select('*').order('name', { ascending: true })
      ]);

      if (notesRes.error) throw notesRes.error;
      if (foldersRes.error) throw foldersRes.error;

      setNotes(notesRes.data || []);
      setFolders(foldersRes.data || []);
    } catch (err: any) {
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createFolder = async (name: string) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('folders')
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create folder');
      return null;
    }
    setFolders(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data as NoteFolder;
  };

  const deleteFolder = async (id: string) => {
    if (!user) return;
    const previous = [...folders];
    setFolders(prev => prev.filter(f => f.id !== id));

    // Notes in this folder will have folder_id set to null by DB ON DELETE SET NULL
    setNotes(prev => prev.map(n => n.folder_id === id ? { ...n, folder_id: null } : n));

    const { error } = await supabase.from('folders').delete().match({ id, user_id: user.id });
    if (error) {
      setFolders(previous);
      toast.error('Failed to delete folder');
      fetchNotes(); // Re-sync notes just in case
    }
  };

  const createNote = async (initialFolderId: string | null = null) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        title: 'Untitled Note',
        content: '',
        folder_id: initialFolderId
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create note');
      return null;
    }

    setNotes(prev => [data, ...prev]);
    return data as Note;
  };

  const updateNote = async (id: string, updates: Partial<Note>, showToast = true) => {
    if (!user) return;

    // Optimistic update
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n));

    const { error } = await supabase
      .from('notes')
      .update(updates)
      .match({ id, user_id: user.id });

    if (error) {
      if (showToast) toast.error('Failed to save note');
      fetchNotes(); // Revert
      return false;
    }
    return true;
  };

  const deleteNote = async (id: string) => {
    if (!user) return;
    const previous = [...notes];
    setNotes(prev => prev.filter(n => n.id !== id));

    const { error } = await supabase.from('notes').delete().match({ id, user_id: user.id });
    if (error) {
      setNotes(previous);
      toast.error('Failed to delete note');
    } else {
      toast.success('Note deleted');
    }
  };

  const updateFolder = async (id: string, name: string) => {
    if (!user) return false;
    const { error } = await supabase.from('folders').update({ name }).match({ id, user_id: user.id });
    if (error) {
      toast.error('Failed to rename folder');
      return false;
    }
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f).sort((a, b) => a.name.localeCompare(b.name)));
    return true;
  };

  return {
    notes,
    folders,
    loading,
    createFolder,
    updateFolder,
    deleteFolder,
    createNote,
    updateNote,
    deleteNote,
    refresh: fetchNotes
  };
}
