// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../blood-donation-contracts/contracts/BloodDonation.sol";

contract DeployBloodDonation {
    // Corrected cheatcode address without the typo
    address constant VM_ADDRESS = 0x71041dd46564f0F33C14F5AA0000000000000000; 

    function run() external {
        // Simple deployment without external library dependencies
        BloodDonation contractInstance = new BloodDonation();
    }
}