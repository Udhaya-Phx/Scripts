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
  nmiResponse,
  nmiResponseI,
  transactionI,
} from "../interface/missing_transaction.interface";
import cockroachPool from "../config/cockroach";
import {
  deleteChargeEvents,
  getBasicChargeData,
  getChargeByCustomerID,
  getChargeByTransactionID,
  getSubDataByCustomerID,
  insertCharge,
  insertChargeEvents,
  insertChargeEventsBulk,
  insertChargesBulk,
  updateCharge,
  updateChargeCycle,
  updateSubscriptionCycle,
} from "../query/pg/pg.query";
import {
  convertTimeStampToDateTime,
  sleep,
  statusMapping,
} from "../utils/missing_transaction.mapping";
import { v4 } from "uuid";
import { promises } from "dns";
import mySqlPool from "../config/mysql";
import {
  updateMissingTransaction,
  updateMissingTransactionStatus,
} from "../query/mysql/mysql.query";

const nmiBaseUrl: string = process.env.NMI_BASE_URL
  ? process.env.NMI_BASE_URL
  : "https://secure.networkmerchants.com/api";

export const getFromNMITransactionService = async (
  email: string,
  securityKey: string,
  customer_id: string,
  storeID: string
): Promise<nmiResponse> => {
  try {
    // Fetch basic charge data
    const basicData = await cockroachPool.query(
      getBasicChargeData(customer_id.trim().toLowerCase(), storeID.trim())
    );
    const rowData = basicData.rows[0]; // Prevents accessing undefined properties
    if (rowData) {
      const params = qs.stringify({
        security_key: securityKey.trim(),
        email: email.trim().toLowerCase(),
      });
      const headers = {
        Accept: "application/xml",
        "Content-Type": "application/x-www-form-urlencoded",
      };
      await sleep(10000);

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
        console.error("No transaction found", email);
        return { store_id: storeID, customer_id: customer_id, transactions: [] };
      }

      // Map transactions to chargePayload objects
      return {
        store_id: storeID,
        customer_id: customer_id,
        transactions: result.nm_response.transaction.map(
          (transaction: transactionI) => ({
            customer_id: customer_id,
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
            OriginalTransactionID:
              transaction.original_transaction_id?.[0] || "",
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
                processor_response_code:
                  action.processor_response_code?.[0] || "",
                processor_response_text:
                  action.processor_response_text?.[0] || "",
                requested_amount: action.requested_amount?.[0] || "",
                response_code: action.response_code?.[0] || "",
                response_text: action.response_text?.[0] || "",
                source: action.source?.[0] || "",
                success: action.success?.[0] || "",
                tap_to_mobile: action.tap_to_mobile?.[0] || "",
                username: action.username?.[0] || "",
              })) || [],
          })
        ),
      };
    } else {
      return { store_id: storeID, customer_id: customer_id, transactions: [] };
    }
    // Prepare request parameters
  } catch (error) {
    console.error("Error in getFromNMITransactionService:", error);
    throw error;
  }
};

export const getDataFromChargeService = async (
  nmiResponses: chargePayloadI[],
  cusID: string,
  storeID: string
): Promise<{
  customerID: string;
  charge: chargeResponseI[];
}> => {
  try {
    let chargesRes: chargeResponseI[] = [];
    let isSale: boolean = false;
    const transactionIDList = nmiResponses.map((nmiResponse) => {
      return nmiResponse.TransactionID;
    });
    const charges = await cockroachPool.query(
      getChargeByTransactionID(`'${transactionIDList.join("', '")}'`)
    );
    // const notExistTransactionIDList = charges.rows.filter(
    //   (transactionID) => transactionID.isexist === false
    // );
    charges.rows = await checkTransactionIDNotExistInCRM(
      charges.rows,
      nmiResponses,
      cusID,
      storeID
    );

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
          if (chargeTransaction.status) {
            if (
              chargeTransaction.status === "partial_refund" ||
              chargeTransaction.status === "refunded"
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
                    amount: action.amount.split("-")[1],
                    charge_id: chargeTransaction.id ? chargeTransaction.id : "",
                    details:
                      action.response_text.toLocaleLowerCase() !== "approved" &&
                      action.response_text.toLocaleLowerCase() !== "success"
                        ? action.response_text
                        : "",
                    event_time: actionDate,
                    kind:
                      action.response_text.toLocaleLowerCase() === "approved" ||
                      action.response_text.toLocaleLowerCase() === "success"
                        ? statusMapping[action.action_type]
                        : action.action_type === "void"
                        ? statusMapping[action.action_type]
                        : statusMapping[`failed_${action.action_type}`],
                    trigger: "system",
                    transaction_id: nmiResponse.TransactionID,
                  };
                  chargeEventList.push(chargeEvent);
                  if (
                    action.amount.split("-")[1] !== chargeTransaction.amount
                  ) {
                    await cockroachPool.query(
                      updateCharge(
                        chargeTransaction.id,
                        "partial_refund",
                        action.amount.split("-")[1]
                      )
                    );
                  } else {
                    await cockroachPool.query(
                      updateCharge(
                        chargeTransaction.id,
                        "refunded",
                        action.amount.split("-")[1]
                      )
                    );
                  }
                }
              }
              chargesRes.push({
                customerID: cusID,
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
          let isSale = false;
          for (const action of nmiResponse.action) {
            if (statusMapping[action.action_type]) {
              if (action.action_type === "sale") {
                isSale = true;
                break;
              }
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
                  action.response_text.toLocaleLowerCase() !== "approved" &&
                  action.response_text.toLocaleLowerCase() !== "success"
                    ? action.response_text
                    : "",
                event_time: actionDate,
                kind:
                  action.response_text.toLocaleLowerCase() === "approved" ||
                  action.response_text.toLocaleLowerCase() === "success"
                    ? statusMapping[action.action_type]
                    : statusMapping[`failed_${action.action_type}`],
                trigger: "system",
                transaction_id: nmiResponse.TransactionID,
              };
              chargePayload.failure_reason =
                action.response_text.toLocaleLowerCase() !== "approved" &&
                action.response_text.toLocaleLowerCase() !== "success"
                  ? action.response_text
                  : "";
              chargePayload.status =
                action.response_text.toLocaleLowerCase() === "approved" ||
                action.response_text.toLocaleLowerCase() === "success"
                  ? statusMapping[action.action_type]
                  : statusMapping[`failed_${action.action_type}`];
              chargePayload.updated_at = actionDate;
              chargePayload.original_date = actionDate;
              chargeEventList.push(chargeEvent);
            }
          }
          console.log(index);
          const refundTransaction = nmiResponses.filter(
            (res) => res.OriginalTransactionID === chargePayload.transaction_id
          )[0];
          if (refundTransaction) {
            let chargeEventList: chargeEventI[] = [];
            for (const action of refundTransaction.action) {
              if (statusMapping[action.action_type]) {
                const actionDate = convertTimeStampToDateTime(
                  action.date
                ).toISOString();
                const chargeEvent: chargeEventI = {
                  id: v4(),
                  version: 0,
                  created_at: actionDate,
                  updated_at: actionDate,
                  amount: action.amount.split("-")[1],
                  charge_id: chargePayload.id ? chargePayload.id : "",
                  details:
                    action.response_text.toLocaleLowerCase() !== "approved" &&
                    action.response_text.toLocaleLowerCase() !== "success"
                      ? action.response_text
                      : "",
                  event_time: actionDate,
                  kind:
                    action.response_text.toLocaleLowerCase() === "approved" ||
                    action.response_text.toLocaleLowerCase() === "success"
                      ? statusMapping[action.action_type]
                      : statusMapping[`failed_${action.action_type}`],
                  trigger: "system",
                  transaction_id: nmiResponse.TransactionID,
                };
                chargeEventList.push(chargeEvent);
                if (
                  action.amount.split("-")[1] !== chargePayload.amount &&
                  action.action_type === "refund"
                ) {
                  chargePayload.status = "partial_refund";
                  chargePayload.refunded_amount = action.amount.split("-")[1];
                } else {
                  chargePayload.status = "refunded";
                  chargePayload.refunded_amount = action.amount.split("-")[1];
                }
              }
            }
          }
          if (!isSale) {
            chargesRes.push({
              customerID: cusID,
              charges: chargePayload,
              chargeEvent: chargeEventList,
            });
          }
        }
      } else {
        const nmiResponse: chargePayloadI = nmiResponses.filter(
          (data) => data.TransactionID === charge.t_id
        )[0];
        if (
          (charge.status !== "voided" &&
            nmiResponse.Condition === "canceled") ||
          (charge.status !== "captured" &&
            charge.status !== "partial_refund" &&
            charge.status !== "refunded" &&
            nmiResponse.Condition === "complete") ||
          (charge.status !== "authorized" &&
            nmiResponse.Condition === "pending")
        ) {
          let chargeEventList: chargeEventI[] = [];
          await cockroachPool.query(deleteChargeEvents(charge.id));
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
                  action.response_text.toLocaleLowerCase() !== "approved" &&
                  action.response_text.toLocaleLowerCase() !== "success"
                    ? action.response_text
                    : "",
                event_time: actionDate,
                kind:
                  action.response_text.toLocaleLowerCase() === "approved" ||
                  action.response_text.toLocaleLowerCase() === "success"
                    ? statusMapping[action.action_type]
                    : statusMapping[`failed_${action.action_type}`],
                trigger: "system",
                transaction_id: nmiResponse.TransactionID,
              };
              await cockroachPool.query(
                updateCharge(charge.id, chargeEvent.kind, "0.00")
              );
              chargeEventList.push(chargeEvent);
            }
          }
          chargesRes.push({
            customerID: cusID,
            chargeEvent: chargeEventList,
          });
        } else {
          chargesRes.push({
            customerID: cusID,
            chargeEvent: [],
          });
        }
      }
    }
    return {
      customerID: cusID,
      charge: chargesRes,
    };
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};

export const bulkInsertChargeService = async (charges: chargeResponseI[]) => {
  try {
    let chargeParams: chargeI[] = [];
    let chargeEventParams: chargeEventI[] = [];
    let insertChargeQuery = "";
    let insertChargeEventsQuery = "";
    let cusID = "";
    charges.forEach((charge: chargeResponseI) => {
      if (charge.charges) {
        chargeParams.push(charge.charges);
      }
      chargeEventParams = [...chargeEventParams, ...charge.chargeEvent];
      cusID = charge.customerID;
    });
    try {
      insertChargeQuery = insertChargesBulk(chargeParams);
      if (chargeParams.length > 0) {
        await cockroachPool.query(insertChargeQuery);
      }
      insertChargeEventsQuery = insertChargeEventsBulk(chargeEventParams);
      if (chargeEventParams.length > 0) {
        await cockroachPool.query(insertChargeEventsQuery);
      }
    } catch (error: any) {
      if (
        error.message !==
        'duplicate key value violates unique constraint "charges_pkey"'
      ) {
        throw error;
      }
    }
    return [insertChargeQuery, insertChargeEventsQuery, cusID];
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};

export const updateLocalDb = async (
  charge: string,
  chargeEvent: string,
  status: string,
  customer_id: string
) => {
  try {
    const data = await mySqlPool
      .promise()
      .execute(updateMissingTransaction(), [
        charge,
        chargeEvent,
        status,
        customer_id,
      ]);
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};

export const updateLocalDbStatus = async (
  status: string,
  customer_id: string
) => {
  try {
    const data = await mySqlPool
      .promise()
      .execute(updateMissingTransactionStatus(), [status, customer_id]);
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};

export const checkTransactionIDNotExistInCRM = async (
  charges: any[],
  nmiResponses: chargePayloadI[],
  cusID: string,
  storeID: string
) => {
  let chargeData = await cockroachPool.query(
    getChargeByCustomerID(cusID, storeID)
  );

  let triggeredDate = "";
  let reason = "";
  let charge = chargeData.rows.filter((charge) => charge.transaction_id === "");
  charge.forEach((data) => {
    data.original_date = data.original_date.toISOString().split("T")[0];
    nmiResponses.forEach((nmiResponse) => {
      for (let i = nmiResponse.action.length - 1; i >= 0; i--) {
        if (
          statusMapping[nmiResponse.action[i].action_type] === "authorized" ||
          nmiResponse.action[i].action_type === "sale"
        ) {
          triggeredDate = nmiResponse.action[i].date;
          reason = nmiResponse.action[i].response_text;
          break;
        }
      }
      const isISODateFormat = (date: string): boolean => {
        return /^\d{4}-\d{2}-\d{2}$/.test(date);
      };

      const isTimestampFormat = (date: string): boolean => {
        return /^\d{14}$/.test(date); // Matches YYYYMMDDHHMMSSS
      };
      if (isTimestampFormat(triggeredDate)) {
        triggeredDate = convertTimeStampToDateTime(triggeredDate)
          .toISOString()
          .split("T")[0];
      }
      if (
        data.failure_reason === reason &&
        data.original_date == triggeredDate
      ) {
        charges = charges.filter(
          (charge) => charge.t_id !== nmiResponse.TransactionID
        );
      }
    });
  });
  return charges;
};

export const reArrangeCycleService = async (
  customerID: string,
  storeID: string
): Promise<{ customerID: string; chargeList: chargeI[] }> => {
  try {
    const chargeData = await cockroachPool.query(
      getChargeByCustomerID(customerID, storeID)
    );
    let count = 1;
    let updatedCharge = chargeData.rows.map((charge: chargeI) => {
      if (
        charge.status !== "fail_authorization" &&
        charge.status !== "fail_capture" &&
        charge.parent_kind === "subscription"
      ) {
        charge.cycle_number = count.toString();
        count++;
      } else if (charge.parent_kind === "purchase") {
        charge.cycle_number = "0";
      } else {
        charge.cycle_number = count.toString();
      }
      return charge;
    });
    if (updatedCharge.length > 0) {
      if (
        updatedCharge[updatedCharge.length - 1].status ===
          "fail_authorization" ||
        updatedCharge[updatedCharge.length - 1].status === "fail_capture"
      ) {
        await cockroachPool.query(
          updateSubscriptionCycle(
            customerID,
            storeID,
            (
              Number(updatedCharge[updatedCharge.length - 1].cycle_number) - 1
            ).toString()
          )
        );
      } else {
        await cockroachPool.query(
          updateSubscriptionCycle(
            customerID,
            storeID,
            updatedCharge[updatedCharge.length - 1].cycle_number
          )
        );
      }
      await cockroachPool.query(
        updateChargeCycle(JSON.stringify(updatedCharge))
      );
    }

    return {
      customerID: customerID,
      chargeList: updatedCharge,
    };
  } catch (error: any) {
    console.log(error);
    throw error;
  }
};
