import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { deleteMessage } from "../controllers/message.controller";

const router = Router();

// DELETE /api/messages/:messageId
router.delete("/:messageId", requireAuth, deleteMessage);

export default router;
