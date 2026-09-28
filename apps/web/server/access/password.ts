import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors";
import { password } from "../validation";

const params = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
let busy = false;

export async function hashPassword(input: unknown, salt: Buffer = randomBytes(16)):
Promise<{ salt: Buffer; hash: Buffer }> {
  const value = password(input);
  if (busy) throw new AppError("rate_limited", 429, 1);
  busy = true;
  try {
    const hash = await new Promise<Buffer>((resolve, reject) => {
      scryptCallback(value, salt, 64, params, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
    return { salt, hash };
  } finally { busy = false; }
}

export async function verifyPassword(input: unknown, stored: {
  password_algorithm: string; password_n: number; password_r: number; password_p: number;
  password_salt: Buffer; password_hash: Buffer;
}): Promise<boolean> {
  if (stored.password_algorithm !== "scrypt-v1" || stored.password_n !== params.N ||
      stored.password_r !== params.r || stored.password_p !== params.p ||
      stored.password_salt.length !== 16 || stored.password_hash.length !== 64) {
    throw new AppError("temporarily_unavailable", 503);
  }
  const result = await hashPassword(input, stored.password_salt);
  return timingSafeEqual(result.hash, stored.password_hash);
}
