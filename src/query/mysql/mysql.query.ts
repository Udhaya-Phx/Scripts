export const updateMissingTransaction = () => {
  return `UPDATE missing_transaction 
  SET charge_query = ?,
  charge_event_query = ?,
  execution_status = ?
  WHERE id = ? `;
};


export const getMissingTransaction = (status: string) =>{
    return `SELECT * FROM missing_transaction WHERE execution_status = '${status}'`
}