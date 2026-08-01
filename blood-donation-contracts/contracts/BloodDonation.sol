// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BloodDonation {
    struct BloodBank {
        string name;
        string latitude;
        string longitude;
        string bloodGroups; 
        string inventoryLevels; // NEW: Added inventory details (e.g., "A+: 5 units, O-: 2 units")
        bool isVerified;        // NEW: Added verification status
        bool isActive;
    }

    mapping(address => BloodBank) public bloodBanks;
    address[] public bloodBankAddresses;

    // NEW: Blockchain Event for real-time updates
    event BloodBankRegistered(address indexed bankAddress, string name, string bloodGroups);

    function registerBloodBank(
        string memory _name, 
        string memory _latitude, 
        string memory _longitude,
        string memory _bloodGroups,
        string memory _inventoryLevels // NEW: Accept inventory in parameters
    ) public {
        // Default to false for verification until verified by an admin, or set to true for testing
        bloodBanks[msg.sender] = BloodBank(_name, _latitude, _longitude, _bloodGroups, _inventoryLevels, false, true);
        bloodBankAddresses.push(msg.sender);

        // Emit the event
        emit BloodBankRegistered(msg.sender, _name, _bloodGroups);
    }

    function getBloodBanks() public view returns (address[] memory) {
        return bloodBankAddresses;
    }
}