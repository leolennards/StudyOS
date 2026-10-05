import { afterEach, describe, expect, it, vi } from "vitest";
import { wakeWorker } from "./wake";

const globalForWake = globalThis as unknown as { studyosLastWake?: number };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  globalForWake.studyosLastWake = undefined;
});

describe("waking the worker", () => {
  it("does nothing when no worker address is configured", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("WORKER_URL", "");
    await wakeWorker();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the worker's health endpoint, at most once a minute", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("WORKER_URL", "https://worker.example.com");
    await wakeWorker();
    await wakeWorker();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe("https://worker.example.com/health");
  });

  it("stays quiet when the worker is still starting and the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    vi.stubEnv("WORKER_URL", "https://worker.example.com");
    await expect(wakeWorker()).resolves.toBeUndefined();
  });
});
