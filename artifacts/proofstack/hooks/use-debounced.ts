"use client";
import { useEffect, useState } from "react";

// The value once it has stopped changing for `delay` ms: search boxes send
// one request when typing pauses, not one per keystroke.
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
