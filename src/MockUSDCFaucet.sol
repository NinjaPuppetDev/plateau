// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMockERC20 {
    function mint(address to, uint256 amount) external;
}

contract MockUSDCFaucet {
    IMockERC20 public token;
    uint256 public amountPerClaim = 1000 * 10**6; // 1000 USDC with 6 decimals

    mapping(address => bool) public claimed;

    constructor(address _token) {
        token = IMockERC20(_token);
    }

    function claim() external {
        require(!claimed[msg.sender], "Already claimed");
        claimed[msg.sender] = true;

        token.mint(msg.sender, amountPerClaim);
    }
}
