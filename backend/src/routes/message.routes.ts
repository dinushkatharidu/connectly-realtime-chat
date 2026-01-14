import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  deleteMessageForEveryone,
  editMessage,
} from "../controllers/message.controller";

const router = Router();

// edit message
router.patch("/:messageId", requireAuth, editMessage);

// delete for everyone (soft delete + caption)
router.delete("/:messageId", requireAuth, deleteMessageForEveryone);

export default router;
