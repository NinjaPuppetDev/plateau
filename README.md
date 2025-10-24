# Plateau: Web3 Trustless Job Search & Payroll Platform
```
░█████████  ░██               ░██                                     
░██     ░██ ░██               ░██                                     
░██     ░██ ░██  ░██████   ░████████  ░███████   ░██████   ░██    ░██ 
░█████████  ░██       ░██     ░██    ░██    ░██       ░██  ░██    ░██ 
░██         ░██  ░███████     ░██    ░█████████  ░███████  ░██    ░██ 
░██         ░██ ░██   ░██     ░██    ░██        ░██   ░██  ░██   ░███ 
░██         ░██  ░█████░██     ░████  ░███████   ░█████░██  ░█████░██ 
```                           
                                                                                                                                    

**Base Batches 002: Builder Track Submission**
## ✨ Demo
(https://madilyn-occludent-nonsegmentally.ngrok-free.dev/)

## Faucet MockUSD
- [Sepolia Mock ERC20 Faucet](https://faucet-mock.vercel.app/)
- (https://sepolia.basescan.org/address/0xf2335e995494c1b7d24e6d94ae30a8970fe45706)

## 🎥 Demo Video
[Watch Demo on Vimeo](https://vimeo.com/1130020067?share=copy&fl=sv&fe=ci)

## 📋 Project Overview

Plateau is a decentralized, trustless job marketplace and payroll platform built on Base and integrated with Farcaster. It connects employers with talent in an open, transparent environment, it enables seamless collaboration without intermediaries.

The platform empowers founders, adventurers, enthusiasts, artists, professionals, and contributors to find partners, discover opportunities, and build projects together.

## 🚀 Deployed Contracts (Base Sepolia)

- **Job Escrow Contract**: [`0x9853fF230a8B479d08C84Fc14b8F1adf68be3e60`](https://sepolia.basescan.org/address/0x9853fF230a8B479d08C84Fc14b8F1adf68be3e60)
- **Mock USDC**: `0x0dFA97F1d8b29e366bbf08Fa253e82d9272a1f03`

## 🎯 How It Works

### The Story

Meet **Derrick** and **Curt**:

1. **Curt** has an idea and a job opening. He posts it on Plateau, making it discoverable exclusively through Farcaster.

2. **Derrick** uses Farcaster to share his work and connect with the community. While scrolling, he discovers Plateau's miniapp.

3. Derrick finds Curt's job posting and applies using his Farcaster profile.

4. Curt reviews applications and hires Derrick.

5. **Payment Flow**:
   - Curt can offer an **upfront payment** to kickstart the work
   - Upon completion, Curt **releases the full amount** from escrow

6. **Dispute Resolution**:
   - If the work doesn't meet expectations, Curt can **open a dispute**
   - A neutral party (human mediator or AI) reviews whether the terms were fulfilled
   - Both parties work toward agreement on resolution

7. **Completion**:
   - Once both agree the job is complete, Curt releases the funds
   - Curt can add comments and **rate Derrick's work**, building reputation on-chain

## 💡 Key Features

- **Farcaster Integration**: Jobs are posted and discovered through the Farcaster social network
- **On-Chain Escrow**: Smart contract-based payment protection for both parties
- **Flexible Payments**: Optional upfront payments and milestone-based releases
- **Dispute Resolution**: Human or AI-assisted conflict resolution
- **Reputation System**: On-chain ratings and reviews build trust
- **Trustless & Transparent**: No intermediaries, all transactions verifiable on Base

## 🛠️ Development Setup

### Start the backend indexer:
```bash
cd talent-indexer-graphql && npm install && npm run dev
```

### Start the frontend:
```bash
cd frontend && npm install && npm run dev 
```

### Expose local server (for testing):
```bash
ngrok http 3000
```

## 🌟 Vision

Plateau aims to create an **open and transparent job marketplace** that removes traditional barriers and intermediaries. By leveraging blockchain technology and social integration, we're building a future where finding work, hiring talent, and completing projects is seamless, secure, and community-driven.

---

## DEMO token: <NOT PUBLISHED IN REPO>

Example curl (header):

```curl -i -X POST "https://madilyn-occludent-nonsegmentally.ngrok-free.dev/graphql" \
  -H "Content-Type: application/json" \
  -H "x-demo-token: <THE_TOKEN_FROM_TEAM>" \
  -d '{"query":"{ latestJobs(limit:5){ job_id client amount description } }"}'
```

