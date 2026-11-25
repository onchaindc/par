import { createPublicClient, http, pad, sliceHex } from "viem";
import { PQC_KEY_STATUS, qoreChain } from "../config";

export const publicClient = createPublicClient({
  chain: qoreChain,
  transport: http(qoreChain.rpcUrls.default.http[0], { timeout: 20_000 }),
});

export type PqcKeyStatus = {
  registered: boolean;
  algorithmId: number;
  possessionProven: boolean;
  publicKeyBytes: number;
  publicKeyHex: string;
  responseBytes: number;
};

const KEY_STATUS_SELECTOR = "0x850dfe51";

/**
 * Reads QoreChain's pqcKeyStatus precompile (0x0A02) and decodes the four-field
 * response required by PqcIssuerAuthorizer: registered, algorithm, pubkey, possession.
 */
export async function readPqcKeyStatus(address: `0x${string}`): Promise<PqcKeyStatus | null> {
  try {
    const result = await publicClient.call({
      to: PQC_KEY_STATUS,
      data: `${KEY_STATUS_SELECTOR}${pad(address, { size: 32 }).slice(2)}`,
    });
    const hex = result.data ?? "0x";
    const bytes = (hex.length - 2) / 2;
    if (bytes < 160) return null;
    const publicKeyBytes = Number(BigInt(sliceHex(hex, 128, 160)));
    // The response is a 160-byte header (5 words) followed by the raw public key.
    // `sliceHex` operates on bytes and already accounts for the "0x" prefix.
    const keyEnd = 160 + publicKeyBytes;
    return {
      registered: BigInt(sliceHex(hex, 0, 32)) === 1n,
      algorithmId: Number(BigInt(sliceHex(hex, 32, 64))),
      possessionProven: BigInt(sliceHex(hex, 96, 128)) === 1n,
      publicKeyBytes,
      publicKeyHex: bytes >= keyEnd ? sliceHex(hex, 160, keyEnd) : "0x",
      responseBytes: bytes,
    };
  } catch {
    return null;
  }
}

export async function fingerprintHex(hex: string): Promise<string | null> {
  if (!hex || hex === "0x") return null;
  try {
    const bytes = new Uint8Array((hex.length - 2) / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function normaliseSignature(input: string): `0x${string}` | null {
  const trimmed = input.trim().replace(/\s+/g, "");
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{9254}$/.test(withPrefix)) return null;
  return withPrefix as `0x${string}`;
}
