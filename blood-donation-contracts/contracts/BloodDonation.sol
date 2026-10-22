// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BloodDonation {
    address public admin;

    struct BankStatus { bool isRegistered; bool isVerified; bool isActive; }
    struct InventoryData { string ipfsCID; }

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

    function updateInventory(string memory _newIpfsCID) public onlyVerifiedActiveBank {
        inventories[msg.sender] = InventoryData({ ipfsCID: _newIpfsCID });
        emit InventoryUpdated(msg.sender);
    }
}