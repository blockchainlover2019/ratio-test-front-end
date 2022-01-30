import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  TransactionInstruction, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { getOrca, OrcaFarmConfig, OrcaPoolConfig, Network, OrcaU64, ORCA_FARM_ID } from "@orca-so/sdk";
import { WalletContextState } from '@solana/wallet-adapter-react';
import Decimal from "decimal.js";
import bs58 from 'bs58';
import { u64, TOKEN_PROGRAM_ID, Token, AccountInfo, AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

import * as anchor from '@project-serum/anchor';
/////
import { 
  decodeGlobalFarmBuffer, 
  decodeUserFarmBuffer, 
  generateBufferData,
  uint64,
  INIT_USER_FARM_DATA_LAYOUT } from "./utils/layout";
import { U64Utils } from "./numbers";

import { orcaFarmConfigs } from "./constants/farms";
import { orcaDevnetFarmConfigs } from "./constants/devnet/farms";

import { IDL as OrcaTestIDL } from './anchor_idl/idl/orca_test';

const BufferLayout = require('buffer-layout');

const ORCA_TEST_PROGRAM = new PublicKey("8Jj2V2CJCY53eLwrzsrc6q4N5MBwUqUUsSkgeehVDWR6");
const owner = Keypair.fromSecretKey(
    bs58.decode("CwAcFJhnJqhkGC7TVFhpGRGECU9TYoMneFZBNggxQ8aMsE49PpQj3wQeuPTEErBXWV4fdBV91mWUVHvn6NxEN9o")
);

// for test
//const connection = new Connection("https://api.mainnet-beta.solana.com", "singleGossip");
const connection = new Connection("https://api.devnet.solana.com", "singleGossip");

const orca = getOrca(connection, Network.DEVNET);

const DEVNET_FARM_PARAMS = Object.freeze({
  address: new PublicKey("6YrLcQs5yFvXkRY5VkMGEfVgo5rwozJf7jXedpZxbKmi"),
  farmTokenMint: new PublicKey("3z8o3b4gMBpnRsrDv7ruZPcVtgoULMFyEoEEGwTsw2TR"),
  rewardTokenMint: new PublicKey("orcarKHSqC5CDDsGbho8GKvwExejWHxTqGzXgcewB9L"),
  rewardTokenDecimals: 6,
  baseTokenMint: new PublicKey("CmDdQhusZWyi9fue27VSktYgkHefm3JXNdzc9kCpyvYi"),
  baseTokenDecimals: 6,
});

export enum INSTRUCTIONS {
  InitGlobalFarm,
  InitUserFarm,
  ConvertTokens,
  RevertTokens,
  Harvest,
  RemoveRewards,
  SetEmissionsPerSecond,
}

export const swap = async () => {
  const orcaSolPool = orca.getPool(OrcaPoolConfig.ORCA_SOL);
  const solToken = orcaSolPool.getTokenB();
  const solAmount = new Decimal(5);
  const quote = await orcaSolPool.getQuote(solToken, solAmount);
  const orcaAmount = quote.getMinOutputAmount();

  console.log(`Swap ${solAmount.toString()} SOL for at least ${orcaAmount.toNumber()} ORCA`);
  const swapPayload = await orcaSolPool.swap(owner, solToken, solAmount, orcaAmount);
  const swapTxId = await swapPayload.execute();
  console.log("Swapped:", swapTxId, "\n");
}

export const addLiquidity = async () => {
  const orcaSolPool = orca.getPool(OrcaPoolConfig.ORCA_SOL);
  const solToken = orcaSolPool.getTokenB();
  const solAmount = new Decimal(4);
  const quote = await orcaSolPool.getQuote(solToken, solAmount);
  const orcaAmount = quote.getMinOutputAmount();

  const { maxTokenAIn, maxTokenBIn, minPoolTokenAmountOut } = await orcaSolPool.getDepositQuote(
    orcaAmount,
    solAmount
  );

  console.log(
    `Deposit at most ${maxTokenBIn.toNumber()} SOL and ${maxTokenAIn.toNumber()} ORCA, for at least ${minPoolTokenAmountOut.toNumber()} LP tokens`
  );

  const poolDepositPayload = await orcaSolPool.deposit(
    owner,
    maxTokenAIn,
    maxTokenBIn,
    minPoolTokenAmountOut
  );
  
  const poolDepositTxId = await poolDepositPayload.execute();
  console.log("Pool deposited:", poolDepositTxId, "\n");
}

export const getLpBalance = async (
  ownerPk: PublicKey,
  poolId: OrcaPoolConfig,
  farmId: OrcaFarmConfig,
) => {
  farmId = OrcaFarmConfig.ORCA_SOL_AQ;
  poolId = OrcaPoolConfig.ORCA_SOL;

  const pool = orca.getPool(poolId);    
  const lpBalance = await pool.getLPBalance(ownerPk);

  const farm = orca.getFarm(farmId);
  const farmLpBalance = await farm.getFarmBalance(ownerPk);
  console.log("farmLpBalance =", farmLpBalance.toNumber());

  return { lpAmount: farmLpBalance.toNumber(), baseAmount: lpBalance.toNumber() };
  
}

export const getDDLpBalance = async (
  ownerPk: PublicKey,
  ddId: OrcaFarmConfig,
) => {
  ddId = OrcaFarmConfig.ORCA_SOL_AQ;
  

  const dd = orca.getFarm(ddId);
  const ddLpBalance = await dd.getFarmBalance(ownerPk);
  console.log("ddLpBalance =", ddLpBalance.toNumber());

  return ddLpBalance.toNumber();
}

export const getLpBaseTokenBalance = async (
  ownerPk: PublicKey,
  poolId: OrcaPoolConfig,
) => {
  poolId = OrcaPoolConfig.ORCA_SOL;
  let mainnetAtalsUsdcLpBaseMint = new PublicKey("FZ8x1LCRSPDeHBDoAc3Gc6Y7ETCynuHEr5q5YWV7uRCJ");
  let tokenAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    TOKEN_PROGRAM_ID,
    mainnetAtalsUsdcLpBaseMint,
    ownerPk);
  let balance = await connection.getTokenAccountBalance(tokenAccount);
  return parseInt(balance.value.amount) / (10**balance.value.decimals);
}

export const getHarvestableAmount = async (
  ownerPk: PublicKey,
  farmId: OrcaFarmConfig
) => {
  farmId = OrcaFarmConfig.ORCA_SOL_AQ;
  const farm = orca.getFarm(farmId);
  let result = await farm.getHarvestableAmount(ownerPk);
  return result.toNumber();
}

export const harvest = async (
  wallet: WalletContextState,
  farmId: OrcaFarmConfig
) => {
  if (wallet.publicKey == null) return false;

  let farmParams = DEVNET_FARM_PARAMS;
  const { address: globalFarmAddress, rewardTokenMint } = farmParams;
  let {userFarmAddress, userFarmData} = await getUserFarm(globalFarmAddress, wallet.publicKey);
  let globalFarmData = await getGlobalFarm(globalFarmAddress);
  
  let arrIx: Array<TransactionInstruction> = [];
  if (!userFarmData || !userFarmData.isInitialized) {
    throw new Error("Failed to get userFarm information");
  }
  // resolve reward token account
  let userRewardTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
     wallet.publicKey, rewardTokenMint, arrIx);
  
  const authority = (await getAuthorityAndNonce(globalFarmAddress, ORCA_FARM_ID))[0];
  /*arrIx.push(constructHarvestIx(
    wallet.publicKey,
    userRewardTokenPublicKey,
    globalFarmData.baseTokenVault,
    globalFarmAddress,
    userFarmAddress,
    globalFarmData.rewardTokenVault,
    authority,
    ORCA_FARM_ID
  ));*/

  let cloneWindow: any = window;
  let provider = new anchor.Provider(connection, cloneWindow['solana'], anchor.Provider.defaultOptions())
  const OrcaTestProgram = new anchor.Program(OrcaTestIDL, ORCA_TEST_PROGRAM, provider);

  const [ratioAuthority, ratioAuthorityBump] = 
  await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("global-ratio-authority")],
    OrcaTestProgram.programId,
  );

  
  console.log("ratioAuthority =", ratioAuthority.toBase58());

  let ratioRewardTokenAccount = await getOrCreateATokenAccountIx(
    ratioAuthority,
    true,
    wallet.publicKey,
    rewardTokenMint,
    arrIx
  );
  
  console.log("ratioRewardTokenAccount =", ratioRewardTokenAccount.toBase58());
  let {userFarmAddress: ratioUserFarmAddress, userFarmData: ratioUserFarmData} 
  = await getUserFarm(globalFarmAddress, ratioAuthority);

  arrIx.push(
    OrcaTestProgram.instruction.harvestReward(
      ratioAuthorityBump, {
        accounts: {
          owner: wallet.publicKey,
          ratioAuthority,
          userRewardTokenAccount: userRewardTokenPublicKey,
          ratioRewardTokenAccount,
          rewardTokenMint,
          globalFarm: globalFarmAddress,
          userFarm: userFarmAddress,
          ratioUserFarm: ratioUserFarmAddress,
          orcaRewardVault: globalFarmData.rewardTokenVault,
          orcaBaseVault: globalFarmData.baseTokenVault,
          authority: authority,
          orcaFarmProgram: ORCA_FARM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId, 
        }
      }
    )
  )

  const signedTransaction = await wallet.sendTransaction( 
    new Transaction().add(...arrIx), connection, { signers: [] }
  );
  
  await connection.confirmTransaction(signedTransaction, 'processed');
  console.log("Farm harvested:", signedTransaction, "\n");
}

export const withdrawLpFromFarm = async (
  wallet: WalletContextState,
  amount: number,
  farmId: OrcaFarmConfig
) => {
  if (wallet.publicKey == null) return false;
  farmId = OrcaFarmConfig.ORCA_SOL_AQ;

  const farm = orca.getFarm(farmId);

  const withdrawAmount = OrcaU64.fromNumber(amount, 6);
  const farmLpBalance = await farm.getFarmBalance(wallet.publicKey);
  console.log(`withdrawAmount = ${withdrawAmount.toNumber()}, farmLpBalance = ${farmLpBalance.toNumber()}`);

  if (withdrawAmount > farmLpBalance) return false;
  
  let farmParams = DEVNET_FARM_PARAMS;
  
  const baseTokenAmount_U64 = U64Utils.toFarmU64(
    withdrawAmount.toDecimal(),
    farmParams,
    "baseTokenAmount"
  );

  const { address: globalFarmAddress, rewardTokenMint } = farmParams;
  let {userFarmAddress, userFarmData} = await getUserFarm(globalFarmAddress, wallet.publicKey);
  let globalFarmData = await getGlobalFarm(globalFarmAddress);

  let arrIx: Array<TransactionInstruction> = [];

  if (!userFarmData || !userFarmData.isInitialized) {
    throw new Error("Failed to get userFarm information. Warning: withdraw from deposit address");
  }
  // resolve farm token account
  let userFarmTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
      wallet.publicKey, globalFarmData.farmTokenMint, arrIx);
  // resolve reward token account
  let userRewardTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
      wallet.publicKey, rewardTokenMint, arrIx);
  // resolve base token account
  let userBaseTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
    wallet.publicKey, globalFarmData.baseTokenMint, arrIx);
  // Convert base tokens to farm tokens
  const authority = (await getAuthorityAndNonce(globalFarmAddress, ORCA_FARM_ID))[0];
  /*arrIx.push(constructRevertTokensIx(
    wallet.publicKey,
    wallet.publicKey,
    userBaseTokenPublicKey,
    userFarmTokenPublicKey,
    userRewardTokenPublicKey,
    globalFarmData.baseTokenVault,
    globalFarmData.farmTokenMint,
    globalFarmAddress,
    userFarmAddress,
    globalFarmData.rewardTokenVault,
    authority,
    ORCA_FARM_ID,
    baseTokenAmount_U64,
  ));*/

  let cloneWindow: any = window;
  let provider = new anchor.Provider(connection, cloneWindow['solana'], anchor.Provider.defaultOptions())
  const OrcaTestProgram = new anchor.Program(OrcaTestIDL, ORCA_TEST_PROGRAM, provider);
  /*
  let signedTransaction = await OrcaTestProgram.rpc.unstakeLpFromOrca(
    baseTokenAmount_U64,
    {
      accounts: {
        owner: wallet.publicKey,
        baseTokenAccount: userBaseTokenPublicKey,
        baseTokenMint: globalFarmData.baseTokenMint,
        poolTokenAccount: userFarmTokenPublicKey,
        poolTokenMint: globalFarmData.farmTokenMint,
        rewardTokenAccount: userRewardTokenPublicKey,
        rewardTokenMint: rewardTokenMint,
        globalFarm: globalFarmAddress,
        userFarm: userFarmAddress,
        rewardTokenVault: globalFarmData.rewardTokenVault,
        baseTokenVault: globalFarmData.baseTokenVault,
        authority: authority,
        orcaFarmProgram: ORCA_FARM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY
      },
      instructions: [...arrIx],
      signers: []
    }
  );

  await connection.confirmTransaction(signedTransaction, 'processed');
  console.log("Farm withdrawn:", signedTransaction, "\n");
  */
  return true;
}

export const deployLPToFarm = async (
  wallet: WalletContextState,
  amount: number,
  poolId: OrcaPoolConfig,
  farmId: OrcaFarmConfig
) => {

  if (wallet.publicKey == null) return false;

  const depositAmount = OrcaU64.fromNumber(amount, 6);
  console.log("depositAmount = ", depositAmount.toNumber());

  //let farmParams = orcaFarmConfigs[farmId];
  let farmParams = DEVNET_FARM_PARAMS;

  console.log("farmParams =", farmParams);

  const baseTokenAmount_U64 = U64Utils.toFarmU64(
    depositAmount.toDecimal(),
    farmParams,
    "baseTokenAmount"
  );
  const { address: globalFarmAddress, rewardTokenMint } = farmParams;
  let {userFarmAddress, userFarmData} = await getUserFarm(globalFarmAddress, wallet.publicKey);
  let globalFarmData = await getGlobalFarm(globalFarmAddress);

  let arrIx: Array<TransactionInstruction> = [];
  // init User Farm
  if (!userFarmData || !userFarmData.isInitialized) {
    throw new Error("Failed to get userFarm information");
  }

  // resolve farm token account
  let userFarmTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
      wallet.publicKey, globalFarmData.farmTokenMint, arrIx);
  
  // resolve reward token account
  let userRewardTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
      wallet.publicKey, rewardTokenMint, arrIx);
  
  // resolve base token account
  let userBaseTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
    wallet.publicKey, globalFarmData.baseTokenMint, arrIx);
  
  // Convert base tokens to farm tokens
  const authority = (await getAuthorityAndNonce(globalFarmAddress, ORCA_FARM_ID))[0];

  let cloneWindow: any = window;
  let provider = new anchor.Provider(connection, cloneWindow['solana'], anchor.Provider.defaultOptions())
  const OrcaTestProgram = new anchor.Program(OrcaTestIDL, ORCA_TEST_PROGRAM, provider);
  
  console.log("OrcaTestProgram =", OrcaTestProgram);

  const [ratioAuthority, ratioAuthorityBump] = 
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("global-ratio-authority")],
      OrcaTestProgram.programId,
    );
    
  /*let ratioPoolTokenAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, globalFarmData.farmTokenMint, ratioAuthority, true);

  let ratioRewardTokenAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, rewardTokenMint, ratioAuthority, true);
*/
  let ratioPoolTokenAccount = await getOrCreateATokenAccountIx(
    ratioAuthority,
    true,
    wallet.publicKey,
    globalFarmData.farmTokenMint,
    arrIx
  );
  let ratioRewardTokenAccount = await getOrCreateATokenAccountIx(
    ratioAuthority,
    true,
    wallet.publicKey,
    rewardTokenMint,
    arrIx
  );
  let ratioBaseTokenAccount = await getOrCreateATokenAccountIx(
    ratioAuthority,
    true,
    wallet.publicKey,
    globalFarmData.baseTokenMint,
    arrIx
  );

  let {userFarmAddress: ratioUserFarmAddress, userFarmData: ratioUserFarmData} 
      = await getUserFarm(globalFarmAddress, ratioAuthority);
  // init User Farm
  if (!ratioUserFarmData || !ratioUserFarmData.isInitialized) {
    //arrIx.push(constructInitUserFarmIx(globalFarmAddress, ratioUserFarmAddress, ratioAuthority, ORCA_FARM_ID));
    arrIx.push(OrcaTestProgram.instruction.initRatioUserFarm(
      ratioAuthorityBump, {
        accounts: {
          payer: wallet.publicKey,
          globalFarm: globalFarmAddress,
          ratioUserFarm: ratioUserFarmAddress,
          farmOwner: ratioAuthority,
          orcaFarmProgram: ORCA_FARM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY
        }
      }
    ))
  }
  
  console.log("OrcaTestProgram.programId =", OrcaTestProgram.programId.toBase58());

  console.log("wallet.publicKey =", wallet.publicKey.toBase58());
  console.log("ratioAuthority =", ratioAuthority.toBase58());
  console.log("ratioBaseTokenAccount =", ratioBaseTokenAccount.toBase58());
  console.log("globalFarmData.baseTokenMint =", globalFarmData.baseTokenMint.toBase58());
  console.log("userFarmTokenPublicKey =", userFarmTokenPublicKey.toBase58());
  console.log("ratioPoolTokenAccount=", ratioPoolTokenAccount.toBase58());
  
  console.log("globalFarmData.farmTokenMint =", globalFarmData.farmTokenMint.toBase58());
  console.log("userRewardTokenPublicKey =", userRewardTokenPublicKey.toBase58());
  console.log("ratioRewardTokenAccount =", ratioRewardTokenAccount.toBase58());
  console.log("rewardTokenMint =", rewardTokenMint.toBase58());
  console.log("globalFarmAddress =", globalFarmAddress.toBase58());
  console.log("ratioUserFarmAddress =", ratioUserFarmAddress.toBase58());
  console.log("globalFarmData.rewardTokenVault =", globalFarmData.rewardTokenVault.toBase58());
  console.log("globalFarmData.baseTokenVault =", globalFarmData.baseTokenVault.toBase58());
  console.log("authority =", authority.toBase58());
  console.log("ORCA_FARM_ID =", ORCA_FARM_ID.toBase58());

  let signedTransaction = await OrcaTestProgram.rpc.depositOrcaLp(
    ratioAuthorityBump,
    baseTokenAmount_U64,
    {
      accounts: {
        owner: wallet.publicKey,
        ratioAuthority: ratioAuthority,
        ratioBaseTokenAccount,
        baseTokenMint: globalFarmData.baseTokenMint,
        userPoolTokenAccount: userFarmTokenPublicKey,
        ratioPoolTokenAccount,
        poolTokenMint: globalFarmData.farmTokenMint,
        userRewardTokenAccount: userRewardTokenPublicKey,
        ratioRewardTokenAccount,
        rewardTokenMint: rewardTokenMint,
        globalFarm: globalFarmAddress,
        userFarm: userFarmAddress,
        ratioUserFarm: userFarmAddress,
        orcaRewardVault: globalFarmData.rewardTokenVault,
        orcaBaseVault: globalFarmData.baseTokenVault,
        authority: authority,
        orcaFarmProgram: ORCA_FARM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY
      },
      instructions: [...arrIx],
      signers: []
    }
  );

    await connection.confirmTransaction(signedTransaction, 'processed');
    console.log("Farm deposited:", signedTransaction, "\n");
    return true;
}

export const depositLpToFarm = async (
  wallet: WalletContextState,
  amount: number,
  poolId: OrcaPoolConfig,
  farmId: OrcaFarmConfig
) => {

  if (wallet.publicKey == null) return false;

  const depositAmount = OrcaU64.fromNumber(amount, 6);
  console.log("depositAmount = ", depositAmount.toNumber());

  //let farmParams = orcaFarmConfigs[farmId];
  let farmParams = DEVNET_FARM_PARAMS;

  console.log("farmParams =", farmParams);

  const baseTokenAmount_U64 = U64Utils.toFarmU64(
    depositAmount.toDecimal(),
    farmParams,
    "baseTokenAmount"
  );
  const { address: globalFarmAddress, rewardTokenMint } = farmParams;
  let {userFarmAddress, userFarmData} = await getUserFarm(globalFarmAddress, wallet.publicKey);
  let globalFarmData = await getGlobalFarm(globalFarmAddress);

  let arrIx: Array<TransactionInstruction> = [];
  // init User Farm
  if (!userFarmData || !userFarmData.isInitialized) {
    arrIx.push(constructInitUserFarmIx(globalFarmAddress, userFarmAddress, owner.publicKey, ORCA_FARM_ID));
  }

  // resolve farm token account
  let userFarmTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
      wallet.publicKey, globalFarmData.farmTokenMint, arrIx);
  
  // resolve reward token account
  let userRewardTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
      wallet.publicKey, rewardTokenMint, arrIx);
  
  // resolve base token account
  let userBaseTokenPublicKey = await getOrCreateAssociatedTokenAccountIx(
    wallet.publicKey, globalFarmData.baseTokenMint, arrIx);
  
  // Convert base tokens to farm tokens
  const authority = (await getAuthorityAndNonce(globalFarmAddress, ORCA_FARM_ID))[0];

  let cloneWindow: any = window;
  let provider = new anchor.Provider(connection, cloneWindow['solana'], anchor.Provider.defaultOptions())
  const OrcaTestProgram = new anchor.Program(OrcaTestIDL, ORCA_TEST_PROGRAM, provider);
  
  console.log("OrcaTestProgram =", OrcaTestProgram);
/*
  let signedTransaction = await OrcaTestProgram.rpc.stakeLpToOrca(
    baseTokenAmount_U64,
    {
      accounts: {
        owner: wallet.publicKey,
        baseTokenAccount: userBaseTokenPublicKey,
        baseTokenMint: globalFarmData.baseTokenMint,
        poolTokenAccount: userFarmTokenPublicKey,
        poolTokenMint: globalFarmData.farmTokenMint,
        rewardTokenAccount: userRewardTokenPublicKey,
        rewardTokenMint: rewardTokenMint,
        globalFarm: globalFarmAddress,
        userFarm: userFarmAddress,
        rewardTokenVault: globalFarmData.rewardTokenVault,
        baseTokenVault: globalFarmData.baseTokenVault,
        authority: authority,
        orcaFarmProgram: ORCA_FARM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY
      },
      instructions: [...arrIx],
      signers: []
    }
  );
  await connection.confirmTransaction(signedTransaction, 'processed');
  console.log("Farm deposited:", signedTransaction, "\n");
  */
  return true;
}
const getOrCreateAssociatedTokenAccountIx = async (
  owner: PublicKey,
  mint: PublicKey,
  arrIx: TransactionInstruction[]
) => {
  let tokenAccountPk = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, mint, owner);
  let tokenAccount = await connection.getAccountInfo(tokenAccountPk);
  if (tokenAccount == null || !deserializeTokenAccount(tokenAccount?.data)) {
    arrIx.push(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, mint, tokenAccountPk, owner, owner
      )
    );
  }
  return tokenAccountPk;
}

const getOrCreateATokenAccountIx = async (
  owner: PublicKey,
  allowOwnerOffCurve: boolean,
  payer: PublicKey,
  mint: PublicKey,
  arrIx: TransactionInstruction[]
) => {
  let tokenAccountPk = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, mint, owner, allowOwnerOffCurve);
  let tokenAccount = await connection.getAccountInfo(tokenAccountPk);
  if (tokenAccount == null || !deserializeTokenAccount(tokenAccount?.data)) {
    arrIx.push(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, mint, tokenAccountPk, owner, payer
      )
    );
  }
  return tokenAccountPk;
}

const getUserFarm = async (
  globalFarmAddress: PublicKey, 
  userPk: PublicKey
) => {
  let userFarmAddress = (
    await PublicKey.findProgramAddress(
      [globalFarmAddress.toBuffer(), userPk.toBuffer(), TOKEN_PROGRAM_ID.toBuffer()], ORCA_FARM_ID)
  )[0];
  console.log("userFarmAddress =", userFarmAddress.toBase58());
  let userFarm = await connection.getAccountInfo(userFarmAddress);
  if (userFarm == null) {
    return {userFarmAddress, userFarm: null};
  }

  let userFarmData = decodeUserFarmBuffer(userFarm);
  console.log('userFarmData =', userFarmData);
  console.log('userFarmData.owner =', userFarmData.owner.toBase58());
  return {userFarmAddress, userFarmData};
}

const getGlobalFarm = async (
  globalFarmAddress: PublicKey
) => {
  let globalFarm = await connection.getAccountInfo(globalFarmAddress);
  if (globalFarm == null) {
    throw new Error("Fail to get GlobalFarm");
  }
  let globalFarmData = decodeGlobalFarmBuffer(globalFarm);
  return globalFarmData;
}

export const depositLpToDD = async (
  wallet: WalletContextState,
  amount: number,
  farmId: OrcaFarmConfig,
  ddId: OrcaFarmConfig
) => {

  if (wallet.publicKey == null) return false;

  const farm = orca.getFarm(farmId);
  
  const depositAmount = OrcaU64.fromNumber(amount, 6);
  console.log("depositAmount = ", depositAmount.toNumber());

  const farmLpBalance = await farm.getFarmBalance(wallet.publicKey);
  console.log("farmLpBalance = ", farmLpBalance.toNumber());

  if (depositAmount > farmLpBalance) {
    return false;
  }

  const dd = orca.getFarm(ddId);

  const ddDepositPayload = await dd.deposit(wallet.publicKey, depositAmount);
  const signedTransaction = await wallet.sendTransaction( ddDepositPayload.transaction, connection, 
    {
      signers: ddDepositPayload.signers
    }
  );
  
  await connection.confirmTransaction(signedTransaction, 'processed');
  console.log("DD deposited:", signedTransaction, "\n");
  return true;
}

// serious modify
export function constructInitUserFarmIx(
  globalFarmStatePubkey: PublicKey,
  userFarmStatePubkey: PublicKey,
  ownerPubkey: PublicKey,
  aquafarmProgramId: PublicKey
): TransactionInstruction {
  const keys = [
    {
      pubkey: globalFarmStatePubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: userFarmStatePubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ownerPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: aquafarmProgramId,
    data: generateBufferData(INIT_USER_FARM_DATA_LAYOUT, {
      instruction: INSTRUCTIONS.InitUserFarm,
    }), // Initialize user farm instruction
  });
}


export const deserializeTokenAccount = (data: Buffer | undefined): AccountInfo | undefined => {
  if (data == undefined || data.length == 0) {
    return undefined;
  }

  const accountInfo = AccountLayout.decode(data);
  accountInfo.mint = new PublicKey(accountInfo.mint);
  accountInfo.owner = new PublicKey(accountInfo.owner);
  accountInfo.amount = u64.fromBuffer(accountInfo.amount);

  if (accountInfo.delegateOption === 0) {
    accountInfo.delegate = null;
    accountInfo.delegatedAmount = new u64(0);
  } else {
    accountInfo.delegate = new PublicKey(accountInfo.delegate);
    accountInfo.delegatedAmount = u64.fromBuffer(accountInfo.delegatedAmount);
  }

  accountInfo.isInitialized = accountInfo.state !== 0;
  accountInfo.isFrozen = accountInfo.state === 2;

  if (accountInfo.isNativeOption === 1) {
    accountInfo.rentExemptReserve = u64.fromBuffer(accountInfo.isNative);
    accountInfo.isNative = true;
  } else {
    accountInfo.rentExemptReserve = null;
    accountInfo.isNative = false;
  }

  if (accountInfo.closeAuthorityOption === 0) {
    accountInfo.closeAuthority = null;
  } else {
    accountInfo.closeAuthority = new PublicKey(accountInfo.closeAuthority);
  }

  return accountInfo;
};

export function constructConvertTokensIx(
  userFarmOwner: PublicKey,
  userTransferAuthority: PublicKey,
  userBaseTokenAccountPubkey: PublicKey,
  userFarmTokenAccountPubkey: PublicKey,
  userRewardTokenAccountPubkey: PublicKey,
  globalBaseTokenVaultPubkey: PublicKey,
  farmTokenMintPubkey: PublicKey,
  globalFarm: PublicKey,
  userFarm: PublicKey,
  globalRewardTokenVaultPubkey: PublicKey,
  authority: PublicKey,
  aquafarmProgramId: PublicKey,
  amountToConvert: u64
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      {
        pubkey: userFarmOwner,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: userBaseTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: globalBaseTokenVaultPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userTransferAuthority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: farmTokenMintPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userFarmTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: globalFarm,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userFarm,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: globalRewardTokenVaultPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userRewardTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: authority,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: aquafarmProgramId,
    data: generateBufferData(
      BufferLayout.struct([
        BufferLayout.u8("instruction"),
        uint64("amountToConvert"),
      ]),
      {
        instruction: INSTRUCTIONS.ConvertTokens,
        amountToConvert: amountToConvert.toBuffer(), // The time period over which to distribute: 2 weeks
      }
    ),
  });
}


export function constructRevertTokensIx(
  userFarmOwner: PublicKey,
  userBurnAuthority: PublicKey,
  userBaseTokenAccountPubkey: PublicKey,
  userFarmTokenAccountPubkey: PublicKey,
  userRewardTokenAccountPubkey: PublicKey,
  globalBaseTokenVaultPubkey: PublicKey,
  farmTokenMintPubkey: PublicKey,
  globalFarm: PublicKey,
  userFarm: PublicKey,
  globalRewardTokenVaultPubkey: PublicKey,
  authority: PublicKey,
  aquafarmProgramId: PublicKey,
  amountToRevert: u64
) {
  return new TransactionInstruction({
    keys: [
      {
        pubkey: userFarmOwner,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: userBaseTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: globalBaseTokenVaultPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: farmTokenMintPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userFarmTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userBurnAuthority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: globalFarm,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userFarm,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: globalRewardTokenVaultPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userRewardTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: authority,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: aquafarmProgramId,
    data: generateBufferData(
      BufferLayout.struct([
        BufferLayout.u8("instruction"),
        uint64("amountToRevert"),
      ]),
      {
        instruction: INSTRUCTIONS.RevertTokens,
        amountToRevert: amountToRevert.toBuffer(),
      }
    ),
  });
}


export function constructHarvestIx(
  userFarmOwner: PublicKey,
  userRewardTokenAccountPubkey: PublicKey,
  globalBaseTokenVaultPubkey: PublicKey,
  globalFarm: PublicKey,
  userFarm: PublicKey,
  globalRewardTokenVaultPubkey: PublicKey,
  authority: PublicKey,
  aquafarmProgramId: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      {
        pubkey: userFarmOwner,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: globalFarm,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userFarm,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: globalBaseTokenVaultPubkey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: globalRewardTokenVaultPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: userRewardTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: authority,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: aquafarmProgramId,
    data: generateBufferData(
      BufferLayout.struct([BufferLayout.u8("instruction")]),
      {
        instruction: INSTRUCTIONS.Harvest,
      }
    ),
  });
}


export async function getAuthorityAndNonce(
  publicKey: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress([publicKey.toBuffer()], programId);
}
