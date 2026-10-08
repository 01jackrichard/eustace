import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '../lib/utils';
import { 
  Undo, Redo, Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  Heading1, Heading2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const MenuBar = ({ editor }: { editor: any }) => {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (!editor) return;
    editor.on('transaction', forceUpdate);
    editor.on('selectionUpdate', forceUpdate);
    return () => {
      editor.off('transaction', forceUpdate);
      editor.off('selectionUpdate', forceUpdate);
    };
  }, [editor]);
  if (!editor) {
    return null;
  }

  const Button = ({ icon: Icon, onClick, isActive = false, title }: any) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 outline-none text-[#A0A0A0]",
        "hover:bg-[#2A2A2A] hover:text-[#FF5722]",
        isActive && "text-[#FF5722] bg-[#FF5722]/10"
      )}
    >
      <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
    </button>
  );

  const Divider = () => <div className="w-[1px] h-5 bg-white/10 mx-1.5 rounded-full" />;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-1 p-1.5 mb-4 rounded-xl bg-[#121212]/90 backdrop-blur-md border border-white/5 shadow-2xl overflow-x-auto custom-scrollbar">
      {/* Group 1: History */}
      <Button icon={Undo} title="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <Button icon={Redo} title="Redo" onClick={() => editor.chain().focus().redo().run()} />

      <Divider />

      {/* Group 2: Formatting */}
      <Button 
        icon={Bold} 
        title="Bold" 
        onClick={() => editor.chain().focus().unsetItalic().unsetUnderline().unsetStrike().toggleBold().run()} 
        isActive={editor.isActive('bold')} 
      />
      <Button 
        icon={Italic} 
        title="Italic" 
        onClick={() => editor.chain().focus().unsetBold().unsetUnderline().unsetStrike().toggleItalic().run()} 
        isActive={editor.isActive('italic')} 
      />
      <Button 
        icon={UnderlineIcon} 
        title="Underline" 
        onClick={() => editor.chain().focus().unsetBold().unsetItalic().unsetStrike().toggleUnderline().run()} 
        isActive={editor.isActive('underline')} 
      />
      <Button 
        icon={Strikethrough} 
        title="Strikethrough" 
        onClick={() => editor.chain().focus().unsetBold().unsetItalic().unsetUnderline().toggleStrike().run()} 
        isActive={editor.isActive('strike')} 
      />

      <Divider />

      {/* Group 3: Typography */}
      <Button 
        icon={Heading1} 
        title="Heading 1" 
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
        isActive={editor.isActive('heading', { level: 1 })} 
      />
      <Button 
        icon={Heading2} 
        title="Heading 2" 
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
        isActive={editor.isActive('heading', { level: 2 })} 
      />

      <Divider />

      {/* Group 4: Lists */}
      <Button 
        icon={List} 
        title="Bullet List" 
        onClick={() => editor.chain().focus().toggleBulletList().run()} 
        isActive={editor.isActive('bulletList')} 
      />
      <Button 
        icon={ListOrdered} 
        title="Numbered List" 
        onClick={() => editor.chain().focus().toggleOrderedList().run()} 
        isActive={editor.isActive('orderedList')} 
      />

      <Divider />

      {/* Group 5: Alignment */}
      <Button 
        icon={AlignLeft} 
        title="Align Left" 
        onClick={() => editor.chain().focus().setTextAlign('left').run()} 
        isActive={editor.isActive({ textAlign: 'left' })} 
      />
      <Button 
        icon={AlignCenter} 
        title="Align Center" 
        onClick={() => editor.chain().focus().setTextAlign('center').run()} 
        isActive={editor.isActive({ textAlign: 'center' })} 
      />
      <Button 
        icon={AlignRight} 
        title="Align Right" 
        onClick={() => editor.chain().focus().setTextAlign('right').run()} 
        isActive={editor.isActive({ textAlign: 'right' })} 
      />
    </div>
  );
};

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: 'Start writing...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-orange max-w-none focus:outline-none min-h-[300px] text-base md:text-lg leading-relaxed',
      },
    },
  });

  // Update editor content when the prop changes (e.g., when a new note is loaded)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="flex-1 flex flex-col w-full h-full text-textMain">
      <MenuBar editor={editor} />
      <div className="flex-1 w-full bg-transparent overflow-y-auto pb-32 cursor-text" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} className="w-full h-full" />
      </div>
    </div>
  );
}
