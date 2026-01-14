import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: string;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ message: "Missing token" });

  const secret = process.env.JWT_SECRET;
  if (!secret)
    return res.status(500).json({ message: "JWT_SECRET not configured" });

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;

    const userId = decoded?.userId as unknown;

    if (typeof userId !== "string" || userId.length === 0) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.userId = userId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
