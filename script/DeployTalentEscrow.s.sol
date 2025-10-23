// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {TalentEscrow} from "../src/TalentEscrow.sol";

contract DeployTalentEscrow is Script {
    function run() external {
        // Start broadcasting transactions from the loaded account
        vm.startBroadcast();

        // Deploy a mock USDC token (6 decimals)
        MockERC20 mock = new MockERC20("Mock USDC", "MUSDC", 6);

        // The fee recipient can be the deployer
        address feeRecipient = msg.sender;

        // Deploy the TalentEscrow pointing to the token
        TalentEscrow escrow = new TalentEscrow(address(mock), feeRecipient);

        // Log addresses to console
        console.log("MockERC20 deployed at:", address(mock));
        console.log("TalentEscrow deployed at:", address(escrow));

        vm.stopBroadcast();
    }
}
