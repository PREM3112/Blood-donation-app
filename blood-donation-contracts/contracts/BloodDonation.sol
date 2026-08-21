// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BloodDonation {
    struct BloodBank {
        string ipfsCID;        // IPFS hash storing JSON (name, bloodGroups, inventoryLevels, phone)
        string latitude;       // Kept on-chain for quick map plotting
        string longitude;      // Kept on-chain for quick map plotting
        bool isVerified;       // Admin verification status
        bool isActive;         // Active status
    }

    mapping(address => BloodBank) public bloodBanks;
    address[] public bloodBankAddresses;

    // Events for real-time frontend and indexing updates
    event BloodBankRegistered(address indexed bankAddress, string ipfsCID, string latitude, string longitude);
    event InventoryUpdated(address indexed bankAddress, string newIpfsCID);

    /**
     * @dev Registers a new blood bank using an IPFS CID instead of raw text strings.
     * @param _ipfsCID IPFS Hash pointing to the metadata JSON file
     * @param _latitude Geo-coordinate latitude
     * @param _longitude Geo-coordinate longitude
     */
    function registerBloodBank(
        string memory _ipfsCID, 
        string memory _latitude, 
        string memory _longitude
    ) public {
        // Prevent duplicate array entries if the bank is re-registering
        if (bytes(bloodBanks[msg.sender].ipfsCID).length == 0) {
            bloodBankAddresses.push(msg.sender);
        }

        // Write to blockchain mapping
        bloodBanks[msg.sender] = BloodBank({
            ipfsCID: _ipfsCID,
            latitude: _latitude,
            longitude: _longitude,
            isVerified: false, // Default to false until admin approval
            isActive: true
        });

        // Emit registration event
        emit BloodBankRegistered(msg.sender, _ipfsCID, _latitude, _longitude);
    }

    /**
     * @dev Allows a registered blood bank to update its inventory IPFS hash dynamically.
     * @param _newIpfsCID Updated IPFS Hash containing new inventory data
     */
    function updateInventory(string memory _newIpfsCID) public {
        require(bytes(bloodBanks[msg.sender].ipfsCID).length > 0, "Blood bank is not registered.");
        
        bloodBanks[msg.sender].ipfsCID = _newIpfsCID;

        // Emit update event
        emit InventoryUpdated(msg.sender, _newIpfsCID);
    }

    /**
     * @dev Returns an array of all registered blood bank wallet addresses.
     */
    function getBloodBanks() public view returns (address[] memory) {
        return bloodBankAddresses;
    }
}