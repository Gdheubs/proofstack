import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import communityRouter from "./community";

import careersRouter from "./careers";
import assessmentsRouter from "./assessments";

import repositoriesRouter from "./repositories";
import editorRouter from "./editor";

import pullsRouter from "./pulls";

import intelligenceRouter from "./intelligence";

import operationsRouter from "./operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(operationsRouter);
router.use(authRouter);
router.use(communityRouter);
router.use(careersRouter);
router.use(assessmentsRouter);
router.use(repositoriesRouter);
router.use(editorRouter);
router.use(pullsRouter);
router.use(intelligenceRouter);

export default router;
