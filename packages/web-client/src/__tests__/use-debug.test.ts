import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebug } from "../hooks/use-debug";

beforeEach(() => {
  localStorage.clear();
});

describe("useDebug", () => {
  it("defaults to debug OFF", () => {
    const { result } = renderHook(() => useDebug());
    expect(result.current.isDebug).toBe(false);
    expect(result.current.debugEvents).toEqual([]);
  });

  it("reads initial state from localStorage", () => {
    localStorage.setItem("debugMode", "true");
    const { result } = renderHook(() => useDebug());
    expect(result.current.isDebug).toBe(true);
  });

  it("toggleDebug flips state and persists to localStorage", () => {
    const { result } = renderHook(() => useDebug());
    expect(result.current.isDebug).toBe(false);

    act(() => result.current.toggleDebug());
    expect(result.current.isDebug).toBe(true);
    expect(localStorage.getItem("debugMode")).toBe("true");

    act(() => result.current.toggleDebug());
    expect(result.current.isDebug).toBe(false);
    expect(localStorage.getItem("debugMode")).toBe("false");
  });

  it("addEvent appends to debugEvents with auto-generated id and timestamp", () => {
    const { result } = renderHook(() => useDebug());
    act(() => {
      result.current.addEvent({ type: "agent", data: { agentId: "test-bot" } });
    });
    expect(result.current.debugEvents).toHaveLength(1);
    expect(result.current.debugEvents[0].type).toBe("agent");
    expect(result.current.debugEvents[0].data.agentId).toBe("test-bot");
    expect(result.current.debugEvents[0].id).toBeDefined();
    expect(result.current.debugEvents[0].timestamp).toBeInstanceOf(Date);
  });

  it("startTurn sets turn label on subsequent events", () => {
    const { result } = renderHook(() => useDebug());
    act(() => result.current.startTurn("What is the weather?"));
    act(() => result.current.addEvent({ type: "agent", data: { agentId: "weather" } }));
    expect(result.current.debugEvents[0].turn).toBe("What is the weather?");
  });

  it("clearEvents empties the array", () => {
    const { result } = renderHook(() => useDebug());
    act(() => result.current.addEvent({ type: "stream", data: {} }));
    expect(result.current.debugEvents).toHaveLength(1);
    act(() => result.current.clearEvents());
    expect(result.current.debugEvents).toEqual([]);
  });
});
