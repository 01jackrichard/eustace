import { cn } from '../lib/utils';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

interface MarkdownRendererProps {
  content: string;
  onCheckboxToggle?: (index: number, checked: boolean) => void;
  className?: string;
  notesList?: { id: string, title: string }[];
}

export function MarkdownRenderer({ content, onCheckboxToggle, className, notesList = [] }: MarkdownRendererProps) {
  // We'll parse blocks simply by splitting on double newlines
  const blocks = content.split(/\n{2,}/);
  let checkboxIndex = 0;

  const renderInline = (text: string) => {
    let result: any[] = [text];

    // Note Links [[Title]]
    result = result.flatMap((part: any, i: number) => {
      if (typeof part !== 'string') return [part];
      const parts = part.split(/(\[\[.*?\]\])/g);
      return parts.map((p, j) => {
        if (p.startsWith('[[') && p.endsWith(']]')) {
          const title = p.slice(2, -2).trim();
          const targetNote = notesList.find(n => n.title.toLowerCase() === title.toLowerCase());
          if (targetNote) {
            return (
              <Link
                key={`${i}-${j}`}
                to={`/notes/${targetNote.id}`}
                className="text-accent hover:underline font-medium transition-colors"
              >
                {title}
              </Link>
            );
          }
          return <span key={`${i}-${j}`} className="text-textMuted">{p}</span>;
        }
        return p;
      });
    });

    // Bold **text**
    result = result.flatMap((part: any, i: number) => {
      if (typeof part !== 'string') return [part];
      const parts = part.split(/(\*\*.*?\*\*)/g);
      return parts.map((p, j) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={`${i}-${j}`} className="font-bold text-textMain">{p.slice(2, -2)}</strong>;
        }
        return p;
      });
    });

    // Italic *text*
    result = result.flatMap((part: any, i: number) => {
      if (typeof part !== 'string') return [part];
      const parts = part.split(/(\*.*?\*)/g);
      return parts.map((p, j) => {
        if (p.startsWith('*') && p.endsWith('*')) {
          return <em key={`${i}-${j}`} className="italic">{p.slice(1, -1)}</em>;
        }
        return p;
      });
    });

    // Inline code `text`
    result = result.flatMap((part: any, i: number) => {
      if (typeof part !== 'string') return [part];
      const parts = part.split(/(`.*?`)/g);
      return parts.map((p, j) => {
        if (p.startsWith('`') && p.endsWith('`')) {
          return <code key={`${i}-${j}`} className="bg-surface px-1.5 py-0.5 rounded text-sm font-mono text-accent">{p.slice(1, -1)}</code>;
        }
        return p;
      });
    });

    return result;
  };

  const renderBlock = (block: string, idx: number) => {
    // Code blocks
    if (block.startsWith('```') && block.endsWith('```')) {
      const code = block.slice(3, -3).trim();
      return (
        <pre key={idx} className="bg-surface p-4 rounded-xl overflow-x-auto my-4 text-sm font-mono text-textMuted border border-border/30">
          <code>{code}</code>
        </pre>
      );
    }

    // Blockquotes
    if (block.startsWith('>')) {
      const lines = block.split('\n').map(l => l.replace(/^>\s?/, ''));
      return (
        <blockquote key={idx} className="border-l-2 border-accent pl-4 py-1 my-4 text-textMuted italic">
          {lines.map((l, i) => <div key={i}>{renderInline(l)}</div>)}
        </blockquote>
      );
    }

    // Headings
    if (block.startsWith('# ')) {
      return <h1 key={idx} className="text-3xl font-bold tracking-tight text-textMain mt-8 mb-4">{renderInline(block.slice(2))}</h1>;
    }
    if (block.startsWith('## ')) {
      return <h2 key={idx} className="text-2xl font-bold tracking-tight text-textMain mt-8 mb-4">{renderInline(block.slice(3))}</h2>;
    }
    if (block.startsWith('### ')) {
      return <h3 key={idx} className="text-xl font-bold text-textMain mt-6 mb-3">{renderInline(block.slice(4))}</h3>;
    }

    // Lists (split by newlines, check if each line is a list item)
    const lines = block.split('\n');
    const isUnordered = lines.every(l => l.trim().startsWith('- '));
    const isOrdered = lines.every(l => /^\d+\.\s/.test(l.trim()));
    const isCheckbox = lines.every(l => l.trim().startsWith('- [ ] ') || l.trim().startsWith('- [x] ') || l.trim().startsWith('- [X] '));

    if (isCheckbox) {
      return (
        <div key={idx} className="flex flex-col gap-2 my-4">
          {lines.map((line, i) => {
            const checked = line.trim().substring(3, 4).toLowerCase() === 'x';
            const content = line.trim().substring(6);
            const currentIndex = checkboxIndex++;
            return (
              <div key={i} className="flex items-start gap-3 group">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCheckboxToggle?.(currentIndex, !checked);
                  }}
                  className="mt-1 outline-none shrink-0"
                >
                  <div className={cn(
                    "w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all duration-200",
                    checked ? "bg-accent border-accent text-background" : "bg-transparent border-border/50 group-hover:border-accent"
                  )}>
                    <Check size={12} strokeWidth={4} className={cn("transition-all duration-200", checked ? "opacity-100 scale-100" : "opacity-0 scale-50")} />
                  </div>
                </button>
                <div className={cn(
                  "flex-1 text-base leading-relaxed transition-all duration-200",
                  checked ? "text-textMuted line-through" : "text-textMain"
                )}>
                  {renderInline(content)}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (isUnordered) {
      return (
        <ul key={idx} className="list-disc list-outside ml-5 my-4 space-y-1.5 text-textMain text-base leading-relaxed">
          {lines.map((l, i) => <li key={i}>{renderInline(l.replace(/^- /, ''))}</li>)}
        </ul>
      );
    }

    if (isOrdered) {
      return (
        <ol key={idx} className="list-decimal list-outside ml-5 my-4 space-y-1.5 text-textMain text-base leading-relaxed">
          {lines.map((l, i) => <li key={i}>{renderInline(l.replace(/^\d+\.\s/, ''))}</li>)}
        </ol>
      );
    }

    // Default paragraph
    return (
      <p key={idx} className="my-4 text-base leading-relaxed text-textMain whitespace-pre-wrap">
        {renderInline(block)}
      </p>
    );
  };

  return (
    <div className={cn("markdown-body", className)}>
      {blocks.map((block, idx) => renderBlock(block.trim(), idx))}
    </div>
  );
}
