import { describe, expect, it } from "vitest";
import { isSignupAllowed, parseAllowedEmails } from "./signup-policy";

describe("sign-up allow-list", () => {
  it("allows everyone when no list is set", () => {
    expect(parseAllowedEmails(undefined)).toBeNull();
    expect(parseAllowedEmails("  ,  ")).toBeNull();
    expect(isSignupAllowed("anyone@example.com", null)).toBe(true);
  });

  it("allows only listed addresses, ignoring case and spacing", () => {
    const allowed = parseAllowedEmails(" Leo@Example.com, friend@uni.ac.uk ");
    expect(isSignupAllowed("leo@example.com", allowed)).toBe(true);
    expect(isSignupAllowed("FRIEND@uni.ac.uk ", allowed)).toBe(true);
    expect(isSignupAllowed("stranger@example.com", allowed)).toBe(false);
  });
});
