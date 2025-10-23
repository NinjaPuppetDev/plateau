export interface Job {
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

export interface Application {
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