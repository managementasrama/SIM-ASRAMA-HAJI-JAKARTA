import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
}

interface GlobalNavigationSearchProps {
  items: NavigationItem[];
  activeTab: string;
  onNavigate: (tabId: string) => void;
}

export function GlobalNavigationSearch({ items, activeTab, onNavigate }: GlobalNavigationSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
    return items.filter(item => item.label.toLocaleLowerCase('id-ID').includes(normalizedQuery));
  }, [items, query]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      );
      const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      const isSlashShortcut = event.key === '/' && !isTyping;

      if (!isOpen && (isSearchShortcut || isSlashShortcut)) {
        event.preventDefault();
        setIsOpen(true);
      }
      if (isOpen && event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        setQuery('');
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const closeSearch = () => {
    setIsOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const selectItem = (item: NavigationItem) => {
    onNavigate(item.id);
    closeSearch();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' && filteredItems.length > 0) {
      event.preventDefault();
      setActiveIndex(index => (index + 1) % filteredItems.length);
    } else if (event.key === 'ArrowUp' && filteredItems.length > 0) {
      event.preventDefault();
      setActiveIndex(index => (index - 1 + filteredItems.length) % filteredItems.length);
    } else if (event.key === 'Enter' && filteredItems[activeIndex]) {
      event.preventDefault();
      selectItem(filteredItems[activeIndex]);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="global-navigation-dialog"
        aria-label="Cari menu"
        aria-keyshortcuts="Control+K Meta+K /"
        className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
      >
        <Search aria-hidden="true" className="h-4 w-4 text-gold-300" />
        <span>Cari menu</span>
        <kbd className="hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/70 sm:inline">Ctrl/⌘ K</kbd>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/65 p-3 pt-[12vh] backdrop-blur-sm sm:p-6 sm:pt-[14vh]"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <section
            id="global-navigation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-navigation-title"
            onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
              if (event.key !== 'Tab') return;
              const focusable = event.currentTarget.querySelectorAll<HTMLElement>('input, button:not([disabled])');
              const first = focusable.item(0);
              const last = focusable.item(focusable.length - 1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-700">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-hajj-700 dark:text-gold-300" />
              <label id="global-navigation-title" htmlFor="global-navigation-search" className="sr-only">Cari halaman</label>
              <input
                ref={inputRef}
                id="global-navigation-search"
                type="search"
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Cari menu, misalnya laporan atau keuangan…"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500 dark:text-white dark:placeholder:text-slate-400"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={closeSearch}
                aria-label="Tutup pencarian"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hajj-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2" role="listbox" aria-label="Menu yang tersedia">
              {filteredItems.length ? filteredItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectItem(item)}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hajj-600 ${
                    activeIndex === index
                      ? 'bg-hajj-50 text-hajj-900 dark:bg-slate-800 dark:text-white'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hajj-100 text-hajj-800 dark:bg-slate-700 dark:text-gold-300">
                    <i aria-hidden="true" className={`fa-solid ${item.icon}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    {item.id === activeTab && <span className="text-xs text-slate-500 dark:text-slate-400">Halaman sedang dibuka</span>}
                  </span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )) : (
                <p role="status" className="px-3 py-8 text-center text-sm text-slate-600 dark:text-slate-300">
                  Tidak ada menu yang cocok. Coba kata kunci lain.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <span>Gunakan tombol panah untuk memilih dan Enter untuk membuka.</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-slate-300 px-1.5 py-0.5 font-mono dark:border-slate-600">Esc</kbd> tutup</span>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
