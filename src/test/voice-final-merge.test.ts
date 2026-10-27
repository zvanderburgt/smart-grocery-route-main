import { describe, it, expect } from "vitest";
import { mergeFinalTranscripts } from "@/hooks/use-voice-input";

describe("mergeFinalTranscripts", () => {
  it("replaces an early final with its revision", () => {
    expect(mergeFinalTranscripts("frozen", "frozen corn")).toBe("frozen corn");
  });

  it("is case-insensitive about the revision prefix", () => {
    expect(mergeFinalTranscripts("Frozen", "frozen corn")).toBe("frozen corn");
  });

  it("drops a repeated tail", () => {
    expect(mergeFinalTranscripts("frozen corn", "corn")).toBe("frozen corn");
  });

  it("joins unrelated finals so the splitter can handle them", () => {
    expect(mergeFinalTranscripts("milk", "eggs")).toBe("milk eggs");
  });

  it("handles empty sides", () => {
    expect(mergeFinalTranscripts("", "corn")).toBe("corn");
    expect(mergeFinalTranscripts("corn", "  ")).toBe("corn");
  });
});
