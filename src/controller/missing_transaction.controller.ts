import { Request, Response } from "express";
import {
    bulkInsertChargeService,
  getDataFromChargeService,
  getFromNMITransactionService,
  updateLocalDb,
} from "../services/missing_transaction.service";
import mySqlPool from "../config/mysql";
import {
  chargeEventI,
  chargeI,
  chargePayloadI,
  chargeResponseI,
  missingTransactionTableI,
} from "../interface/missing_transaction.interface";
import { getMissingTransaction } from "../query/mysql/mysql.query";

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
    let chargePayloadList: chargeResponseI[] =
      [];
    for (const [index, row] of rows.entries()) {
      console.log(`${index+1}/${rows.length} => start`);
      const nmiResponse = await getFromNMITransactionService(
        row.customer_email.toString(),
        row.security_key.toString()
      );
      console.log(row);
      if (nmiResponse.length> 0) {
        chargePayloadList = [...chargePayloadList, ...await getDataFromChargeService(nmiResponse, row.customer_id.toString())];
        let params = await bulkInsertChargeService(chargePayloadList);
        updateLocalDb(params[0], params[1], row);
      }
      else {
        throw new Error("No data found");
      }
      console.log(`${index+1}/${rows.length} => completed`);
    }
    res.json(chargePayloadList);
  } catch (error:any) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};
