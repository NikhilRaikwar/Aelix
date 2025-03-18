import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
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
import cors from "cors";

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

// ERC-20 ABI for interacting with deployed tokens
const ERC20_ABI = [
  "function transfer(address to, uint256 value) public returns (bool)",
  "function balanceOf(address account) public view returns (uint256)",
  "function burn(uint256 value) public returns (bool)",
];

// Token name to address mapping (in-memory storage for simplicity)
const tokenMap: { [name: string]: string } = {};

// Initialize OpenAI model
const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  apiKey: OPENAI_API_KEY,
  temperature: 0,
});

// Blockchain tools
class BlockchainTools {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet | null = null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getWallet(): ethers.Wallet | null {
    return this.wallet;
  }

  setWallet(wallet: ethers.Wallet): void {
    this.wallet = wallet;
  }

  clearWallet(): void {
    this.wallet = null;
    log.info("Wallet cleared from memory");
  }
}

// Define tools
class SetWalletTool extends StructuredTool {
  schema = z.object({
    privateKey: z.string().describe("The private key to set the wallet"),
  });

  name = "setWallet";
  description = "Set the wallet using a private key. Stays until explicitly disconnected.";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call({ privateKey }: { privateKey: string }) {
    try {
      const wallet = new ethers.Wallet(privateKey, this.tools.getProvider());
      this.tools.setWallet(wallet);
      log.info(`Wallet set to address: ${wallet.address}`);
      return `Wallet set to address: ${wallet.address}`;
    } catch (error) {
      log.error("SetWalletTool error:", error);
      throw new Error(`Failed to set wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class DisconnectWalletTool extends StructuredTool {
  schema = z.object({});

  name = "disconnectWallet";
  description = "Disconnect the current wallet and clear it from memory";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call() {
    this.tools.clearWallet();
    return "Wallet disconnected successfully";
  }
}

class GetWalletAddressTool extends StructuredTool {
  schema = z.object({});

  name = "getWalletAddress";
  description = "Get the current wallet address";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call() {
    const wallet = this.tools.getWallet();
    if (!wallet) return "No wallet set. Please provide a private key.";
    return wallet.address;
  }
}

class GetBalanceTool extends StructuredTool {
  schema = z.object({});

  name = "getBalance";
  description = "Get the MONAD balance and balances of created ERC-20 tokens";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call() {
    const wallet = this.tools.getWallet();
    if (!wallet) return "No wallet set.";

    const balances: string[] = [];
    // MONAD balance
    const monadBalance = await this.tools.getProvider().getBalance(wallet.address);
    balances.push(`MONAD Balance: ${ethers.formatEther(monadBalance)} MONAD`);

    // ERC-20 token balances
    for (const [tokenName, tokenAddress] of Object.entries(tokenMap)) {
      try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.tools.getProvider());
        const balance = await tokenContract.balanceOf(wallet.address);
        balances.push(`${tokenName} Balance: ${ethers.formatUnits(balance, 18)} ${tokenName}`);
      } catch (error) {
        log.error(`Error fetching balance for ${tokenName}:`, error);
        balances.push(`${tokenName} Balance: Unable to fetch`);
      }
    }

    return balances.length > 0 ? balances.join("\n") : "No balances available.";
  }
}

class TransferTokensTool extends StructuredTool {
  schema = z.object({
    to: z.string().describe("The recipient address"),
    amount: z.string().describe("The amount of MONAD to transfer"),
  });

  name = "transferTokens";
  description = "Transfer MONAD tokens to an address";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call({ to, amount }: { to: string; amount: string }) {
    const wallet = this.tools.getWallet();
    if (!wallet) return "No wallet set.";
    try {
      const tx = { to, value: ethers.parseEther(amount) };
      const txResponse = await wallet.sendTransaction(tx);
      await txResponse.wait();
      log.info(`Transfer: ${amount} MONAD to ${to}, Tx: ${txResponse.hash}`);
      return `Transferred ${amount} MONAD to ${to}. Tx: ${MONAD_EXPLORER_URL}/tx/${txResponse.hash}`;
    } catch (error) {
      log.error("TransferTokensTool error:", error);
      throw new Error(`Failed to transfer tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class SignMessageTool extends StructuredTool {
  schema = z.object({
    message: z.string().describe("The message to sign"),
  });

  name = "signMessage";
  description = "Sign a message with the wallet";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call({ message }: { message: string }) {
    const wallet = this.tools.getWallet();
    if (!wallet) return "No wallet set.";
    try {
      const signature = await wallet.signMessage(message);
      return `Message signed: ${signature}`;
    } catch (error) {
      log.error("SignMessageTool error:", error);
      throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class GetTransactionHistoryTool extends StructuredTool {
  schema = z.object({
    count: z.number().optional().default(5).describe("Number of transactions to fetch"),
  });

  name = "getTransactionHistory";
  description = "Get recent transaction history with explorer links";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call({ count }: { count: number }) {
    const wallet = this.tools.getWallet();
    if (!wallet) return "No wallet set.";
    const provider = this.tools.getProvider();
    const blockNumber = await provider.getBlockNumber();
    const fromBlock = Math.max(blockNumber - 99, 0);
    const filter = { fromBlock, toBlock: blockNumber, address: wallet.address };
    try {
      const logs = await provider.getLogs(filter);
      const recentTxs = logs.slice(0, count).map((log) => ({
        hash: `${MONAD_EXPLORER_URL}/tx/${log.transactionHash}`,
        blockNumber: log.blockNumber,
        data: log.data,
      }));
      return `Recent ${count} transactions:\n${JSON.stringify(recentTxs, null, 2)}`;
    } catch (error) {
      log.error("GetTransactionHistoryTool error:", error);
      return `Failed to fetch transaction history: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

class GetGasPriceTool extends StructuredTool {
  schema = z.object({});

  name = "getGasPrice";
  description = "Estimate current gas price";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call() {
    const feeData = await this.tools.getProvider().getFeeData();
    const gasPrice = feeData.gasPrice;
    if (!gasPrice) return "Unable to fetch gas price.";
    return `Current gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`;
  }
}

class GetTokenPriceTool extends StructuredTool {
  schema = z.object({
    token: z.string().describe("Token ticker (e.g., MONAD)"),
  });

  name = "getTokenPrice";
  description = "Get real-time token price from CoinGecko";

  async _call({ token }: { token: string }) {
    try {
      const response = await axios.get<{ [key: string]: { usd: number } }>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${token.toLowerCase()}&vs_currencies=usd`,
        { headers: { "x-cg-api-key": COINGECKO_API_KEY } }
      );
      const price = response.data[token.toLowerCase()]?.usd;
      if (!price) return `Price not found for ${token}`;
      return `Price of ${token}: $${price} USD`;
    } catch (error) {
      log.error("GetTokenPriceTool error:", error);
      throw new Error(`Failed to fetch price: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class GetTrendingTokensTool extends StructuredTool {
  schema = z.object({});

  name = "getTrendingTokens";
  description = "Get trending tokens from Monad Testnet explorer";

  async _call() {
    try {
      if (!cheerio) throw new Error("Cheerio module is not available.");
      const response = await axios.get<string>(`${MONAD_EXPLORER_URL}/tokens`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const $ = cheerio.load(response.data);
      const tokens: { token: string; price: string }[] = [];
      $("table tbody tr").each((_, element) => {
        const tokenName = $(element).find("td:nth-child(1)").text().trim();
        const price = $(element).find("td:nth-child(2)").text().trim();
        if (tokenName && price) tokens.push({ token: tokenName, price });
      });
      if (tokens.length === 0) return "No token data found on the explorer.";
      return `Trending tokens from Monad Testnet:\n${JSON.stringify(tokens.slice(0, 5), null, 2)}`;
    } catch (error) {
      log.error("GetTrendingTokensTool error:", error);
      return `Failed to fetch trending tokens: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

class CreateTokenTool extends StructuredTool {
  schema = z.object({
    name: z.string().describe("The name of the token"),
    symbol: z.string().describe("The symbol of the token"),
    totalSupply: z.string().describe("The total supply of the token (in whole units, e.g., 1000 for 1000 tokens)"),
  });

  name = "createToken";
  description = "Create a new ERC-20 token on the Monad Testnet with burn functionality";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call({ name, symbol, totalSupply }: { name: string; symbol: string; totalSupply: string }) {
    const wallet = this.tools.getWallet();
    if (!wallet) return "No wallet set. Please set a wallet first.";

    const TOKEN_ABI = [
      "constructor(string memory _name, string memory _symbol, uint256 _initialSupply)",
      "function transfer(address to, uint256 value) public returns (bool)",
      "function balanceOf(address account) public view returns (uint256)",
      "function burn(uint256 value) public returns (bool)",
    ];
    const TOKEN_BYTECODE = "0x6080604052601260025f6101000a81548160ff021916908360ff16021790555034801561002a575f80fd5b50604051611822380380611822833981810160405281019061004c91906102a1565b825f908161005a919061052d565b50816001908161006a919061052d565b50806003819055508060045f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20819055503373ffffffffffffffffffffffffffffffffffffffff165f73ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef83604051610111919061060b565b60405180910390a3505050610624565b5f604051905090565b5f80fd5b5f80fd5b5f80fd5b5f80fd5b5f601f19601f8301169050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b6101808261013a565b810181811067ffffffffffffffff8211171561019f5761019e61014a565b5b80604052505050565b5f6101b1610121565b90506101bd8282610177565b919050565b5f67ffffffffffffffff8211156101dc576101db61014a565b5b6101e58261013a565b9050602081019050919050565b8281835e5f83830152505050565b5f61021261020d846101c2565b6101a8565b90508281526020810184848401111561022e5761022d610136565b5b6102398482856101f2565b509392505050565b5f82601f83011261025557610254610132565b5b8151610265848260208601610200565b91505092915050565b5f819050919050565b6102808161026e565b811461028a575f80fd5b50565b5f8151905061029b81610277565b92915050565b5f805f606084860312156102b8576102b761012a565b5b5f84015167ffffffffffffffff8111156102d5576102d461012e565b5b6102e186828701610241565b935050602084015167ffffffffffffffff8111156103025761030161012e565b5b61030e86828701610241565b925050604061031f8682870161028d565b9150509250925092565b5f81519050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f600282049050600182168061037757607f821691505b60208210810361038a57610389610333565b5b50919050565b5f819050815f5260205f209050919050565b5f6020601f8301049050919050565b5f82821b905092915050565b5f600883026103ec7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff826103b1565b6103f686836103b1565b95508019841693508086168417925050509392505050565b5f819050919050565b5f61043161042c6104278461026e565b61040e565b61026e565b9050919050565b5f819050919050565b61044a83610417565b61045e61045682610438565b8484546103bd565b825550505050565b5f90565b610472610466565b61047d818484610441565b505050565b5b818110156104a0576104955f8261046a565b600181019050610483565b5050565b601f8211156104e5576104b681610390565b6104bf846103a2565b810160208510156104ce578190505b6104e26104da856103a2565b830182610482565b50505b505050565b5f82821c905092915050565b5f6105055f19846008026104ea565b1980831691505092915050565b5f61051d83836104f6565b9150826002028217905092915050565b61053682610329565b67ffffffffffffffff81111561054f5761054e61014a565b5b6105598254610360565b6105648282856104a4565b5f60209050601f831160018114610595575f8415610583578287015190505b61058d8582610512565b8655506105f4565b601f1984166105a386610390565b5f5b828110156105ca578489015182556001820191506020850194506020810190506105a5565b868310156105e757848901516105e3601f8916826104f6565b8355505b6001600288020188555050505b505050505050565b6106058161026e565b82525050565b5f60208201905061061e5f8301846105fc565b92915050565b6111f1806106315f395ff3fe608060405234801561000f575f80fd5b506004361061009c575f3560e01c806342966c681161006457806342966c681461015a57806370a082311461018a57806395d89b41146101ba578063a9059cbb146101d8578063dd62ed3e146102085761009c565b806306fdde03146100a0578063095ea7b3146100be57806318160ddd146100ee57806323b872dd1461010c578063313ce5671461013c575b5f80fd5b6100a8610238565b6040516100b59190610c61565b60405180910390f35b6100d860048036038101906100d39190610d12565b6102c3565b6040516100e59190610d6a565b60405180910390f35b6100f66103b0565b6040516101039190610d92565b60405180910390f35b61012660048036038101906101219190610dab565b6103b6565b6040516101339190610d6a565b60405180910390f35b610144610772565b6040516101519190610e16565b60405180910390f35b610174600480360381019061016f9190610e2f565b610784565b6040516101819190610d6a565b60405180910390f35b6101a4600480360381019061019f9190610e5a565b61092c565b6040516101b19190610d92565b60405180910390f35b6101c2610941565b6040516101cf9190610c61565b60405180910390f35b6101f260048036038101906101ed9190610d12565b6109cd565b6040516101ff9190610d6a565b60405180910390f35b610222600480360381019061021d9190610e85565b610bd1565b60405161022f9190610d92565b60405180910390f35b5f805461024490610ef0565b80601f016020809104026020016040519081016040528092919081815260200182805461027090610ef0565b80156102bb5780601f10610292576101008083540402835291602001916102bb565b820191905f5260205f20905b81548152906001019060200180831161029e57829003601f168201915b505050505081565b5f8160055f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258460405161039e9190610d92565b60405180910390a36001905092915050565b60035481565b5f8073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff1603610425576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161041c90610f6a565b60405180910390fd5b5f73ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610493576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161048a90610fd2565b60405180910390fd5b8160045f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20541015610513576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161050a9061103a565b60405180910390fd5b8160055f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205410156105ce576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105c5906110a2565b60405180910390fd5b8160045f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825461061a91906110ed565b925050819055508160045f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825461066d9190611120565b925050819055508160055f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546106fb91906110ed565b925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161075f9190610d92565b60405180910390a3600190509392505050565b60025f9054906101000a900460ff1681565b5f8160045f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20541015610805576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107fc9061103a565b60405180910390fd5b8160045f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825461085191906110ed565b925050819055508160035f82825461086991906110ed565b925050819055503373ffffffffffffffffffffffffffffffffffffffff167fcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca5836040516108b69190610d92565b60405180910390a25f73ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161091b9190610d92565b60405180910390a360019050919050565b6004602052805f5260405f205f915090505481565b6001805461094e90610ef0565b80601f016020809104026020016040519081016040528092919081815260200182805461097a90610ef0565b80156109c55780601f1061099c576101008083540402835291602001916109c5565b820191905f5260205f20905b8154815290600101906020018083116109a857829003601f168201915b505050505081565b5f8073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610a3c576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a339061119d565b60405180910390fd5b8160045f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20541015610abc576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610ab39061103a565b60405180910390fd5b8160045f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f828254610b0891906110ed565b925050819055508160045f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f828254610b5b9190611120565b925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef84604051610bbf9190610d92565b60405180910390a36001905092915050565b6005602052815f5260405f20602052805f5260405f205f91509150505481565b5f81519050919050565b5f82825260208201905092915050565b8281835e5f83830152505050565b5f601f19601f8301169050919050565b5f610c3382610bf1565b610c3d8185610bfb565b9350610c4d818560208601610c0b565b610c5681610c19565b840191505092915050565b5f6020820190508181035f830152610c798184610c29565b905092915050565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610cae82610c85565b9050919050565b610cbe81610ca4565b8114610cc8575f80fd5b50565b5f81359050610cd981610cb5565b92915050565b5f819050919050565b610cf181610cdf565b8114610cfb575f80fd5b50565b5f81359050610d0c81610ce8565b92915050565b5f8060408385031215610d2857610d27610c81565b5b5f610d3585828601610ccb565b9250506020610d4685828601610cfe565b9150509250929050565b5f8115159050919050565b610d6481610d50565b82525050565b5f602082019050610d7d5f830184610d5b565b92915050565b610d8c81610cdf565b82525050565b5f602082019050610da55f830184610d83565b92915050565b5f805f60608486031215610dc257610dc1610c81565b5b5f610dcf86828701610ccb565b9350506020610de086828701610ccb565b9250506040610df186828701610cfe565b9150509250925092565b5f60ff82169050919050565b610e1081610dfb565b82525050565b5f602082019050610e295f830184610e07565b92915050565b5f60208284031215610e4457610e43610c81565b5b5f610e5184828501610cfe565b91505092915050565b5f60208284031215610e6f57610e6e610c81565b5b5f610e7c84828501610ccb565b91505092915050565b5f8060408385031215610e9b57610e9a610c81565b5b5f610ea885828601610ccb565b9250506020610eb985828601610ccb565b9150509250929050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f6002820490506001821680610f0757607f821691505b602082108103610f1a57610f19610ec3565b5b50919050565b7f496e76616c69642066726f6d20616464726573730000000000000000000000005f82015250565b5f610f54601483610bfb565b9150610f5f82610f20565b602082019050919050565b5f6020820190508181035f830152610f8181610f48565b9050919050565b7f496e76616c696420746f206164647265737300000000000000000000000000005f82015250565b5f610fbc601283610bfb565b9150610fc782610f88565b602082019050919050565b5f6020820190508181035f830152610fe981610fb0565b9050919050565b7f496e73756666696369656e742062616c616e63650000000000000000000000005f82015250565b5f611024601483610bfb565b915061102f82610ff0565b602082019050919050565b5f6020820190508181035f83015261105181611018565b9050919050565b7f496e73756666696369656e7420616c6c6f77616e6365000000000000000000005f82015250565b5f61108c601683610bfb565b915061109782611058565b602082019050919050565b5f6020820190508181035f8301526110b981611080565b9050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f6110f782610cdf565b915061110283610cdf565b925082820390508181111561111a576111196110c0565b5b92915050565b5f61112a82610cdf565b915061113583610cdf565b925082820190508082111561114d5761114c6110c0565b5b92915050565b7f496e76616c6964206164647265737300000000000000000000000000000000005f82015250565b5f611187600f83610bfb565b915061119282611153565b602082019050919050565b5f6020820190508181035f8301526111b48161117b565b905091905056fea264697066735822122082c07cd3182cc847423571400a3f9bd36735b562f3bb49ba898c64f54697bfd464736f6c634300081a0033"; // Replace with actual bytecode from Remix/Hardhat

    const factory = new ethers.ContractFactory(TOKEN_ABI, TOKEN_BYTECODE, wallet);

    try {
      const totalSupplyWei = ethers.parseUnits(totalSupply, 18);
      const contract = await factory.deploy(name, symbol, totalSupplyWei);
      await contract.waitForDeployment();
      const contractAddress = await contract.getAddress();
      tokenMap[symbol] = contractAddress; // Store token address with symbol
      log.info(`Token ${name} (${symbol}) created at: ${contractAddress}`);
      return `Token ${name} (${symbol}) created successfully at ${MONAD_EXPLORER_URL}/address/${contractAddress}`;
    } catch (error) {
      log.error("CreateTokenTool error:", error);
      throw new Error(`Failed to create token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class GetFaucetTokensTool extends StructuredTool {
  schema = z.object({
    address: z.string().describe("The wallet address to receive testnet MON tokens"),
  });

  name = "getFaucetTokens";
  description = "Request testnet MON tokens from the Monad faucet";

  async _call({ address }: { address: string }) {
    try {
      if (!ethers.isAddress(address)) {
        return "Invalid Ethereum address provided.";
      }
      return `To get testnet MON tokens for ${address}, visit ${MONAD_FAUCET_URL}, connect your wallet, paste your address (${address}), and click 'Get Testnet MON'. Tokens are available every 12 hours based on eligibility (e.g., Discord role or ETH activity).`;
    } catch (error) {
      log.error("GetFaucetTokensTool error:", error);
      return `Failed to process faucet request: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

class BatchMixedTransferTool extends StructuredTool {
  schema = z.object({
    transfers: z
      .string()
      .describe(
        "A space-separated list of mixed transfers in the format '<type1> <to1> <amount1> [tokenName1] <type2> <to2> <amount2> [tokenName2]'. " +
        "Use 'MONAD' for native tokens or 'TOKEN' for ERC-20 tokens with token name (e.g., 'MONAD 0x123... 0.01 TOKEN 0x456... 10 MKING')"
      ),
  });

  name = "batchMixedTransfer";
  description =
    "Transfer MONAD and ERC-20 tokens in a single batch using token names. Format: batchMixedTransfer <type1> <to1> <amount1> [tokenName1] <type2> <to2> <amount2> [tokenName2] ...";

  constructor(private tools: BlockchainTools) {
    super();
  }

  async _call({ transfers }: { transfers: string }) {
    const wallet = this.tools.getWallet();
    if (!wallet) return "No wallet set. Please set a wallet with 'setWallet <privateKey>' first.";

    const parts = transfers.trim().split(" ");
    if (parts.length < 3) {
      return "Invalid format. Use: batchMixedTransfer <type1> <to1> <amount1> [tokenName1] <type2> <to2> <amount2> [tokenName2] ...";
    }

    const transferList: { type: string; to: string; amount: string; tokenName?: string }[] = [];
    for (let i = 0; i < parts.length; i += 3) {
      const type = parts[i].toUpperCase();
      const to = parts[i + 1];
      const amount = parts[i + 2];
      let tokenName: string | undefined;

      if (type === "TOKEN") {
        if (i + 3 >= parts.length) {
          return `Missing token name for TOKEN transfer at position ${i / 3 + 1}`;
        }
        tokenName = parts[i + 3];
        if (!tokenMap[tokenName]) {
          return `Token ${tokenName} not found. Please create it first using createToken.`;
        }
        i++; // Skip the tokenName in the next iteration
      } else if (type !== "MONAD") {
        return `Invalid type: ${type}. Use 'MONAD' or 'TOKEN'`;
      }

      if (!ethers.isAddress(to)) return `Invalid address: ${to}`;
      if (isNaN(Number(amount)) || Number(amount) <= 0) return `Invalid amount: ${amount}`;
      transferList.push({ type, to, amount, tokenName });
    }

    const results: string[] = [];
    let nonce = await wallet.getNonce();

    for (const [index, { type, to, amount, tokenName }] of transferList.entries()) {
      try {
        if (type === "MONAD") {
          const tx = {
            to,
            value: ethers.parseEther(amount),
            nonce,
          };
          const txResponse = await wallet.sendTransaction(tx);
          const receipt = await txResponse.wait();
          if (receipt && receipt.hash) {
            log.info(`MONAD Transfer: ${amount} to ${to}, Tx: ${receipt.hash}`);
            results.push(
              `${index + 1}. **MONAD Transfer to ${to}**:\n   - Amount: ${amount} MONAD\n   - Status: Successful\n   - Transaction Link: [View Transaction](${MONAD_EXPLORER_URL}/tx/${receipt.hash})`
            );
          } else {
            throw new Error("Transaction receipt is null or invalid");
          }
        } else if (type === "TOKEN" && tokenName) {
          const tokenAddress = tokenMap[tokenName];
          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
          const amountWei = ethers.parseUnits(amount, 18);
          const tx = await tokenContract.transfer(to, amountWei, { nonce });
          const receipt = await tx.wait();
          if (receipt && receipt.hash) {
            log.info(`Token Transfer: ${amount} ${tokenName} to ${to}, Tx: ${receipt.hash}`);
            results.push(
              `${index + 1}. **${tokenName} Transfer to ${to}**:\n   - Amount: ${amount} ${tokenName}\n   - Status: Successful\n   - Transaction Link: [View Transaction](${MONAD_EXPLORER_URL}/tx/${receipt.hash})`
            );
          } else {
            throw new Error("Transaction receipt is null or invalid");
          }
        }
        nonce++;
      } catch (error) {
        log.error(`Transfer to ${to} failed:`, error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push(
          `${index + 1}. **${type === "MONAD" ? "MONAD" : tokenName} Transfer to ${to}**:\n   - Amount: ${amount} ${type === "MONAD" ? "MONAD" : tokenName}\n   - Status: Failed\n   - Error: ${errorMsg}`
        );
      }
    }

    const summary = `The batch mixed transfer completed with ${results.length} operations:\n\n${results.join("\n\n")}`;
    log.info(summary);
    return summary;
  }
}

class HelpTool extends StructuredTool {
  schema = z.object({});

  name = "help";
  description = "List all available commands";

  async _call() {
    const commands = [
      "setWallet <privateKey> - Set your wallet",
      "disconnectWallet - Disconnect and clear your wallet",
      "getWalletAddress - Get your wallet address",
      "getBalance - Check your MONAD and token balances",
      "transferTokens <to> <amount> - Transfer MONAD tokens",
      "signMessage <message> - Sign a message",
      "getTransactionHistory [count] - Get recent transactions (default 5)",
      "getGasPrice - Get current gas price",
      "getTokenPrice <token> - Get token price (e.g., MONAD)",
      "getTrendingTokens - Get trending tokens from Monad explorer",
      "createToken <name> <symbol> <totalSupply> - Create a new token",
      "getFaucetTokens <address> - Request testnet MON tokens from Monad faucet",
      "batchMixedTransfer <type1> <to1> <amount1> [tokenName1] <type2> <to2> <amount2> [tokenName2] - Transfer MONAD and tokens",
      "help - Show this list",
    ];
    return `Available commands:\n${commands.join("\n")}`;
  }
}

// Instantiate tools
const blockchainTools = new BlockchainTools();
const tools = [
  new SetWalletTool(blockchainTools),
  new DisconnectWalletTool(blockchainTools),
  new GetWalletAddressTool(blockchainTools),
  new GetBalanceTool(blockchainTools),
  new TransferTokensTool(blockchainTools),
  new SignMessageTool(blockchainTools),
  new GetTransactionHistoryTool(blockchainTools),
  new GetGasPriceTool(blockchainTools),
  new GetTokenPriceTool(),
  new GetTrendingTokensTool(),
  new CreateTokenTool(blockchainTools),
  new GetFaucetTokensTool(),
  new BatchMixedTransferTool(blockchainTools),
  new HelpTool(),
];

const toolNode = new ToolNode(tools);
const modelWithTools = llm.bindTools(tools);

// Define state
interface AgentState {
  messages: BaseMessage[];
}

// Agent logic
async function callAgent(state: AgentState): Promise<Partial<AgentState>> {
  const systemMessage = new SystemMessage(
    "You are an AI assistant that helps users interact with the Monad Testnet blockchain. Use the provided tools to assist the user. The wallet private key persists until the user explicitly disconnects."
  );
  const messagesWithSystem = [systemMessage, ...state.messages];
  const response = await modelWithTools.invoke(messagesWithSystem);
  return { messages: [response] };
}

function shouldContinue(state: AgentState): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if ("tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
    return "tools";
  }
  return END;
}

// Define workflow
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      reducer: (x?: BaseMessage[], y?: BaseMessage[]) => (x ?? []).concat(y ?? []),
      default: () => [],
    },
  },
})
  .addNode("agent", callAgent)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addEdge("tools", "agent")
  .addConditionalEdges("agent", shouldContinue);

const agent = workflow.compile();

const app = express();

// Define agentHandler
const agentHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  const { input, privateKey } = req.body as { input?: string; privateKey?: string };
  if (!input) {
    res.status(400).json({ error: "Input is required" });
    return;
  }

  try {
    const messages: BaseMessage[] = [];
    if (privateKey) {
      messages.push(new HumanMessage(`setWallet ${privateKey}`));
    }
    messages.push(new HumanMessage(input));

    const result = await agent.invoke({ messages });
    const lastMessage = result.messages[result.messages.length - 1];
    res.json({ response: lastMessage.content });
  } catch (error) {
    log.error("Agent handler error:", error);
    res.status(500).json({ error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` });
  }
};

// Setup Express with CORS and routes
app.use(cors({ origin: "https://aelix-ai.vercel.app" }));
app.use(bodyParser.json());
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Welcome to Monad AI Agent! Use POST /agent to interact with the agent." });
});
app.post("/agent", agentHandler);

const PORT = 3000;
app.listen(PORT, () => {
  log.info(`Server running on http://localhost:${PORT}`);
});