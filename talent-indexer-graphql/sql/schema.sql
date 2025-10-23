-- talent_escrow_schema.sql
CREATE SCHEMA IF NOT EXISTS talent_escrow;

-- JobCreated
CREATE TABLE IF NOT EXISTS talent_escrow.job_created (
    contract_address TEXT,
    job_id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    token_addr TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    partial_pct NUMERIC,
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    block_hash TEXT,
    network TEXT,
    tx_index TEXT,
    log_index TEXT,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_by TEXT,
    deleted_at TIMESTAMPTZ
);

-- JobAccepted (on-chain applications)
CREATE TABLE IF NOT EXISTS talent_escrow.job_accepted (
    contract_address TEXT,
    job_id TEXT NOT NULL,
    worker TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    block_hash TEXT,
    network TEXT,
    tx_index TEXT,
    log_index TEXT,
    PRIMARY KEY (tx_hash, log_index)
);

-- Applications (off-chain applications with rich data)
CREATE TABLE IF NOT EXISTS talent_escrow.applications (
    id SERIAL PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES talent_escrow.job_created(job_id),
    applicant_address TEXT,
    applicant_fid TEXT,
    applicant_username TEXT,
    applicant_display_name TEXT,
    applicant_pfp_url TEXT,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'PENDING',
    application_message TEXT,
    hired_by TEXT,
    hired_at TIMESTAMPTZ,
    on_chain_applied BOOLEAN DEFAULT FALSE,
    on_chain_tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PartialReleased
CREATE TABLE IF NOT EXISTS talent_escrow.partial_released (
    contract_address TEXT,
    job_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    block_hash TEXT,
    network TEXT,
    tx_index TEXT,
    log_index TEXT,
    PRIMARY KEY (tx_hash, log_index)
);

-- FinalReleased
CREATE TABLE IF NOT EXISTS talent_escrow.final_released (
    contract_address TEXT,
    job_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    block_hash TEXT,
    network TEXT,
    tx_index TEXT,
    log_index TEXT,
    PRIMARY KEY (tx_hash, log_index)
);

-- DisputeOpened
CREATE TABLE IF NOT EXISTS talent_escrow.dispute_opened (
    contract_address TEXT,
    job_id TEXT NOT NULL,
    opener TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    block_hash TEXT,
    network TEXT,
    tx_index TEXT,
    log_index TEXT,
    PRIMARY KEY (tx_hash, log_index)
);

-- DisputeResolved
CREATE TABLE IF NOT EXISTS talent_escrow.dispute_resolved (
    contract_address TEXT,
    job_id TEXT NOT NULL,
    client_amount NUMERIC NOT NULL,
    worker_amount NUMERIC NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    block_hash TEXT,
    network TEXT,
    tx_index TEXT,
    log_index TEXT,
    PRIMARY KEY (tx_hash, log_index)
);

-- Job Metadata
CREATE TABLE IF NOT EXISTS talent_escrow.job_metadata (
    job_id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_created_client ON talent_escrow.job_created(client);
CREATE INDEX IF NOT EXISTS idx_job_created_deleted ON talent_escrow.job_created(deleted);
CREATE INDEX IF NOT EXISTS idx_job_created_block_number ON talent_escrow.job_created(block_number DESC);
CREATE INDEX IF NOT EXISTS idx_job_accepted_job_id ON talent_escrow.job_accepted(job_id);
CREATE INDEX IF NOT EXISTS idx_job_metadata_job_id ON talent_escrow.job_metadata(job_id);
CREATE INDEX IF NOT EXISTS idx_job_created_client_lower ON talent_escrow.job_created(LOWER(client));
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON talent_escrow.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON talent_escrow.applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_fid ON talent_escrow.applications(applicant_fid);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON talent_escrow.applications(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_on_chain ON talent_escrow.applications(on_chain_applied);