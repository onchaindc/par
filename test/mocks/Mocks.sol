// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Local test double for the QoreChain `pqcKeyStatus` precompile (0x0A02). Etched at the real
/// address in tests. It does not implement any cryptography.
contract MockPqcKeyStatus {
    bool public registered;
    uint8 public algorithmId;
    bytes public pubkey;
    bool public possessionProven;

    function setKey(bool registered_, uint8 algorithmId_, bytes calldata pubkey_, bool possessionProven_)
        external
    {
        registered = registered_;
        algorithmId = algorithmId_;
        pubkey = pubkey_;
        possessionProven = possessionProven_;
    }

    function pqcKeyStatus(address)
        external
        view
        returns (bool registered_, uint8 algorithmId_, bytes memory pubkey_, bool possessionProven_)
    {
        return (registered, algorithmId, pubkey, possessionProven);
    }
}

/// @dev Three-field variant shown in the QoreChain docs, used to prove the tolerant decoder.
contract MockPqcKeyStatusLegacy {
    function pqcKeyStatus(address) external pure returns (bool, uint8, bytes memory) {
        return (true, 1, new bytes(2592));
    }
}

/// @dev Returns garbage, to check that malformed precompile answers fail closed.
contract MockPqcKeyStatusMalformed {
    fallback() external {
        assembly {
            mstore(0, 0xdeadbeef)
            return(0, 32)
        }
    }
}

/// @dev Local test double for the QoreChain `pqcVerify` precompile (0x0A01). It can be told to accept
/// or reject, and optionally to reject any message other than an expected one. It performs no
/// ML-DSA-87 verification; real cryptography is only exercised on QoreChain.
contract MockPqcVerify {
    bool public result = true;
    bool public checksMessage;
    bytes32 public expectedMessageHash;

    function setResult(bool result_) external {
        result = result_;
    }

    function expectMessage(bytes calldata message) external {
        checksMessage = true;
        expectedMessageHash = keccak256(message);
    }

    function pqcVerify(bytes calldata, bytes calldata, bytes calldata message) external view returns (bool) {
        if (!result) return false;
        if (checksMessage && keccak256(message) != expectedMessageHash) return false;
        return true;
    }
}

/// @dev Returns no data, to check that the authorizer fails closed on a malformed verify answer.
contract MockPqcVerifyMalformed {
    fallback() external {}
}

/// @dev Returns a 32-byte word that is not the ABI boolean 0 or 1.
contract MockPqcVerifyNonBool {
    fallback() external {
        assembly {
            mstore(0, 2)
            return(0, 32)
        }
    }
}

/// @dev Reverts instead of answering, to check fail-closed behaviour.
contract MockPqcVerifyReverting {
    fallback() external {
        revert("verification unavailable");
    }
}

/// @dev Settlement token used in tests (6 decimals, mintable).
contract TestERC20 is ERC20 {
    constructor() ERC20("Test USD", "TUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Token that re-enters the servicing contract while a payment is being transferred.
contract ReentrantERC20 is TestERC20 {
    address public target;
    bytes public payload;
    bool public armed;

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed) {
            armed = false;
            (bool ok, bytes memory ret) = target.call(payload);
            if (!ok) {
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
    }
}
