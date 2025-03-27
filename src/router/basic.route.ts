import { Router } from "express";
import { missingTransactionController, reArrangeSubCycleController } from "../controller/missing_transaction.controller";


const router = Router();

router.get('/mt', missingTransactionController);
router.get('/re-arrange-cycle', reArrangeSubCycleController);
export default router;