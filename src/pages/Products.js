
import { useState } from 'react';
import { useEffect } from 'react';
// material
import { FormGroup, Grid, Stack, TextField, Typography, Button } from '@mui/material';
// components   
import Page from '../components/Page';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import MoneyOff from '@mui/icons-material/MoneyOff';
import Money from '@mui/icons-material/Money';
import LoadingButton from '@mui/lab/LoadingButton'
import { InlineIcon } from '@iconify/react';
import { useWallet } from "@solana/wallet-adapter-react";

import { OrcaFarmConfig, OrcaPoolConfig } from "@orca-so/sdk";

import {
  getLpBaseTokenBalance, 
  getLpBalance,
  getDDLpBalance,
  depositLpToFarm, 
  depositLpToDD,
  withdrawLpFromFarm, 
  harvest, 
  getHarvestableAmount,
  swap,
  addLiquidity,
  deployLPToFarm
} from '../contexts/orca';

// ----------------------------------------------------------------------

export default function EcommerceShop() {
  const wallet = useWallet();
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [depositDDLoading, setDepositDDLoading] = useState(false);
  const [withdrawDDLoading, setWithdrawDDLoading] = useState(false);
  const [harvestLoading, setHarvestLoading] = useState(false);
  const [ddHarvestLoading, setDDHarvestLoading] = useState(false);

  const [farmInfo, setFarmInfo] = useState({
    isStableFarm: false,
    farmLabel: "ORCA/SOL",
    poolId: OrcaPoolConfig.ORCA_SOL,
    farmId: OrcaFarmConfig.ORCA_SOL_AQ,
    ddId: "",
  });

  const [totalAmount, setTotalAmount] = useState(0.0);
  const [userlpAmount, setUserLPAmount] = useState(0.0);
  const [ddlpAmount, setUserDDLPAmount] = useState(0.0);
  const [userUnstakedlpAmount, setUserUnstakedLPAmount] = useState(0.0);
  const [inputAmount, setInputAmount] = useState(0.0);
  const [earningAmount, setEarningAmount] = useState(0.0);
  const [doubleDipReward, setDoubleDipReward] = useState(0.0);

  const [globalVault, setGlobalVault] = useState({
    mintColl: "",
    tokenColl: "",
    totalColl: 0,
    totalDebt: 0  
  });

  const [userTrove, setUserTrove] = useState({
    lockedCollBalance: 0,
    debt: 0,
    lastMintTime: ""
  })

  useEffect(() => {
    updateLpBalance();
    
  }, [wallet.publicKey, farmInfo])

  
  const updateLpBalance = () => {
    if (wallet.publicKey == null) return;
    getLpBalance(wallet.publicKey, farmInfo.poolId, farmInfo.farmId)
    .then(({ lpAmount, baseAmount }) => {
      setUserLPAmount(lpAmount + baseAmount);
      setUserUnstakedLPAmount(baseAmount);
    });
    farmInfo.ddId !== "" && getDDLpBalance(wallet.publicKey, farmInfo.ddId)
    .then((ddAmount) => {
      setUserDDLPAmount(ddAmount);
    })
    getHarvestableAmount(wallet.publicKey, farmInfo.farmId).then(x => {
      setEarningAmount(x);
    });
    farmInfo.ddId !== "" && getHarvestableAmount(wallet.publicKey, farmInfo.ddId).then(x => {
      setDoubleDipReward(x);
    })

    setGlobalVault({
      mintColl: "",
      tokenColl: "",
      totalColl: 0,
      totalDebt: 0  
    });
    setUserTrove({
      lockedCollBalance: 0,
      debt: 0,
      lastMintTime: ""
    })
  }
  const onStakingAmountChange = (e) => {
    console.log(e.target.value);
    setInputAmount(parseInt(e.target.value));
  }

  const onWithdrawClick = () => {
    setWithdrawLoading(true);
    withdrawLpFromFarm(wallet, inputAmount, farmInfo.farmId).then(success => {
      setWithdrawLoading(false);
      if (success) {
        updateLpBalance();
      }
    })
  }
  const onWithdrawDDClick = () => {
    setWithdrawDDLoading(true);
    withdrawLpFromFarm(wallet, inputAmount, farmInfo.ddId).then(success => {
      setWithdrawDDLoading(false);
      if (success) {
        updateLpBalance();
      }
    })
  }
  const onDepositClick = () => {
    setDepositLoading(true);
    deployLPToFarm(wallet, inputAmount, farmInfo.poolId, farmInfo.farmId).then(success => {
      setDepositLoading(false);
      if (success) {
        updateLpBalance();
      }
    })
  }

  const onDepositDDClick = () => {
    setDepositDDLoading(true);
    depositLpToDD(wallet, inputAmount, farmInfo.farmId, farmInfo.ddId).then(success => {
      setDepositDDLoading(false);
      if (success) {
        updateLpBalance();
      }
    })
  }

  const onHarvestClick = () => {
    setHarvestLoading(true);
    harvest(wallet, farmInfo.farmId).then(success => {
      setHarvestLoading(false);
      if (success) {
        updateLpBalance();
      }
    })
  }

  const onDDHarvestClick = () => {
    setDDHarvestLoading(true);
    harvest(wallet, farmInfo.ddId).then(success => {
      setDDHarvestLoading(false);
      if (success) {
        updateLpBalance();
      }
    })
  }
  return (
    <Page title="Ratio Finance &gt; Orca Integration" ml={5}>
      <Grid container spacing={2} >
        <Grid item xs={8}  style={{border: '1px solid #ea8881', borderRadius: '15px'}} mt={4} p={5}>
          <Stack direction="row" spacing={2} mt={2}>
            <Button variant="outlined" color="primary" onClick={() => swap()}>Swap</Button> <br/>
            <Button variant="outlined" color="error" onClick={() => addLiquidity()}>Add Liquidity</Button>
          </Stack>

          <Stack pt={2}>
            <Typography variant="h2" noWrap>
              Orca <span style={{color:'#ea8881'}}>{farmInfo.farmLabel}</span> Farm
            </Typography> 
          </Stack>
          
          <Stack>
            <Typography variant="h4" noWrap>
              User Deposit LPT Balance: {userlpAmount}
            </Typography> 
          </Stack>
          <Stack>
            <Typography variant="h6" noWrap>
              Staked Balance: {userlpAmount-userUnstakedlpAmount}
            </Typography> 
          </Stack>
          <Stack>
            <Typography variant="h6" noWrap>
              Unstaked Balance: {userUnstakedlpAmount}
            </Typography> 
          </Stack>
          <Stack direction="row" spacing={3} >
            <Typography variant="h4" noWrap>
              Earning: {earningAmount} ORCA
            </Typography> 
            <LoadingButton
              loading={harvestLoading}
              loadingPosition="start"
              startIcon={<Money />}
              onClick={() => {onHarvestClick()}}
              size="large"
              variant="outlined">
              Harvest
            </LoadingButton>
          </Stack>
          {
            farmInfo.ddId != ""?<Stack style={{backgroundColor: '#f2d0fd'}} p={2} mt={1}>
                <Stack>
                  <Typography variant="h4" noWrap>
                    DoubleDip Balance: {ddlpAmount}
                  </Typography> 
                </Stack>
                <Stack direction="row" spacing={3} >
                  <Typography variant="h4" noWrap>
                    Earning: {doubleDipReward} Atlas
                  </Typography> 
                  <LoadingButton
                    loading={ddHarvestLoading}
                    loadingPosition="start"
                    startIcon={<Money />}
                    onClick={() => {onDDHarvestClick()}}
                    size="large"
                    variant="outlined">
                    Harvest Double-Dip
                  </LoadingButton>
                </Stack>
              </Stack>:""
          }
          <Stack direction="column" spacing={1} ml={2}  pt={5}>
            <TextField id="outlined-basic" label="amount" variant="outlined" onChange={(e) => onStakingAmountChange(e)} />
            <Stack direction="row" spacing={1} >
              <LoadingButton
                loading={depositLoading}
                loadingPosition="start"
                startIcon={<MonetizationOnIcon />}
                onClick={() => {onDepositClick()}}
                size="large"
                variant="contained">
                Deposit
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
            {
              farmInfo.ddId != ""?
              <Stack direction="row" spacing={2} >
                <LoadingButton
                  loading={depositDDLoading}
                  loadingPosition="start"
                  startIcon={<MonetizationOnIcon />}
                  onClick={() => {onDepositDDClick()}}
                  size="large"
                  variant="contained">
                  Double-Dip
                </LoadingButton>

                <LoadingButton
                  loading={withdrawDDLoading}
                  loadingPosition="start"
                  startIcon={<MoneyOff />}
                  onClick={() => {onWithdrawDDClick()}}
                  size="large"
                  variant="outlined">
                  UnDip
                </LoadingButton>
              </Stack>:""
          }
          </Stack>
        </Grid>
        <Grid item xs={4} p={2}>
          <Stack direction="column">
            <Stack direction="column"  style={{border: '1px solid rgb(63 81 181)', borderRadius: '15px'}} p={2} mt={4}>
              <Typography variant='h3'>TokenVault</Typography>
              <Typography variant='h6'>mint_coll</Typography>
              <Typography variant='h6'>{globalVault.mintColl}</Typography>
              <Typography variant='h6'>token_coll</Typography>
              <Typography variant='h6'>{globalVault.tokenColl}</Typography>
              <Typography variant='h6'>total_coll : {globalVault.totalColl}</Typography>
              <Typography variant='h6'>total_debt : {globalVault.totalDebt}</Typography>
            </Stack>
            <Stack direction="column"  style={{border: '1px solid rgb(231 158 0)', borderRadius: '15px'}} p={2} mt={4}>
              <Typography variant='h3'>UserTrove</Typography>
              <Typography variant='h6'>locked_coll_balance : {userTrove.lockedCollBalance}</Typography>
              <Typography variant='h6'>debt : {userTrove.debt}</Typography>
              <Typography variant='h6'>last_mint_time : {userTrove.lastMintTime}</Typography>
            </Stack>
          </Stack>  
        </Grid>
      </Grid>
        
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
