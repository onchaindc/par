// The Solidity-matched PAR authorization fixture.
//
// test/AuthorizationMessage.t.sol pins the same two hashes. Keeping the
// encoding here means the offline signing check and the issuer authorization
// script cannot silently drift from each other or from the contract.

import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";

export const DOMAIN = keccak256(toUtf8Bytes("PAR_BOND_AUTHORIZATION_V1"));
const abi = AbiCoder.defaultAbiCoder();

export const SAMPLE = {
  chainId: 9800n,
  servicing: "0x1111111111111111111111111111111111111111",
  bond: "0x2222222222222222222222222222222222222222",
  pqcIssuer: "0x3333333333333333333333333333333333333333",
  deadline: 1_893_456_000n, // 2030-01-01T00:00:00Z
};

const MESSAGE_TYPES = [
  "bytes32", // domain
  "uint256", // chain id
  "address", // servicing contract
  "address", // bond token
  "address", // PQC issuer identity
  "bytes32", // action type
  "uint256", // authorization nonce
  "uint64", // deadline
  "bytes32", // parameters hash
];

export const COUPON_FIXTURE = {
  name: "couponFinalization",
  nonce: 7n,
  action: keccak256(toUtf8Bytes("PAR_ACTION_FINALIZE_COUPON_V1")),
  params: {
    types: ["uint256", "uint64", "uint128", "uint256", "uint64"],
    values: [0n, 100n, 2_500_000n, 3_750_000_000n, SAMPLE.deadline],
  },
};

export const REDEMPTION_FIXTURE = {
  name: "redemptionDeclaration",
  nonce: 8n,
  action: keccak256(toUtf8Bytes("PAR_ACTION_DECLARE_REDEMPTION_V1")),
  params: {
    types: ["uint64", "uint128", "uint256", "uint64"],
    values: [100n, 100_000_000n, 150_000_000_000n, SAMPLE.deadline],
  },
};

export const EXPECTED_HASHES = {
  couponFinalization:
    "0x8d6e46e9e47b137f08d8c9f87e4ad07bb4a36a2bf61c592bb523811157ae2ad4",
  redemptionDeclaration:
    "0x5372e6d0029d5b89b30fd81209f69d2ec9ac958c8380d0c093eb962237fdc1cd",
};

export function buildMessage(entry, sample = SAMPLE) {
  const paramsHash = keccak256(abi.encode(entry.params.types, entry.params.values));
  const message = abi.encode(
    MESSAGE_TYPES,
    [
      DOMAIN,
      sample.chainId,
      sample.servicing,
      sample.bond,
      sample.pqcIssuer,
      entry.action,
      entry.nonce,
      sample.deadline,
      paramsHash,
    ],
  );
  return { message, paramsHash };
}
