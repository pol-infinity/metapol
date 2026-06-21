// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MetaPOL {

    // Constants
    uint public constant ADMIN_FEE_PCT          = 8;
    uint public constant MINING_PCT             = 20;
    uint public constant USER_PCT               = 72;
    uint public constant REGISTRATION_FEE       = 5 * 1e18;
    uint public constant DAILY_RATE_X1e12       = 1_500_000_000; // 1.5% daily in 1e12
    uint public constant SECONDS_PER_DAY        = 86400;
    uint public constant MINING_CAP_MULT        = 5;
    uint public constant MIN_DIRECTS_FOR_INCOME = 2;

    // State
    address public immutable ownerWallet;
    bool    private _locked;

    uint public currUserID;
    uint public totalAdminFees;
    uint public totalMiningDeposited;

    uint[12] public poolCurrUserID;
    uint[12] public poolActiveUserID;

    uint[12] public LEVEL_PRICES = [
        10    * 1e18,
        20    * 1e18,
        40    * 1e18,
        80    * 1e18,
        160   * 1e18,
        320   * 1e18,
        640   * 1e18,
        1280  * 1e18,
        2560  * 1e18,
        5120  * 1e18,
        10240 * 1e18,
        20480 * 1e18
    ];

    uint[12] public LEVEL_THRESHOLDS = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

    // Structs
    struct UserStruct {
        bool isExist;
        uint id;
        uint referrerID;
        uint referredUsers;
        uint totalEarnings;
        uint totalMiningDeposited;
        uint totalMiningWithdrawn;
        bool isFounder;
    }

    struct PoolUserStruct {
        bool isExist;
        uint id;
        uint payment_received;
    }

    struct MiningEntry {
        uint capital;
        uint cap;
        uint withdrawn;
        uint startTime;
        bool active;
    }

    // Mappings
    mapping(address => UserStruct)                      public users;
    mapping(uint    => address)                         public userList;
    mapping(uint => mapping(address => PoolUserStruct)) public poolUsers;
    mapping(uint => mapping(uint    => address))        public poolUserList;
    mapping(address => MiningEntry[])                   public miningEntries;

    // Events
    event RegUser(
        address indexed user,
        address indexed referrer,
        uint    indexed userId,
        uint    regFee,
        uint    time
    );
    event SponsorPaid(
        address indexed sponsor,
        address indexed user,
        uint    amount,
        uint    time
    );
    event RegPoolEntry(
        address indexed user,
        uint    indexed level,
        uint    slotId,
        uint    value,
        uint    time
    );
    event GetPoolPayment(
        address indexed payer,
        address indexed receiver,
        uint    indexed level,
        uint    userAmount,
        uint    adminFee,
        uint    miningAmount,
        uint    time
    );
    event AutoUpgrade(
        address indexed user,
        uint    indexed fromLevel,
        uint    indexed toLevel,
        uint    amount,
        uint    time
    );
    event AutoUpgradeSkipped(
        address indexed user,
        uint    indexed level,
        uint    profitSent,
        uint    time
    );
    event CycleProfit(
        address indexed user,
        uint    indexed level,
        uint    profit,
        uint    time
    );
    event AutoRepurchase(
        address indexed user,
        uint    indexed level,
        uint    time
    );
    event AdminFeeCollected(
        address indexed admin,
        uint    indexed level,
        uint    amount,
        uint    time
    );
    event MiningDeposit(
        address indexed user,
        uint    indexed entryIndex,
        uint    capital,
        uint    cap,
        uint    time
    );
    event MiningWithdraw(
        address indexed user,
        uint    grossAmount,
        uint    adminFee,
        uint    netAmount,
        uint    time
    );
    event FounderGranted(
        address indexed addr,
        uint    indexed userId,
        uint    time
    );
    event IncomeSkipped(
        address indexed skippedUser,
        address indexed nextCandidate,
        uint    indexed level,
        uint    time
    );

    // Modifiers
    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == ownerWallet, "Not owner");
        _;
    }

    // Constructor
    constructor(address[] memory _founders) {
        ownerWallet = msg.sender;

        // Owner — ID 1 — isFounder = true (exempt from referral gate)
        currUserID++;
        users[ownerWallet] = UserStruct(true, currUserID, 0, 0, 0, 0, 0, true);
        userList[currUserID] = ownerWallet;
        _addFounderToAllPools(ownerWallet);
        _addAdminMining();

        // Additional founders — all 12 slots FREE, no mining, exempt from gate
        for (uint i = 0; i < _founders.length; i++) {
            address f = _founders[i];
            require(f != address(0),   "Founder: zero address");
            require(f != ownerWallet,  "Founder: same as owner");
            require(!users[f].isExist, "Founder: duplicate");
            currUserID++;
            users[f] = UserStruct(true, currUserID, 1, 0, 0, 0, 0, true);
            userList[currUserID] = f;
            _addFounderToAllPools(f);
        }
    }

    // Founder Grant
    function grantFounderStatus(address _addr) external onlyOwner {
        require(_addr != address(0),   "Zero address");
        require(!users[_addr].isExist, "Already registered");
        currUserID++;
        users[_addr] = UserStruct(true, currUserID, 1, 0, 0, 0, 0, true);
        userList[currUserID] = _addr;
        _addFounderToAllPools(_addr);
        emit FounderGranted(_addr, currUserID, block.timestamp);
    }

    // Registration (5 POL)
    function regUser(uint _referrerID) external payable nonReentrant {
        require(!users[msg.sender].isExist,                   "Already registered");
        require(_referrerID > 0 && _referrerID <= currUserID, "Invalid referrer ID");
        require(msg.value == REGISTRATION_FEE,                "Send exactly 5 POL");

        currUserID++;
        users[msg.sender] = UserStruct(true, currUserID, _referrerID, 0, 0, 0, 0, false);
        userList[currUserID] = msg.sender;
        users[userList[_referrerID]].referredUsers++;

        uint adminFee     = msg.value * ADMIN_FEE_PCT / 100;
        uint sponsorShare = msg.value - adminFee;
        totalAdminFees   += adminFee;

        _sendPOL(ownerWallet, adminFee);
        _sendPOL(userList[_referrerID], sponsorShare);

        emit AdminFeeCollected(ownerWallet, 0, adminFee, block.timestamp);
        emit SponsorPaid(userList[_referrerID], msg.sender, sponsorShare, block.timestamp);
        emit RegUser(msg.sender, userList[_referrerID], currUserID, msg.value, block.timestamp);
    }

    // Buy Slot 1
    function buySlot1() external payable nonReentrant {
        require(users[msg.sender].isExist,         "Register first");
        require(!poolUsers[0][msg.sender].isExist, "Already in Slot 1");
        require(msg.value == LEVEL_PRICES[0],      "Send exactly 10 POL");

        _addMiningEntry(msg.sender, msg.value * MINING_PCT / 100);
        _enterPool(0, msg.sender, msg.value);
    }

    // Buy Slot 2–12 (Manual Upgrade)
    function buyLevel(uint _level) external payable nonReentrant {
        require(_level >= 2 && _level <= 12, "Level must be 2-12");
        require(users[msg.sender].isExist,   "Not registered");

        uint idx = _level - 1;

        require(!poolUsers[idx][msg.sender].isExist,  "Already in this slot");
        require(poolUsers[idx-1][msg.sender].isExist, "Buy previous slot first");
        require(msg.value == LEVEL_PRICES[idx],       "Incorrect POL amount");

        _addMiningEntry(msg.sender, msg.value * MINING_PCT / 100);
        _enterPool(idx, msg.sender, msg.value);
    }

    // Mining Withdraw
    function withdrawMining() external nonReentrant {
        uint grossAmount = _pendingMining(msg.sender);
        require(grossAmount > 0,                      "Nothing to withdraw");
        require(address(this).balance >= grossAmount, "Insufficient contract balance");

        // Effects first — update all entry state before any transfer
        MiningEntry[] storage entries = miningEntries[msg.sender];
        for (uint i = 0; i < entries.length; i++) {
            if (!entries[i].active) continue;
            uint entryPending = _pendingForEntry(entries[i]);
            if (entryPending == 0) continue;
            entries[i].withdrawn += entryPending;
            if (entries[i].withdrawn >= entries[i].cap) {
                entries[i].withdrawn = entries[i].cap;
                entries[i].active    = false;
            }
        }

        uint adminFee  = grossAmount * ADMIN_FEE_PCT / 100;
        uint netAmount = grossAmount - adminFee;

        users[msg.sender].totalMiningWithdrawn += grossAmount;
        totalAdminFees                         += adminFee;

        // Interactions last
        _sendPOL(ownerWallet, adminFee);
        _sendPOL(msg.sender,  netAmount);

        emit AdminFeeCollected(ownerWallet, 0, adminFee, block.timestamp);
        emit MiningWithdraw(msg.sender, grossAmount, adminFee, netAmount, block.timestamp);
    }

    // Views
    function getUserInfo(address _addr) external view returns (
        bool isExist,
        uint id,
        uint referrerID,
        uint referredUsers,
        uint totalEarnings,
        uint totalMiningDep,
        uint totalMiningWith,
        bool isFounder,
        bool incomeEligible
    ) {
        UserStruct storage u = users[_addr];
        bool eligible = _isEligibleForIncome(_addr);
        return (
            u.isExist, u.id, u.referrerID, u.referredUsers,
            u.totalEarnings, u.totalMiningDeposited, u.totalMiningWithdrawn,
            u.isFounder,
            eligible
        );
    }

    function getPoolUserInfo(uint _level, address _addr) external view returns (
        bool isExist,
        uint id,
        uint payment_received
    ) {
        require(_level >= 1 && _level <= 12, "Level must be 1-12");
        PoolUserStruct storage p = poolUsers[_level - 1][_addr];
        return (p.isExist, p.id, p.payment_received);
    }

    function getPoolStatus(uint _level) external view returns (
        uint    currID,
        uint    activeID,
        address activeUser
    ) {
        require(_level >= 1 && _level <= 12, "Level must be 1-12");
        uint idx = _level - 1;
        return (
            poolCurrUserID[idx],
            poolActiveUserID[idx],
            poolUserList[idx][poolActiveUserID[idx]]
        );
    }

    function getPendingMining(address _addr) external view returns (
        uint gross,
        uint adminFee,
        uint net
    ) {
        gross    = _pendingMining(_addr);
        adminFee = gross * ADMIN_FEE_PCT / 100;
        net      = gross - adminFee;
    }

    function getMiningEntries(address _addr) external view returns (
        uint[] memory capitals,
        uint[] memory caps,
        uint[] memory withdrawn,
        uint[] memory startTimes,
        bool[] memory active,
        uint[] memory pending
    ) {
        MiningEntry[] storage entries = miningEntries[_addr];
        uint len   = entries.length;
        capitals   = new uint[](len);
        caps       = new uint[](len);
        withdrawn  = new uint[](len);
        startTimes = new uint[](len);
        active     = new bool[](len);
        pending    = new uint[](len);
        for (uint i = 0; i < len; i++) {
            capitals[i]   = entries[i].capital;
            caps[i]       = entries[i].cap;
            withdrawn[i]  = entries[i].withdrawn;
            startTimes[i] = entries[i].startTime;
            active[i]     = entries[i].active;
            pending[i]    = _pendingForEntry(entries[i]);
        }
    }

    function getFeeBreakdown(uint _level) external view returns (
        uint slotPrice,
        uint adminFee,
        uint miningAmount,
        uint userReceives
    ) {
        require(_level >= 1 && _level <= 12, "Level must be 1-12");
        uint price  = LEVEL_PRICES[_level - 1];
        uint admin  = price * ADMIN_FEE_PCT / 100;
        uint mining = price * MINING_PCT    / 100;
        return (price, admin, mining, price - admin - mining);
    }

    function getCycleBreakdown(uint _level) external view returns (
        uint totalOnCycle,
        uint adminFee,
        uint autoUpgradeCost,
        uint profit
    ) {
        require(_level >= 1 && _level <= 12, "Level must be 1-12");
        uint idx       = _level - 1;
        uint threshold = LEVEL_THRESHOLDS[idx];
        uint price     = LEVEL_PRICES[idx];
        uint total     = price * threshold;
        uint admin     = total * ADMIN_FEE_PCT / 100;
        uint remaining = total - admin;
        uint upgCost   = (_level < 12) ? LEVEL_PRICES[idx + 1] : 0;
        uint prof      = (upgCost <= remaining) ? remaining - upgCost : remaining;
        return (total, admin, upgCost, prof);
    }

    function isUserInSlot(address _addr, uint _level) external view returns (bool) {
        require(_level >= 1 && _level <= 12, "Level must be 1-12");
        return poolUsers[_level - 1][_addr].isExist;
    }

    function contractPOLBalance() external view returns (uint) {
        return address(this).balance;
    }

    function checkIncomeEligibility(address _addr) external view returns (
        bool eligible,
        uint directReferrals,
        uint required
    ) {
        return (
            _isEligibleForIncome(_addr),
            users[_addr].referredUsers,
            MIN_DIRECTS_FOR_INCOME
        );
    }

    // Core Pool Logic

    /// @dev Scans forward from poolActiveUserID for the next eligible user, skipping ineligible ones without moving them.
    function _findEligibleActiveUser(uint _idx)
        internal
        returns (address eligibleUser, uint eligibleSlotID)
    {
        uint poolSize = poolCurrUserID[_idx];
        uint scanPtr  = poolActiveUserID[_idx];
        uint checked  = 0;

        while (checked <= poolSize) {
            address candidate = poolUserList[_idx][scanPtr];

            if (candidate == address(0)) {
                return (ownerWallet, poolUsers[_idx][ownerWallet].id);
            }

            if (_isEligibleForIncome(candidate)) {
                poolActiveUserID[_idx] = scanPtr;
                return (candidate, poolUsers[_idx][candidate].id);
            }

            uint nextPtr = scanPtr + 1;
            address nextCandidate = poolUserList[_idx][nextPtr];
            emit IncomeSkipped(candidate, nextCandidate, _idx + 1, block.timestamp);

            scanPtr++;
            checked++;
        }

        return (ownerWallet, poolUsers[_idx][ownerWallet].id);
    }

    function _enterPool(uint _idx, address _user, uint _amount) internal {
        uint threshold = LEVEL_THRESHOLDS[_idx];

        poolCurrUserID[_idx]++;
        uint newSlotId = poolCurrUserID[_idx];
        poolUsers[_idx][_user]        = PoolUserStruct(true, newSlotId, 0);
        poolUserList[_idx][newSlotId] = _user;

        (address currentUser, ) = _findEligibleActiveUser(_idx);

        uint adminFee  = _amount * ADMIN_FEE_PCT / 100;
        uint userShare = _amount * USER_PCT      / 100;

        totalAdminFees += adminFee;
        _sendPOL(ownerWallet, adminFee);
        emit AdminFeeCollected(ownerWallet, _idx + 1, adminFee, block.timestamp);

        poolUsers[_idx][currentUser].payment_received++;

        if (poolUsers[_idx][currentUser].payment_received >= threshold) {

            // Cycle: advance active pointer and re-enter user at the back of the queue
            poolActiveUserID[_idx]++;
            _reEnterPool(_idx, currentUser);
            emit AutoRepurchase(currentUser, _idx + 1, block.timestamp);

            bool isLastSlot    = (_idx == 11);
            bool alreadyInNext = (!isLastSlot && poolUsers[_idx + 1][currentUser].isExist);

            if (isLastSlot || alreadyInNext) {
                users[currentUser].totalEarnings += userShare;
                _sendPOL(currentUser, userShare);
                if (alreadyInNext) {
                    emit AutoUpgradeSkipped(currentUser, _idx + 1, userShare, block.timestamp);
                } else {
                    emit CycleProfit(currentUser, _idx + 1, userShare, block.timestamp);
                }
            } else {
                // Auto upgrade: userShare always covers nextPrice at current thresholds
                uint nextPrice = LEVEL_PRICES[_idx + 1];
                require(userShare >= nextPrice, "Cycle: insufficient for auto-upgrade");

                uint profit = userShare - nextPrice;

                if (profit > 0) {
                    users[currentUser].totalEarnings += profit;
                    _sendPOL(currentUser, profit);
                    emit CycleProfit(currentUser, _idx + 1, profit, block.timestamp);
                }

                _addMiningEntry(currentUser, nextPrice * MINING_PCT / 100);

                emit AutoUpgrade(currentUser, _idx + 1, _idx + 2, nextPrice, block.timestamp);
                _enterPool(_idx + 1, currentUser, nextPrice);
            }

        } else {
            users[currentUser].totalEarnings += userShare;
            _sendPOL(currentUser, userShare);
            emit GetPoolPayment(
                _user, currentUser, _idx + 1,
                userShare, adminFee, _amount * MINING_PCT / 100,
                block.timestamp
            );
        }

        emit RegPoolEntry(_user, _idx + 1, newSlotId, _amount, block.timestamp);
    }

    // Direct Referral Gate
    function _isEligibleForIncome(address _addr) internal view returns (bool) {
        if (_addr == ownerWallet)   return true;
        if (users[_addr].isFounder) return true;
        return users[_addr].referredUsers >= MIN_DIRECTS_FOR_INCOME;
    }

    // Mining Internals
    function _addMiningEntry(address _user, uint _amount) internal {
        if (_amount == 0) return;
        uint cap = _amount * MINING_CAP_MULT;
        miningEntries[_user].push(MiningEntry({
            capital   : _amount,
            cap       : cap,
            withdrawn : 0,
            startTime : block.timestamp,
            active    : true
        }));
        users[_user].totalMiningDeposited += _amount;
        totalMiningDeposited              += _amount;
        uint entryIdx = miningEntries[_user].length - 1;
        emit MiningDeposit(_user, entryIdx, _amount, cap, block.timestamp);
    }

    function _addAdminMining() internal {
        for (uint i = 0; i < 12; i++) {
            uint miningAmt = LEVEL_PRICES[i] * MINING_PCT / 100;
            _addMiningEntry(ownerWallet, miningAmt);
        }
    }

    function _pendingForEntry(MiningEntry storage e) internal view returns (uint) {
        if (!e.active) return 0;
        uint elapsed   = block.timestamp - e.startTime;
        uint earned    = e.capital * DAILY_RATE_X1e12 * elapsed / SECONDS_PER_DAY / 1e12;
        uint available = (earned > e.cap) ? e.cap : earned;
        if (available <= e.withdrawn) return 0;
        return available - e.withdrawn;
    }

    function _pendingMining(address _addr) internal view returns (uint) {
        uint total = 0;
        MiningEntry[] storage entries = miningEntries[_addr];
        for (uint i = 0; i < entries.length; i++) {
            total += _pendingForEntry(entries[i]);
        }
        return total;
    }

    // Queue Internals

    /// @dev Re-enters a user at the back of the pool with payment_received reset to 0 (used on cycle).
    function _reEnterPool(uint _idx, address _user) internal {
        delete poolUsers[_idx][_user];
        poolCurrUserID[_idx]++;
        uint reSlotId = poolCurrUserID[_idx];
        poolUsers[_idx][_user]       = PoolUserStruct(true, reSlotId, 0);
        poolUserList[_idx][reSlotId] = _user;
    }

    function _addFounderToAllPools(address _addr) internal {
        for (uint i = 0; i < 12; i++) {
            poolCurrUserID[i]++;
            uint slotId = poolCurrUserID[i];
            poolUsers[i][_addr]     = PoolUserStruct(true, slotId, 0);
            poolUserList[i][slotId] = _addr;
            if (poolActiveUserID[i] == 0) poolActiveUserID[i] = 1;
        }
    }

    function _sendPOL(address _to, uint _amount) internal {
        (bool success, ) = payable(_to).call{value: _amount}("");
        require(success, "POL transfer failed");
    }

    // Fallback
    receive() external payable {
        revert("Use regUser, buySlot1 or buyLevel");
    }
}
