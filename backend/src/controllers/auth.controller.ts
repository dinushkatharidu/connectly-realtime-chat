import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { UserModel } from "../models/User";
import { signToken } from "../config/jwt";

const registerSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Validation error", errors: parsed.error.flatten() });
  }

  const { name, email, password } = parsed.data;

  const existing = await UserModel.findOne({ email });
  if (existing)
    return res.status(409).json({ message: "Email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await UserModel.create({ name, email, passwordHash });

  const token = signToken({ userId: user._id.toString() });

  return res.status(201).json({
    token,
    user: { id: user._id, name: user.name, email: user.email },
  });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Validation error", errors: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const user = await UserModel.findOne({ email });
  if (!user)
    return res.status(401).json({ message: "Invalid email or password" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok)
    return res.status(401).json({ message: "Invalid email or password" });

  const token = signToken({ userId: user._id.toString() });

  return res.json({
    token,
    user: { id: user._id, name: user.name, email: user.email },
  });
}
