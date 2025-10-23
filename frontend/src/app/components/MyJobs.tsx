'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apolloClient } from '@/lib/apollo';
import { gql } from '@apollo/client';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { JobManagement } from './JobManagement';

// Types
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

// GraphQL responses
interface JobsByClientData {
  jobsByClient: Job[];
}

interface ApplicationsByClientData {
  applicationsByClient: {
    success: boolean;
    message: string;
    applications: Application[];
  };
}

interface DeleteJobData {
  deleteJob: {
    success: boolean;
    message: string;
    job: {
      job_id: string;
      deleted: boolean;
    };
  };
}

interface ApplicationStatusData {
  updateApplicationStatus: {
    success: boolean;
    message: string;
    application: Application;
  };
}

// GraphQL queries
const GET_MY_JOBS = gql`
  query JobsByClient($client: String!, $limit: Int!) {
    jobsByClient(client: $client, limit: $limit) {
      job_id
      client
      token_addr
      amount
      partial_pct
      tx_hash
      block_number
      block_timestamp
      description
      deleted
    }
  }
`;

const GET_APPLICATIONS_BY_CLIENT = gql`
  query ApplicationsByClient($client_address: String!) {
    applicationsByClient(client_address: $client_address) {
      success
      message
      applications {
        id
        job_id
        applicant_address
        applicant_fid
        applicant_username
        applicant_display_name
        applicant_pfp_url
        application_message
        status
        applied_at
        hired_by
        hired_at
        job {
          client
          amount
          description
        }
      }
    }
  }
`;

const UPDATE_APPLICATION_STATUS = gql`
  mutation UpdateApplicationStatus($input: ApplicationStatusInput!) {
    updateApplicationStatus(input: $input) {
      success
      message
      application {
        id
        status
        hired_by
        hired_at
      }
    }
  }
`;

const DELETE_JOB = gql`
  mutation DeleteJob($jobId: String!, $deletedBy: String!) {
    deleteJob(jobId: $jobId, deletedBy: $deletedBy) {
      success
      message
      job {
        job_id
        deleted
      }
    }
  }
`;

export default function MyJobs() {
  const { address, isConnected } = useAccount();
  
  // Contract interaction
  const { writeContract, isPending: isContractPending } = useWriteContract();
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | undefined>(undefined);
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ 
    hash: currentTxHash 
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [appsLoading, setAppsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [managingJob, setManagingJob] = useState<Job | null>(null);
  const [hiringInProgress, setHiringInProgress] = useState<string | null>(null);

  // Fetch jobs
  const fetchMyJobs = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const result = await apolloClient.query<JobsByClientData>({
        query: GET_MY_JOBS,
        variables: { 
          client: address.toLowerCase(),
          limit: 50 
        },
        fetchPolicy: 'network-only',
      });

      if (result.data?.jobsByClient) {
        setJobs(result.data.jobsByClient);
      } else {
        setJobs([]);
      }
    } catch (err: any) {
      console.error('Error fetching jobs:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Fetch applications
  const fetchApplications = useCallback(async () => {
    if (!address) return;

    setAppsLoading(true);
    try {
      const result = await apolloClient.query<ApplicationsByClientData>({
        query: GET_APPLICATIONS_BY_CLIENT,
        variables: { 
          client_address: address.toLowerCase()
        },
        fetchPolicy: 'network-only',
      });

      if (result.data?.applicationsByClient?.success) {
        setApplications(result.data.applicationsByClient.applications);
      } else {
        setApplications([]);
      }
    } catch (err: any) {
      console.error('Error fetching applications:', err);
    } finally {
      setAppsLoading(false);
    }
  }, [address]);

  // Initial data loading
  useEffect(() => {
    if (address) {
      fetchMyJobs();
      fetchApplications();
      const interval = setInterval(fetchApplications, 10000);
      return () => clearInterval(interval);
    } else {
      setJobs([]);
      setApplications([]);
      setLoading(false);
    }
  }, [address, fetchMyJobs, fetchApplications]);

  // Handle successful transaction confirmation
  useEffect(() => {
    if (isConfirmed && currentTxHash) {
      console.log('✅ Transaction confirmed:', currentTxHash);
      setStatusMessage('✅ Worker assigned successfully on-chain!');
      setCurrentTxHash(undefined);
      setHiringInProgress(null);
      
      // Refresh data
      setTimeout(() => {
        fetchApplications();
        fetchMyJobs();
      }, 2000);
    }
  }, [isConfirmed, currentTxHash, fetchApplications, fetchMyJobs]);

  const getApplicationsForJob = (jobId: string) => {
    return applications.filter(app => app.job_id === jobId);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!address) {
      setStatusMessage('Please connect your wallet to delete jobs');
      return;
    }

    setStatusMessage('Deleting job...');

    try {
      const result = await apolloClient.mutate<DeleteJobData>({
        mutation: DELETE_JOB,
        variables: { 
          jobId: jobId,
          deletedBy: address
        },
      });

      if (result.data?.deleteJob?.success) {
        setStatusMessage('✅ Job deleted successfully');
        await fetchMyJobs();
      } else {
        setStatusMessage(`❌ ${result.data?.deleteJob?.message || 'Failed to delete job'}`);
      }
    } catch (err: any) {
      console.error('Delete job error:', err);
      setStatusMessage(`❌ ${err.message}`);
    }
  };

  const handleHire = async (application: Application) => {
    if (!address) {
      setStatusMessage('Please connect your wallet to hire applicants');
      return;
    }

    // Prevent multiple hires
    if (hiringInProgress) {
      setStatusMessage('Please wait for the current hire to complete');
      return;
    }

    // Check if this job already has a hired applicant
    const jobApplications = getApplicationsForJob(application.job_id);
    const alreadyHired = jobApplications.some(app => 
      app.status === 'HIRED' && app.id !== application.id
    );

    if (alreadyHired) {
      setStatusMessage('❌ This job already has a hired applicant');
      return;
    }

    setHiringInProgress(application.id);
    setStatusMessage('Hiring applicant...');

    try {
      // First update application status in GraphQL
      const result = await apolloClient.mutate<ApplicationStatusData>({
        mutation: UPDATE_APPLICATION_STATUS,
        variables: {
          input: {
            application_id: application.id,
            status: 'HIRED',
            hired_by: address,
          },
        },
      });

      if (result.data?.updateApplicationStatus?.success) {
        setStatusMessage('Application marked as hired! Assigning worker on-chain...');
        
        // Convert job_id to number and validate
        const jobId = parseInt(application.job_id);
        if (isNaN(jobId)) {
          throw new Error('Invalid job ID format');
        }

        // Get the worker address
        const workerAddress = application.applicant_address;
        
        if (!workerAddress) {
          throw new Error('Applicant has no Ethereum address - cannot assign on-chain');
        }

        // Import contract details dynamically to avoid SSR issues
        const TalentEscrowJson = (await import('@/abi/TalentEscrow.json')).default;
        const { ESCROW_ADDRESS } = await import('@/lib/escrow');

        // Call the smart contract to assign the worker
        writeContract({
          address: ESCROW_ADDRESS as `0x${string}`,
          abi: TalentEscrowJson,
          functionName: 'assignWorker',
          args: [BigInt(jobId), workerAddress as `0x${string}`],
        }, {
          onSuccess: (hash) => {
            console.log('✅ Transaction submitted:', hash);
            setCurrentTxHash(hash);
          }
        });

        // Refresh applications list immediately
        await fetchApplications();
      } else {
        setStatusMessage(`❌ Failed to update application: ${result.data?.updateApplicationStatus?.message}`);
        setHiringInProgress(null);
      }
    } catch (err: any) {
      console.error('❌ Hire error:', err);
      setStatusMessage(`❌ Failed to hire: ${err.message}`);
      setHiringInProgress(null);
    }
  };

  const handleReject = async (applicationId: string) => {
    if (!address) {
      setStatusMessage('Please connect your wallet to reject applicants');
      return;
    }

    setStatusMessage('Rejecting application...');

    try {
      const result = await apolloClient.mutate<ApplicationStatusData>({
        mutation: UPDATE_APPLICATION_STATUS,
        variables: {
          input: {
            application_id: applicationId,
            status: 'REJECTED',
            hired_by: address,
          },
        },
      });

      if (result.data?.updateApplicationStatus?.success) {
        setStatusMessage('✅ Application rejected');
        await fetchApplications();
      } else {
        setStatusMessage(`❌ Failed to reject: ${result.data?.updateApplicationStatus?.message}`);
      }
    } catch (err: any) {
      console.error('Reject error:', err);
      setStatusMessage(`❌ Failed to reject: ${err.message}`);
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr) return 'N/A';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (amount: string) => {
    return new Intl.NumberFormat('en-US').format(parseInt(amount) / 1000000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HIRED': return 'bg-green-100 text-green-800 border-green-200';
      case 'REJECTED': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  // Close management modal and refresh data
  const handleManagementClose = () => {
    setManagingJob(null);
    fetchMyJobs();
    fetchApplications();
  };

  // Check if application is being hired
  const isApplicationHiring = (applicationId: string) => {
    return hiringInProgress === applicationId;
  };

  const getHireButtonText = (applicationId: string) => {
    if (hiringInProgress === applicationId) {
      if (currentTxHash) {
        return isConfirming ? 'Confirming...' : 'Assigning...';
      }
      return 'Hiring...';
    }
    return 'Hire';
  };

  if (!isConnected || !address) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🔐</div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Connect Your Wallet</h3>
          <p className="text-gray-500">
            Connect your wallet to view and manage your job postings.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-600 mt-3 text-sm">Loading your jobs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          <p className="font-semibold">Error loading your jobs</p>
          <p className="mt-1 opacity-90">{error}</p>
          <button 
            onClick={fetchMyJobs}
            className="mt-3 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            My Jobs
          </h2>
          <p className="text-gray-600 text-sm mt-1">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} posted • {applications.length} total application{applications.length !== 1 ? 's' : ''} • {formatAddress(address)}
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchApplications}
            disabled={appsLoading}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded transition-colors flex items-center gap-1 border border-gray-300 disabled:opacity-50"
          >
            {appsLoading ? 'Refreshing...' : 'Refresh Apps'}
          </button>
          <button 
            onClick={fetchMyJobs}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded transition-colors flex items-center gap-1 border border-gray-300"
          >
            Refresh Jobs
          </button>
        </div>
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${
          statusMessage.includes('✅') 
            ? 'bg-green-50 border-green-200 text-green-700'
            : statusMessage.includes('❌')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          {statusMessage}
        </div>
      )}

      {/* Transaction Progress Indicator */}
      {(isContractPending || isConfirming) && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-sm text-blue-700 mb-2">
            <span>Assigning Worker on-chain</span>
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

      {/* Job Management Modal */}
      {managingJob && (
        <JobManagement 
          job={managingJob}
          applications={getApplicationsForJob(managingJob.job_id)}
          onClose={handleManagementClose}
          onStatusUpdate={setStatusMessage}
        />
      )}

      {/* Jobs List */}
      {jobs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
          <div className="text-gray-400 text-4xl mb-3">💼</div>
          <h3 className="text-lg font-bold text-gray-700 mb-2">No jobs posted yet</h3>
          <p className="text-gray-500 text-sm">
            Create your first job posting to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {jobs.map((job) => {
            const jobApplications = getApplicationsForJob(job.job_id);
            const isExpanded = expandedJob === job.job_id;
            const hasHiredApplicant = jobApplications.some(app => app.status === 'HIRED');
            
            return (
              <div key={job.job_id} className="bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-all duration-200 hover:shadow-sm">
                {/* Job Header */}
                <div className="p-4 border-b border-gray-100">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-bold text-gray-900">#{job.job_id}</span>
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">
                          Your Post
                        </span>
                        {hasHiredApplicant && (
                          <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs rounded border border-green-200">
                            Hired
                          </span>
                        )}
                        {jobApplications.length > 0 && (
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-xs rounded border border-purple-200">
                            {jobApplications.length} application{jobApplications.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDate(job.block_timestamp)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{formatAmount(job.amount)}</div>
                      <div className="text-xs text-gray-600">USDC</div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mt-3">
                    <p className="text-gray-700 text-sm">
                      {job.description || (
                        <span className="text-gray-400 italic">No description</span>
                      )}
                    </p>
                  </div>

                  {/* Job Details */}
                  <div className="grid grid-cols-2 gap-4 text-xs border-t border-gray-100 pt-3 mt-3">
                    <div>
                      <span className="text-gray-500 block mb-0.5">Token</span>
                      <div className="text-gray-800 font-mono">
                        {formatAddress(job.token_addr)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-0.5">Block</span>
                      <div className="text-gray-800">#{job.block_number}</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}
                      className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded text-sm transition-all duration-200 flex items-center justify-center gap-1"
                    >
                      <span>{isExpanded ? '▲' : '▼'}</span>
                      {isExpanded ? 'Hide' : 'Show'} Applications ({jobApplications.length})
                    </button>
                    
                    {/* Manage Job Button - Only show if hired */}
                    {hasHiredApplicant && (
                      <button
                        onClick={() => setManagingJob(job)}
                        className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded text-sm transition-all duration-200 flex items-center justify-center gap-1"
                      >
                        <span>⚙️</span>
                        Manage Job
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteJob(job.job_id)}
                      disabled={hasHiredApplicant}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-400 text-white font-medium rounded text-sm transition-all duration-200 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      title={hasHiredApplicant ? "Cannot delete job with hired applicant" : "Delete job"}
                    >
                      <span>🗑️</span>
                    </button>
                    
                    <a 
                      href={`https://sepolia.basescan.org/tx/${job.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm transition-colors flex items-center justify-center border border-gray-300"
                    >
                      <span>🔗</span>
                    </a>
                  </div>
                </div>

                {/* Applications Section */}
                {isExpanded && (
                  <div className="p-4 bg-gray-50 border-t border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-3">Applications</h4>
                    
                    {jobApplications.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-gray-500 text-sm">No applications yet</p>
                        <p className="text-gray-400 text-xs mt-1">Applications will appear here when people apply to your job</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {jobApplications.map((application) => (
                          <div 
                            key={application.id} 
                            className={`border rounded-lg p-3 ${
                              application.status === 'HIRED' 
                                ? 'bg-green-50 border-green-200' 
                                : application.status === 'REJECTED'
                                ? 'bg-red-50 border-red-200'
                                : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-3 flex-1">
                                {/* Applicant Avatar */}
                                {application.applicant_pfp_url ? (
                                  <img 
                                    src={application.applicant_pfp_url} 
                                    alt="Profile" 
                                    className="w-8 h-8 rounded-full"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                    <span className="text-gray-500 text-xs">👤</span>
                                  </div>
                                )}

                                {/* Applicant Info */}
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h5 className="font-medium text-gray-900 text-sm">
                                      {application.applicant_display_name || application.applicant_username || 'Anonymous Applicant'}
                                    </h5>
                                    {application.applicant_fid && (
                                      <a 
                                        href={`https://warpcast.com/${application.applicant_username || application.applicant_fid}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
                                      >
                                        <span>🌊</span>
                                        Farcaster
                                      </a>
                                    )}
                                  </div>

                                  {application.applicant_address ? (
                                    <p className="text-gray-600 text-xs font-mono">
                                      {formatAddress(application.applicant_address)}
                                    </p>
                                  ) : (
                                    <p className="text-gray-400 text-xs">
                                      No Ethereum address (Farcaster-only applicant)
                                    </p>
                                  )}

                                  {application.application_message && (
                                    <p className="text-gray-700 text-sm mt-2">
                                      "{application.application_message}"
                                    </p>
                                  )}

                                  <p className="text-gray-500 text-xs mt-2">
                                    Applied {formatDate(application.applied_at)}
                                  </p>
                                </div>
                              </div>

                              {/* Status and Actions */}
                              <div className="text-right ml-4">
                                <div className={`text-xs font-medium px-2 py-1 rounded-full mb-2 ${getStatusColor(application.status)}`}>
                                  {application.status}
                                </div>

                                {application.status === 'PENDING' && (
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => handleReject(application.id)}
                                      disabled={hasHiredApplicant || isApplicationHiring(application.id)}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50"
                                      title={hasHiredApplicant ? "Cannot reject - job already has hired applicant" : "Reject application"}
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => handleHire(application)}
                                      disabled={!application.applicant_address || hasHiredApplicant || isApplicationHiring(application.id)}
                                      className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1 min-w-20 justify-center"
                                      title={
                                        !application.applicant_address 
                                          ? "Cannot hire - applicant has no Ethereum address" 
                                          : hasHiredApplicant 
                                          ? "Cannot hire - job already has hired applicant"
                                          : "Hire applicant"
                                      }
                                    >
                                      {isApplicationHiring(application.id) ? (
                                        <>
                                          <div className="animate-spin rounded-full h-2 w-2 border-b-2 border-white"></div>
                                          {getHireButtonText(application.id)}
                                        </>
                                      ) : (
                                        'Hire'
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}