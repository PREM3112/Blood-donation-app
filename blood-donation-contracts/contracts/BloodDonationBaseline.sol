// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BloodDonationBaseline {
    address public admin;

    struct BankStatus { bool isRegistered; bool isVerified; bool isActive; }
    struct InventoryData { string name; string licenseId; string inventoryLevels; string timestamp; }

    mapping(address => BankStatus) public bankStatuses;
    mapping(address => InventoryData) public inventories;

    event BloodBankRegistered(address indexed bankAddress);
    event BloodBankVerified(address indexed bankAddress, bool status);
    event InventoryUpdated(address indexed bankAddress);

    constructor() { admin = msg.sender; }

    modifier onlyAdmin() { require(msg.sender == admin, "Only admin can call this"); _; }
    modifier onlyVerifiedActiveBank() {
        require(bankStatuses[msg.sender].isRegistered, "Bank not registered");
        require(bankStatuses[msg.sender].isActive, "Bank not active");
        require(bankStatuses[msg.sender].isVerified, "Bank not verified");
        _;
    }

    function registerBloodBank() public {
        require(!bankStatuses[msg.sender].isRegistered, "Bank already registered");
        bankStatuses[msg.sender] = BankStatus({ isRegistered: true, isVerified: false, isActive: true });
        emit BloodBankRegistered(msg.sender);
    }

    function verifyBloodBank(address _bankAddress, bool _status) public onlyAdmin {
        require(bankStatuses[_bankAddress].isRegistered, "Bank must be registered first");
        bankStatuses[_bankAddress].isVerified = _status;
        emit BloodBankVerified(_bankAddress, _status);
    }

    function updateInventory(string memory _name, string memory _licenseId, string memory _inventoryLevels, string memory _timestamp) public onlyVerifiedActiveBank {
        inventories[msg.sender] = InventoryData({ name: _name, licenseId: _licenseId, inventoryLevels: _inventoryLevels, timestamp: _timestamp });
        emit InventoryUpdated(msg.sender);
    }
}