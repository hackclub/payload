// outside env.ts so proxy.ts doesn't load the whole env schema
export const fionaOrigins = (process.env.FIONA_ORIGINS ?? "https://ds2.shipwrights.dev,https://ds.shipwrights.dev")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
