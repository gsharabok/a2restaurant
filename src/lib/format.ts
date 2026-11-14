const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export const formatPrice = (value: number) => gbp.format(value);
