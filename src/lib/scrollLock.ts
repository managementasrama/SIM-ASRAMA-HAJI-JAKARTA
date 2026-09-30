import { useEffect } from 'react';

/**
 * Robust, reference-counted Body Scroll Lock
 * Mencegah background page scrolling saat popup / modal terbuka.
 * Mendukung multiple modal bersarang tanpa merusak overflow saat salah satu ditutup.
 */
let scrollLockCount = 0;
let originalBodyOverflow = '';
let originalHtmlOverflow = '';
let originalBodyPaddingRight = '';
let originalTouchAction = '';

export function lockBodyScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  scrollLockCount++;

  if (scrollLockCount === 1) {
    originalBodyOverflow = document.body.style.overflow;
    originalHtmlOverflow = document.documentElement.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;
    originalTouchAction = document.body.style.touchAction;

    // Hitung lebar scrollbar untuk mencegah layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  }
}

export function unlockBodyScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  scrollLockCount = Math.max(0, scrollLockCount - 1);

  if (scrollLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow || '';
    document.documentElement.style.overflow = originalHtmlOverflow || '';
    document.body.style.paddingRight = originalBodyPaddingRight || '';
    document.body.style.touchAction = originalTouchAction || '';
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  }
}

/**
 * React Hook untuk mengunci scroll body saat `isLocked` bernilai true
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, [isLocked]);
}
