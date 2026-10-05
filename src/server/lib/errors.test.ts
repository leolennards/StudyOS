import { describe, expect, it } from "vitest";
import { AppError, isAppError, isUniqueViolation, notFound } from "./errors";

describe("AppError", () => {
  it("carries a default message a user can read", () => {
    expect(new AppError("FORBIDDEN").message).toBe("You don't have access to that.");
  });

  it("keeps field errors and the original cause", () => {
    const cause = new Error("boom");
    const error = new AppError("VALIDATION", "Check the form", { fields: { name: ["Required"] }, cause });
    expect(error.fields).toEqual({ name: ["Required"] });
    expect(error.cause).toBe(cause);
    expect(isAppError(error)).toBe(true);
  });

  it("names the thing that was not found", () => {
    expect(notFound("That subject").message).toContain("That subject");
  });
});

describe("isUniqueViolation", () => {
  it("recognises the Postgres unique-violation code", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("nope"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
