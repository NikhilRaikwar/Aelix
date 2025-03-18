<div align="center">

# Aelix | Monad AI Agent

![Aelix](https://github.com/user-attachments/assets/abceed91-a760-47b2-b91a-570941ad5503)



</div>

Welcome to **Aelix | Monad AI Agent**—an open-source, AI-powered assistant crafted to supercharge your interactions with the Monad Testnet blockchain! 🌐 Aelix is your smart sidekick, capable of autonomously executing 10+ blockchain actions with finesse. 🚀

- 🔑 Set up and manage your wallet effortlessly  
- 💰 Check your MONAD token balance in a snap  
- 📤 Send MONAD tokens to any address  
- ✍️ Sign messages with top-notch security  
- 📜 Peek into your recent transaction history  
- ⛽ Fetch live gas price estimates  
- 💹 Get real-time token prices (powered by CoinGecko)  
- 🔥 Explore trending tokens on Monad Testnet  
- 🪙 Launch your own tokens on the testnet  
- 💧 Grab testnet MON tokens from the faucet  
- And more awesomeness awaits... ✨  

Built for everyone—from AI wizards in San Francisco to crypto hustlers worldwide—**Aelix** brings the Monad ecosystem to your fingertips. 🌍 No matter your background, this agent makes blockchain exploration simple, smart, and fun! 💡

## Try Aelix Now! 🌟  
Check out the agent in action on our website:  
👉 **[Aelix AI](https://aelix-ai.vercel.app/)**

## 🔧 Core Blockchain Features

- **Wallet & Token Operations**
  - 🔑 Set up and manage wallets on Monad Testnet
  - 💰 Check your MONAD token balance instantly
  - 📤 Transfer MONAD tokens to any address
  - 🪙 Create and deploy your own tokens on Monad Testnet
  - 💧 Request testnet MON tokens from the Monad faucet
  - ✍️ Sign messages securely with your wallet

- **Blockchain Insights**
  - 📜 Fetch recent transaction history with explorer links
  - ⛽ Get real-time gas price estimates
  - 💹 Retrieve live token prices via CoinGecko
  - 🔥 Discover trending tokens on Monad Testnet

## 🤖 AI Integration Features

- **LangChain Integration**
  - 🛠️ Built-in LangChain tools for seamless blockchain operations
  - ⚛️ Autonomous agent support with React framework
  - 🧠 Persistent memory for smooth, context-aware interactions
  - 📡 Streaming responses for real-time feedback

- **Vercel Deployment**
  - 🌐 Hosted on Vercel for fast and reliable access
  - 🧩 Framework-agnostic design with easy frontend integration
  - ⚡ Quick setup with environment variable support

- **Agent Modes**
  - 💬 Interactive chat mode for guided blockchain operations
  - 🤖 Autonomous mode for independent task execution
  - 🛡️ Built-in error handling for robust performance

- **AI-Powered Tools**
  - 📝 Natural language processing for intuitive blockchain commands
  - 💹 Price feed integration for token market insights
  - ⚙️ Automated decision-making to simplify complex actions

## 📃 Documentation
You can view the full documentation of the kit at [Aelix Agent Documentation](https://nikhils-organization-8.gitbook.io/aelix)

## 📦 Installation

Setting up Aelix | Monad AI Agent locally is super simple. Follow these steps:
```bash
# Clone the repository
git clone https://github.com/nikhilraikwar-aelix/aelix.git
cd aelix

# Install dependencies
npm install

## Quick Start

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import express, { Request, Response, RequestHandler } from "express";
import bodyParser from "body-parser";
import axios from "axios";
import * as cheerio from "cheerio";
import { Logger } from "tslog";
import cors from 'cors';

dotenv.config();

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";
const DEXSCREENER_API_KEY = process.env.DEXSCREENER_API_KEY || "";
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const MONAD_EXPLORER_URL = "https://monad-testnet.socialscan.io";
const MONAD_FAUCET_URL = "https://testnet.monad.xyz/";

// Logger setup
const log = new Logger({ name: "MonadAgent" });
```
```bash
# 🛠 Backend Setup

### Step 1: Navigate to the Backend Directory
Run the following command to move into the backend directory:

```bash
cd monadagent

### Step 2: Install Backend Dependencies
Use the following command to install all necessary dependencies:
npm install

### Step 3: Set up environment variables (create a .env file in monadagent/):

OPENAI_API_KEY=your-openai-api-key
COINGECKO_API_KEY=your-coingecko-api-key
MONAD_RPC_URL=https://testnet-rpc.monad.xyz

### Step 4: Run the backend:
npx ts-node monadAgent.ts

### Step 5: Test Backend using curl command:
$ curl -X POST http://localhost:3000/agent -H "Content-Type: application/json" -d '{"input": "help"}'

```
```bash

# 🌐 Frontend Setup

### Step 1: Return to the Root Directory
cd ..
### Step 2: Install frontend dependencies
npm install
### Step 3: Set up environment variables (create a .env file in root)
VITE_API_ENDPOINT=http://localhost:3000/agent  
VITE_PRIVY_APP_ID=your-privy-app-id
### Step 4: Run the frontend
npm run dev

- Open http://localhost:5173/dashboard in your browser and connect your wallet via Privy.
- 🎉 Your Aelix AI Agent is now up and running! 🚀

```


## Usage Examples

Aelix | Monad AI Agent accepts commands through its chat interface (`src/components/ChatInterface.tsx`). Here are the operations with examples:

### Set Wallet
Set your Monad Testnet wallet:
- **Command**: `setWallet <your-private-key>`
- **Response**: `Wallet set to address: 0xYourWalletAddress`


### Check Balance
Check your wallet's MONAD balance:
- **Command**: `getBalance`
- **Response**: `Balance: 10 MONAD`


### Transfer Tokens
Send MONAD tokens to any address:
- **Command**: `transferTokens <recipient-address> 1`
- **Response**: `Successfully transferred 1 MONAD to <recipient-address>. Transaction hash: 0x...`


### Get Token Price
Fetch real-time token price (via CoinGecko):
- **Command**: `getTokenPrice MONAD`
- **Response**: `MONAD price: $0.50 USD`

### Create Token
Create a new token on Monad Testnet:
- **Command**: `createToken MyToken MTK 1000`
- **Response**: `Token MyToken (MTK) created with 1000 supply. Token address: 0x...`

## Dependencies

We’ve used these key libraries:

### Backend (`monadagent/`)
- `@langchain/openai` - For AI model integration
- `ethers` - For Monad Testnet blockchain interactions
- `express` - For the API server
- `axios` - For HTTP requests (e.g., CoinGecko)
- `cors` - For cross-origin requests

### Frontend (`src/`)
- `react` - UI framework
- `@privy-io/react-auth` - Wallet authentication
- `@tanstack/react-query` - Data fetching
- `shadcn/ui` - UI components
- `tailwindcss` - Styling

  
## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=NikhilRaikwar/Aelix&type=Date)](https://www.star-history.com/#NikhilRaikwar/Aelix&Date)

## License 📝

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


## Security

Handle private keys with care and never share them. Store sensitive data in .env files and add them to .gitignore.

