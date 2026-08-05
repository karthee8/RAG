import { useEffect, useState } from 'react';

export function useAntigravity() {
  const [isFloating, setIsFloating] = useState(false);

  useEffect(() => {
    // Listen for a custom event so we can trigger it from chat
    const handleTrigger = () => {
      setIsFloating((prev) => !prev);
    };

    window.addEventListener('toggle-antigravity', handleTrigger);

    return () => {
      window.removeEventListener('toggle-antigravity', handleTrigger);
    };
  }, []);

  useEffect(() => {
    if (isFloating) {
      document.body.classList.add('antigravity-active');
      // Apply class to chat bubbles as well
      const bubbles = document.querySelectorAll('.chat-bubble-container');
      bubbles.forEach(b => b.classList.add('antigravity-active'));
    } else {
      document.body.classList.remove('antigravity-active');
      const bubbles = document.querySelectorAll('.chat-bubble-container');
      bubbles.forEach(b => b.classList.remove('antigravity-active'));
    }
  }, [isFloating]);

  return { isFloating };
}
