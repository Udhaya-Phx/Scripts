import { Request, Response } from "express";
import {
  bulkInsertChargeService,
  getDataFromChargeService,
  getFromNMITransactionService,
  updateLocalDb,
} from "../services/missing_transaction.service";
import mySqlPool from "../config/mysql";
import { chargeResponseI } from "../interface/missing_transaction.interface";
import { getMissingTransaction } from "../query/mysql/mysql.query";
import { processInBatches } from "../helper/missing_transaction.helper";

export const missingTransactionController = async (
  req: Request,
  res: Response
) => {
  try {
    // const { id } = req.params;
    // const [rows] = await mySqlPool.promise().query(`SELECT * FROM missing_transaction WHERE id = ${id}`);
    // res.json(rows);
    const [rows, fields]: [any, any] = await mySqlPool
      .promise()
      .query(getMissingTransaction("get_nmi_response"));
    const nmiRequestPromiseArr = rows.map((r: any) => {
      return () =>
        getFromNMITransactionService(
          r.customer_email.toString(),
          r.security_key.toString(),
          r.customer_id.toString()
        );
    });

    const nmiResponse = await processInBatches(
      nmiRequestPromiseArr,
      200,
      "NMI call"
    );

    const successNmiRes = nmiResponse
      .filter((nmi) => nmi.status === "fulfilled")
      .map((nmi) => nmi.value);

    const chargePromiseArr = successNmiRes
      .filter((nmi: any) => nmi?.transactions?.length)
      .map((nmi: any) => {
        return () =>
          getDataFromChargeService(
            nmi.transactions,
            nmi.customer_id.toString()
          );
      });

    const chargeResponse = await processInBatches(
      chargePromiseArr,
      200,
      "Charge call"
    );

    const successChargeRes = chargeResponse
      .filter((nmi) => nmi.status === "fulfilled")
      .map((nmi) => nmi.value);

    const chargeInsertPromiseArr = successChargeRes.map((charge: any) => {
      return () => bulkInsertChargeService(charge);
    });

    const chargeInsertResponse = await processInBatches(
      chargeInsertPromiseArr,
      200,
      "Insert charge"
    );

    const successChargeInsertRes = chargeInsertResponse
      .filter((nmi) => nmi.status === "fulfilled")
      .map((nmi) => nmi.value);

    const updateLocalDbPromiseArr = successChargeInsertRes.map(
      (charge: any) => {
        return () =>
          updateLocalDb(
            charge[0],
            charge[1],
            "completed",
            charge[2].toString()
          );
      }
    );

    await processInBatches(updateLocalDbPromiseArr, 200, "Update local db");

    const emptyNmiRes = successNmiRes
      .filter((nmi: any) => !nmi?.transactions?.length)
      .map((nmi: any) => {
        return () =>
          updateLocalDb("empty", "empty", "empty", nmi.customer_id.toString());
      });

    await processInBatches(emptyNmiRes, 200, "Update local db");

    // for (const [index, row] of rows.entries()) {
    //   console.log(`${index+1}/${rows.length} => start`);
    //   const nmiResponse = await getFromNMITransactionService(
    //     row.customer_email.toString(),
    //     row.security_key.toString()
    //   );
    //   console.log(row);
    //   if (nmiResponse.length> 0) {
    //     chargePayloadList = [...await getDataFromChargeService(nmiResponse, row.customer_id.toString())];
    //     let params = await bulkInsertChargeService(chargePayloadList);
    //     updateLocalDb(params[0], params[1], 'completed', row);
    //   }
    //   else {
    //     updateLocalDb('-','-','empty', row)
    //   }
    //   console.log(`${index+1}/${rows.length} => completed`);
    // }
    res.json(successChargeInsertRes);
  } catch (error: any) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};
