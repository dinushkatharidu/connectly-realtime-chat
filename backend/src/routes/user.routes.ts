import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { searchUsers } from "../controllers/user.controller";

const router = Router();

router.use(requireAuth);

// /api/users/search?email=dinushka
router.get("/search", searchUsers);

export default router;
