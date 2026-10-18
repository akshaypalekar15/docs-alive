'use client';
import { useCallback, useEffect } from 'react';

const CLASS = 'is-dragging';

/**
 * A drag that begins on a handle still sweeps across text, and the browser
 * starts a selection the moment the pointer crosses any. Suppressing selection
 * for the whole drag — not only on the handle — is what stops the text being
 * highlighted, and clearing the range afterwards drops anything picked up
 * before the guard took effect.
 *
 * Framer's `Reorder.Group` does not fire `onDragStart`, so this is driven from
 * the handle's own pointerdown instead. Only a press that starts on a handle
 * suppresses selection: a press anywhere else is the reader selecting text,
 * which has to keep working.
 */
export function useDragSelectionGuard() {
  const stop = useCallback(() => {
    // Only tidy up if a drag actually started. This listener is on every
    // pointerup in the document, so without the check it would wipe the
    // selection the reader just made by dragging across the text.
    if (!document.documentElement.classList.contains(CLASS)) return;
    document.documentElement.classList.remove(CLASS);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    // Releasing outside the window, or losing focus mid-drag, would otherwise
    // leave the page permanently unselectable.
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      document.documentElement.classList.remove(CLASS);
    };
  }, [stop]);

  return {
    onDragHandlePointerDown: () => {
      document.documentElement.classList.add(CLASS);
    },
  };
}