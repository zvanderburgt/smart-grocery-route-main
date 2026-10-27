import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "@/hooks/use-local-storage";

describe("useLocalStorage", () => {
  it("returns the initial value when key is absent", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("persists a string value", () => {
    const { result } = renderHook(() => useLocalStorage("test-str", ""));
    act(() => {
      result.current[1]("hello");
    });
    expect(result.current[0]).toBe("hello");
    expect(localStorage.getItem("test-str")).toBe('"hello"');
  });

  it("persists an array value", () => {
    const { result } = renderHook(() =>
      useLocalStorage<number[]>("test-arr", []),
    );
    act(() => {
      result.current[1]([1, 2, 3]);
    });
    expect(result.current[0]).toEqual([1, 2, 3]);
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useLocalStorage<number>("test-num", 0));
    act(() => {
      result.current[1]((prev) => (prev ?? 0) + 5);
    });
    expect(result.current[0]).toBe(5);
  });
});
