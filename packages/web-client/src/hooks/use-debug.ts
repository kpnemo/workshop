import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { DebugEvent } from "../types";

const DEBUG_KEY = "debugMode";

export function useDebug() {
  const [isDebug, setIsDebug] = useState(() => localStorage.getItem(DEBUG_KEY) === "true");
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const currentTurnRef = useRef<string | undefined>(undefined);

  const toggleDebug = useCallback(() => {
    setIsDebug((prev) => {
      const next = !prev;
      localStorage.setItem(DEBUG_KEY, String(next));
      return next;
    });
  }, []);

  const addEvent = useCallback((event: Omit<DebugEvent, "id" | "timestamp">) => {
    const newEvent: DebugEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
      turn: event.turn ?? currentTurnRef.current,
    };
    setDebugEvents((prev) => [...prev, newEvent]);
  }, []);

  const startTurn = useCallback((userMessage: string) => {
    currentTurnRef.current = userMessage;
  }, []);

  const clearEvents = useCallback(() => {
    setDebugEvents([]);
    currentTurnRef.current = undefined;
  }, []);

  return { isDebug, toggleDebug, debugEvents, addEvent, startTurn, clearEvents };
}
