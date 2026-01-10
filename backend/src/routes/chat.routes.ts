import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createChat,
  listMyChats,
  getMessages,
  sendMessage,
} from "../controllers/chat.controller";

const router = Router();

router.use(requireAuth);

router.post("/", createChat);
router.get("/", listMyChats);
router.get("/:chatId/messages", getMessages);
router.post("/message", sendMessage);

export default router;
