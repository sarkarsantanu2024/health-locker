import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  loginSchema,
  passwordSchema,
  phoneSchema,
  signupSchema,
  usernameSchema,
} from "@/shared/schemas/auth";

const validSignup = {
  username: "priya.sharma",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
  fullName: "Priya Sharma",
  phone: "+91 98000 00101",
  addressLine: "44 Southern Avenue",
  city: "Kolkata",
  state: "West Bengal",
  pincode: "700029",
  planId: "plan-patient-free",
  consent: true as const,
};

describe("usernameSchema", () => {
  it("lowercases and trims", () => {
    expect(usernameSchema.parse("  Priya.Sharma  ")).toBe("priya.sharma");
  });

  it("rejects spaces, symbols and out-of-range lengths", () => {
    for (const bad of ["ab", "a".repeat(33), "priya sharma", "priya@sharma", "priya/../admin"]) {
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("passwordSchema", () => {
  it("requires 12 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a-long-enough-one").success).toBe(true);
  });

  it("rejects the obvious guesses", () => {
    for (const bad of ["password1234", "Welcome12345", "healthlocker1", "qwerty123456"]) {
      expect(passwordSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("rejects leading or trailing whitespace", () => {
    expect(passwordSchema.safeParse(" a-long-password").success).toBe(false);
    expect(passwordSchema.safeParse("a-long-password ").success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("normalises Indian mobile formats", () => {
    for (const input of ["9800000101", "+919800000101", "+91 98000 00101", "98000-00101"]) {
      expect(phoneSchema.safeParse(input).success, input).toBe(true);
    }
  });

  it("rejects landlines, short numbers and non-Indian formats", () => {
    for (const bad of ["1234567890", "980000010", "98000001011", "+1 415 555 0100", "abcdefghij"]) {
      expect(phoneSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("loginSchema", () => {
  it("does not apply the password policy to an existing password", () => {
    // Enforcing the policy at login would leak it and lock out older accounts.
    expect(loginSchema.safeParse({ username: "priya.demo", password: "short" }).success).toBe(true);
  });

  it("requires a 6-digit TOTP when supplied", () => {
    expect(loginSchema.safeParse({ username: "a.b", password: "x", totp: "12345" }).success).toBe(false);
    expect(loginSchema.safeParse({ username: "a.b", password: "x", totp: "123456" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "a.b", password: "x", totp: "" }).success).toBe(true);
  });
});

describe("signupSchema", () => {
  it("accepts a complete registration", () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it.each([
    ["fullName", ""],
    ["phone", "123"],
    ["addressLine", ""],
    ["city", ""],
    ["state", ""],
    ["pincode", "12345"],
    ["planId", ""],
  ])("requires %s", (field, value) => {
    const result = signupSchema.safeParse({ ...validSignup, [field]: value });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.error.flatten().fieldErrors)).toContain(field);
    }
  });

  it("rejects a PIN code starting with zero", () => {
    expect(signupSchema.safeParse({ ...validSignup, pincode: "070029" }).success).toBe(false);
  });

  it("requires the two passwords to match", () => {
    const result = signupSchema.safeParse({ ...validSignup, confirmPassword: "something else" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it("rejects a password containing the username", () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      password: "priya.sharma-2026",
      confirmPassword: "priya.sharma-2026",
    });

    expect(result.success).toBe(false);
  });

  it("requires explicit consent before storing health records", () => {
    const result = signupSchema.safeParse({ ...validSignup, consent: false });
    expect(result.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("rejects reusing the current password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "a-long-enough-one",
      newPassword: "a-long-enough-one",
      confirmPassword: "a-long-enough-one",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a genuine change", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "the-old-passphrase",
        newPassword: "a-brand-new-passphrase",
        confirmPassword: "a-brand-new-passphrase",
      }).success,
    ).toBe(true);
  });
});
