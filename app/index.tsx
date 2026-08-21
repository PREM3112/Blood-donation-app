import '@walletconnect/react-native-compat';
import 'react-native-get-random-values';

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, Alert, ActivityIndicator, Button, ScrollView, TouchableOpacity, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL } from './contractConfig';
import { useWalletConnectModal } from '@walletconnect/modal-react-native';

export default function App() {
  const { open, isConnected, address, provider } = useWalletConnectModal();
  
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [bloodBanks, setBloodBanks] = useState<any[]>([]);
  
  // State for real-world hospitals (Powered by OpenStreetMap)
  const [realHospitals, setRealHospitals] = useState<any[]>([]);

  // Form State
  const [bankName, setBankName] = useState('');
  const [bloodGroups, setBloodGroups] = useState('');
  const [inventoryLevels, setInventoryLevels] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Filter State
  const [selectedFilter, setSelectedFilter] = useState('All');
  const bloodTypeOptions = ['All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  // Native Direct Contact Helpers
  const makePhoneCall = (phoneNumber: string) => {
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Error", "Phone calls are not supported on this device.");
    });
  };

  const sendSMS = (phoneNumber: string, message: string) => {
    const url = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Error", "SMS is not supported on this device.");
    });
  };

  const sendWhatsApp = (phoneNumber: string, message: string) => {
    const url = `whatsapp://send?text=${encodeURIComponent(message)}&phone=${phoneNumber}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Error", "WhatsApp is not installed on this device.");
    });
  };

  // Real Hospital Fetcher using OpenStreetMap (Overpass API)
  const fetchRealHospitals = async (lat: number, lng: number) => {
    try {
      const radius = 5000; // 5km search radius
      const query = `[out:json];(node["amenity"="hospital"](around:${radius},${lat},${lng});node["amenity"="clinic"](around:${radius},${lat},${lng}););out body;`;
      const url = 'https://overpass-api.de/api/interpreter';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'DecentralizedBloodBankApp/1.0'
        },
        body: `data=${encodeURIComponent(query)}`
      });
      
      const rawText = await response.text();
      if (rawText.trim().startsWith('<')) return; 

      const data = JSON.parse(rawText);
      
      if (data.elements) {
        const formattedHospitals = data.elements
          .filter((el: any) => el.tags && el.tags.name) 
          .map((el: any) => ({
            name: el.tags.name,
            lat: el.lat,
            lng: el.lon,
            vicinity: el.tags['addr:street'] || el.tags['addr:suburb'] || 'Hospital / Clinic' 
          }));

        setRealHospitals(formattedHospitals);
      }
    } catch (error) {
      console.error("Error fetching OSM hospitals:", error);
    }
  };

  // 1. Fetch User Location & Nearby Hospitals
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access location was denied.');
        const fallbackLat = 13.0827;
        const fallbackLng = 80.2707;
        setLocation({ latitude: fallbackLat, longitude: fallbackLng } as Location.LocationObjectCoords); 
        fetchRealHospitals(fallbackLat, fallbackLng);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      fetchRealHospitals(loc.coords.latitude, loc.coords.longitude);
    })();
  }, []);

  // 2. Safe Provider Error & Cleanup Listeners
  useEffect(() => {
    if (!provider) return;

    const handleDisconnect = (error: any) => {
      console.error('[DEBUG] Provider forcefully disconnected:', error);
    };

    const handleError = (error: any) => {
      console.error('[DEBUG] Underlying Provider Error:', error);
    };

    provider.on('disconnect', handleDisconnect);
    provider.on('error', handleError);

    return () => {
      if (provider && typeof provider.removeListener === 'function') {
        try {
          provider.removeListener('disconnect', handleDisconnect);
          provider.removeListener('error', handleError);
        } catch (cleanupErr) {
          console.warn("Ignored WalletConnect cleanup error:", cleanupErr);
        }
      }
    };
  }, [provider]);

  // 3. Fetch verified Web3 blood banks from smart contract & IPFS
  const fetchBlockchainData = async () => {
    try {
      const jsonProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, jsonProvider);

      const addresses = await contract.getBloodBanks();
      const fetchedBanks = [];

      for (let i = 0; i < addresses.length; i++) {
        const bankDetails = await contract.bloodBanks(addresses[i]);
        if (!bankDetails.isActive) continue;

        let offChainData = { name: "Blood Bank", bloodGroups: "N/A", inventoryLevels: "N/A" };
        const cid = bankDetails.ipfsCID;

        // Inside fetchBlockchainData in App.tsx
if (cid && cid.trim() !== '' && cid !== 'QmFallbackCID') {
  try {
    const ipfsRes = await fetch(`https://ipfs.io/ipfs/${cid}`);
    
    // 1. Ensure HTTP status is OK (200)
    if (ipfsRes.ok) {
      const contentType = ipfsRes.headers.get("content-type");
      // 2. Check if the response is actually JSON
      if (contentType && contentType.includes("application/json")) {
        offChainData = await ipfsRes.json();
      } else {
        const textData = await ipfsRes.text();
        console.warn(`IPFS CID ${cid} did not return JSON. Received:`, textData.substring(0, 50));
      }
    } else {
      console.warn(`IPFS gateway returned status ${ipfsRes.status} for CID: ${cid}`);
    }
  } catch (ipfsErr) {
    console.error("IPFS metadata fetch error for CID:", cid, ipfsErr);
  }
}

        fetchedBanks.push({
          id: addresses[i],
          name: offChainData.name || "Blood Bank",
          latitude: parseFloat(bankDetails.latitude),
          longitude: parseFloat(bankDetails.longitude),
          bloodGroups: offChainData.bloodGroups || "N/A",
          inventoryLevels: offChainData.inventoryLevels || "N/A",
          isVerified: bankDetails.isVerified,
          isActive: bankDetails.isActive,
          ipfsCID: cid,
        });
      }
      setBloodBanks(fetchedBanks);
    } catch (error) {
      console.error("Error fetching from blockchain:", error);
    }
  };

  // 4. Registering logic with Pinata IPFS & WalletConnect
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

      // A. Create Metadata JSON
      const metadata = {
        name: bankName,
        bloodGroups: bloodGroups,
        inventoryLevels: inventoryLevels,
        registeredAt: new Date().toISOString()
      };

      // B. Upload Metadata JSON to IPFS via Pinata
      let ipfsCID = "";
      const pinataJwt = process.env.EXPO_PUBLIC_PINATA_JWT;

      if (pinataJwt) {
        const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${pinataJwt}`
          },
          body: JSON.stringify({ pinataContent: metadata })
        });
        const pinataData = await pinataRes.json();
        ipfsCID = pinataData.IpfsHash;
      } else {
        // Fallback for key configuration testing
        const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "pinata_api_key": "d791ec88adc28557707e",
            "pinata_secret_api_key": "f67b08aaf154a0d77730f9c9ff0ffd6330f941ff27d8a88d3fd4601095a44652"
          },
          body: JSON.stringify({ pinataContent: metadata })
        });
        const pinataData = await pinataRes.json();
        ipfsCID = pinataData.IpfsHash || "QmFallbackCID";
      }

      const web3Provider = new ethers.BrowserProvider(provider as any);
      const signer = await web3Provider.getSigner();

      // Request Network Switch to Sepolia
      try {
        await web3Provider.send("wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }]);
      } catch (switchError: any) {
         console.log("Network switch notice:", switchError?.message);
      }
      
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, web3Provider);

      // C. Encode transaction parameters (3 arguments: ipfsCID, latitude, longitude)
      const encodedData = contract.interface.encodeFunctionData("registerBloodBank", [
        ipfsCID,
        location.latitude.toString(),
        location.longitude.toString()
      ]);

      const transactionParameters = {
        to: CONTRACT_ADDRESS,
        value: 0n, 
        data: encodedData,
        chainId: 11155111,
        gasLimit: 500000n, 
        maxPriorityFeePerGas: 1500000000n 
      };

      const txResponse = await signer.sendTransaction(transactionParameters);
      await txResponse.wait();
      Alert.alert("Success", `${bankName} registered on the blockchain via IPFS!`);
      
      setBankName('');
      setBloodGroups('');
      setInventoryLevels('');
      fetchBlockchainData();
    } catch (error: any) {
      console.error("Error registering blood bank:", error);
      Alert.alert("Error", error?.message || "Failed to register the blood bank.");
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
      
      {/* ---------------- MAPVIEW ---------------- */}
      <MapView 
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      >
        {/* User Location */}
        <Marker 
          coordinate={{ latitude: location.latitude, longitude: location.longitude }} 
          title="You are here" 
          pinColor="blue"
        />

        {/* Free Real-World Unregistered Hospitals (Red Pins) */}
        {realHospitals.map((hospital, index) => (
          <Marker
            key={`real-${index}`}
            coordinate={{ 
              latitude: hospital.lat, 
              longitude: hospital.lng 
            }}
            title={hospital.name}
            description={hospital.vicinity + "\n(Tap callout to register)"}
            pinColor="red"
            onCalloutPress={() => {
              setBankName(hospital.name);
            }}
          />
        ))}

        {/* Web3 Registered Blood Banks (Green Pins) */}
        {filteredBanks.map((bank) => (
          <Marker
            key={bank.id}
            coordinate={{ latitude: bank.latitude, longitude: bank.longitude }}
            title={`✅ ${bank.name}`}
            description={`Blood: ${bank.bloodGroups} | Inv: ${bank.inventoryLevels}\n(Tap callout to contact)`}
            pinColor="green"
            onCalloutPress={() => {
              const defaultPhone = "919876543210";
              const emergencyMsg = `URGENT: Requesting information on ${selectedFilter !== 'All' ? selectedFilter : 'blood'} stock found on Decentralized Blood Bank app.`;

              Alert.alert(
                `Contact ${bank.name}`,
                "Choose contact method:",
                [
                  { text: "Call", onPress: () => makePhoneCall(defaultPhone) },
                  { text: "SMS", onPress: () => sendSMS(defaultPhone, emergencyMsg) },
                  { text: "WhatsApp", onPress: () => sendWhatsApp(defaultPhone, emergencyMsg) },
                  { text: "Cancel", style: "cancel" }
                ]
              );
            }}
          />
        ))}
      </MapView>

      {/* Wallet Connection Button */}
      <View style={styles.walletButtonContainer}>
        <TouchableOpacity
          style={styles.walletButton}
          onPress={async () => {
            try {
              await open();
            } catch (error: any) {
              Alert.alert("Connection Error", error?.message);
            }
          }}
        >
          <Text style={styles.walletButtonText}>
            {isConnected ? "Connected" : "Connect Wallet"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Buttons */}
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

      {/* Registration Form */}
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>Register Blood Bank</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Blood Bank Name (Tap Red Pin to Autofill)"
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
          title={isRegistering ? "Uploading to IPFS & Chain..." : "Register Location"} 
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