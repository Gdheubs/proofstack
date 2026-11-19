import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import communityRouter from "./community";

import careersRouter from "./careers";
import assessmentsRouter from "./assessments";

import repositoriesRouter from "./repositories";
import editorRouter from "./editor";
import monitoringRouter from "./monitoring";

import pullsRouter from "./pulls";

import intelligenceRouter from "./intelligence";

import operationsRouter from "./operations";
import platformRouter from "./platform";
import mailHooksRouter from "./mail-hooks";
import mediaRouter from "./media";
import mediaHooksRouter from "./media-hooks";
import socialRouter from "./social";
import moderationRouter from "./moderation";
import skillsAuthoringRouter from "./skills-authoring";
import skillsRouter from "./skills";
import skillsInterviewRouter from "./skills-interview";
import skillsVerifyRouter from "./skills-verify";
import skillsGradingRouter from "./skills-grading";
import educationRouter from "./education";
import orgResultsRouter from "./org-results";
import careerChecksRouter from "./career-checks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(operationsRouter);
router.use(authRouter);
router.use(communityRouter);
router.use(careersRouter);
router.use(assessmentsRouter);
router.use(repositoriesRouter);
router.use(editorRouter);
router.use(monitoringRouter);
router.use(pullsRouter);
router.use(intelligenceRouter);
router.use(platformRouter);
router.use(mailHooksRouter);
router.use(mediaRouter);
router.use(mediaHooksRouter);
router.use(socialRouter);
router.use(moderationRouter);
router.use(skillsAuthoringRouter);
router.use(skillsRouter);
router.use(skillsInterviewRouter);
router.use(skillsVerifyRouter);
router.use(skillsGradingRouter);
router.use(educationRouter);
router.use(orgResultsRouter);
router.use(careerChecksRouter);

export default router;
