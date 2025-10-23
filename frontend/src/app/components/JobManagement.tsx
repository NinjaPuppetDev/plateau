'use client';

import React, { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

interface Job {
  job_id: string;
  client: string;
  token_addr: string;
  amount: string;
  partial_pct: string;
  tx_hash: string;
  block_number: string;
  block_timestamp: string;
  description: string;
  deleted: boolean;
}

interface Application {
  id: string;
  job_id: string;
  applicant_address: string | null;
  applicant_fid: string | null;
  applicant_username: string | null;
  applicant_display_name: string | null;
  applicant_pfp_url: string | null;
  applied_at: string;
  status: string;
  application_message: string | null;
  hired_by: string | null;
  hired_at: string | null;
  job: {
    client: string;
    amount: string;
    description: string;
  };
}

interface JobManagementProps {
  job: Job;
  applications: Application[];
  onClose: () => void;
  onStatusUpdate: (message: string) => void;
}

export const JobManagement: React.FC<JobManagementProps> = ({
  job,
  applications,
  onClose,
  onStatusUpdate
}) => {
  const { writeContract, isPending: isWritePending } = useWriteContract();
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = 
    useWaitForTransactionReceipt({ hash: currentTxHash });

  // Handle transaction confirmation
  React.useEffect(() => {
    if (isConfirmed && currentTxHash) {
      console.log('✅ Transaction confirmed:', currentTxHash);
      onStatusUpdate(`✅ ${actionInProgress} completed successfully!`);
      setActionInProgress(null);
      setCurrentTxHash(undefined);
      
      // Close after success
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  }, [isConfirmed, currentTxHash, actionInProgress, onStatusUpdate, onClose]);

  const executeContractAction = async (action: string, functionName: string, args: any[] = []) => {
    setActionInProgress(action);
    onStatusUpdate(`Processing ${action}...`);

    try {
      const jobId = parseInt(job.job_id);
      if (isNaN(jobId)) {
        throw new Error('Invalid job ID format');
      }

      // Import contract details
      const TalentEscrowJson = (await import('@/abi/TalentEscrow.json')).default;
      const { ESCROW_ADDRESS } = await import('@/lib/escrow');

      writeContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: TalentEscrowJson,
        functionName,
        args: [BigInt(jobId), ...args],
      }, {
        onSuccess: (hash) => {
          console.log('✅ Transaction submitted:', hash);
          setCurrentTxHash(hash);
        }
      });
    } catch (err: any) {
      console.error(`❌ ${action} error:`, err);
      onStatusUpdate(`❌ Failed to ${action}: ${err.message}`);
      setActionInProgress(null);
    }
  };

  const handleCancelJob = () => {
    executeContractAction('cancel job', 'cancelJob', []);
  };

  const handleReleasePartial = () => {
    executeContractAction('partial payment release', 'releasePartial', []);
  };

  const handleReleaseFinal = () => {
    executeContractAction('final payment release', 'releaseFinal', []);
  };

  const handleOpenDispute = () => {
    executeContractAction('dispute opening', 'openDispute', []);
  };

  const formatAmount = (amount: string) => {
    return new Intl.NumberFormat('en-US').format(parseInt(amount) / 1000000);
  };

  const formatAddress = (addr: string) => {
    if (!addr) return 'N/A';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const hiredApplication = applications.find(app => app.status === 'HIRED');

  const isActionDisabled = isWritePending || isConfirming || actionInProgress !== null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Manage Job #{job.job_id}</h2>
            <p className="text-gray-600 text-sm mt-1">
              Contract actions for hired worker
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            disabled={isActionDisabled}
          >
            ×
          </button>
        </div>

        {/* Job Details */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Total Amount</label>
              <p className="text-lg font-bold text-gray-900">{formatAmount(job.amount)} USDC</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Partial Payment %</label>
              <p className="text-lg font-bold text-gray-900">{job.partial_pct}%</p>
            </div>
          </div>

          {hiredApplication && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Hired Worker</h4>
              <div className="flex items-center space-x-3">
                {hiredApplication.applicant_pfp_url && (
                  <img 
                    src={hiredApplication.applicant_pfp_url} 
                    alt="Profile" 
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {hiredApplication.applicant_display_name || hiredApplication.applicant_username || 'Anonymous'}
                  </p>
                  <p className="text-sm text-gray-600 font-mono">
                    {formatAddress(hiredApplication.applicant_address || '')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contract Actions */}
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Contract Actions</h3>
          
          <div className="space-y-4">
            {/* Cancel Job */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">Cancel Job</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Cancel the job and get full refund (only if no work has started)
                </p>
              </div>
              <button
                onClick={handleCancelJob}
                disabled={isActionDisabled}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded text-sm transition-colors disabled:cursor-not-allowed"
              >
                {actionInProgress === 'cancel job' ? 'Processing...' : 'Cancel Job'}
              </button>
            </div>

            {/* Release Partial Payment */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">Release Partial Payment</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Release {job.partial_pct}% of the funds to the worker
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  Amount: {formatAmount((parseInt(job.amount) * parseInt(job.partial_pct) / 100).toString())} USDC
                </p>
              </div>
              <button
                onClick={handleReleasePartial}
                disabled={isActionDisabled}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded text-sm transition-colors disabled:cursor-not-allowed"
              >
                {actionInProgress === 'partial payment release' ? 'Processing...' : 'Release Partial'}
              </button>
            </div>

            {/* Release Final Payment */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">Release Final Payment</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Release remaining funds to complete the job
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  Amount: {formatAmount((parseInt(job.amount) * (100 - parseInt(job.partial_pct)) / 100).toString())} USDC
                </p>
              </div>
              <button
                onClick={handleReleaseFinal}
                disabled={isActionDisabled}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded text-sm transition-colors disabled:cursor-not-allowed"
              >
                {actionInProgress === 'final payment release' ? 'Processing...' : 'Release Final'}
              </button>
            </div>

            {/* Open Dispute */}
            <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
              <div>
                <h4 className="font-medium text-red-900">Open Dispute</h4>
                <p className="text-sm text-red-700 mt-1">
                  Open a dispute if there are issues with the work. Requires platform intervention.
                </p>
              </div>
              <button
                onClick={handleOpenDispute}
                disabled={isActionDisabled}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded text-sm transition-colors disabled:cursor-not-allowed"
              >
                {actionInProgress === 'dispute opening' ? 'Processing...' : 'Open Dispute'}
              </button>
            </div>
          </div>
        </div>

        {/* Transaction Status */}
        {(isWritePending || isConfirming) && (
          <div className="p-4 bg-blue-50 border-t border-blue-200">
            <div className="flex items-center justify-between text-sm text-blue-700 mb-2">
              <span>Processing transaction...</span>
              <span className="font-medium">
                {isConfirming ? 'Confirming...' : 'Transaction Submitted'}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  isConfirming ? 'bg-blue-500 w-3/4' : 'bg-blue-400 w-1/2'
                }`}
              ></div>
            </div>
            {currentTxHash && (
              <p className="text-xs text-blue-600 mt-2 break-all">
                TX: {currentTxHash}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};