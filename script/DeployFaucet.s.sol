// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/MockUSDCFaucet.sol";

contract DeployFaucet is Script {
    function run() external {
        // The mock USDC address on Base Sepolia
        address mockUSDC = 0x0dFA97F1d8b29e366bbf08Fa253e82d9272a1f03;

        vm.startBroadcast();

        MockUSDCFaucet faucet = new MockUSDCFaucet(mockUSDC);

        vm.stopBroadcast();

        console.log("Faucet deployed at:", address(faucet));
    }
}
