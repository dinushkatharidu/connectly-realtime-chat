import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { upload } from "../middleware/upload";

const router = Router();

router.post("/single", requireAuth, upload.single("file"), (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  return res.json({
    url: `/uploads/${file.filename}`,
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
  });
});

export default router;
