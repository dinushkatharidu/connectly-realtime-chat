import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type JwtPayload = { userId: string; iat: number; exp: number };

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as JwtPayload;
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
