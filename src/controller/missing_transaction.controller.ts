import { Request, Response } from "express";
import {
  bulkInsertChargeService,
  getDataFromChargeService,
  getFromNMITransactionService,
  reArrangeCycleService,
  updateLocalDb,
  updateLocalDbStatus,
} from "../services/missing_transaction.service";
import mySqlPool from "../config/mysql";
import {
  chargeI,
  chargeResponseI,
} from "../interface/missing_transaction.interface";
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
          r.customer_id.toString(),
          r.store_id.toString()
        );
    });

    const nmiResponse = await processInBatches(
      nmiRequestPromiseArr,
      200,
      "NMI call"
    );

    const successNmiRes = nmiResponse
      .filter((nmi: any) => nmi.status === "fulfilled")
      .map((nmi: any) => nmi.value);

    const emptyNMIRes = nmiResponse
      .filter((nmi: any) => nmi.status === "fulfilled")
      .map((nmi: any) => {
        if (!nmi.value?.transactions?.length) {
          return nmi.value;
        }
      });

    const chargePromiseArr = successNmiRes
      .filter((nmi: any) => nmi?.transactions?.length)
      .map((nmi: any) => {
        return () =>
          getDataFromChargeService(
            nmi.transactions,
            nmi.customer_id.toString(),
            nmi.store_id.toString()
          );
      });

    const chargeResponse = await processInBatches(
      chargePromiseArr,
      200,
      "Charge call"
    );

    const successChargeRes = chargeResponse
      .filter((nmi) => nmi.status === "fulfilled")
      .map((nmi) => {
        if (nmi.value.charge.length > 0) {
          return nmi.value;
        }
      });
    const emptyChargeRes = chargeResponse
      .filter((nmi) => nmi.status === "fulfilled")
      .map((nmi) => {
        if (!nmi.value.charge.length) {
          return nmi.value;
        }
      });

    const chargeInsertPromiseArr = successChargeRes
      .filter((charge: any) => {
        if (charge) {
          return charge;
        }
      })
      .map((charge: any) => {
        return () => bulkInsertChargeService(charge.charge);
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
            "ready_to_arrange",
            charge[2].toString()
          );
      }
    );

    await processInBatches(updateLocalDbPromiseArr, 200, "Update local db");

    const emptyNmiRes = emptyChargeRes
      .filter((nmi: any) => nmi?.charge?.length == 0)
      .map((nmi: any) => {
        return () =>
          updateLocalDb(
            "empty",
            "empty",
            "ready_to_arrange",
            nmi.customerID.toString()
          );
      });
    const emptyRes = emptyNMIRes
      .filter((nmi: any) => nmi?.transactions?.length == 0)
      .map((nmi: any) => {
        return () =>
          updateLocalDb(
            "empty",
            "empty",
            "ready_to_arrange",
            nmi.customer_id.toString()
          );
      });

    await processInBatches(emptyNmiRes, 200, "Update local db");
    await processInBatches(emptyRes, 200, "Update local db");

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

export const reArrangeSubCycleController = async (
  req: Request,
  res: Response
) => {
  try {
    const [rows, fields]: [any, any] = await mySqlPool
      .promise()
      .query(getMissingTransaction("ready_to_arrange"));
    const processChargePromiseArr = rows.map((r: any) => {
      return () =>
        reArrangeCycleService(r.customer_id.trim().toString(), r.store_id.trim().toString());
    });
    const processChargeResponse = await processInBatches(
      processChargePromiseArr,
      200,
      "reArrangeCycleService"
    );
    const successRearrangeRes = processChargeResponse
      .filter((process) => process.status === "fulfilled")
      .map((process) => process.value);
    const updateLocalDbPromiseArr = successRearrangeRes.map((charge: any) => {
      return () =>
        updateLocalDbStatus("completed", charge.customerID.toString());
    });
    await processInBatches(updateLocalDbPromiseArr, 200, "Update local db");

    res.json({ message: "reArrangeSubCycleController" });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};
