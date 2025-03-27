import { v4 as uuid } from "uuid";
import {
  chargeEventI,
  chargeI,
} from "../../interface/missing_transaction.interface";

export const getChargeByTransactionID = (transactionIDs: string) => {
  return `
        WITH given_transactions AS (
    SELECT unnest(ARRAY[${transactionIDs}]) AS transaction_id
)
SELECT gt.transaction_id as t_id, 
       c.*, 
       CASE 
           WHEN c.transaction_id IS NOT NULL THEN TRUE 
           ELSE FALSE 
       END AS isExist
FROM given_transactions gt
LEFT JOIN charges c ON gt.transaction_id = c.transaction_id;
;
    `;
};

export const getChargeEventByChargeID = (chargeID: string) => {
  return `
        SELECT * FROM charge_events WHERE charge_id = '${chargeID}';
    `;
};

export const getSubDataByCustomerID = (customerID: string, storeID: string) => {
  return `
    select sub.id from subscriptions sub
    where sub.customer_id = '${customerID}' and sub.store_id = '${storeID}';  
  `
};

export const getChargeByCustomerID = (customerID: string, storeID: string) => {
  return `
        SELECT c.* FROM charges c
        join subscriptions sub on sub.id = c.parent_id 
        join customers cus on cus.id = sub.customer_id
        WHERE cus.id = '${customerID}' and cus.store_id = '${storeID}' order by c.original_date;
    `;
};

export const insertChargeEvents = (events: chargeEventI) => {
  return `
      INSERT INTO charge_events (
          id, 
          version, 
          event_time, 
          charge_id, 
          kind, 
          trigger, 
          amount, 
          details, 
          transaction_id,
          created_at, 
          updated_at
      ) VALUES (
          '${uuid()}',
          0,
          'to_timestamp(${events.event_time}/1000)',
          '${events.charge_id}',
          '${events.kind}',
          '${events.trigger}',
          '${events.amount}',
          '${events.details}',
          '${events.transaction_id}',
          'to_timestamp(${
            events.created_at ? events.created_at : Date.now()
          }/1000)',
          'to_timestamp(${
            events.updated_at ? events.updated_at : Date.now()
          }/1000)'
      );
      `;
};

export const insertCharge = (charge: chargeI) => {
  return `
        INSERT INTO charges (
    id, version, parent_id, parent_kind, payment_profile_id, store_id, transaction_id,
    amount, cycle_number, original_date, status, card_brand, created_at, updated_at,
    salvage_attempt, avs_code, cvv_code, ip_address, auth_code, channel_id
) VALUES (
    ${uuid()},
    0,
    '${charge.parent_id}',
    '${charge.parent_kind}',
    '${charge.payment_profile_id}',
    '${charge.store_id}',
    '${charge.transaction_id}',
    '${charge.amount}',
    '${charge.cycle_number}',
    'to_timestamp(${charge.original_date}/1000)',
    '${charge.status}',
    '${charge.card_brand}',
    'to_timestamp(${charge.created_at}/1000)',
    'to_timestamp(${charge.updated_at}/1000)',
    '${charge.salvage_attempt}',
    '${charge.avs_code}',
    '${charge.cvv_code}',
    '${charge.ip_address}',
    '${charge.auth_code}',
    '${charge.channel_id}'
);
    `;
};

export const insertChargeEventsBulk = (events: chargeEventI[]) => {
  if (events.length === 0) return "";
  return `
    INSERT INTO charge_events (
    id, 
    version, 
    event_time, 
    charge_id, 
    kind, 
    trigger, 
    amount, 
    details, 
    transaction_id,
    created_at, 
    updated_at
) VALUES 
    ${events
      .map(
        (event) => `(
          '${event.id}',
          ${event.version},
          '${event.event_time}'::TIMESTAMPTZ,
          '${event.charge_id}',
          '${event.kind}',
          '${event.trigger}',
          '${event.amount}',
          '${event.details}',
          '${event.transaction_id}',
          '${event.created_at ? event.created_at : Date.now()}'::TIMESTAMPTZ,
          '${event.updated_at ? event.updated_at : Date.now()}'::TIMESTAMPTZ
        )`
      )
      .join(",\n")};
  `;
};

export const insertChargesBulk = (charges: chargeI[]) => {
  if (charges.length === 0) return ""; // Handle empty array case

  const values = charges
    .map(
      (charge) => `
        (
          '${charge.id}',
          ${charge.version},
          '${charge.parent_id}',
          '${charge.parent_kind}',
          '${charge.payment_profile_id}',
          '${charge.store_id}',
          '${charge.transaction_id}',
          '${charge.amount}',
          '${charge.cycle_number}',
          '${charge.original_date}'::TIMESTAMPTZ,
          '${charge.status}',
          '${charge.card_brand}',
          '${charge.created_at}'::TIMESTAMPTZ,
          '${charge.updated_at}'::TIMESTAMPTZ,
          '${charge.salvage_attempt}',
          '${charge.avs_code}',
          '${charge.cvv_code}',
          '${charge.ip_address}',
          '${charge.auth_code}',
          '${charge.channel_id}',
          '${charge.refunded_amount ? charge.refunded_amount : 0.0}',
          '${charge.failure_reason}'
        )`
    )
    .join(",");

  return `
    INSERT INTO charges (
      id, version, parent_id, parent_kind, payment_profile_id, store_id, transaction_id,
      amount, cycle_number, original_date, status, card_brand, created_at, updated_at,
      salvage_attempt, avs_code, cvv_code, ip_address, auth_code, channel_id, refunded_amount, failure_reason
    ) VALUES ${values};
  `;
};

export const getBasicChargeData = (cusID: string, storeID: string) => {
  return `
        select sub.id as subscription_id, sub.payment_profile_id, sub.store_id, sub.channel_id from customers cus
        join subscriptions sub on sub.customer_id = cus.id 
        where cus.id = '${cusID}' and cus.store_id = '${storeID}';
    `;
};

export const deleteChargeEvents = (chargeID: string) => {
  return `
        DELETE FROM charge_events WHERE charge_id = '${chargeID}';
    `;
};

export const updateCharge = (
  chargeID: string,
  status: string,
  refundedAmount: string
) => {
  return `
        UPDATE charges SET status = '${status}',
        refunded_amount = '${refundedAmount}' WHERE id = '${chargeID}';
    `;
};

export const updateSubscriptionCycle = (cusID: string, storeID: string, cycle: string) => {
  return `
        UPDATE subscriptions SET current_cycle = '${cycle}' WHERE customer_id = '${cusID}' and store_id = '${storeID}';
    `;
}

export const updateChargeCycle = (chargeList: string) => {
  return `
    with updated_charges as (
    select 
    t ->> 'id' as id,
    t ->> 'cycle_number' as cycle_number,
    t ->> 'original_date' as original_date
    from jsonb_array_elements('${chargeList}'::jsonb) t
    )
    update charges c
    set cycle_number = uc.cycle_number::int
    from updated_charges uc
    where c.id = uc.id;
  `
} 
