
import { web3 } from '@project-serum/anchor';
import { Keypair, 
        PublicKey,
        SystemProgram,
        Transaction,
        SYSVAR_CLOCK_PUBKEY,
        TransactionInstruction,
        sendAndConfirmTransaction } from '@solana/web3.js';

import { Token, TOKEN_PROGRAM_ID, AccountLayout, MintLayout, AccountInfo } from "@solana/spl-token";
import bs58 from 'bs58';
import * as anchor from '@project-serum/anchor';
import BN from 'bn.js'; 
import { WalletContextState } from '@solana/wallet-adapter-react';
import { toast } from 'react-toastify';

import { IDL as FirstIDL } from './anchor_idl/idl/first';
import { IDL as SecondIDL } from './anchor_idl/idl/second';

const solConnection = new web3.Connection(web3.clusterApiUrl("devnet"));

const FIRST_PROGRAM_ID = new PublicKey(
  "56n2n8MBEqqSNMEsTmuk2RrRCAswhGvmLNaeUMg82dTN"
);
const SECOND_PROGRAM_ID = new PublicKey(
  "GzjpBe8X4PSpYuz2kFdhMVV9uAEbjRjN1cuPaDSWMAa5"
);

export const TOKEN_MINT_PUBKEY = new PublicKey(
  "2qqrTvaDmkd7wFGPc3moGzGJfrknJUDoqTWMXZfzm4jc"
);

export const VAULT_TOKEN_ACCOUNT_PUBKEY = new PublicKey(
  "Fx8YfZPV6uyxY1e6UHh7tmb6XaJgrebTGejt6coEyytY"
);

const ADMIN_KEY_PAIR = Keypair.fromSecretKey(
  bs58.decode("4DvzFh5zMD5pyx46Yvw2X6biMyFfTASEr7k7FfgPaCYfvVfKZkfpciiaESuUmNGyf5PHUqJMmFw4wLEqXeqBT9GZ")
); 

const decimal_value = new anchor.BN(10).pow(new anchor.BN(9));
const MINTER_ACCOUNT_SPACE = 8;
const STAKER_ACCOUNT_SPACE = 40;

export const mintAndDeposit = async (amount: BN, wallet: WalletContextState) => {
  let cloneWindow: any = window;
  let provider = new anchor.Provider(solConnection, cloneWindow['solana'], anchor.Provider.defaultOptions())
  const firstProgram = new anchor.Program(FirstIDL, FIRST_PROGRAM_ID, provider);
  const secondProgram = new anchor.Program(SecondIDL, SECOND_PROGRAM_ID, provider);
  
  if (wallet.publicKey === null) return false;

  let minter_pda = await PublicKey.createWithSeed(
    wallet.publicKey,
    "minter",
    secondProgram.programId,
  );

  let arrIx: Array<TransactionInstruction> = [];
  let minterPDA = await solConnection.getAccountInfo(minter_pda);
  console.log("minterPDA info =", minterPDA);
  if (minterPDA === null) {
    arrIx.push(SystemProgram.createAccountWithSeed({
      fromPubkey: wallet.publicKey,
      basePubkey: wallet.publicKey,
      seed: "minter",
      newAccountPubkey: minter_pda,
      lamports : await provider.connection.getMinimumBalanceForRentExemption(MINTER_ACCOUNT_SPACE),
      space: MINTER_ACCOUNT_SPACE,
      programId: secondProgram.programId,
    }));
  }


  let staker_pda = await PublicKey.createWithSeed(
    wallet.publicKey,
    "staker",
    firstProgram.programId,
  );
  let stakerPDA = await solConnection.getAccountInfo(staker_pda);
  console.log("stakerPDA info =", stakerPDA);
  if (stakerPDA === null) {
    arrIx.push(SystemProgram.createAccountWithSeed({
      fromPubkey: wallet.publicKey,
      basePubkey: wallet.publicKey,
      seed: "staker",
      newAccountPubkey: staker_pda,
      lamports : await provider.connection.getMinimumBalanceForRentExemption(STAKER_ACCOUNT_SPACE),
      space: STAKER_ACCOUNT_SPACE,
      programId: firstProgram.programId,
    }));
  }

  
  let userTokenAccount = new Keypair();
  const createTempTokenAccountIx = SystemProgram.createAccount({
    programId: TOKEN_PROGRAM_ID,
    space: AccountLayout.span,
    lamports: await solConnection.getMinimumBalanceForRentExemption(
      AccountLayout.span
    ),
    fromPubkey: wallet.publicKey,
    newAccountPubkey: userTokenAccount.publicKey,
  });
  const initTempAccountIx = Token.createInitAccountInstruction(
    TOKEN_PROGRAM_ID,
    TOKEN_MINT_PUBKEY,
    userTokenAccount.publicKey,
    wallet.publicKey
  );
  arrIx.push(createTempTokenAccountIx, initTempAccountIx);

  let result = await secondProgram.rpc.mintAndDeposit(
    new anchor.BN(amount).mul(decimal_value),
    {
      accounts: {
        admin: ADMIN_KEY_PAIR.publicKey,
        owner: wallet.publicKey,
        sourceTokenAccount: userTokenAccount.publicKey,
        sourceTokenMint: TOKEN_MINT_PUBKEY,
        tokenVaultAccount: VAULT_TOKEN_ACCOUNT_PUBKEY,
        minterPda: minter_pda,
        stakerPda: staker_pda,
        tokenProgram: TOKEN_PROGRAM_ID,
        firstProgram: firstProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY
      },
      instructions: arrIx,
      signers: [ADMIN_KEY_PAIR, userTokenAccount]
  }).catch(error => {
    showToast(error, 1);
  });

  if (result !== undefined) {
    showToast("Deposit Succeed. txHash=" + result, 0);
    return true;
  }
  return false;
}

export const withdraw = async (wallet: WalletContextState) => {

  let cloneWindow: any = window;
  let provider = new anchor.Provider(solConnection, cloneWindow['solana'], anchor.Provider.defaultOptions())
  const firstProgram = new anchor.Program(FirstIDL, FIRST_PROGRAM_ID, provider);

  if (wallet.publicKey === null) return false;
  let staker_pda = await PublicKey.createWithSeed(
    wallet.publicKey,
    "staker",
    firstProgram.programId,
  );

  let userTokenAccount = await getTokenAccount(wallet.publicKey, TOKEN_MINT_PUBKEY);
  
  let accInfo = solConnection.getAccountInfo(userTokenAccount);
  if (accInfo === null) {
    showToast("no token account", 1);
    return false;
  }
  let result = await firstProgram.rpc.withdraw({
    accounts: {
      admin: ADMIN_KEY_PAIR.publicKey,
      owner: wallet.publicKey,
      tokenStaker: staker_pda,
      destTokenAccount: userTokenAccount,
      tokenMint: TOKEN_MINT_PUBKEY,
      tokenVaultAccount: VAULT_TOKEN_ACCOUNT_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID
    },
    signers: [ADMIN_KEY_PAIR]
  }).catch(error => {
    showToast(error, 1);
  });

  if (result !== undefined) {
    showToast("Withdraw succeed. txHash=" + result, 0);
    return true;
  }
  return false;
}
export const getUserStakedAmount = async (owner: PublicKey) => {
  if (owner === null) return 0;
  let staker_pda = await PublicKey.createWithSeed(
    owner,
    "staker",
    FIRST_PROGRAM_ID,
  );
  let stakerPDA = await solConnection.getAccountInfo(staker_pda);
  if (stakerPDA === null) {
    return 0;
  }
  console.log("stakerPDA =", stakerPDA);
  let amount : Buffer | undefined = stakerPDA?.data.slice(32, 40);
  if (amount === undefined) return 0;
  let x = new anchor.BN(amount.swap64()).div(decimal_value);
  
  console.log("amount =", x.toString());
  return x.toString();
}
export const getTotalStakedAmount = async () => {
  let x = await getTokenAccountBalance(VAULT_TOKEN_ACCOUNT_PUBKEY);
  return x;
}
const getTokenAccountBalance = async (tokenAccount : PublicKey) => {
  let tokenAccountInfo = await solConnection.getAccountInfo(tokenAccount);
  let amount : Buffer | undefined = tokenAccountInfo?.data.slice(64, 72);
  if (amount === undefined) return 0;
  
  let x = new anchor.BN(amount.swap64()).div(decimal_value);
  return x.toString();
}
const getTokenAccount = async (owner: PublicKey, tokenMint : PublicKey) : Promise<PublicKey> => {
  let tokenAccount = await solConnection.getProgramAccounts(
    TOKEN_PROGRAM_ID,
    {
      filters: [
        {
          dataSize: 165
        },
        {
          memcmp: {
            offset: 32,
            bytes: owner.toBase58()
          }
        },
        {
          memcmp: {
            offset: 0,
            bytes: tokenMint.toBase58()
          }
        },
      ]
    }
  );
  return tokenAccount[0].pubkey;
}

export const showToast = (txt: string, ty: number) => {
  let type = toast.TYPE.SUCCESS;
  if (ty === 1) type = toast.TYPE.ERROR;
  toast.error(txt, {
    position: "bottom-left",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
    type,
    theme: 'colored'
  });
}