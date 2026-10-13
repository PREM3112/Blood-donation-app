// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BloodDonation {
    struct BloodBank {
        string ipfsCID;
        string latitude;
        string longitude;
        bool isVerified;
        bool isActive;
    }

    address public admin; // The government health authority wallet
    mapping(address => BloodBank) public bloodBanks;
    address[] public bloodBankAddresses;

    event BloodBankRegistered(address indexed bankAddress, string ipfsCID);
    event BloodBankVerified(address indexed bankAddress, bool status);
    event InventoryUpdated(address indexed bankAddress, string newIpfsCID);

    constructor() {
        admin = msg.sender; // The person who deploys the contract becomes the Admin
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action.");
        _;
    }

    // 1. Registration remains open for all, but isVerified defaults to FALSE
    function registerBloodBank(string memory _ipfsCID, string memory _latitude, string memory _longitude) public {
        if (bytes(bloodBanks[msg.sender].ipfsCID).length == 0) {
            bloodBankAddresses.push(msg.sender);
        }

        bloodBanks[msg.sender] = BloodBank({
            ipfsCID: _ipfsCID,
            latitude: _latitude,
            longitude: _longitude,
            isVerified: false, 
            isActive: true
        });

        emit BloodBankRegistered(msg.sender, _ipfsCID);
    }

    // 2. ONLY THE ADMIN can verify a hospital
    function verifyBloodBank(address _bankAddress, bool _status) public onlyAdmin {
        require(bytes(bloodBanks[_bankAddress].ipfsCID).length > 0, "Bank not registered.");
        bloodBanks[_bankAddress].isVerified = _status;
        emit BloodBankVerified(_bankAddress, _status);
    }

    // 3. ONLY VERIFIED hospitals can update their inventory
    function updateInventory(string memory _newIpfsCID) public {
        require(bytes(bloodBanks[msg.sender].ipfsCID).length > 0, "Not registered.");
        require(bloodBanks[msg.sender].isVerified == true, "Bank must be verified by admin to update stock.");
        
        bloodBanks[msg.sender].ipfsCID = _newIpfsCID;
        emit InventoryUpdated(msg.sender, _newIpfsCID);
    }

    function getBloodBanks() public view returns (address[] memory) {
        return bloodBankAddresses;
    }
}