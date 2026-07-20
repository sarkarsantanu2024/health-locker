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
  it("requires 8 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("kx7mQp").success).toBe(false); // 6
    expect(passwordSchema.safeParse("kx7mQpz").success).toBe(false); // 7
    expect(passwordSchema.safeParse("kx7mQpz2").success).toBe(true); // 8
    // Length alone is not enough: "12345678" is 8 but still blocked.
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("a-long-enough-one").success).toBe(true);
  });

  it("rejects only exact breach-list matches, case-insensitively", () => {
    for (const bad of ["password", "Password123", "12345678", "QWERTY123", "iloveyou"]) {
      expect(passwordSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("accepts what an ordinary person would actually choose", () => {
    // No capital, digit or symbol requirement: NIST advises against composition
    // rules, and this product is used by people who are not developers.
    for (const good of [
      "kolkata2026",
      "my dog rocky",
      "amarsonarbangla",
      "priya1989",
      "chai lover",
      "passwordless-vault", // contains "password" but is not the banned exact value
    ]) {
      expect(passwordSchema.safeParse(good).success, good).toBe(true);
    }
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

  it("rejects a password identical to the username, but allows one containing it", () => {
    expect(
      signupSchema.safeParse({
        ...validSignup,
        password: "priya.sharma",
        confirmPassword: "priya.sharma",
      }).success,
    ).toBe(false);

    expect(
      signupSchema.safeParse({
        ...validSignup,
        password: "priya.sharma-2026",
        confirmPassword: "priya.sharma-2026",
      }).success,
    ).toBe(true);
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
