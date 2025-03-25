export interface nmiResponse {
  customer_id: string;
  transactions: chargePayloadI[];
}

export interface chargePayloadI {
  TransactionID: string;
  ExternalProcessorID: string;
  AVSCode: string;
  CVVCode: string;
  AuthCode: string;
  CardBrand: string;
  SubscriptionID: string;
  PaymentProfileID: string;
  StoreID: string;
  ChannelID: string;
  OriginalTransactionID?: string;
  Condition: string;
  action: actionI[];
}

export interface missingTransactionTableI {
  id: number;
  store_id: string;
  store_name: string;
  customer_id: string;
  customer_email: string;
  security_key: string;
  execution_status: string;
}

export interface nmiResponseI {
  data?: string;
  nm_response?: {
    transaction: transactionI[];
  };
  error_response: string[];
}

export interface transactionI {
  customer_id: string;
  transaction_id: string[];
  partial_payment_id: string[];
  partial_payment_balance: string[];
  platform_id: string[];
  transaction_type: string[];
  condition: string[];
  order_id: string[];
  authorization_code: string[];
  ponumber: string[];
  order_description: string[];
  original_transaction_id?: string[];
  first_name: string[];
  last_name: string[];
  address_1: string[];
  address_2: string[];
  company: string[];
  city: string[];
  state: string[];
  postal_code: string[];
  country: string[];
  email: string[];
  phone: string[];
  fax: string[];
  cell_phone: string[];
  customertaxid: string[];
  customerid: string[];
  website: string[];
  shipping_first_name: string[];
  shipping_last_name: string[];
  shipping_address_1: string[];
  shipping_address_2: string[];
  shipping_company: string[];
  shipping_city: string[];
  shipping_state: string[];
  shipping_postal_code: string[];
  shipping_country: string[];
  shipping_email: string[];
  shipping_carrier: string[];
  tracking_number: string[];
  shipping_date: string[];
  shipping: string[];
  shipping_phone: string[];
  cc_number: string[];
  cc_hash: string[];
  cc_exp: string[];
  cavv: string[];
  cavv_result: string[];
  xid: string[];
  eci: string[];
  directory_server_id: string[];
  three_ds_version: string[];
  avs_response: string[];
  csc_response: string[];
  cardholder_auth: string[];
  cc_start_date: string[];
  cc_issue_number: string[];
  check_account: string[];
  check_hash: string[];
  check_aba: string[];
  check_name: string[];
  account_holder_type: string[];
  account_type: string[];
  sec_code: string[];
  drivers_license_number: string[];
  drivers_license_state: string[];
  drivers_license_dob: string[];
  social_security_number: string[];
  processor_id: string[];
  tax: string[];
  currency: string[];
  surcharge: string[];
  convenience_fee: string[];
  misc_fee: string[];
  misc_fee_name: string[];
  cash_discount: string[];
  tip: string[];
  card_balance: string[];
  card_available_balance: string[];
  entry_mode: string[];
  merchant_defined_field: any[];
  cc_bin: string[];
  cc_type: string[];
  signature_image: string[];
  cof_supported: string[];
  stored_credential_indicator: string[];
  initiated_by: string[];
  duty_amount: string[];
  discount_amount: string[];
  national_tax_amount: string[];
  summary_commodity_code: string[];
  vat_tax_amount: string[];
  vat_tax_rate: string[];
  alternate_tax_amount: string[];
  action: actionArrI[];
}

export interface actionArrI {
  amount: string[];
  action_type: string[];
  date: string[];
  success: string[];
  ip_address: string[];
  source: string[];
  api_method: string[];
  tap_to_mobile: string[];
  username: string[];
  response_text: string[];
  batch_id: string[];
  processor_batch_id: string[];
  response_code: string[];
  processor_response_text: string[];
  processor_response_code: string[];
  requested_amount: string[];
  device_license_number: string[];
  device_nickname: string[];
}

export interface actionI {
  amount: string;
  action_type: string;
  date: string;
  success: string;
  ip_address: string;
  source: string;
  api_method: string;
  tap_to_mobile: string;
  username: string;
  response_text: string;
  batch_id: string;
  processor_batch_id: string;
  response_code: string;
  processor_response_text: string;
  processor_response_code: string;
  requested_amount: string;
  device_license_number: string;
  device_nickname: string;
}

export interface chargeEventI {
  id?: string;
  version?: number;
  event_time: string;
  charge_id: string;
  kind: string;
  trigger?: string;
  amount: string;
  details: string;
  transaction_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface chargeI {
  id?: string;
  version?: number;
  parent_id: string;
  parent_kind: string;
  payment_profile_id: string;
  store_id: string;
  transaction_id: string;
  amount: string;
  cycle_number: string;
  original_date: string;
  status: string;
  card_brand: string;
  created_at: string;
  updated_at: string;
  salvage_attempt: string;
  avs_code: string;
  cvv_code: string;
  ip_address: string;
  auth_code: string;
  channel_id: string;
  refunded_amount?: string | null;
  failure_reason?: string | null;
}

export interface chargeResponseI {
  customerID: string;
  charges?: chargeI;
  chargeEvent: chargeEventI[];
}
