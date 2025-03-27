export const updateMissingTransaction = () => {
  return `UPDATE missing_transaction_test_1 
  SET charge_query = ?,
  charge_event_query = ?,
  execution_status = ?
  WHERE customer_id = ? `;
};

export const updateMissingTransactionStatus = () => {
  return `UPDATE missing_transaction_test_1 
  SET execution_status = ?
  WHERE customer_id = ? `;
};

export const getMissingTransaction = (status: string) => {
  return `SELECT * FROM missing_transaction_test_1 WHERE execution_status = '${status}' limit 1`;
};
