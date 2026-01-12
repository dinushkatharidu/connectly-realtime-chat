import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { UserModel } from "../models/User";

function getQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string")
    return value[0].trim();
  return "";
}

/**
 * GET /api/users/search?email=...
 * Protected: returns users matching email (excluding self)
 */
export async function searchUsers(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Unauthorized" });

    const email = getQueryString((req.query as any).email);
    if (!email)
      return res.status(400).json({ message: "email query param is required" });

    // Basic safe regex for partial match
    const regex = new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const users = await UserModel.find({
      _id: { $ne: req.userId },
      email: { $regex: regex },
    })
      .select("_id name email")
      .limit(10);

    return res.json(users);
  } catch (err) {
    console.error("searchUsers error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}
