import { factory } from "ulid";

const prng = () => {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error("Web Crypto API is not available for ULID generation");
  }
  const buffer = new Uint8Array(1);
  cryptoObj.getRandomValues(buffer);
  return buffer[0] / 0xff;
};

export const ulid = factory(prng);
