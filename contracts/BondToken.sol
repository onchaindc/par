// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title BondToken
/// @notice Transferable, capped-supply bond token with checkpointed balances.
/// @dev Every balance movement writes a checkpoint, so `balanceOfAt` can answer historical ownership
/// questions for a record-date block without relying on snapshots, ERC-7540 or ERC-3643. The issuer
/// (holder of `MINTER_ROLE`) mints; nothing in this contract burns tokens.
contract BondToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("PAR_MINTER_ROLE");

    struct Checkpoint {
        uint256 blockNumber;
        uint256 balance;
    }

    /// @notice Maximum supply that can ever exist, in token base units (18 decimals).
    uint256 public immutable cap;

    mapping(address account => Checkpoint[]) private _balanceCheckpoints;
    Checkpoint[] private _supplyCheckpoints;

    event Minted(address indexed to, uint256 amount);

    error InvalidCap();
    error ZeroAddress();
    error CapExceeded(uint256 cap, uint256 attemptedSupply);
    error FutureBlockLookup(uint256 requestedBlock, uint256 currentBlock);

    constructor(string memory name_, string memory symbol_, address admin_, uint256 cap_)
        ERC20(name_, symbol_)
    {
        if (admin_ == address(0)) revert ZeroAddress();
        if (cap_ == 0) revert InvalidCap();
        cap = cap_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    /// @notice Mints new bond tokens. Supply can never exceed the immutable cap.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 newSupply = totalSupply() + amount;
        if (newSupply > cap) revert CapExceeded(cap, newSupply);
        _mint(to, amount);
        emit Minted(to, amount);
    }

    /// @notice Balance of `account` as it stood at the end of `blockNumber`.
    /// @dev `blockNumber` must be strictly in the past: the current block's balance is not final yet.
    function balanceOfAt(address account, uint256 blockNumber) public view returns (uint256) {
        if (blockNumber >= block.number) revert FutureBlockLookup(blockNumber, block.number);
        return _lookup(_balanceCheckpoints[account], blockNumber);
    }

    /// @notice Total supply as it stood at the end of `blockNumber`.
    function totalSupplyAt(uint256 blockNumber) public view returns (uint256) {
        if (blockNumber >= block.number) revert FutureBlockLookup(blockNumber, block.number);
        return _lookup(_supplyCheckpoints, blockNumber);
    }

    /// @notice Number of balance checkpoints recorded for `account`.
    function checkpointCount(address account) external view returns (uint256) {
        return _balanceCheckpoints[account].length;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (from != address(0)) {
            _writeCheckpoint(_balanceCheckpoints[from], balanceOf(from));
        }
        if (to != address(0)) {
            _writeCheckpoint(_balanceCheckpoints[to], balanceOf(to));
        }
        if (from == address(0) || to == address(0)) {
            _writeCheckpoint(_supplyCheckpoints, totalSupply());
        }
    }

    /// @dev Collapses multiple movements in one block into a single checkpoint holding the final balance.
    function _writeCheckpoint(Checkpoint[] storage checkpoints, uint256 newBalance) private {
        uint256 length = checkpoints.length;
        if (length != 0 && checkpoints[length - 1].blockNumber == block.number) {
            checkpoints[length - 1].balance = newBalance;
        } else {
            checkpoints.push(Checkpoint({blockNumber: block.number, balance: newBalance}));
        }
    }

    /// @dev Binary search for the last checkpoint at or before `blockNumber` (ERC-5805 style).
    function _lookup(Checkpoint[] storage checkpoints, uint256 blockNumber) private view returns (uint256) {
        uint256 low;
        uint256 high = checkpoints.length;
        while (low < high) {
            uint256 mid = (low + high) / 2;
            if (checkpoints[mid].blockNumber <= blockNumber) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        if (low == 0) return 0;
        return checkpoints[low - 1].balance;
    }
}
