import * as Linking from 'expo-linking';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as any).React = React;
  
  const style = document.createElement('style');
  style.innerHTML = `
    wcm-modal {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
    }
    #walletconnect-modal {
      max-width: 450px !important;
      width: 100% !important;
      border-radius: 20px !important;
    }
  `;
  document.head.appendChild(style);
}

import { Stack } from 'expo-router';
import { WalletConnectModal, useWalletConnectModal } from '@walletconnect/modal-react-native';
import { RPC_URL } from './contractConfig';

const projectId = 'f4c08310d2caa9d83e6686c1237b0778';

const providerMetadata = {
  name: 'Blood Donation App',
  description: 'Decentralized Blood Donation System',
  url: 'https://github.com/expo/expo',
  icons: ['https://walletconnect.com/walletconnect-logo.png'],
  redirect: {
    native: Linking.createURL(''), 
    universal: '', 
  },
};

const sessionParams = {
  namespaces: {
    eip155: {
      methods: [
        "eth_sendTransaction",
        "eth_signTransaction",
        "eth_sign",
        "personal_sign",
        "eth_signTypedData",
        "wallet_switchEthereumChain",
      ],
      chains: ["eip155:11155111"],
      events: ["chainChanged", "accountsChanged"],
      rpcMap: {
        11155111: RPC_URL, 
      },
    },
  },
};

export default function RootLayout() {
  const { provider, address, isConnected } = useWalletConnectModal();

  useEffect(() => {
    const nukeGhostSession = async () => {
      await AsyncStorage.clear();
      console.log("WalletConnect cache wiped clean!");
    };
    nukeGhostSession();
  }, []);

  useEffect(() => {
    if (isConnected) {
      console.log("Wallet successfully synced with app! Address:", address);
    }
  }, [isConnected, address]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <WalletConnectModal
        projectId={projectId}
        providerMetadata={providerMetadata}
        sessionParams={sessionParams}
      />
    </>
  );
}