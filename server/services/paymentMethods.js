export const PAYMENT_METHOD_ERROR = "Payment method must be Cash or GCash.";

const allowedPaymentMethods = new Set(["Cash", "GCash"]);

export function isAllowedPaymentMethod(method) {
  return allowedPaymentMethods.has(method);
}