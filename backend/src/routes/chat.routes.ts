import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createChat,
  getMessagesByChat,
  getMyChats,
  sendMessage,
} from "../controllers/chat.controller";

const router = Router();

router.get("/", requireAuth, getMyChats);
router.post("/", requireAuth, createChat);
router.get("/:chatId/messages", requireAuth, getMessagesByChat);
router.post("/message", requireAuth, sendMessage);

export default router;
