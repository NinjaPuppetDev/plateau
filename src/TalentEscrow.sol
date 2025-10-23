// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TalentEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    error TalentEscrow__InvalidToken();
    error TalentEscrow__AmountMustBeGreaterThanZero();
    error TalentEscrow__InvalidPartialPct();
    error TalentEscrow__NotClient();
    error TalentEscrow__NotOpen();
    error TalentEscrow__NotAccepted();
    error TalentEscrow__InvalidState();



    enum State {
        Open,
        Accepted,
        PartialReleased,
        Completed,
        Cancelled,
        Disputed,
        Resolved
    }

    struct Job {
        address client;
        address worker;
        uint256 escrowAmount; // held in contract for worker
        uint256 feeAmount; // fee paid to platform
        uint256 partialPct; // integer percent 0..100
        State state;
    }

    IERC20 public immutable token;
    uint256 public constant feePCT = 3;
    address public feeRecipient;

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    constructor(address _token, address _feeRecipient) Ownable(msg.sender) {
        if (_token == address(0)) revert TalentEscrow__InvalidToken();
        token = IERC20(_token);
        feeRecipient = _feeRecipient;
    }

    /* ========== EVENTS ========== */
    event JobCreated(uint256 indexed jobId, address indexed client, uint256 totalAmount, uint256 partialPct);
    event JobAccepted(uint256 indexed jobId, address indexed worker);
    event PartialReleased(uint256 indexed jobId, uint256 amount);
    event FinalReleased(uint256 indexed jobId, uint256 amount);
    event JobCancelled(uint256 indexed jobId);
    event DisputeOpened(uint256 indexed jobId, address indexed opener);
    event DisputeResolved(uint256 indexed jobId, uint256 clientAmount, uint256 workerAmount);

    /* ========== MUTATIVE FUNCTIONS ========== */
    function createJob(uint256 amount, uint256 partialPct) external returns (uint256 jobId) {
        if (amount == 0) revert TalentEscrow__AmountMustBeGreaterThanZero();
        if (partialPct > 100) revert TalentEscrow__InvalidPartialPct(); 

        uint256 fee = (amount * feePCT) / 100;
        uint256 escrowedAmount = amount - fee;

        // Transfer fee
        token.safeTransferFrom(msg.sender, feeRecipient, fee);
        // Transfer escrowed amount
        token.safeTransferFrom(msg.sender, address(this), escrowedAmount);

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client: msg.sender,
            worker: address(0),
            escrowAmount: escrowedAmount,
            feeAmount: fee,
            partialPct: partialPct,
            state: State.Open
        });

        emit JobCreated(jobId, msg.sender, amount, partialPct);
    }
    // Not a good idea to have this function publically accessible without restrictions
    function acceptJob(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        if (j.state != State.Open) revert TalentEscrow__NotOpen();
        j.worker = msg.sender;
        j.state = State.Accepted;
        emit JobAccepted(jobId, msg.sender);
    }

    // Recently added function to allow client to assign a worker
    function assignWorker(uint256 jobId, address worker) external {
        Job storage job = jobs[jobId];
        require(job.client == msg.sender, TalentEscrow__NotClient());
        require(job.state == State.Open, TalentEscrow__NotOpen());
        job.worker = worker;
        job.state = State.Accepted;
        emit JobAccepted(jobId, worker);
    }

    function releasePartial(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert TalentEscrow__NotClient();
        if (j.state != State.Accepted) revert TalentEscrow__NotAccepted();

        uint256 partialAmount = (j.escrowAmount * j.partialPct) / 100;
        j.state = State.PartialReleased;
        token.safeTransfer(j.worker, partialAmount);

        emit PartialReleased(jobId, partialAmount);
    }

    function releaseFinal(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert TalentEscrow__NotClient();
        if (!(j.state == State.PartialReleased || j.state == State.Accepted)) revert TalentEscrow__InvalidState();

        uint256 paid = (j.escrowAmount * j.partialPct) / 100;
        uint256 remaining = j.escrowAmount - paid;
        j.state = State.Completed;
        token.safeTransfer(j.worker, remaining);

        emit FinalReleased(jobId, remaining);
    }

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert TalentEscrow__NotClient();
        if (j.state != State.Open) revert TalentEscrow__InvalidState();

        j.state = State.Cancelled;
        token.safeTransfer(j.client, j.escrowAmount);

        emit JobCancelled(jobId);
    }

    function openDispute(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client && msg.sender != j.worker) revert TalentEscrow__NotClient();
        if (!(j.state == State.Accepted || j.state == State.PartialReleased)) revert TalentEscrow__InvalidState();

        j.state = State.Disputed;
        emit DisputeOpened(jobId, msg.sender);
    }

    function resolveDispute(uint256 jobId, uint256 clientAmount, uint256 workerAmount)
        external
        onlyOwner
        nonReentrant
    {
        Job storage j = jobs[jobId];
        if (j.state != State.Disputed) revert TalentEscrow__InvalidState();
        require(clientAmount + workerAmount == j.escrowAmount, "sum mismatch");

        j.state = State.Resolved;
        if (clientAmount > 0) token.safeTransfer(j.client, clientAmount);
        if (workerAmount > 0) token.safeTransfer(j.worker, workerAmount);

        emit DisputeResolved(jobId, clientAmount, workerAmount);
    }

    /* ========== VIEW FUNCTIONS ========== */
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function getJobState(uint256 jobId) external view returns (State) {
        return jobs[jobId].state;
    }
}
