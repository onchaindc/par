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
  deadline: 1_893_456_000n, // 2030-01-01T00:00:00Z
};

const MESSAGE_TYPES = [
  "bytes32", // domain
  "uint256", // chain id
  "address", // servicing contract
  "address", // bond token
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
    "0x266c8e516dacb848a2b62b8970803d4d32aeea66d0409f251fe9e8d8671dcbfe",
  redemptionDeclaration:
    "0xc71335b4e6766c5b4c61a0831c0f75c07caf0e1b8bbc7a46f3ede2a4335f78b4",
};

export function buildMessage(entry, sample = SAMPLE) {
  const paramsHash = keccak256(abi.encode(entry.params.types, entry.params.values));
  const message = abi.encode(
    MESSAGE_TYPES,
    [DOMAIN, sample.chainId, sample.servicing, sample.bond, entry.action, entry.nonce, sample.deadline, paramsHash],
  );
  return { message, paramsHash };
}
