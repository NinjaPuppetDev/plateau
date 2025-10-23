// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TalentEscrow.sol";
import "../src/MockERC20.sol";

contract TalentEscrowTest is Test {
    TalentEscrow public escrow;
    MockERC20 public token;

    address public client = address(0x1);
    address public worker = address(0x2);
    address public feeRecipient = address(0x3);

    uint256 constant ONE = 1e18;

    function setUp() public {
        // Deploy mock ERC20 (mints 1_000_000 * 10**decimals to this test contract)
        token = new MockERC20("TestToken", "TT", 18);

        // Give client a reasonable balance (<= minted supply)
        // minted supply = 1_000_000 * ONE so we transfer 1_000_000 * ONE to client
        token.transfer(client, 1_000_000 * ONE);

        // Deploy TalentEscrow with fee recipient
        escrow = new TalentEscrow(address(token), feeRecipient);

        // Approve escrow contract to spend client's tokens
        vm.prank(client);
        token.approve(address(escrow), type(uint256).max);
    }

    function testCreateJobRecordsFeeAndEscrow() public {
        uint256 jobAmount = 40_000 * ONE; // 40k tokens
        uint256 partialPct = 50; // 50%

        // client creates job
        vm.prank(client);
        uint256 jobId = escrow.createJob(jobAmount, partialPct);

        // read job struct
        TalentEscrow.Job memory j = escrow.getJob(jobId);

        uint256 expectedFee = (jobAmount * 3) / 100; // 3%
        uint256 expectedEscrow = jobAmount - expectedFee;

        assertEq(j.client, client);
        assertEq(j.worker, address(0));
        assertEq(j.feeAmount, expectedFee);
        assertEq(j.escrowAmount, expectedEscrow);
        assertEq(j.partialPct, partialPct);
        assertEq(uint256(j.state), uint256(TalentEscrow.State.Open));

        // feeRecipient should have received the fee
        assertEq(token.balanceOf(feeRecipient), expectedFee);
    }

    function testAcceptThenPartialThenFinal() public {
        uint256 jobAmount = 10_000 * ONE; // 10k tokens
        uint256 partialPct = 40; // 40%

        // create job
        vm.prank(client);
        uint256 jobId = escrow.createJob(jobAmount, partialPct);

        // accept by worker
        vm.prank(worker);
        escrow.acceptJob(jobId);

        // release partial by client
        vm.prank(client);
        escrow.releasePartial(jobId);

        // validate partial paid
        TalentEscrow.Job memory j = escrow.getJob(jobId);
        uint256 expectedEscrow = jobAmount - ((jobAmount * 3) / 100);
        uint256 expectedPartial = (expectedEscrow * partialPct) / 100;
        assertEq(token.balanceOf(worker), expectedPartial);
        assertEq(uint256(j.state), uint256(TalentEscrow.State.PartialReleased));

        // release final
        vm.prank(client);
        escrow.releaseFinal(jobId);

        uint256 expectedFinal = expectedEscrow - expectedPartial;
        assertEq(token.balanceOf(worker), expectedPartial + expectedFinal);
        assertEq(uint256(escrow.getJobState(jobId)), uint256(TalentEscrow.State.Completed));
    }

    function testCancelRefundsClient() public {
        uint256 jobAmount = 5_000 * ONE;
        uint256 partialPct = 30;

        // create job
        vm.prank(client);
        uint256 jobId = escrow.createJob(jobAmount, partialPct);

        // cancel
        vm.prank(client);
        escrow.cancelJob(jobId);

        // job state should be Cancelled
        TalentEscrow.Job memory j = escrow.getJob(jobId);
        assertEq(uint256(j.state), uint256(TalentEscrow.State.Cancelled));

        // client balance: started with 1_000_000, paid jobAmount then refunded escrow (jobAmount - fee)
        uint256 fee = (jobAmount * 3) / 100;
        uint256 escrowed = jobAmount - fee;
        uint256 expectedClientBalance = 1_000_000 * ONE - jobAmount + escrowed;
        assertEq(token.balanceOf(client), expectedClientBalance);
    }

    function testOpenDisputeAndResolveByOwner() public {
        uint256 jobAmount = 8_000 * ONE;
        uint256 partialPct = 50;

        // create job
        vm.prank(client);
        uint256 jobId = escrow.createJob(jobAmount, partialPct);

        // accept
        vm.prank(worker);
        escrow.acceptJob(jobId);

        // open dispute (client)
        vm.prank(client);
        escrow.openDispute(jobId);

        TalentEscrow.Job memory j = escrow.getJob(jobId);
        assertEq(uint256(j.state), uint256(TalentEscrow.State.Disputed));

        // compute escrowed (minus fee)
        uint256 fee = (jobAmount * 3) / 100;
        uint256 escrowed = jobAmount - fee;

        // decide a split: clientShare / workerShare must sum to escrowed
        uint256 clientShare = (escrowed * 30) / 100; // 30% back to client
        uint256 workerShare = escrowed - clientShare;

        // resolve as owner (owner is this test contract)
        vm.prank(escrow.owner());
        escrow.resolveDispute(jobId, clientShare, workerShare);

        // check balances updated
        uint256 expectedClientBalance = 1_000_000 * ONE - jobAmount + clientShare;
        assertEq(token.balanceOf(client), expectedClientBalance);
        assertEq(token.balanceOf(worker), workerShare);

        // job state is Resolved
        j = escrow.getJob(jobId);
        assertEq(uint256(j.state), uint256(TalentEscrow.State.Resolved));
    }
}
