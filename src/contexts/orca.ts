/*
import { usdcUsdtAqFarm } from './constants';
import { OrcaFarmImpl } from './model/orca/farm/orca-farm';
import { OrcaU64 } from './public/utils';
import { web3 } from '@project-serum/anchor';
import { Keypair } from '@solana/web3.js';

// for rest function
import { Token, TOKEN_PROGRAM_ID, AccountLayout, MintLayout } from "@solana/spl-token";

import Decimal from 'decimal.js';
const connection = new web3.Connection(web3.clusterApiUrl("mainnet-beta"));

let usdcUsdtFarm = new OrcaFarmImpl(connection, usdcUsdtAqFarm);
*/

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { getOrca, OrcaFarmConfig, OrcaPoolConfig, Network, OrcaU64, ORCA_FARM_ID } from "@orca-so/sdk";
import { WalletContextState } from '@solana/wallet-adapter-react';
import Decimal from "decimal.js";
import bs58 from 'bs58';
import { u64, TOKEN_PROGRAM_ID, Token, AccountInfo, AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

/////
import { 
  decodeGlobalFarmBuffer, 
  decodeUserFarmBuffer, 
  generateBufferData,
  uint64,
  INIT_USER_FARM_DATA_LAYOUT } from "./utils/layout";
import { U64Utils } from "./numbers";
import { orcaFarmConfigs } from "./constants/farms";

const BufferLayout = require('buffer-layout');

const owner = Keypair.fromSecretKey(
    bs58.decode("CwAcFJhnJqhkGC7TVFhpGRGECU9TYoMneFZBNggxQ8aMsE49PpQj3wQeuPTEErBXWV4fdBV91mWUVHvn6NxEN9o")
);

const connection = new Connection("https://api.mainnet-beta.solana.com", "singleGossip");
const orca = getOrca(connection);

export enum INSTRUCTIONS {
  InitGlobalFarm,
  InitUserFarm,
  ConvertTokens,
  RevertTokens,
  Harvest,
  RemoveRewards,
  SetEmissionsPerSecond,
}

const swap = () => {

}

export const getLpBalance = async (
  ownerPk: PublicKey,
  poolId: OrcaPoolConfig,
  farmId: OrcaFarmConfig,
) => {
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
  const dd = orca.getFarm(ddId);
  const ddLpBalance = await dd.getFarmBalance(ownerPk);
  console.log("ddLpBalance =", ddLpBalance.toNumber());

  return ddLpBalance.toNumber();
}

export const getLpBaseTokenBalance = async (
  ownerPk: PublicKey,
  poolId: OrcaPoolConfig,
) => {
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
  const farm = orca.getFarm(farmId);
  let result = await farm.getHarvestableAmount(ownerPk);
  return result.toNumber();
}

export const harvest = async (
  wallet: WalletContextState,
  farmId: OrcaFarmConfig
) => {
  if (wallet.publicKey == null) return false;
  const farm = orca.getFarm(farmId);
  let harvestTxPayload = await farm.harvest(wallet.publicKey);
  const signedTransaction = await wallet.sendTransaction( harvestTxPayload.transaction, connection, 
    {
      signers: harvestTxPayload.signers
    }
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

  const farm = orca.getFarm(farmId);

  const withdrawAmount = OrcaU64.fromNumber(amount, 6);
  console.log("withdrawAmount = ", withdrawAmount.toNumber());

  const farmLpBalance = await farm.getFarmBalance(wallet.publicKey);
  console.log("farmLpBalance = ", farmLpBalance.toNumber());
  
  if (withdrawAmount > farmLpBalance) {
    return false;
  }

  let farmParams = orcaFarmConfigs[farmId];
  // const farmDepositPayload = await farm.deposit(wallet.publicKey, depositAmount);

  const baseTokenAmount_U64 = U64Utils.toFarmU64(
    withdrawAmount.toDecimal(),
    farmParams,
    "baseTokenAmount"
  );

  const { address: globalFarmAddress, rewardTokenMint } = farmParams;

  let {userFarmAddress, userFarmData} = await getUserFarm(globalFarmAddress, wallet.publicKey);
  if (userFarmData == null) {
    console.log("userFarmData is null"); return false;
  }

  let globalFarmData = await getGlobalFarm(globalFarmAddress);
  if (globalFarmData == null) {
    console.log("Error: globalFarmData is null"); return false;
  }

  let arrIx: Array<TransactionInstruction> = [];
  // init User Farm
  if (!userFarmData.isInitialized) {
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
  arrIx.push(constructRevertTokensIx(
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
  ));

  const signedTransaction = await wallet.sendTransaction( new Transaction().add(...arrIx), connection, 
    {
      signers: []
    }
  );
  
  await connection.confirmTransaction(signedTransaction, 'processed');
  console.log("Farm withdrawn:", signedTransaction, "\n");
  return true;
}

export const __depositLpToFarm__ = async (
  wallet: WalletContextState,
  amount: number,
  poolId: OrcaPoolConfig,
  farmId: OrcaFarmConfig
) => {

  if (wallet.publicKey == null) return false;

  const pool = orca.getPool(poolId);    
  const lpBalance = await pool.getLPBalance(wallet.publicKey);
  const farm = orca.getFarm(farmId);
  const depositAmount = OrcaU64.fromNumber(amount, 6);
  console.log("depositAmount = ", depositAmount.toNumber());

  if (depositAmount > lpBalance) {
    return false;
  }

  const farmDepositPayload = await farm.deposit(wallet.publicKey, depositAmount);
  const signedTransaction = await wallet.sendTransaction( farmDepositPayload.transaction, connection, 
    {
      signers: farmDepositPayload.signers
    }
  );
  
  await connection.confirmTransaction(signedTransaction, 'processed');
  console.log("Farm deposited:", signedTransaction, "\n");
  return true;
}

export async function getUserFarmAddress(
  globalFarm: PublicKey,
  owner: PublicKey,
  tokenProgramId: PublicKey,
  aquafarmProgramId: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [globalFarm.toBuffer(), owner.toBuffer(), tokenProgramId.toBuffer()],
    aquafarmProgramId
  );
}


export const depositLpToFarm = async (
  wallet: WalletContextState,
  amount: number,
  poolId: OrcaPoolConfig,
  farmId: OrcaFarmConfig
) => {

  if (wallet.publicKey == null) return false;

  const pool = orca.getPool(poolId);    
  const lpBalance = await pool.getLPBalance(wallet.publicKey);
  const depositAmount = OrcaU64.fromNumber(amount, 6);
  console.log("depositAmount = ", depositAmount.toNumber());

  if (depositAmount > lpBalance) {
    return false;
  }

  let farmParams = orcaFarmConfigs[farmId];
  // const farmDepositPayload = await farm.deposit(wallet.publicKey, depositAmount);

  const baseTokenAmount_U64 = U64Utils.toFarmU64(
    depositAmount.toDecimal(),
    farmParams,
    "baseTokenAmount"
  );

  const { address: globalFarmAddress, rewardTokenMint } = farmParams;

  let {userFarmAddress, userFarmData} = await getUserFarm(globalFarmAddress, wallet.publicKey);
  if (userFarmData == null) {
    console.log("userFarmData is null"); return false;
  }

  let globalFarmData = await getGlobalFarm(globalFarmAddress);
  if (globalFarmData == null) {
    console.log("Error: globalFarmData is null"); return false;
  }

  let arrIx: Array<TransactionInstruction> = [];
  
  // init User Farm
  if (!userFarmData.isInitialized) {
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
  arrIx.push(constructConvertTokensIx(
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
  ));

  const signedTransaction = await wallet.sendTransaction( new Transaction().add(...arrIx), connection, 
    {
      signers: []
    }
  );

  await connection.confirmTransaction(signedTransaction, 'processed');
  console.log("Farm deposited:", signedTransaction, "\n");
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
const getUserFarm = async (
  globalFarmAddress: PublicKey, 
  userPk: PublicKey
) => {
  let userFarmAddress = (
    await PublicKey.findProgramAddress(
      [globalFarmAddress.toBuffer(), userPk.toBuffer(), TOKEN_PROGRAM_ID.toBuffer()], ORCA_FARM_ID)
  )[0];

  let userFarm = await connection.getAccountInfo(userFarmAddress);
  if (userFarm == null) {
    console.log("Error: userFarm is null");
    return {userFarmAddress, userFarmData: null};
  }

  let userFarmData = decodeUserFarmBuffer(userFarm);
  console.log('userFarmData =', userFarmData);
  return {userFarmAddress, userFarmData};
}

const getGlobalFarm = async (
  globalFarmAddress: PublicKey
) => {
  let globalFarm = await connection.getAccountInfo(globalFarmAddress);
  if (globalFarm == null) {
    console.log("Error: globalFarm is null");
    return null;
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


export async function getAuthorityAndNonce(
  publicKey: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress([publicKey.toBuffer()], programId);
}