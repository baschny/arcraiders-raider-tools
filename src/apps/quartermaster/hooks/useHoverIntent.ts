import { useCallback, useEffect, useRef, useState } from 'react';

interface UseHoverIntentOptions {
  delayShow?: number;
  delayHide?: number;
}

export function useHoverIntent<T extends HTMLElement>(options: UseHoverIntentOptions = {}) {
  const { delayShow = 350, delayHide = 120 } = options;
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<T | null>(null);

  const showTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const hoverCountRef = useRef(0);
  const contextMenuLockRef = useRef(false);

  const clearTimeouts = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const onMouseEnter = useCallback(() => {
    hoverCountRef.current += 1;

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (!showTimeoutRef.current) {
      showTimeoutRef.current = window.setTimeout(() => {
        setIsHovered(true);
        showTimeoutRef.current = null;
      }, delayShow);
    }
  }, [delayShow]);

  const onMouseLeave = useCallback(() => {
    if (contextMenuLockRef.current) return;

    hoverCountRef.current -= 1;
    if (hoverCountRef.current > 0) return;
    if (hoverCountRef.current < 0) hoverCountRef.current = 0;

    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }

    hideTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
      hideTimeoutRef.current = null;
    }, delayHide);
  }, [delayHide]);

  const onContextMenu = useCallback(() => {
    contextMenuLockRef.current = true;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const release = () => {
      contextMenuLockRef.current = false;
      if (hoverCountRef.current <= 0) {
        hideTimeoutRef.current = window.setTimeout(() => {
          setIsHovered(false);
          hideTimeoutRef.current = null;
        }, delayHide);
      }
    };

    window.addEventListener('mousemove', release, { once: true });
  }, [delayHide]);

  useEffect(() => {
    if (!isHovered) {
      hoverCountRef.current = 0;
      contextMenuLockRef.current = false;
      clearTimeouts();
    }
  }, [isHovered, clearTimeouts]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('mouseenter', onMouseEnter);
    element.addEventListener('mouseleave', onMouseLeave);
    element.addEventListener('contextmenu', onContextMenu);

    return () => {
      element.removeEventListener('mouseenter', onMouseEnter);
      element.removeEventListener('mouseleave', onMouseLeave);
      element.removeEventListener('contextmenu', onContextMenu);
      clearTimeouts();
    };
  }, [onContextMenu, onMouseEnter, onMouseLeave, clearTimeouts]);

  return {
    ref,
    isHovered,
    handlers: {
      onMouseEnter,
      onMouseLeave,
      onContextMenu,
    },
  };
}
