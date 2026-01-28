import { useEffect, useRef, useState, useCallback } from 'react';

interface UseHoverIntentOptions {
  /**
   * Delay in milliseconds before showing (default: 500ms)
   */
  delayShow?: number;
  /**
   * Delay in milliseconds before hiding (default: 100ms)
   */
  delayHide?: number;
}

export function useHoverIntent<T extends HTMLElement>(
  options: UseHoverIntentOptions = {}
) {
  const { delayShow = 500, delayHide = 100 } = options;
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<T | null>(null);
  
  // State refs
  const showTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const hoverCountRef = useRef(0);
  const isContextMenuOpenRef = useRef(false);

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

  const handleMouseEnter = useCallback(() => {
    hoverCountRef.current++;
    
    // Clear hide timeout immediately if we enter any valid zone
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    // Schedule show if not already shown
    if (!showTimeoutRef.current) {
      showTimeoutRef.current = window.setTimeout(() => {
        setIsHovered(true);
        showTimeoutRef.current = null;
      }, delayShow);
    }
  }, [delayShow]);

  const handleMouseLeave = useCallback(() => {
    // If context menu is open, we ignore leaves
    if (isContextMenuOpenRef.current) return;

    hoverCountRef.current--;
    
    // If we still have a hover lock (e.g. moved from Icon to Box), do nothing
    if (hoverCountRef.current > 0) return;
    
    // Clamp at 0 just in case
    if (hoverCountRef.current < 0) hoverCountRef.current = 0;

    // Clear show timeout if we leave before showing
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }

    // Schedule hide
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
      hideTimeoutRef.current = null;
    }, delayHide);
  }, [delayHide]);

  const handleContextMenu = useCallback(() => {
    isContextMenuOpenRef.current = true;
    
    // Cancel any pending hide because we are interacting
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    // Listen for the next mouse movement to release the lock
    const onGlobalMouseMove = () => {
      isContextMenuOpenRef.current = false;
      // If we are not hovering anything anymore, we should hide
      if (hoverCountRef.current <= 0) {
        hideTimeoutRef.current = window.setTimeout(() => {
          setIsHovered(false);
          hideTimeoutRef.current = null;
        }, delayHide);
      }
    };
    
    window.addEventListener('mousemove', onGlobalMouseMove, { once: true });
  }, [delayHide]);

  // Safety reset when closed
  useEffect(() => {
    if (!isHovered) {
      hoverCountRef.current = 0;
      isContextMenuOpenRef.current = false;
      clearTimeouts();
    }
  }, [isHovered, clearTimeouts]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
    element.addEventListener('contextmenu', handleContextMenu);

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
      element.removeEventListener('contextmenu', handleContextMenu);
      clearTimeouts();
    };
  }, [handleMouseEnter, handleMouseLeave, handleContextMenu, clearTimeouts]);

  return { 
    ref, 
    isHovered,
    handlers: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onContextMenu: handleContextMenu
    }
  };
}
