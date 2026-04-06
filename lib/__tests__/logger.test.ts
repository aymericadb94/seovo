import { describe, it, expect, vi } from "vitest";
import { logger } from "../logger";

describe("logger", () => {
  it("logs info to console.log as JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("Test message", { context: "test" });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("Test message");
    expect(parsed.context).toBe("test");
    expect(parsed.timestamp).toBeDefined();
    spy.mockRestore();
  });

  it("logs errors with stack trace", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    logger.error("Something failed", { error: err, context: "test" });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
    expect(parsed.error).toBe("boom");
    expect(parsed.stack).toContain("Error: boom");
    spy.mockRestore();
  });

  it("logs warnings to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("Watch out", { userId: "u123" });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("warn");
    expect(parsed.userId).toBe("u123");
    spy.mockRestore();
  });

  it("handles non-Error objects in error field", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("String error", { error: "just a string" });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.error).toBe("just a string");
    expect(parsed.stack).toBeUndefined();
    spy.mockRestore();
  });
});
