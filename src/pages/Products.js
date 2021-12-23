
import { useState } from 'react';
import { useEffect } from 'react';
// material
import { Container, Stack, TextField, Typography, Link } from '@mui/material';
// components
import Page from '../components/Page';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import MoneyOff from '@mui/icons-material/MoneyOff';
import LoadingButton from '@mui/lab/LoadingButton'
import { InlineIcon } from '@iconify/react';
import { getFormattedPrice } from '../contexts/utils'
import { useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_MINT_PUBKEY, VAULT_TOKEN_ACCOUNT_PUBKEY, mintAndDeposit, withdraw, getUserStakedAmount, getTotalStakedAmount
} from '../contexts/helpers';

// ----------------------------------------------------------------------

export default function EcommerceShop() {
  const wallet = useWallet();
  const [mintLoading, setMintLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0.0);
  const [userAmount, setUserAmount] = useState(0.0);
  const [stakingAmount, setStakingAmount] = useState(0.0);

  useEffect(() => {
    getUserStakedAmount(wallet.publicKey).then(x => {
      setUserAmount(x);
    });
  }, [wallet.publicKey])

  useEffect(() => {
    getTotalStakedAmount().then((x) => {
      setTotalAmount(x);
    })
  }, [])

  const onStakingAmountChange = (e) => {
    console.log(e.target.value);
    setStakingAmount(parseInt(e.target.value));
  }

  const onMintClick = () => {
    mintAndDeposit(stakingAmount, wallet).then(res =>{
      setMintLoading(false);
      console.log("minting succeed=", res);
      if (res === true) {
        setTotalAmount(totalAmount + stakingAmount);
        setUserAmount(userAmount + stakingAmount);
        // updateData(hero_id, priceToUpdate, contentURI, owner);
      }
    });
  }
  const onWithdrawClick = () => {
    withdraw(wallet).then(res =>{
      setWithdrawLoading(false);
      console.log("withdraw succeed=", res);
      if (res === true) {
        setTotalAmount(totalAmount - userAmount);
        setUserAmount(0);
        // updateData(hero_id, priceToUpdate, contentURI, owner);
      }
    });
  }

  return (
    <Page title="Ratio Finance CPI Simple Test" ml={5}>
        <Stack>
          <Link href={"https://solscan.io/account/" + TOKEN_MINT_PUBKEY.toBase58() + "?cluster=devnet"} target="_blank" underline="hover" key={0}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h4" noWrap>
              Token Address: { TOKEN_MINT_PUBKEY.toBase58() }
              </Typography>
              <Typography variant="h4">
                <InlineIcon icon="bi:arrow-right"/>
              </Typography>
            </Stack>
          </Link>
        </Stack>
        <Stack>
          <Link href={"https://solscan.io/account/" + VAULT_TOKEN_ACCOUNT_PUBKEY.toBase58() + "?cluster=devnet"} target="_blank" underline="hover" key={0}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h4" noWrap>
              Vault Token Account Address: { VAULT_TOKEN_ACCOUNT_PUBKEY.toBase58() }
              </Typography>
              <Typography variant="h4">
                <InlineIcon icon="bi:arrow-right"/>
              </Typography>
            </Stack>
          </Link>
        </Stack>

        <Stack pt={2}>
          <Typography variant="h3" noWrap>
            Total Staked Amount: {totalAmount}
          </Typography> 
        </Stack>
        
        <Stack>
          <Typography variant="h3" noWrap>
            User Staked Amount: {userAmount}
          </Typography> 
        </Stack>

        <Stack direction="row" spacing={3} ml={2}  pt={5}>
          <TextField id="outlined-basic" label="amount" variant="outlined" onChange={(e) => onStakingAmountChange(e)} />
          
          <LoadingButton
            loading={mintLoading}
            loadingPosition="start"
            startIcon={<MonetizationOnIcon />}
            onClick={() => {onMintClick()}}
            size="large"
            variant="contained">
            Mint And Deposit
          </LoadingButton>
          <LoadingButton
            loading={withdrawLoading}
            loadingPosition="start"
            startIcon={<MoneyOff />}
            onClick={() => {onWithdrawClick()}}
            size="large"
            variant="outlined">
            Withdraw
          </LoadingButton>
        </Stack>
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
    </Page>
  );
}
