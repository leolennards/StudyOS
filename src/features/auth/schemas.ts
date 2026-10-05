import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Keep it under 80 characters"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(128, "Keep it under 128 characters"),
});

export const forgotPasswordSchema = z.object({ email: z.email("Enter a valid email address") });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters").max(128, "Keep it under 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match" });
