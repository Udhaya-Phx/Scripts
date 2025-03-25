export const statusMapping: Record<string, string> = {
    sale: "captured",
    capture: "captured",
    auth: "authorized",
    void: "voided",
    refund: "refunded",
    failed_sale: "fail_capture",
    failed_auth: "fail_authorization",
    failed_capture: "fail_capture",
    failed_void: "fail_voided",
    failed_refund: "fail_refunded",
  };

export const convertTimeStampToDateTime = (timeStamp: string): Date => {
    const year = timeStamp.substring(0, 4);
const month = timeStamp.substring(4, 6);
const day = timeStamp.substring(6, 8);
const hours = timeStamp.substring(8, 10);
const minutes = timeStamp.substring(10, 12);
const seconds = timeStamp.substring(12, 14);

// Create a Date object
return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));