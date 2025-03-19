import { Router } from "express";
import { missingTransactionController } from "../controller/missing_transaction.controller";


const router = Router();

router.get('/mt', missingTransactionController);

export default router;