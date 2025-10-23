// src/app/components/CreateJob.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { Contract, Interface } from 'ethers';
import ERC20Abi from '@/abi/ERC20.json';
import TalentEscrowJson from '@/abi/TalentEscrow.json';
import { ESCROW_ADDRESS, TOKEN_ADDRESS } from '@/lib/escrow';
import { apolloClient } from '@/lib/apollo';
import { gql } from '@apollo/client';

// Type definitions for GraphQL responses
interface JobMetadata {
  job_id: string;
  description: string;
}

interface AddJobMetadataResponse {
  success: boolean;
  message: string;
  job: JobMetadata | null;
}

interface MutationResult {
  addJobMetadata: AddJobMetadataResponse;
}

const ADD_JOB_METADATA_MUTATION = gql`
  mutation AddJobMetadata($input: JobMetadataInput!) {
    addJobMetadata(input: $input) {
      success
      message
      job {
        job_id
        description
      }
    }
  }
`;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function parseTokenAmount(amountStr: string, decimals: number): bigint | null {
  if (!amountStr || Number.isNaN(Number(amountStr))) return null;
  const s = amountStr.trim();
  if (!s) return null;
  if (s.startsWith('-')) return null;
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) return null;
  const wholePart = BigInt(whole || '0');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const fracPart = BigInt(fracPadded || '0');
  const multiplier = BigInt(10) ** BigInt(decimals);
  return wholePart * multiplier + fracPart;
}

export default function CreateJob() {
  const { address, isConnected } = useAccount();
  
  // State for both approval and createJob transactions
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'creating'>('idle');
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>(undefined);
  const [createJobHash, setCreateJobHash] = useState<`0x${string}` | undefined>(undefined);
  
  const { writeContract: writeApprove, error: approveError, isPending: isApprovePending } = useWriteContract();
  const { writeContract: writeCreateJob, error: createJobError, isPending: isCreateJobPending } = useWriteContract();
  
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ 
    hash: approvalHash 
  });
  const { isLoading: isCreateJobConfirming, isSuccess: isCreateJobConfirmed, data: receipt } = useWaitForTransactionReceipt({ 
    hash: createJobHash 
  });

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('100');
  const [partial, setPartial] = useState('40');
  const [decimals, setDecimals] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Read token decimals and current allowance
  const { data: tokenDecimals } = useReadContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20Abi,
    functionName: 'decimals',
    query: {
      enabled: !!TOKEN_ADDRESS && TOKEN_ADDRESS !== ZERO_ADDRESS,
    },
  });

  const { data: currentAllowance } = useReadContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20Abi,
    functionName: 'allowance',
    args: [address as `0x${string}`, ESCROW_ADDRESS as `0x${string}`],
    query: {
      enabled: !!address && !!TOKEN_ADDRESS && TOKEN_ADDRESS !== ZERO_ADDRESS,
    },
  });

  useEffect(() => {
    if (tokenDecimals !== undefined) {
      setDecimals(Number(tokenDecimals));
    }
  }, [tokenDecimals]);

  const parsedAmount = useMemo(() => {
    if (decimals === null) return null;
    return parseTokenAmount(amount, decimals);
  }, [amount, decimals]);

  // Check if we need approval
  const needsApproval = useMemo(() => {
    if (!parsedAmount || !currentAllowance) return true;
    return BigInt(currentAllowance.toString()) < parsedAmount;
  }, [parsedAmount, currentAllowance]);

  function parseJobIdFromReceipt(receipt: any): string | null {
    try {
      const iface = new Interface(TalentEscrowJson as any);
      for (const log of receipt.logs || []) {
        if (!log || !log.address) continue;
        if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) continue;
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'JobCreated') {
            const raw = parsed.args?.jobId ?? parsed.args?.[0];
            return raw?.toString ? raw.toString() : String(raw);
          }
        } catch (e) {
          // not parseable
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Handle metadata saving after job creation
  useEffect(() => {
    if (isCreateJobConfirmed && receipt) {
      const jobId = parseJobIdFromReceipt(receipt);
      if (jobId && description.trim()) {
        setStatus(`Job ${jobId} created on-chain! Saving description...`);
        
        apolloClient.mutate<MutationResult>({
          mutation: ADD_JOB_METADATA_MUTATION,
          variables: { 
            input: { 
              jobId: jobId, 
              description: description.trim() 
            } 
          },
        }).then(result => {
          if (result.data?.addJobMetadata?.success) {
            setStatus(`✅ ${result.data.addJobMetadata.message}`);
          } else {
            setStatus(`⚠ Job created but: ${result.data?.addJobMetadata?.message}`);
          }
          
          // Reset form and state
          setDescription('');
          setAmount('100');
          setPartial('40');
          setCurrentStep('idle');
          setApprovalHash(undefined);
          setCreateJobHash(undefined);

          // Refresh jobs list
          apolloClient.refetchQueries({ include: ['LatestJobs'] });
        }).catch(gErr => {
          console.warn('GraphQL metadata error', gErr);
          setStatus(`⚠ Job ${jobId} created but description save failed: ${gErr.message}`);
        });
      } else if (jobId) {
        setStatus(`✅ Job ${jobId} created successfully (no description provided).`);
        
        // Reset form and state
        setDescription('');
        setAmount('100');
        setPartial('40');
        setCurrentStep('idle');
        setApprovalHash(undefined);
        setCreateJobHash(undefined);
        
        // Refresh jobs list
        apolloClient.refetchQueries({ include: ['LatestJobs'] });
      }
    }
  }, [isCreateJobConfirmed, receipt, description]);

  // Automatically create job after approval is confirmed
  useEffect(() => {
    if (isApproveConfirmed && parsedAmount && currentStep === 'approving') {
      setCurrentStep('creating');
      setStatus('Token approved! Creating job...');
      
      writeCreateJob({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: TalentEscrowJson,
        functionName: 'createJob',
        args: [parsedAmount, Number(partial)],
      }, {
        onSuccess: (hash) => {
          setCreateJobHash(hash);
        },
        onError: (err) => {
          console.error('Create job error:', err);
          setStatus(`❌ Failed to create job: ${err.message}`);
          setCurrentStep('idle');
        }
      });
    }
  }, [isApproveConfirmed, parsedAmount, partial, currentStep, writeCreateJob]);

  const handleCreateJob = async () => {
    setStatus(null);

    if (!isConnected || !address) {
      setStatus('Wallet not connected.');
      return;
    }

    const requiredAmount = parsedAmount;
    if (!requiredAmount) {
      setStatus('Invalid amount (check decimals).');
      return;
    }

    const pct = Number(partial);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      setStatus('Partial % must be 0–100');
      return;
    }

    if (!ESCROW_ADDRESS || ESCROW_ADDRESS === ZERO_ADDRESS) {
      setStatus('Escrow address is not configured.');
      return;
    }

    try {
      if (needsApproval) {
        setCurrentStep('approving');
        setStatus('Approving USDC spending...');
        
        writeApprove({
          address: TOKEN_ADDRESS as `0x${string}`,
          abi: ERC20Abi,
          functionName: 'approve',
          args: [ESCROW_ADDRESS as `0x${string}`, requiredAmount],
        }, {
          onSuccess: (hash) => {
            setApprovalHash(hash);
          },
          onError: (err) => {
            console.error('Approve error:', err);
            setStatus(`❌ Approval failed: ${err.message}`);
            setCurrentStep('idle');
          }
        });
      } else {
        setCurrentStep('creating');
        setStatus('Creating job...');
        
        writeCreateJob({
          address: ESCROW_ADDRESS as `0x${string}`,
          abi: TalentEscrowJson,
          functionName: 'createJob',
          args: [requiredAmount, pct],
        }, {
          onSuccess: (hash) => {
            setCreateJobHash(hash);
          },
          onError: (err) => {
            console.error('Create job error:', err);
            setStatus(`❌ Failed to create job: ${err.message}`);
            setCurrentStep('idle');
          }
        });
      }
    } catch (err: any) {
      console.error('Transaction error:', err);
      setStatus(`❌ Error: ${err.message}`);
      setCurrentStep('idle');
    }
  };

  const getButtonText = () => {
    if (currentStep === 'approving') {
      if (isApprovePending) return 'Approving USDC...';
      if (isApproveConfirming) return 'Waiting for approval confirmation...';
      return 'Approving...';
    }
    
    if (currentStep === 'creating') {
      if (isCreateJobPending) return 'Creating Job...';
      if (isCreateJobConfirming) return 'Confirming Job Creation...';
      return 'Creating...';
    }

    return needsApproval ? 'Approve & Create Job' : 'Create Job';
  };

  const isButtonDisabled = isApprovePending || isApproveConfirming || isCreateJobPending || isCreateJobConfirming || !description.trim();

  if (!isConnected) {
    return (
      <div className="text-center p-6 bg-gray-50 rounded-lg">
        <p className="text-gray-600">Please connect your wallet to create a job</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Create Job</h3>
        <div className="text-sm text-gray-600">
          {decimals !== null ? `${decimals} decimals` : 'Loading token...'}
        </div>
      </div>

      {/* Progress indicator */}
      {(currentStep === 'approving' || currentStep === 'creating') && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>1. Approve Token</span>
            <span>2. Create Job</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                currentStep === 'approving' ? 'bg-yellow-500 w-1/2' : 'bg-green-500 w-full'
              }`}
            ></div>
          </div>
        </div>
      )}

      <label className="block text-sm font-medium text-gray-700 mb-1">Token</label>
      <div className="mb-4">
        <select className="w-full p-3 rounded-lg bg-gray-50 border border-gray-300 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" disabled>
          <option>{TOKEN_ADDRESS ?? 'Token not configured'}</option>
        </select>
      </div>

      <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full mt-1 p-3 rounded-lg bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
        rows={4}
        placeholder="Describe the job requirements, deliverables, and timeline..."
        disabled={currentStep !== 'idle'}
      />

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USDC)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-3 rounded-lg bg-gray-50 border border-gray-300 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={currentStep !== 'idle'}
            type="number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Partial Payment %</label>
          <input
            value={partial}
            onChange={(e) => setPartial(e.target.value)}
            className="w-full p-3 rounded-lg bg-gray-50 border border-gray-300 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={currentStep !== 'idle'}
            type="number"
            min="0"
            max="100"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleCreateJob}
          disabled={isButtonDisabled}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {currentStep !== 'idle' && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          )}
          {getButtonText()}
        </button>

        <button
          onClick={() => {
            setDescription('');
            setAmount('100');
            setPartial('40');
            setStatus(null);
            setCurrentStep('idle');
            setApprovalHash(undefined);
            setCreateJobHash(undefined);
          }}
          disabled={currentStep !== 'idle'}
          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-all duration-300 disabled:opacity-50 border border-gray-300"
        >
          Reset
        </button>
      </div>

      {status && (
        <div className={`mt-4 p-4 rounded-lg border text-sm break-words ${
          status.includes('✅') || status.includes('Success') 
            ? 'bg-green-50 border-green-200 text-green-800'
            : status.includes('⚠') 
            ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
            : status.includes('❌')
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-gray-50 border-gray-200 text-gray-800'
        }`}>
          {status}
        </div>
      )}

      {approvalHash && (
        <div className="mt-3 text-sm text-gray-600 break-all">
          Approval TX: {approvalHash}
        </div>
      )}

      {createJobHash && (
        <div className="mt-3 text-sm text-gray-600 break-all">
          Create Job TX: {createJobHash}
        </div>
      )}

      {(approveError || createJobError) && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          Error: {approveError?.message || createJobError?.message}
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 text-xs text-gray-500">
        <p>• Job will be created on Base Sepolia testnet</p>
        <p>• Two transactions required: Approve USDC + Create Job</p>
        <p>• Make sure you have enough USDC and ETH for gas</p>
      </div>
    </div>
  );
}