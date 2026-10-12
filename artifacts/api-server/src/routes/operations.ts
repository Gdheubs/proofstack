import { Router, type IRouter } from "express";
import { requireAccount, readSession } from "../services/auth-sessions";
import { authLimit } from "../services/auth-limits";
import { getOperations } from "../services/operations";
const router: IRouter = Router();
router.get("/operations", async (req, res) => {
  const s = requireAccount(await readSession(req, res));
  await authLimit(req, "operations", s.user.id, 10, 60);
  res.json(await getOperations(s));
});
export default router;
