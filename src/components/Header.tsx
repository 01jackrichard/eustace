import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Settings, Download, Upload, Trash2 } from 'lucide-react';

interface HeaderProps {
  year: number;
  setYear: (y: number) => void;
  onExport: () => void;
  onImport: (data: string) => void;
  onClear: () => void;
}

export function Header({ year, setYear, onExport, onImport, onClear }: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        onImport(result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-textMain">EUSTACE</h1>
        <p className="text-textMuted text-sm mt-1">Build your days. Build your year.</p>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center bg-surface border border-border rounded-lg overflow-hidden p-1">
          <button 
            onClick={() => setYear(year - 1)}
            className="p-1.5 hover:bg-surfaceHover rounded text-textMuted hover:text-textMain transition-colors"
            aria-label="Previous Year"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-4 font-medium min-w-[4.5rem] text-center">{year}</span>
          <button 
            onClick={() => setYear(year + 1)}
            className="p-1.5 hover:bg-surfaceHover rounded text-textMuted hover:text-textMain transition-colors"
            aria-label="Next Year"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="group relative">
          <button className="p-2.5 bg-surface border border-border rounded-lg hover:bg-surfaceHover transition-colors text-textMuted hover:text-textMain" aria-label="Settings">
            <Settings size={18} />
          </button>
          <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
            <div className="p-1.5 flex flex-col gap-1">
              <button onClick={onExport} className="w-full text-left px-3 py-2 text-sm text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg flex items-center gap-2">
                <Download size={14} /> Export Data
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="w-full text-left px-3 py-2 text-sm text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg flex items-center gap-2">
                <Upload size={14} /> Import Data
              </button>
              <div className="h-px bg-border my-1 w-full" />
              <button onClick={onClear} className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg flex items-center gap-2">
                <Trash2 size={14} /> Clear All Data
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".json" 
              className="hidden" 
            />
          </div>
        </div>
      </div>
    </header>
  );
}
