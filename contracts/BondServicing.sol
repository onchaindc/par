// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BondToken} from "./BondToken.sol";
import {AuthorizationMessage} from "./lib/AuthorizationMessage.sol";
import {IIssuerAuthorizer} from "./interfaces/IIssuerAuthorizer.sol";

/// @title BondServicing
/// @notice Coupon and principal servicing for one bond issue.
/// @dev Entitlements are pull-based: each investor's claim is derived from the bond token's
/// checkpointed balance at a period's record-date block, so no holder list is stored on chain.
/// Sensitive issuer actions (`finalizeCoupon`, `declareRedemption`) require both the `ISSUER_ROLE` and
/// a fresh ML-DSA-87 signature over an action-bound message checked by 0x0A01.
/// @dev Two distinct identities are involved and deliberately separated:
/// - the *operational issuer* is an ordinary EVM account holding `DEFAULT_ADMIN_ROLE` and
///   `ISSUER_ROLE`; it submits the transaction and pays for it;
/// - the *PQC issuer* is the account whose ML-DSA-87 key is registered in `authorizer`; it signs the
///   action message off chain with its post-quantum key and never needs an EVM transaction.
/// Any account holding `ISSUER_ROLE` can relay a valid PQC-signed action, so the signing identity and
/// the transaction sender do not have to be the same address.
contract BondServicing is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ISSUER_ROLE = keccak256("PAR_ISSUER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("PAR_TREASURER_ROLE");

    bytes32 public constant ACTION_FINALIZE_COUPON = keccak256("PAR_ACTION_FINALIZE_COUPON_V1");
    bytes32 public constant ACTION_DECLARE_REDEMPTION = keccak256("PAR_ACTION_DECLARE_REDEMPTION_V1");

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant TOKEN_UNIT = 1e18;

    /// @notice Immutable terms of the bond issue.
    /// @param paymentToken ERC-20 used for coupons and principal.
    /// @param maturity Unix timestamp at which principal may be redeemed.
    /// @param couponRateBps Annual coupon rate in basis points.
    /// @param paymentsPerYear Coupon frequency. Must divide 12 (1, 2, 3, 4, 6 or 12).
    /// @param faceValuePerToken Principal per 1e18 bond token base units, in payment-token base units.
    struct BondTerms {
        address paymentToken;
        uint64 maturity;
        uint16 couponRateBps;
        uint8 paymentsPerYear;
        uint128 faceValuePerToken;
    }

    struct CouponPeriod {
        uint64 recordDateBlock;
        bool finalized;
        uint128 couponPerToken;
        uint256 requiredFunding;
        uint256 funded;
        uint256 claimed;
    }

    struct Redemption {
        bool declared;
        uint64 recordDateBlock;
        uint128 principalPerToken;
        uint256 requiredFunding;
        uint256 funded;
        uint256 claimed;
    }

    BondToken public immutable bond;
    IIssuerAuthorizer public immutable authorizer;

    BondTerms private _terms;
    CouponPeriod[] private _coupons;

    /// @dev periodId + 1 per record-date block, to reject duplicate record dates.
    mapping(uint64 recordDateBlock => uint256 periodIdPlusOne) private _periodByRecordDate;
    mapping(uint256 periodId => mapping(address investor => bool claimed)) private _couponClaimed;
    mapping(address investor => bool claimed) private _principalClaimed;

    Redemption private _redemption;

    /// @notice Nonce used in the next PQC-authorised action message; incremented on every use.
    uint256 public authorizationNonce;

    event CouponPeriodOpened(uint256 indexed periodId, uint64 recordDateBlock);
    event CouponRecordDateSet(
        uint256 indexed periodId, uint64 previousRecordDateBlock, uint64 recordDateBlock
    );
    event CouponFinalized(
        uint256 indexed periodId,
        uint64 indexed recordDateBlock,
        uint256 totalSupplyAtRecordDate,
        uint128 couponPerToken,
        uint256 requiredFunding,
        uint256 authorizationNonce,
        uint64 deadline
    );
    event CouponFunded(uint256 indexed periodId, address indexed funder, uint256 amount, uint256 funded);
    event CouponClaimed(uint256 indexed periodId, address indexed investor, uint256 amount);

    event RedemptionDeclared(
        uint64 indexed recordDateBlock,
        uint256 totalSupplyAtRecordDate,
        uint128 principalPerToken,
        uint256 requiredFunding,
        uint256 authorizationNonce,
        uint64 deadline
    );
    event RedemptionFunded(address indexed funder, uint256 amount, uint256 funded);
    event PrincipalClaimed(address indexed investor, uint256 amount);

    error ZeroAddress();
    error InvalidTerms();
    error PeriodOutOfRange(uint256 periodId);
    error RecordDateNotFuture(uint64 recordDateBlock);
    error RecordDateNotReached(uint64 recordDateBlock);
    error RecordDateLocked(uint256 periodId);
    error RecordDateAlreadyUsed(uint64 recordDateBlock);
    error RecordDateOrder(uint64 recordDateBlock);
    error RecordDateFinalized(uint256 periodId);
    error CouponAlreadyFinalized(uint256 periodId);
    error CouponNotFinalized(uint256 periodId);
    error CouponAmountZero();
    error ZeroAmount();
    error FundingExceedsRequirement(uint256 required, uint256 funded, uint256 amount);
    error DistributionNotFullyFunded(uint256 required, uint256 funded);
    error AlreadyClaimed(uint256 periodId, address investor);
    error PrincipalAlreadyClaimed(address investor);
    error NothingToClaim(uint256 periodId, address investor);
    error NothingToClaimPrincipal(address investor);
    error RedemptionAlreadyDeclared();
    error RedemptionNotDeclared();
    error BeforeMaturity(uint64 maturity);
    error AuthorizationExpired(uint64 deadline);
    error UnauthorizedIssuerAction();
    error IssuerIsPqcIdentity();

    constructor(
        BondToken bond_,
        IIssuerAuthorizer authorizer_,
        address issuer_,
        address paymentToken_,
        uint64 maturity_,
        uint16 couponRateBps_,
        uint8 paymentsPerYear_,
        uint128 faceValuePerToken_
    ) {
        if (
            address(bond_) == address(0) || address(authorizer_) == address(0) || issuer_ == address(0)
                || paymentToken_ == address(0)
        ) revert ZeroAddress();
        if (
            maturity_ <= block.timestamp || couponRateBps_ == 0 || couponRateBps_ > BPS_DENOMINATOR
                || paymentsPerYear_ == 0 || 12 % paymentsPerYear_ != 0 || faceValuePerToken_ == 0
        ) revert InvalidTerms();
        // The operational EVM issuer must be a separate account from the registered PQC identity.
        // Otherwise a single compromised keypair would hold both the role and the signing key.
        if (issuer_ == authorizer_.pqcIssuer()) revert IssuerIsPqcIdentity();

        bond = bond_;
        authorizer = authorizer_;
        _terms = BondTerms({
            paymentToken: paymentToken_,
            maturity: maturity_,
            couponRateBps: couponRateBps_,
            paymentsPerYear: paymentsPerYear_,
            faceValuePerToken: faceValuePerToken_
        });

        _grantRole(DEFAULT_ADMIN_ROLE, issuer_);
        _grantRole(ISSUER_ROLE, issuer_);
    }

    // ---------------------------------------------------------------------------------------------
    // Schedule
    // ---------------------------------------------------------------------------------------------

    /// @notice Opens a coupon period with a future record-date block.
    /// @dev Record dates must increase across periods. The date can be changed with
    /// `setCouponRecordDate` until the block is reached, then it is locked.
    function openCouponPeriod(uint64 recordDateBlock)
        external
        onlyRole(ISSUER_ROLE)
        returns (uint256 periodId)
    {
        if (recordDateBlock <= block.number) {
            revert RecordDateNotFuture(recordDateBlock);
        }
        if (_periodByRecordDate[recordDateBlock] != 0) revert RecordDateAlreadyUsed(recordDateBlock);

        uint256 count = _coupons.length;
        if (count != 0 && recordDateBlock <= _coupons[count - 1].recordDateBlock) {
            revert RecordDateOrder(recordDateBlock);
        }

        _coupons.push();
        periodId = count;
        _coupons[periodId].recordDateBlock = recordDateBlock;
        _periodByRecordDate[recordDateBlock] = periodId + 1;
        emit CouponPeriodOpened(periodId, recordDateBlock);
    }

    /// @notice Replaces the record date of an unfinalised period, while that date is still in the future.
    function setCouponRecordDate(uint256 periodId, uint64 newRecordDateBlock) external onlyRole(ISSUER_ROLE) {
        CouponPeriod storage period = _coupon(periodId);
        if (period.finalized) revert RecordDateFinalized(periodId);
        if (period.recordDateBlock <= block.number) revert RecordDateLocked(periodId);
        if (newRecordDateBlock <= block.number) revert RecordDateNotFuture(newRecordDateBlock);
        if (_periodByRecordDate[newRecordDateBlock] != 0) revert RecordDateAlreadyUsed(newRecordDateBlock);

        uint256 count = _coupons.length;
        if (periodId != 0 && newRecordDateBlock <= _coupons[periodId - 1].recordDateBlock) {
            revert RecordDateOrder(newRecordDateBlock);
        }
        if (periodId + 1 < count && newRecordDateBlock >= _coupons[periodId + 1].recordDateBlock) {
            revert RecordDateOrder(newRecordDateBlock);
        }

        uint64 previous = period.recordDateBlock;
        delete _periodByRecordDate[previous];
        _periodByRecordDate[newRecordDateBlock] = periodId + 1;
        period.recordDateBlock = newRecordDateBlock;
        emit CouponRecordDateSet(periodId, previous, newRecordDateBlock);
    }

    /// @notice Finalises a coupon period: freezes its record date, coupon per token and required funding.
    /// @dev Requires an ML-DSA-87 signature by the issuer over
    /// `couponFinalizationMessage(periodId, deadline)` before `deadline`.
    function finalizeCoupon(uint256 periodId, uint64 deadline, bytes calldata signature)
        external
        nonReentrant
        onlyRole(ISSUER_ROLE)
    {
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);

        CouponPeriod storage period = _coupon(periodId);
        if (period.finalized) revert CouponAlreadyFinalized(periodId);
        if (period.recordDateBlock >= block.number) revert RecordDateNotReached(period.recordDateBlock);

        (uint128 couponPerToken, uint256 requiredFunding) = _pendingCouponAmounts(periodId);
        bytes memory message = _couponFinalizationMessage(periodId, couponPerToken, requiredFunding, deadline);
        uint256 usedNonce = _authorize(signature, message);

        period.couponPerToken = couponPerToken;
        period.requiredFunding = requiredFunding;
        period.finalized = true;

        emit CouponFinalized(
            periodId,
            period.recordDateBlock,
            bond.totalSupplyAt(period.recordDateBlock),
            couponPerToken,
            requiredFunding,
            usedNonce,
            deadline
        );
    }

    // ---------------------------------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------------------------------

    /// @notice Funds a finalised coupon period with the payment token. Partial top-ups are allowed.
    function fundCoupon(uint256 periodId, uint256 amount) external nonReentrant onlyRole(TREASURER_ROLE) {
        CouponPeriod storage period = _coupon(periodId);
        if (!period.finalized) revert CouponNotFinalized(periodId);
        if (amount == 0) revert ZeroAmount();

        uint256 newFunded = period.funded + amount;
        if (newFunded > period.requiredFunding) {
            revert FundingExceedsRequirement(period.requiredFunding, period.funded, amount);
        }

        period.funded = newFunded;
        IERC20(_terms.paymentToken).safeTransferFrom(msg.sender, address(this), amount);
        emit CouponFunded(periodId, msg.sender, amount, newFunded);
    }

    /// @notice Declares principal redemption after maturity and freezes its record date and amount.
    /// @dev Requires an ML-DSA-87 signature by the issuer over
    /// `redemptionDeclarationMessage(recordDateBlock, deadline)`.
    function declareRedemption(uint64 recordDateBlock, uint64 deadline, bytes calldata signature)
        external
        nonReentrant
        onlyRole(ISSUER_ROLE)
    {
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        if (_redemption.declared) revert RedemptionAlreadyDeclared();
        if (block.timestamp < _terms.maturity) revert BeforeMaturity(_terms.maturity);
        if (recordDateBlock >= block.number) revert RecordDateNotReached(recordDateBlock);

        uint128 principalPerToken = _terms.faceValuePerToken;
        uint256 supply = bond.totalSupplyAt(recordDateBlock);
        uint256 requiredFunding = Math.mulDiv(supply, principalPerToken, TOKEN_UNIT);
        bytes memory message =
            _redemptionDeclarationMessage(recordDateBlock, principalPerToken, requiredFunding, deadline);
        uint256 usedNonce = _authorize(signature, message);

        _redemption = Redemption({
            declared: true,
            recordDateBlock: recordDateBlock,
            principalPerToken: principalPerToken,
            requiredFunding: requiredFunding,
            funded: 0,
            claimed: 0
        });

        emit RedemptionDeclared(
            recordDateBlock, supply, principalPerToken, requiredFunding, usedNonce, deadline
        );
    }

    /// @notice Funds principal redemption. Partial top-ups are allowed; over-funding is rejected.
    function fundRedemption(uint256 amount) external nonReentrant onlyRole(TREASURER_ROLE) {
        Redemption storage redemption_ = _redemption;
        if (!redemption_.declared) revert RedemptionNotDeclared();
        if (amount == 0) revert ZeroAmount();

        uint256 newFunded = redemption_.funded + amount;
        if (newFunded > redemption_.requiredFunding) {
            revert FundingExceedsRequirement(redemption_.requiredFunding, redemption_.funded, amount);
        }

        redemption_.funded = newFunded;
        IERC20(_terms.paymentToken).safeTransferFrom(msg.sender, address(this), amount);
        emit RedemptionFunded(msg.sender, amount, newFunded);
    }

    // ---------------------------------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------------------------------

    /// @notice Claims the caller's coupon for one period. Exactly once per period, only when fully funded.
    function claimCoupon(uint256 periodId) external nonReentrant returns (uint256 amount) {
        CouponPeriod storage period = _coupon(periodId);
        if (!period.finalized) revert CouponNotFinalized(periodId);
        if (period.funded < period.requiredFunding) {
            revert DistributionNotFullyFunded(period.requiredFunding, period.funded);
        }
        if (_couponClaimed[periodId][msg.sender]) revert AlreadyClaimed(periodId, msg.sender);

        amount = couponEntitlement(periodId, msg.sender);
        if (amount == 0) revert NothingToClaim(periodId, msg.sender);

        _couponClaimed[periodId][msg.sender] = true;
        period.claimed += amount;
        IERC20(_terms.paymentToken).safeTransfer(msg.sender, amount);
        emit CouponClaimed(periodId, msg.sender, amount);
    }

    /// @notice Claims the caller's principal after maturity. Exactly once, only when fully funded.
    function claimPrincipal() external nonReentrant returns (uint256 amount) {
        Redemption storage redemption_ = _redemption;
        if (!redemption_.declared) revert RedemptionNotDeclared();
        if (redemption_.funded < redemption_.requiredFunding) {
            revert DistributionNotFullyFunded(redemption_.requiredFunding, redemption_.funded);
        }
        if (_principalClaimed[msg.sender]) revert PrincipalAlreadyClaimed(msg.sender);

        amount = redemptionEntitlement(msg.sender);
        if (amount == 0) revert NothingToClaimPrincipal(msg.sender);

        _principalClaimed[msg.sender] = true;
        redemption_.claimed += amount;
        IERC20(_terms.paymentToken).safeTransfer(msg.sender, amount);
        emit PrincipalClaimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function terms() external view returns (BondTerms memory) {
        return _terms;
    }

    function couponPeriodCount() external view returns (uint256) {
        return _coupons.length;
    }

    function couponPeriod(uint256 periodId) external view returns (CouponPeriod memory) {
        return _coupon(periodId);
    }

    function couponEntitlement(uint256 periodId, address investor) public view returns (uint256) {
        CouponPeriod storage period = _coupon(periodId);
        if (!period.finalized) revert CouponNotFinalized(periodId);
        return
            Math.mulDiv(bond.balanceOfAt(investor, period.recordDateBlock), period.couponPerToken, TOKEN_UNIT);
    }

    function couponStatus(uint256 periodId)
        external
        view
        returns (uint256 required, uint256 funded, uint256 claimed, uint256 outstanding)
    {
        CouponPeriod storage period = _coupon(periodId);
        return (period.requiredFunding, period.funded, period.claimed, period.funded - period.claimed);
    }

    function hasClaimedCoupon(uint256 periodId, address investor) external view returns (bool) {
        return _couponClaimed[periodId][investor];
    }

    function redemption() external view returns (Redemption memory) {
        return _redemption;
    }

    function redemptionEntitlement(address investor) public view returns (uint256) {
        Redemption storage redemption_ = _redemption;
        if (!redemption_.declared) revert RedemptionNotDeclared();
        return Math.mulDiv(
            bond.balanceOfAt(investor, redemption_.recordDateBlock), redemption_.principalPerToken, TOKEN_UNIT
        );
    }

    function redemptionStatus()
        external
        view
        returns (uint256 required, uint256 funded, uint256 claimed, uint256 outstanding)
    {
        Redemption storage redemption_ = _redemption;
        return (
            redemption_.requiredFunding,
            redemption_.funded,
            redemption_.claimed,
            redemption_.funded - redemption_.claimed
        );
    }

    function hasClaimedPrincipal(address investor) external view returns (bool) {
        return _principalClaimed[investor];
    }

    /// @notice Message the issuer must sign to finalise `periodId` with 0x0A01 before `deadline`.
    function couponFinalizationMessage(uint256 periodId, uint64 deadline)
        external
        view
        returns (bytes memory)
    {
        (uint128 couponPerToken, uint256 requiredFunding) = _pendingCouponAmounts(periodId);
        return _couponFinalizationMessage(periodId, couponPerToken, requiredFunding, deadline);
    }

    /// @notice Message the issuer must sign to declare principal redemption at `recordDateBlock`.
    function redemptionDeclarationMessage(uint64 recordDateBlock, uint64 deadline)
        external
        view
        returns (bytes memory)
    {
        uint256 supply = bond.totalSupplyAt(recordDateBlock);
        uint256 requiredFunding = Math.mulDiv(supply, _terms.faceValuePerToken, TOKEN_UNIT);
        return
            _redemptionDeclarationMessage(
                recordDateBlock, _terms.faceValuePerToken, requiredFunding, deadline
            );
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _coupon(uint256 periodId) private view returns (CouponPeriod storage) {
        if (periodId >= _coupons.length) revert PeriodOutOfRange(periodId);
        return _coupons[periodId];
    }

    function _couponPerToken() private view returns (uint128) {
        uint256 value = Math.mulDiv(
            _terms.faceValuePerToken, _terms.couponRateBps, BPS_DENOMINATOR * uint256(_terms.paymentsPerYear)
        );
        return uint128(value);
    }

    function _pendingCouponAmounts(uint256 periodId) private view returns (uint128, uint256) {
        uint128 couponPerToken = _couponPerToken();
        if (couponPerToken == 0) revert CouponAmountZero();
        uint256 requiredFunding =
            Math.mulDiv(bond.totalSupplyAt(_coupon(periodId).recordDateBlock), couponPerToken, TOKEN_UNIT);
        return (couponPerToken, requiredFunding);
    }

    function _couponFinalizationMessage(
        uint256 periodId,
        uint128 couponPerToken,
        uint256 requiredFunding,
        uint64 deadline
    ) private view returns (bytes memory) {
        return _authorizationMessage(
            ACTION_FINALIZE_COUPON,
            deadline,
            abi.encode(periodId, _coupon(periodId).recordDateBlock, couponPerToken, requiredFunding, deadline)
        );
    }

    function _redemptionDeclarationMessage(
        uint64 recordDateBlock,
        uint128 principalPerToken,
        uint256 requiredFunding,
        uint64 deadline
    ) private view returns (bytes memory) {
        return _authorizationMessage(
            ACTION_DECLARE_REDEMPTION,
            deadline,
            abi.encode(recordDateBlock, principalPerToken, requiredFunding, deadline)
        );
    }

    /// @dev Binds a signature to this chain, this servicing contract, this bond, the registered PQC
    /// issuer identity, the action, a one-time nonce and a deadline.
    function _authorizationMessage(bytes32 action, uint64 deadline, bytes memory params)
        private
        view
        returns (bytes memory)
    {
        return AuthorizationMessage.build(
            block.chainid,
            address(this),
            address(bond),
            authorizer.pqcIssuer(),
            action,
            authorizationNonce,
            deadline,
            keccak256(params)
        );
    }

    /// @dev Requires the registered PQC issuer to have signed `message`; consumes one nonce. The
    /// caller only needs `ISSUER_ROLE`, so a separate operational account can relay the signature.
    function _authorize(bytes calldata signature, bytes memory message) private returns (uint256 usedNonce) {
        usedNonce = authorizationNonce;
        if (!authorizer.isAuthorized(authorizer.pqcIssuer(), message, signature)) {
            revert UnauthorizedIssuerAction();
        }
        authorizationNonce = usedNonce + 1;
    }
}
