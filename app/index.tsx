import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, Alert, ActivityIndicator, Button, ScrollView, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL } from './contractConfig';
import { useWalletConnectModal } from '@walletconnect/modal-react-native';

export default function App() {
  const { open, isConnected, address, provider } = useWalletConnectModal();
  
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bloodBanks, setBloodBanks] = useState<any[]>([]);

  // Form State
  const [bankName, setBankName] = useState('');
  const [bloodGroups, setBloodGroups] = useState('');
  const [inventoryLevels, setInventoryLevels] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Filter State
  const [selectedFilter, setSelectedFilter] = useState('All');
  const bloodTypeOptions = ['All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation.coords);
    })();
  }, []);

  const fetchBlockchainData = async () => {
    try {
      const jsonProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, jsonProvider);

      const addresses = await contract.getBloodBanks();
      const fetchedBanks = [];

      for (let i = 0; i < addresses.length; i++) {
        const bankDetails = await contract.bloodBanks(addresses[i]);
        fetchedBanks.push({
          id: addresses[i],
          name: bankDetails.name,
          latitude: parseFloat(bankDetails.latitude),
          longitude: parseFloat(bankDetails.longitude),
          bloodGroups: bankDetails.bloodGroups,
          inventoryLevels: bankDetails.inventoryLevels,
          isVerified: bankDetails.isVerified,
          isActive: bankDetails.isActive,
        });
      }

      setBloodBanks(fetchedBanks);
    } catch (error) {
      console.error("Error fetching from blockchain:", error);
    }
  };

  const registerRealBloodBank = async () => {
    if (!isConnected) {
      Alert.alert("Wallet Not Connected", "Please connect your mobile wallet first.");
      open();
      return;
    }

    if (!bankName.trim() || !bloodGroups.trim() || !inventoryLevels.trim()) {
      Alert.alert("Missing Details", "Please fill in name, blood groups, and inventory levels.");
      return;
    }

    if (!location) {
      Alert.alert("Location Error", "Still finding your location. Please wait.");
      return;
    }

    try {
      setIsRegistering(true);

      const web3Provider = new ethers.BrowserProvider(provider as any);
      const signer = await web3Provider.getSigner();
      
      const contractWithSigner = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contractWithSigner.registerBloodBank(
        bankName, 
        location.latitude.toString(), 
        location.longitude.toString(),
        bloodGroups,
        inventoryLevels 
      );

      await tx.wait();
      Alert.alert("Success", `${bankName} registered on the blockchain via your wallet!`);
      
      setBankName('');
      setBloodGroups('');
      setInventoryLevels('');
      fetchBlockchainData();
    } catch (error) {
      console.error("Error registering blood bank:", error);
      Alert.alert("Error", "Failed to register the blood bank.");
    } finally {
      setIsRegistering(false);
    }
  };

  useEffect(() => {
    fetchBlockchainData();
  }, []);

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e74c3c" />
        <Text style={{ marginTop: 10 }}>Finding your location...</Text>
      </View>
    );
  }

  const filteredBanks = bloodBanks.filter((bank) => {
    if (selectedFilter === 'All') return true;
    return bank.bloodGroups.toUpperCase().includes(selectedFilter.toUpperCase());
  });

  return (
    <View style={styles.container}>
      <View style={[styles.map, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2f3' }]}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#555' }}>Web Testing Mode</Text>
        <Text style={{ color: '#777', marginTop: 5 }}>WalletConnect & Smart Contract logic is fully active here!</Text>
      </View>

      {/* Wallet Connection Button Top Right */}
      <View style={styles.walletButtonContainer}>
        <TouchableOpacity
  style={styles.walletButton}
  onPress={async () => {
    console.log("Opening WalletConnect...");
    await open();
    console.log("Returned from MetaMask");
    console.log("Connected:", isConnected);
    console.log("Address:", address);
    console.log("Provider:", provider);
  }}
></TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {bloodTypeOptions.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                selectedFilter === type && styles.activeFilterButton
              ]}
              onPress={() => setSelectedFilter(type)}
            >
              <Text style={[
                styles.filterText,
                selectedFilter === type && styles.activeFilterText
              ]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>Register Blood Bank</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Blood Bank Name"
          value={bankName}
          onChangeText={setBankName}
          editable={!isRegistering}
        />

        <TextInput
          style={styles.input}
          placeholder="Blood Groups (e.g., A+, O-)"
          value={bloodGroups}
          onChangeText={setBloodGroups}
          editable={!isRegistering}
        />

        <TextInput
          style={styles.input}
          placeholder="Inventory Levels (e.g., A+: 5 units)"
          value={inventoryLevels}
          onChangeText={setInventoryLevels}
          editable={!isRegistering}
        />
        
        <Button 
          title={isRegistering ? "Registering on Chain..." : "Register Location"} 
          onPress={registerRealBloodBank} 
          disabled={isRegistering || bankName.trim() === '' || bloodGroups.trim() === '' || inventoryLevels.trim() === ''}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { width: '100%', height: '100%' },
  walletButtonContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 999,
    elevation: 10,
  },
  walletButton: {
    backgroundColor: '#2ecc71',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 4,
  },
  walletButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  filterContainer: {
    position: 'absolute',
    top: 115,
    left: 15,
    right: 15,
    height: 45,
  },
  filterButton: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    elevation: 3,
    height: 38,
    justifyContent: 'center',
  },
  activeFilterButton: {
    backgroundColor: '#e74c3c',
  },
  filterText: {
    fontWeight: 'bold',
    color: '#333',
  },
  activeFilterText: {
    color: 'white',
  },
  formContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 15,
    elevation: 5, 
  },
  formTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 12, backgroundColor: '#f9f9f9' },
});