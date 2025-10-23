import { gql } from "@apollo/client";

export const GET_LATEST_JOBS = gql`
  query LatestJobs($limit: Int!) {
    latestJobs(limit: $limit) {
      job_id
      client
      token_addr
      amount
      partial_pct
      tx_hash
      block_number
      block_timestamp
      description
    }
  }
`;

export const GET_JOB_BY_ID = gql`
  query JobById($jobId: String!) {
    jobById(jobId: $jobId) {
      job_id
      client
      token_addr
      amount
      partial_pct
      tx_hash
      block_number
      block_timestamp
      description
    }
  }
`;
