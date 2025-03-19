import axios from "axios";
import qs from "qs";
import xml2js from "xml2js";
import {
  actionArrI,
  actionI,
  chargeEventI,
  chargeI,
  chargePayloadI,
  chargeResponseI,
  nmiResponseI,
  transactionI,
} from "../interface/missing_transaction.interface";
import cockroachPool from "../config/cockroach";
import {
  deleteChargeEvents,
  getBasicChargeData,
  getChargeByTransactionID,
  insertCharge,
  insertChargeEvents,
  insertChargeEventsBulk,
  insertChargesBulk,
  updateCharge,
} from "../query/pg/pg.query";
import {
  convertTimeStampToDateTime,
  statusMapping,
} from "../utils/missing_transaction.mapping";
import { v4 } from "uuid";
import { promises } from "dns";
import mySqlPool from "../config/mysql";
import { updateMissingTransaction } from "../query/mysql/mysql.query";

const nmiBaseUrl: string = process.env.NMI_BASE_URL
  ? process.env.NMI_BASE_URL
  : "https://secure.networkmerchants.com/api";

export const getFromNMITransactionService = async (
  email: string,
  securityKey: string
): Promise<chargePayloadI[]> => {
  try {
    // Fetch basic charge data
    const basicData = await cockroachPool.query(
      getBasicChargeData(email.toLowerCase())
    );
    const rowData = basicData.rows[0] || {}; // Prevents accessing undefined properties

    // Prepare request parameters
    const params = qs.stringify({ security_key: securityKey, email });
    const headers = {
      Accept: "application/xml",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Fetch transaction data from NMI
    const { data: xmlData } = await axios.post(
      `${nmiBaseUrl}/query.php`,
      params,
      { headers }
    );

    // Parse XML response
    const parser = new xml2js.Parser();
    const result: nmiResponseI = await parser.parseStringPromise(xmlData);

    if (!result?.nm_response?.transaction) {
      console.error("No transaction found");
      return [];
    }

    // Map transactions to chargePayload objects
    return result.nm_response.transaction.map((transaction: transactionI) => ({
      TransactionID: transaction.transaction_id?.[0] || "",
      ExternalProcessorID: transaction.processor_id?.[0] || "",
      AVSCode: transaction.avs_response?.[0] || "",
      CVVCode: transaction.cavv?.[0] || "",
      AuthCode: transaction.authorization_code?.[0] || "",
      CardBrand: transaction.cc_type?.[0] || "",
      ChannelID: rowData.channel_id || "",
      PaymentProfileID: rowData.payment_profile_id || "",
      StoreID: rowData.store_id || "",
      SubscriptionID: rowData.subscription_id || "",
      OriginalTransactionID: transaction.original_transaction_id?.[0] || "",
      Condition: transaction.condition?.[0] || "",
      action:
        transaction.action?.map((action: actionArrI) => ({
          amount: action.amount?.[0] || "",
          date: action.date?.[0] || "",
          action_type: action.action_type?.[0] || "",
          api_method: action.api_method?.[0] || "",
          batch_id: action.batch_id?.[0] || "",
          device_license_number: action.device_license_number?.[0] || "",
          device_nickname: action.device_nickname?.[0] || "",
          ip_address: action.ip_address?.[0] || "",
          processor_batch_id: action.processor_batch_id?.[0] || "",
          processor_response_code: action.processor_response_code?.[0] || "",
          processor_response_text: action.processor_response_text?.[0] || "",
          requested_amount: action.requested_amount?.[0] || "",
          response_code: action.response_code?.[0] || "",
          response_text: action.response_text?.[0] || "",
          source: action.source?.[0] || "",
          success: action.success?.[0] || "",
          tap_to_mobile: action.tap_to_mobile?.[0] || "",
          username: action.username?.[0] || "",
        })) || [],
    }));
  } catch (error) {
    console.error("Error in getFromNMITransactionService:", error);
    throw error;
  }
};

export const getDataFromChargeService = async (
  nmiResponses: chargePayloadI[]
): Promise<chargeResponseI[]> => {
  try {
    let chargesRes: chargeResponseI[] = [];
    const transactionIDList = nmiResponses.map((nmiResponse) => {
      return nmiResponse.TransactionID;
    });
    const charges = await cockroachPool.query(
      getChargeByTransactionID(`'${transactionIDList.join("', '")}'`)
    );
    // const notExistTransactionIDList = charges.rows.filter(
    //   (transactionID) => transactionID.isexist === false
    // );
    for (const [index, charge] of charges.rows.entries()) {
      if (!charge.isexist) {
        const nmiResponse: chargePayloadI = nmiResponses.filter(
          (data) => data.TransactionID === charge.t_id
        )[0];
        let isRefund = nmiResponse.action.find(
          (res: actionI) => res.action_type === "refund"
        );
        if (isRefund) {
          const chargeTransaction = charges.rows.find(
            (row) => row.t_id === nmiResponse.OriginalTransactionID
          );
          if (chargeTransaction) {
            if (
              chargeTransaction.status === "partial_refund" ||
              chargeTransaction.status === "refund"
            ) {
              continue;
            } else {
              let chargeEventList: chargeEventI[] = [];
              for (const action of nmiResponse.action) {
                if (statusMapping[action.action_type]) {
                  const actionDate = convertTimeStampToDateTime(
                    action.date
                  ).toISOString();
                  const chargeEvent: chargeEventI = {
                    id: v4(),
                    version: 0,
                    created_at: actionDate,
                    updated_at: actionDate,
                    amount: action.amount,
                    charge_id: chargeTransaction.id ? chargeTransaction.id : "",
                    details:
                      action.response_text !== "Approved"
                        ? action.response_text
                        : "",
                    event_time: actionDate,
                    kind:
                      action.response_text === "Approved"
                        ? statusMapping[action.action_type]
                        : statusMapping[`failed_${action.action_type}`],
                    trigger: "system",
                    transaction_id: nmiResponse.TransactionID,
                  };
                  chargeEventList.push(chargeEvent);
                  if (action.amount !== chargeTransaction.amount) {
                    await cockroachPool.query(
                      updateCharge(
                        chargeTransaction.id,
                        "partial_refund",
                        action.amount
                      )
                    );
                  } else {
                    await cockroachPool.query(
                      updateCharge(
                        chargeTransaction.id,
                        "refund",
                        action.amount
                      )
                    );
                  }
                }
              }
              chargesRes.push({
                chargeEvent: chargeEventList,
              });
            }
          }
        } else {
          let chargePayload: chargeI = {
            id: v4(),
            version: 0,
            amount: nmiResponse.action[0].amount,
            auth_code: nmiResponse.AuthCode,
            avs_code: nmiResponse.AVSCode,
            card_brand: nmiResponse.CardBrand,
            created_at: convertTimeStampToDateTime(
              nmiResponse.action[0].date
            ).toISOString(),
            cycle_number: String(0),
            ip_address: nmiResponse.action[0].ip_address,
            original_date: convertTimeStampToDateTime(
              nmiResponse.action[0].date
            ).toISOString(),
            parent_id: nmiResponse.SubscriptionID,
            channel_id: nmiResponse.ChannelID,
            payment_profile_id: nmiResponse.PaymentProfileID,
            store_id: nmiResponse.StoreID,
            status: "captured",
            transaction_id: nmiResponse.TransactionID,
            updated_at: convertTimeStampToDateTime(
              nmiResponse.action[nmiResponse.action.length - 1].date
            ).toISOString(),
            salvage_attempt: "0",
            cvv_code: nmiResponse.CVVCode,
            parent_kind: "subscription",
          };

          let chargeEventList: chargeEventI[] = [];
          for (const action of nmiResponse.action) {
            if (statusMapping[action.action_type]) {
              const actionDate = convertTimeStampToDateTime(
                action.date
              ).toISOString();
              const chargeEvent: chargeEventI = {
                id: v4(),
                version: 0,
                created_at: actionDate,
                updated_at: actionDate,
                amount: action.amount,
                charge_id: chargePayload.id ? chargePayload.id : "",
                details:
                  action.response_text !== "Approved"
                    ? action.response_text
                    : "",
                event_time: actionDate,
                kind:
                  action.response_text === "Approved"
                    ? statusMapping[action.action_type]
                    : statusMapping[`failed_${action.action_type}`],
                trigger: "system",
                transaction_id: nmiResponse.TransactionID,
              };
              chargePayload.failure_reason =
                action.response_text !== "Approved" ? action.response_text : "";
              chargePayload.status =
                action.response_text === "Approved"
                  ? statusMapping[action.action_type]
                  : statusMapping[`failed_${action.action_type}`];
              chargePayload.updated_at = actionDate;
              chargePayload.original_date = actionDate;
              chargeEventList.push(chargeEvent);
            }
          }
          console.log(index, chargePayload);
          const refundTransaction = nmiResponses.filter(
            (res) => res.OriginalTransactionID === chargePayload.transaction_id
          )[0];
          if (refundTransaction) {
            let chargeEventList: chargeEventI[] = [];
            for (const action of nmiResponse.action) {
              if (statusMapping[action.action_type]) {
                const actionDate = convertTimeStampToDateTime(
                  action.date
                ).toISOString();
                const chargeEvent: chargeEventI = {
                  id: v4(),
                  version: 0,
                  created_at: actionDate,
                  updated_at: actionDate,
                  amount: action.amount,
                  charge_id: chargePayload.id ? chargePayload.id : "",
                  details:
                    action.response_text !== "Approved"
                      ? action.response_text
                      : "",
                  event_time: actionDate,
                  kind:
                    action.response_text === "Approved"
                      ? statusMapping[action.action_type]
                      : statusMapping[`failed_${action.action_type}`],
                  trigger: "system",
                  transaction_id: nmiResponse.TransactionID,
                };
                chargeEventList.push(chargeEvent);
                if (action.amount !== chargePayload.amount) {
                  chargePayload.status = "partial_refund";
                  chargePayload.refunded_amount = action.amount;
                } else {
                  chargePayload.status = "refund";
                  chargePayload.refunded_amount = action.amount;
                }
              }
            }
          }
          chargesRes.push({
            charges: chargePayload,
            chargeEvent: chargeEventList,
          });
        }
      } else {
        const nmiResponse: chargePayloadI = nmiResponses.filter(
          (data) => data.TransactionID === charge.t_id
        )[0];
        if (
          charge.status !== "voided" &&
          nmiResponse.Condition === "canceled"
        ) {
          let chargeEventList: chargeEventI[] = [];
          await cockroachPool.query(deleteChargeEvents(charge.id));
          await cockroachPool.query(updateCharge(charge.id, "voided", "0.00"));
          for (const action of nmiResponse.action) {
            if (statusMapping[action.action_type]) {
              const actionDate = convertTimeStampToDateTime(
                action.date
              ).toISOString();
              const chargeEvent: chargeEventI = {
                id: v4(),
                version: 0,
                created_at: actionDate,
                updated_at: actionDate,
                amount: action.amount,
                charge_id: charge.id ? charge.id : "",
                details:
                  action.response_text !== "Approved"
                    ? action.response_text
                    : "",
                event_time: actionDate,
                kind:
                  action.response_text === "Approved"
                    ? statusMapping[action.action_type]
                    : statusMapping[`failed_${action.action_type}`],
                trigger: "system",
                transaction_id: nmiResponse.TransactionID,
              };
              chargeEventList.push(chargeEvent);
            }
          }
          chargesRes.push({
            chargeEvent: chargeEventList,
          });
        }
      }
    }
    return chargesRes;
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};

export const bulkInsertChargeService = async (charges: chargeResponseI[]) => {
  try {
    let chargeParams: chargeI[] = [];
    let chargeEventParams: chargeEventI[] = [];
    charges.forEach((charge: chargeResponseI) => {
      if (charge.charges) {
        chargeParams.push(charge.charges);
      }
      chargeEventParams = [...chargeEventParams, ...charge.chargeEvent];
    });
    const insertChargeQuery = insertChargesBulk(chargeParams);
    if (chargeParams.length > 0) {
      await cockroachPool.query(insertChargeQuery);
    }
    const insertChargeEventsQuery = insertChargeEventsBulk(chargeEventParams);
    if (chargeEventParams.length > 0) {
      await cockroachPool.query(insertChargeEventsQuery);
    }
    return [insertChargeQuery, insertChargeEventsQuery];
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};

export const updateLocalDb = async (
  charge: string,
  chargeEvent: string,
  row: any
) => {
  try {
    await mySqlPool
      .promise()
      .execute(updateMissingTransaction(), [charge, chargeEvent, row.id]);
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};
