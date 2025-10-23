import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { createServer as createHttpServer } from "http";
import { createSchema, createYoga } from "graphql-yoga";
import { Pool } from "pg";
import { ethers } from "ethers";

const config = {
  RPC_URL: String(process.env.RPC_URL ?? ""),
  CONTRACT_ADDRESS: String(process.env.CONTRACT_ADDRESS ?? ""),
  DATABASE_URL: String(process.env.DATABASE_URL ?? ""),
  GRAPHQL_PORT: Number(process.env.GRAPHQL_PORT ?? 4000),
  START_BLOCK: Number(process.env.START_BLOCK ?? 0),
  BATCH_SIZE: Number(process.env.BATCH_SIZE ?? 10),
  CONFIRMATIONS: Number(process.env.CONFIRMATIONS ?? 2),
};

if (!config.RPC_URL || !config.CONTRACT_ADDRESS || !config.DATABASE_URL) {
  console.error("Missing required env: RPC_URL, CONTRACT_ADDRESS or DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: config.DATABASE_URL, max: 20, idleTimeoutMillis: 30000 });

// Database operations
const db = {
  async initializeSchema() {
    try {
      // Drop and recreate schema for clean start
      await pool.query(`DROP SCHEMA IF EXISTS talent_escrow CASCADE`);
      await pool.query(`CREATE SCHEMA IF NOT EXISTS talent_escrow`);
      
      console.log("🔄 Creating fresh database schema...");

      // Create all tables with proper structure
      const tables = [
        // Job Created Table
        `CREATE TABLE talent_escrow.job_created (
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
        )`,

        // Job Accepted Table
        `CREATE TABLE talent_escrow.job_accepted (
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
        )`,

        // Applications Table
        `CREATE TABLE talent_escrow.applications (
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
        )`,

        // Partial Released Table
        `CREATE TABLE talent_escrow.partial_released (
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
        )`,

        // Final Released Table
        `CREATE TABLE talent_escrow.final_released (
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
        )`,

        // Dispute Opened Table
        `CREATE TABLE talent_escrow.dispute_opened (
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
        )`,

        // Dispute Resolved Table
        `CREATE TABLE talent_escrow.dispute_resolved (
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
        )`,

        // Job Metadata Table
        `CREATE TABLE talent_escrow.job_metadata (
          job_id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`
      ];

      for (const tableSql of tables) {
        await pool.query(tableSql);
        console.log(`✅ Created table: ${tableSql.split('(')[0].split('IF NOT EXISTS').pop()?.trim()}`);
      }

      // Create indexes
      const indexes = [
        `CREATE INDEX idx_job_created_client ON talent_escrow.job_created(client)`,
        `CREATE INDEX idx_job_created_deleted ON talent_escrow.job_created(deleted)`,
        `CREATE INDEX idx_job_created_block_number ON talent_escrow.job_created(block_number DESC)`,
        `CREATE INDEX idx_job_accepted_job_id ON talent_escrow.job_accepted(job_id)`,
        `CREATE INDEX idx_job_metadata_job_id ON talent_escrow.job_metadata(job_id)`,
        `CREATE INDEX idx_job_created_client_lower ON talent_escrow.job_created(LOWER(client))`,
        `CREATE INDEX idx_applications_job_id ON talent_escrow.applications(job_id)`,
        `CREATE INDEX idx_applications_status ON talent_escrow.applications(status)`,
        `CREATE INDEX idx_applications_applicant_fid ON talent_escrow.applications(applicant_fid)`,
        `CREATE INDEX idx_applications_applied_at ON talent_escrow.applications(applied_at DESC)`,
        `CREATE INDEX idx_applications_on_chain ON talent_escrow.applications(on_chain_applied)`
      ];

      for (const indexSql of indexes) {
        await pool.query(indexSql);
      }

      console.info("✅ DB schema initialized with fresh tables");
    } catch (error) {
      console.error("❌ DB schema initialization failed:", error);
      throw error;
    }
  },

  // Job operations
  async insertJobCreated(row: any) {
    const q = `
      INSERT INTO talent_escrow.job_created (
        contract_address, job_id, client, token_addr, amount, partial_pct,
        tx_hash, block_number, block_timestamp, block_hash, network, tx_index, log_index
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (job_id) DO UPDATE SET
        client = EXCLUDED.client,
        token_addr = EXCLUDED.token_addr,
        amount = EXCLUDED.amount,
        partial_pct = EXCLUDED.partial_pct,
        tx_hash = EXCLUDED.tx_hash,
        block_number = EXCLUDED.block_number,
        block_timestamp = EXCLUDED.block_timestamp
      RETURNING *
    `;
    const vals = [
      row.contract_address,
      row.job_id,
      row.client,
      row.token_addr,
      row.amount,
      row.partial_pct,
      row.tx_hash,
      row.block_number,
      row.block_timestamp,
      row.block_hash,
      'base-sepolia',
      row.tx_index,
      row.log_index,
    ];
    const res = await pool.query(q, vals);
    console.log(`✅ Job ${row.job_id} stored in database`);
    return res.rows[0];
  },

  async addJobMetadata(jobId: string, description: string) {
    console.log(`📝 Storing metadata for job ${jobId}: ${description.substring(0, 50)}...`);
    
    await pool.query(`
      INSERT INTO talent_escrow.job_metadata (job_id, description)
      VALUES($1,$2)
      ON CONFLICT (job_id) DO UPDATE SET 
        description = EXCLUDED.description, 
        created_at = NOW()
      RETURNING *
    `, [jobId, description]);
    console.log(`✅ Metadata stored for job ${jobId}`);
  },

  async getLatestJobs(limit = 50) {
    const { rows } = await pool.query(
      `SELECT j.*, m.description
       FROM talent_escrow.job_created j
       LEFT JOIN talent_escrow.job_metadata m ON j.job_id = m.job_id
       WHERE j.deleted = FALSE
       ORDER BY j.block_number DESC
       LIMIT $1`, 
      [limit]
    );
    return rows;
  },

  async getJobsByClient(clientAddress: string, limit = 50) {
    console.log(`🔍 Querying jobs for client: ${clientAddress}`);
    
    const { rows } = await pool.query(
      `SELECT j.*, m.description
       FROM talent_escrow.job_created j
       LEFT JOIN talent_escrow.job_metadata m ON j.job_id = m.job_id
       WHERE LOWER(j.client) = LOWER($1) AND j.deleted = FALSE
       ORDER BY j.block_number DESC
       LIMIT $2`, 
      [clientAddress, limit]
    );
    
    console.log(`📊 Found ${rows.length} jobs for client ${clientAddress}`);
    return rows;
  },

  async getJobById(jobId: string) {
    const { rows } = await pool.query(
      `SELECT j.*, m.description
       FROM talent_escrow.job_created j
       LEFT JOIN talent_escrow.job_metadata m ON j.job_id = m.job_id
       WHERE j.job_id = $1 AND j.deleted = FALSE`, 
      [jobId]
    );
    return rows[0] ?? null;
  },

  async jobExists(jobId: string) {
    const { rows } = await pool.query(
      `SELECT 1 FROM talent_escrow.job_created WHERE job_id = $1`,
      [jobId]
    );
    return rows.length > 0;
  },

  async getHighestBlockProcessed() {
    const { rows } = await pool.query(
      `SELECT MAX(block_number) as max_block FROM talent_escrow.job_created`
    );
    const maxBlock = rows[0]?.max_block;
    return maxBlock ? Number(maxBlock) : config.START_BLOCK;
  },

  async softDeleteJob(jobId: string, deletedBy: string) {
    console.log(`🗑️ Soft deleting job ${jobId} by ${deletedBy}`);
    
    const q = `
      UPDATE talent_escrow.job_created 
      SET deleted = TRUE, deleted_by = $2, deleted_at = NOW()
      WHERE job_id = $1 AND deleted = FALSE
      RETURNING *
    `;
    const result = await pool.query(q, [jobId, deletedBy]);
    return result.rows[0];
  },

  async canUserDeleteJob(jobId: string, userAddress: string): Promise<boolean> {
    console.log(`🔐 Checking delete permissions for job ${jobId} by ${userAddress}`);
    
    const { rows } = await pool.query(
      `SELECT 1 FROM talent_escrow.job_created 
       WHERE job_id = $1 AND LOWER(client) = LOWER($2) AND deleted = FALSE`,
      [jobId, userAddress]
    );
    
    const canDelete = rows.length > 0;
    console.log(`🔐 Delete permission for job ${jobId}: ${canDelete}`);
    return canDelete;
  },

  // Application operations
  async createApplication(input: any) {
    const {
      job_id,
      applicant_address,
      applicant_fid,
      applicant_username,
      applicant_display_name,
      applicant_pfp_url,
      application_message,
      on_chain_applied = false,
      on_chain_tx_hash = null
    } = input;

    const query = `
      INSERT INTO talent_escrow.applications (
        job_id, applicant_address, applicant_fid, applicant_username,
        applicant_display_name, applicant_pfp_url, application_message,
        on_chain_applied, on_chain_tx_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      job_id,
      applicant_address,
      applicant_fid,
      applicant_username,
      applicant_display_name,
      applicant_pfp_url,
      application_message,
      on_chain_applied,
      on_chain_tx_hash
    ];

    const result = await pool.query(query, values);
    console.log(`✅ Application created for job ${job_id} by ${applicant_address || applicant_fid}`);
    return result.rows[0];
  },

  async updateApplicationStatus(applicationId: number, status: string, hiredBy: string | null = null) {
    const query = `
      UPDATE talent_escrow.applications 
      SET status = $1, hired_by = $2, hired_at = CASE WHEN $1 = 'HIRED' THEN NOW() ELSE NULL END
      WHERE id = $3
      RETURNING *
    `;

    const values = [status, hiredBy, applicationId];
    const result = await pool.query(query, values);
    console.log(`✅ Application ${applicationId} status updated to ${status}`);
    return result.rows[0];
  },

  async getApplicationsByJob(jobId: string) {
    const query = `
      SELECT a.*, j.client, m.description as job_description
      FROM talent_escrow.applications a
      JOIN talent_escrow.job_created j ON a.job_id = j.job_id
      LEFT JOIN talent_escrow.job_metadata m ON j.job_id = m.job_id
      WHERE a.job_id = $1
      ORDER BY a.applied_at DESC
    `;

    const result = await pool.query(query, [jobId]);
    return result.rows;
  },

  async getApplicationsByClient(clientAddress: string) {
    const query = `
      SELECT a.*, j.client, j.amount, m.description as job_description
      FROM talent_escrow.applications a
      JOIN talent_escrow.job_created j ON a.job_id = j.job_id
      LEFT JOIN talent_escrow.job_metadata m ON j.job_id = m.job_id
      WHERE LOWER(j.client) = LOWER($1)
      ORDER BY a.applied_at DESC
    `;

    const result = await pool.query(query, [clientAddress]);
    return result.rows;
  },

  async getApplicationById(applicationId: number) {
    const query = `
      SELECT a.*, j.client, j.amount, m.description as job_description
      FROM talent_escrow.applications a
      JOIN talent_escrow.job_created j ON a.job_id = j.job_id
      LEFT JOIN talent_escrow.job_metadata m ON j.job_id = m.job_id
      WHERE a.id = $1
    `;

    const result = await pool.query(query, [applicationId]);
    return result.rows[0];
  },

  async canClientManageApplication(applicationId: number, clientAddress: string) {
    const query = `
      SELECT 1 
      FROM talent_escrow.applications a
      JOIN talent_escrow.job_created j ON a.job_id = j.job_id
      WHERE a.id = $1 AND LOWER(j.client) = LOWER($2)
    `;

    const result = await pool.query(query, [applicationId, clientAddress]);
    return result.rows.length > 0;
  },

  async markApplicationAsOnChain(applicationId: number, txHash: string) {
    const query = `
      UPDATE talent_escrow.applications 
      SET on_chain_applied = TRUE, on_chain_tx_hash = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [applicationId, txHash]);
    console.log(`✅ Application ${applicationId} marked as on-chain with tx ${txHash}`);
    return result.rows[0];
  }
};

let provider: any;
let contract: any;

async function setupBlockchain(): Promise<boolean> {
  try {
    provider = new ethers.JsonRpcProvider(config.RPC_URL);
    const net = await provider.getNetwork();
    const latestBlock = await provider.getBlockNumber();
    console.info(`🔗 Connected to ${net.name} (chainId ${net.chainId}), latest block ${latestBlock}`);

    const abiPath = "./abi/TalentEscrow.abi.json";
    if (!fs.existsSync(abiPath)) throw new Error("ABI file not found: " + abiPath);
    const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

    contract = new ethers.Contract(config.CONTRACT_ADDRESS, abi, provider);

    const code = await provider.getCode(config.CONTRACT_ADDRESS);
    if (!code || code === "0x") throw new Error("No contract found at " + config.CONTRACT_ADDRESS);

    console.info("✅ Contract loaded:", config.CONTRACT_ADDRESS);
    return true;
  } catch (err) {
    console.error("Blockchain setup failed:", err);
    return false;
  }
}

async function getLogsWithRetry(filter: any, maxRetries = 6) {
  let attempt = 0;
  let backoff = 500;
  while (true) {
    try {
      return await provider.getLogs(filter);
    } catch (err) {
      attempt++;
      const msg = String(err).toLowerCase();
      if (attempt <= maxRetries && (
        msg.includes("rate limit") || msg.includes("429") || msg.includes("timeout") || 
        msg.includes("gateway") || msg.includes("no backend")
      )) {
        console.warn(`⏳ getLogs attempt ${attempt} failed, retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(15000, backoff * 2);
        continue;
      }
      throw err;
    }
  }
}

async function handleLog(log: any) {
  let parsed: any = null;
  try {
    parsed = contract.interface.parseLog(log);
  } catch {
    return;
  }
  
  if (!parsed) return;

  const blk = await provider.getBlock(log.blockNumber).catch(() => null);
  if (!blk) {
    console.warn(`⚠ Block ${log.blockNumber} not found for tx ${log.transactionHash}, skipping`);
    return;
  }

  const args = parsed.args ?? {};
  
  // Handle JobCreated events
  if (parsed.name === 'JobCreated') {
    const jobIdRaw = args.jobId ?? args[0];
    const jobId = jobIdRaw?.toString ? jobIdRaw.toString() : String(jobIdRaw ?? "0");
    const client = args.client ?? args[1] ?? "";
    const tokenAddr = args.tokenAddr ?? args[2] ?? "";
    const amount = (args.amount && args.amount.toString) ? args.amount.toString() : String(args[3] ?? "0");
    const partialPct = (args.partialPct && args.partialPct.toString) ? args.partialPct.toString() : String(args[4] ?? "0");

    const row = {
      contract_address: config.CONTRACT_ADDRESS,
      job_id: jobId,
      client,
      token_addr: tokenAddr,
      amount,
      partial_pct: partialPct,
      tx_hash: log.transactionHash,
      block_number: log.blockNumber,
      block_timestamp: new Date((blk.timestamp || 0) * 1000).toISOString(),
      block_hash: log.blockHash,
      network: 'base-sepolia',
      tx_index: log.transactionIndex ?? 0,
      log_index: log.logIndex ?? 0,
    };

    try {
      await db.insertJobCreated(row);
      console.log(`➕ Indexed job ${jobId} for client ${client} at block ${log.blockNumber}`);
    } catch (err) {
      console.error("DB insertJobCreated error:", err);
    }
  }
  
  // Handle JobAccepted events
  else if (parsed.name === 'JobAccepted') {
    const jobIdRaw = args.jobId ?? args[0];
    const jobId = jobIdRaw?.toString ? jobIdRaw.toString() : String(jobIdRaw ?? "0");
    const worker = args.worker ?? args[1] ?? "";

    const row = {
      contract_address: config.CONTRACT_ADDRESS,
      job_id: jobId,
      worker,
      tx_hash: log.transactionHash,
      block_number: log.blockNumber,
      block_timestamp: new Date((blk.timestamp || 0) * 1000).toISOString(),
      block_hash: log.blockHash,
      network: 'base-sepolia',
      tx_index: log.transactionIndex ?? 0,
      log_index: log.logIndex ?? 0,
    };

    try {
      const q = `
        INSERT INTO talent_escrow.job_accepted (
          contract_address, job_id, worker, tx_hash, block_number, 
          block_timestamp, block_hash, network, tx_index, log_index
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (tx_hash, log_index) DO NOTHING
        RETURNING *
      `;
      await pool.query(q, [
        row.contract_address,
        row.job_id,
        row.worker,
        row.tx_hash,
        row.block_number,
        row.block_timestamp,
        row.block_hash,
        row.network,
        row.tx_index,
        row.log_index,
      ]);
      console.log(`✅ Job ${jobId} accepted by worker ${worker}`);
    } catch (err) {
      console.error("DB insertJobAccepted error:", err);
    }
  }
}

async function initialSync() {
  console.info("🔄 Starting initial sync...");
  const latest = await provider.getBlockNumber();
  const confirmed = Math.max(0, latest - config.CONFIRMATIONS);
  let from = config.START_BLOCK;
  const batch = Math.max(1, config.BATCH_SIZE);

  const totalBlocks = confirmed - from;
  console.log(`📊 Sync range: ${from} → ${confirmed} (${totalBlocks} blocks, ${Math.ceil(totalBlocks / batch)} batches)`);

  let processedBlocks = 0;
  let lastProgressLog = 0;

  for (; from <= confirmed; from += batch) {
    const to = Math.min(from + batch - 1, confirmed);
    processedBlocks += (to - from + 1);
    
    try {
      const logs = await getLogsWithRetry({ 
        address: config.CONTRACT_ADDRESS, 
        fromBlock: from, 
        toBlock: to 
      });
      
      if (logs && logs.length > 0) {
        console.log(`📊 Processing ${logs.length} logs from blocks ${from}-${to}`);
        for (const l of logs) {
          await handleLog(l);
        }
      }
      
      // Progress logging
      const progress = Math.round((processedBlocks / totalBlocks) * 100);
      if (progress >= lastProgressLog + 10 || to === confirmed) {
        console.log(`📈 Sync progress: ${progress}% (${processedBlocks}/${totalBlocks} blocks)`);
        lastProgressLog = progress;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (err) {
      console.warn(`⚠ Error fetching logs ${from}-${to}:`, err);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.info("✅ Initial sync complete.");
}

async function startRealtime() {
  console.info("⏱ Starting realtime listener (confirmed blocks)");
  let lastProcessed = await db.getHighestBlockProcessed();

  provider.on("block", async (blockNum: number) => {
    try {
      const target = blockNum - config.CONFIRMATIONS;
      if (target <= lastProcessed) return;
      
      for (let b = lastProcessed + 1; b <= target; b++) {
        try {
          const logs = await getLogsWithRetry({ 
            address: config.CONTRACT_ADDRESS, 
            fromBlock: b, 
            toBlock: b 
          });
          
          if (logs && logs.length > 0) {
            console.log(`📊 Realtime: Processing ${logs.length} logs from block ${b}`);
            for (const l of logs) {
              await handleLog(l);
            }
          }
          
          lastProcessed = b;
        } catch (err) {
          console.warn(`⚠ Realtime block ${b} getLogs failed:`, err);
        }
      }
    } catch (err) {
      console.error("Realtime listener error:", err);
    }
  });
}

// GraphQL Schema and Resolvers
const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Job {
      job_id: String!
      client: String!
      token_addr: String!
      amount: String!
      partial_pct: String
      tx_hash: String!
      block_number: String!
      block_timestamp: String!
      description: String
      deleted: Boolean
    }

    type Application {
      id: ID!
      job_id: String!
      applicant_address: String
      applicant_fid: String
      applicant_username: String
      applicant_display_name: String
      applicant_pfp_url: String
      applied_at: String!
      status: String!
      application_message: String
      hired_by: String
      hired_at: String
      on_chain_applied: Boolean!
      on_chain_tx_hash: String
      job: Job
    }

    input JobMetadataInput {
      jobId: String!
      description: String!
    }

    input ApplicationInput {
      job_id: String!
      applicant_address: String
      applicant_fid: String
      applicant_username: String
      applicant_display_name: String
      applicant_pfp_url: String
      application_message: String
      on_chain_applied: Boolean
      on_chain_tx_hash: String
    }

    input ApplicationStatusInput {
      application_id: ID!
      status: String!
      hired_by: String!
    }

    input MarkOnChainInput {
      application_id: ID!
      tx_hash: String!
    }

    type MutationResult {
      success: Boolean!
      message: String!
      job: Job
    }

    type ApplicationResponse {
      success: Boolean!
      message: String!
      application: Application
    }

    type ApplicationsResponse {
      success: Boolean!
      message: String!
      applications: [Application!]!
    }

    type MarkOnChainResponse {
      success: Boolean!
      message: String!
      application: Application
    }

    type Query {
      latestJobs(limit: Int = 50): [Job!]!
      jobById(jobId: String!): Job
      jobsByClient(client: String!, limit: Int = 50): [Job!]!
      applicationsByJob(job_id: String!): ApplicationsResponse!
      applicationsByClient(client_address: String!): ApplicationsResponse!
      health: String!
    }

    type Mutation {
      addJobMetadata(input: JobMetadataInput!): MutationResult!
      deleteJob(jobId: String!, deletedBy: String!): MutationResult!
      createApplication(input: ApplicationInput!): ApplicationResponse!
      updateApplicationStatus(input: ApplicationStatusInput!): ApplicationResponse!
      markApplicationOnChain(input: MarkOnChainInput!): MarkOnChainResponse!
    }
  `,
  resolvers: {
    Query: {
      latestJobs: async (_: any, { limit = 50 }: any) => {
        const rows = await db.getLatestJobs(limit);
        return rows.map((r: any) => ({
          job_id: String(r.job_id || ""),
          client: String(r.client || ""),
          token_addr: String(r.token_addr || ""),
          amount: String(r.amount || "0"),
          partial_pct: r.partial_pct != null ? String(r.partial_pct) : null,
          tx_hash: String(r.tx_hash || ""),
          block_number: String(r.block_number || "0"),
          block_timestamp: r.block_timestamp ? new Date(r.block_timestamp).toISOString() : new Date().toISOString(),
          description: r.description || null,
          deleted: r.deleted || false,
        }));
      },
      jobById: async (_: any, { jobId }: any) => {
        const r = await db.getJobById(String(jobId));
        if (!r) return null;
        return {
          job_id: String(r.job_id || ""),
          client: String(r.client || ""),
          token_addr: String(r.token_addr || ""),
          amount: String(r.amount || "0"),
          partial_pct: r.partial_pct != null ? String(r.partial_pct) : null,
          tx_hash: String(r.tx_hash || ""),
          block_number: String(r.block_number || "0"),
          block_timestamp: r.block_timestamp ? new Date(r.block_timestamp).toISOString() : new Date().toISOString(),
          description: r.description || null,
          deleted: r.deleted || false,
        };
      },
      jobsByClient: async (_: any, { client, limit = 50 }: any) => {
        console.log(`🔍 GraphQL Query: jobsByClient for ${client}`);
        const rows = await db.getJobsByClient(client, limit);
        return rows.map((r: any) => ({
          job_id: String(r.job_id || ""),
          client: String(r.client || ""),
          token_addr: String(r.token_addr || ""),
          amount: String(r.amount || "0"),
          partial_pct: r.partial_pct != null ? String(r.partial_pct) : null,
          tx_hash: String(r.tx_hash || ""),
          block_number: String(r.block_number || "0"),
          block_timestamp: r.block_timestamp ? new Date(r.block_timestamp).toISOString() : new Date().toISOString(),
          description: r.description || null,
          deleted: r.deleted || false,
        }));
      },
      applicationsByJob: async (_: any, { job_id }: any) => {
        try {
          const applications = await db.getApplicationsByJob(job_id);
          return {
            success: true,
            message: `Found ${applications.length} applications for job ${job_id}`,
            applications: applications.map((app: any) => ({
              ...app,
              applied_at: new Date(app.applied_at).toISOString(),
              hired_at: app.hired_at ? new Date(app.hired_at).toISOString() : null,
              job: {
                job_id: app.job_id,
                client: app.client,
                description: app.job_description || null
              }
            }))
          };
        } catch (error: any) {
          console.error('Error fetching applications by job:', error);
          return {
            success: false,
            message: `Failed to fetch applications: ${error.message}`,
            applications: []
          };
        }
      },
      applicationsByClient: async (_: any, { client_address }: any) => {
        try {
          const applications = await db.getApplicationsByClient(client_address);
          return {
            success: true,
            message: `Found ${applications.length} applications for your jobs`,
            applications: applications.map((app: any) => ({
              ...app,
              applied_at: new Date(app.applied_at).toISOString(),
              hired_at: app.hired_at ? new Date(app.hired_at).toISOString() : null,
              job: {
                job_id: app.job_id,
                client: app.client,
                amount: app.amount,
                description: app.job_description || null
              }
            }))
          };
        } catch (error: any) {
          console.error('Error fetching applications by client:', error);
          return {
            success: false,
            message: `Failed to fetch applications: ${error.message}`,
            applications: []
          };
        }
      },
      health: () => "OK",
    },
    Mutation: {
      addJobMetadata: async (_: any, { input }: any) => {
        try {
          const jobId = String(input.jobId);
          const description = String(input.description ?? "").trim();
          
          if (!description) {
            return {
              success: false,
              message: "Description cannot be empty",
              job: null
            };
          }

          await db.addJobMetadata(jobId, description);
          const job = await db.getJobById(jobId);
          
          return {
            success: true,
            message: "Job description saved successfully",
            job: job ? {
              job_id: String(job.job_id || ""),
              client: String(job.client || ""),
              token_addr: String(job.token_addr || ""),
              amount: String(job.amount || "0"),
              partial_pct: job.partial_pct != null ? String(job.partial_pct) : null,
              tx_hash: String(job.tx_hash || ""),
              block_number: String(job.block_number || "0"),
              block_timestamp: job.block_timestamp ? new Date(job.block_timestamp).toISOString() : new Date().toISOString(),
              description: description,
              deleted: job.deleted || false,
            } : null
          };
        } catch (error: any) {
          console.error("Mutation addJobMetadata error:", error);
          return {
            success: false,
            message: `Failed to save job description: ${error.message}`,
            job: null
          };
        }
      },
      deleteJob: async (_: any, { jobId, deletedBy }: any) => {
        try {
          const jobIdStr = String(jobId);
          const deletedByStr = String(deletedBy ?? "").trim();
          
          if (!deletedByStr) {
            return {
              success: false,
              message: "Deleted by address is required",
              job: null
            };
          }

          console.log(`🔐 Attempting to delete job ${jobIdStr} by ${deletedByStr}`);

          const canDelete = await db.canUserDeleteJob(jobIdStr, deletedByStr);
          if (!canDelete) {
            return {
              success: false,
              message: "You can only delete jobs that you created",
              job: null
            };
          }

          const deletedJob = await db.softDeleteJob(jobIdStr, deletedByStr);
          
          if (!deletedJob) {
            return {
              success: false,
              message: "Job not found or already deleted",
              job: null
            };
          }

          return {
            success: true,
            message: "Job deleted successfully",
            job: {
              job_id: String(deletedJob.job_id || ""),
              client: String(deletedJob.client || ""),
              token_addr: String(deletedJob.token_addr || ""),
              amount: String(deletedJob.amount || "0"),
              partial_pct: deletedJob.partial_pct != null ? String(deletedJob.partial_pct) : null,
              tx_hash: String(deletedJob.tx_hash || ""),
              block_number: String(deletedJob.block_number || "0"),
              block_timestamp: deletedJob.block_timestamp ? new Date(deletedJob.block_timestamp).toISOString() : new Date().toISOString(),
              description: deletedJob.description || null,
              deleted: true,
            }
          };
        } catch (error: any) {
          console.error("Mutation deleteJob error:", error);
          return {
            success: false,
            message: `Failed to delete job: ${error.message}`,
            job: null
          };
        }
      },
      createApplication: async (_: any, { input }: any) => {
        try {
          const job = await db.getJobById(input.job_id);
          if (!job) {
            return {
              success: false,
              message: "Job not found",
              application: null
            };
          }

          if (job.deleted) {
            return {
              success: false,
              message: "Cannot apply to a deleted job",
              application: null
            };
          }

          const application = await db.createApplication(input);
          
          return {
            success: true,
            message: "Application submitted successfully",
            application: {
              ...application,
              applied_at: new Date(application.applied_at).toISOString(),
              hired_at: application.hired_at ? new Date(application.hired_at).toISOString() : null,
              job: {
                job_id: job.job_id,
                client: job.client,
                description: job.description || null
              }
            }
          };
        } catch (error: any) {
          console.error('Error creating application:', error);
          return {
            success: false,
            message: `Failed to submit application: ${error.message}`,
            application: null
          };
        }
      },
      updateApplicationStatus: async (_: any, { input }: any) => {
        try {
          const { application_id, status, hired_by } = input;

          const canManage = await db.canClientManageApplication(parseInt(application_id), hired_by);
          if (!canManage) {
            return {
              success: false,
              message: "You can only update applications for your own jobs",
              application: null
            };
          }

          if (!['HIRED', 'REJECTED'].includes(status)) {
            return {
              success: false,
              message: "Status must be either HIRED or REJECTED",
              application: null
            };
          }

          const application = await db.updateApplicationStatus(parseInt(application_id), status, hired_by);
          
          return {
            success: true,
            message: `Application ${status.toLowerCase()} successfully`,
            application: {
              ...application,
              applied_at: new Date(application.applied_at).toISOString(),
              hired_at: application.hired_at ? new Date(application.hired_at).toISOString() : null
            }
          };
        } catch (error: any) {
          console.error('Error updating application status:', error);
          return {
            success: false,
            message: `Failed to update application: ${error.message}`,
            application: null
          };
        }
      },
      markApplicationOnChain: async (_: any, { input }: any) => {
        try {
          const { application_id, tx_hash } = input;

          const application = await db.markApplicationAsOnChain(parseInt(application_id), tx_hash);
          
          return {
            success: true,
            message: "Application marked as on-chain",
            application: {
              ...application,
              applied_at: new Date(application.applied_at).toISOString(),
              hired_at: application.hired_at ? new Date(application.hired_at).toISOString() : null
            }
          };
        } catch (error: any) {
          console.error('Error marking application as on-chain:', error);
          return {
            success: false,
            message: `Failed to mark application as on-chain: ${error.message}`,
            application: null
          };
        }
      }
    },
  },
});

function createGraphQLServer() {
  const yoga = createYoga({
    schema,
    cors: {
      origin: "*",
      credentials: true,
    },
    logging: 'error',
  });
  return createHttpServer(yoga);
}

async function main() {
  console.info("🚀 Starting Talent Escrow Indexer with Enhanced Applications Support");
  
  try {
    const client = await pool.connect();
    client.release();
    console.info("✅ Database connection OK");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }

  // Initialize fresh schema
  await db.initializeSchema();

  const ok = await setupBlockchain();
  if (!ok) process.exit(1);

  const server = createGraphQLServer();
  server.listen(config.GRAPHQL_PORT, () => {
    console.info(`🌐 GraphQL server ready: http://localhost:${config.GRAPHQL_PORT}/graphql`);
  });

  setTimeout(async () => {
    try {
      await initialSync();
      startRealtime();
    } catch (err) {
      console.error("Indexer error:", err);
    }
  }, 1000);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});