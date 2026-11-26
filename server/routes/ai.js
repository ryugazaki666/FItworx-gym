// server/routes/ai.js
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { answerQuery } from "../services/ai.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
router.use(requireAuth);

// Authorized users (admin or staff) only — enforced by requireAuth above,
// since both roles are legitimate front-desk/reporting users in this system.
router.post("/query", asyncHandler(async (req, res) => {
  const question = (req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Enter a question." });
  if (question.length > 500) return res.status(400).json({ error: "Question is too long. Keep it under 500 characters." });

  try {
    const result = await answerQuery(question);
    res.json(result);
  } catch (error) {
    const status = error.message.startsWith("GEMINI_API_KEY") ? 503 : 500;
    res.status(status).json({ error: error.message });
  }
}));

export default router;
