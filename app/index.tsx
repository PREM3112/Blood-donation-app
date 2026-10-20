import '@walletconnect/react-native-compat';
import 'react-native-get-random-values';

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, Alert, TouchableOpacity, Linking, Modal, ActivityIndicator, Platform, ScrollView } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { getDistance } from 'geolib'; 
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL } from './contractConfig';
import { useWalletConnectModal } from '@walletconnect/modal-react-native';
import { BlurView } from 'expo-blur'; 
import LottieView from 'lottie-react-native'; 
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// AI Service Imports
import { parseQueryWithGemini, parseAudioWithGemini } from './geminiService';

const silverMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] }
];

export default function App() {
  const { open, isConnected, address, provider } = useWalletConnectModal();
  
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [bloodBanks, setBloodBanks] = useState<any[]>([]);
  const [realHospitals, setRealHospitals] = useState<any[]>([]);

  // Registration States
  const [bankName, setBankName] = useState('');
  const [bloodGroups, setBloodGroups] = useState('');
  const [inventoryLevels, setInventoryLevels] = useState('');
  const [licenseId, setLicenseId] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<any | null>(null);
  const [isHospitalFormVisible, setIsHospitalFormVisible] = useState(false);

  const [selectedFilter, setSelectedFilter] = useState('All');
  const bloodTypeOptions = ['All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  // AI & Voice Assistant States
  const [isAiModalVisible, setIsAiModalVisible] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiMessage, setAiMessage] = useState('Type or hold the microphone to speak your emergency request.');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const ADMIN_ADDRESS = "0x3955FEdCC7210d0A4663Cbd274c27D6b6A938147";
  const isAdmin = address && address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  // --- Communication & Routing Helpers ---
  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string) => {
    Linking.openURL(`whatsapp://send?phone=${phone}&text=Emergency: We are looking for blood availability.`);
  };

  const openDirections = (lat: number, lng: number, hospitalName: string) => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${lat},${lng}`;
    const url = Platform.select({
      ios: `${scheme}${hospitalName}@${latLng}`,
      android: `${scheme}${latLng}(${hospitalName})`
    });
    if (url) Linking.openURL(url);
  };

  // Voice Recording Functions
  const startRecording = async () => {
    try {
      if (recording) return;
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'Please enable microphone access.');
        return;
      }
      await Audio.setAudioModeAsync({ 
        allowsRecordingIOS: true, 
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(newRecording);
      setIsRecording(true);
      setAiMessage('Listening... Speak your emergency request now.');
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setIsAiProcessing(true);
    setAiMessage('Analyzing speech with Gemini...');

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        const base64Audio = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const result = await parseAudioWithGemini(base64Audio);
        setAiMessage(result.replyMessage || 'Processed voice request.');
        
        if (result.bloodGroup && bloodTypeOptions.includes(result.bloodGroup)) {
          setSelectedFilter(result.bloodGroup);
        } else if (result.bloodGroup === "All" || !result.bloodGroup) {
          setSelectedFilter('All');
        }

        // AUTO-CLOSE MODAL AFTER 1.2 SECONDS
        setTimeout(() => {
          setIsAiModalVisible(false);
          setAiMessage('Type or hold the microphone to speak your emergency request.'); 
        }, 1200);
      }
    } catch (error) {
      setAiMessage('Failed to process voice request. Please try typing.');
      setRecording(null);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const fetchRealHospitals = async (lat: number, lng: number) => {
    try {
      const radius = 15000; 
      const API_KEY = "ac4541dc1e8f4e8bb6bdba7fa15e6822"; 
      const url = `https://api.geoapify.com/v2/places?categories=healthcare.hospital,healthcare.clinic_or_praxis&filter=circle:${lng},${lat},${radius}&limit=100&apiKey=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.features) {
        const formattedHospitals = data.features.map((feature: any, idx: number) => {
          // Deterministic simulated real-time stock generation for public nodes
          const unitsA = (idx * 3 + 4) % 15;
          const unitsB = (idx * 2 + 1) % 12;
          const unitsO = (idx * 5 + 6) % 20;
          const unitsAB = (idx + 2) % 8;

          const inventoryLevels = `A+: ${unitsA}, B+: ${unitsB}, O+: ${unitsO}, AB+: ${unitsAB}`;
          const bloodGroups = 'A+, B+, O+, AB+';

          return {
            id: `geo-${idx}`,
            name: feature.properties.name || "City Health Clinic",
            latitude: feature.properties.lat,
            longitude: feature.properties.lon,
            vicinity: feature.properties.street || feature.properties.city || 'Hospital / Clinic',
            inventoryLevels,
            bloodGroups,
            isVerified: false,
          };
        });
        setRealHospitals(formattedHospitals);
      }
    } catch (error) { console.error("Error fetching Geoapify hospitals:", error); }
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation({ latitude: 13.0827, longitude: 80.2707 } as Location.LocationObjectCoords); 
        fetchRealHospitals(13.0827, 80.2707);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      fetchRealHospitals(loc.coords.latitude, loc.coords.longitude);
    })();
  }, []);

  const fetchBlockchainData = async () => {
    try {
      const jsonProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, jsonProvider);
      
      let addresses = [];
      try { 
        addresses = await contract.getBloodBanks(); 
      } catch (callErr: any) { 
        console.error("CRITICAL RPC ERROR:", callErr?.message || callErr);
        return; 
      }

      if (!addresses || addresses.length === 0) return;
      const fetchedBanks = [];

      for (let i = 0; i < addresses.length; i++) {
        const bankDetails = await contract.bloodBanks(addresses[i]);

        let offChainData: any = { name: "Pending Hospital", bloodGroups: "Pending", inventoryLevels: "Pending", licenseId: "Fetching..." };
        const cid = bankDetails.ipfsCID;

        if (cid && cid !== 'QmFallbackCID') {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second IPFS Timeout
            
            const ipfsRes = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (ipfsRes.ok) {
              offChainData = await ipfsRes.json();
            }
          } catch (ipfsErr) {
            console.log("IPFS took too long, skipping metadata for now.");
          }
        }

        fetchedBanks.push({
          id: addresses[i],
          name: offChainData.name || "Unknown Hospital",
          licenseId: offChainData.licenseId || "IPFS Pending...",
          latitude: parseFloat(bankDetails.latitude) || 0,
          longitude: parseFloat(bankDetails.longitude) || 0,
          bloodGroups: offChainData.bloodGroups || "N/A",
          inventoryLevels: offChainData.inventoryLevels || "N/A",
          lastUpdated: offChainData.lastUpdated || "Just now",
          isVerified: bankDetails.isVerified,
          isActive: bankDetails.isActive,
          ipfsCID: cid,
        });
      }
      
      setBloodBanks(fetchedBanks);
    } catch (error) {
      console.log("Fetch Blockchain Error:", error);
    }
  };

  const registerRealBloodBank = async () => {
    if (!isConnected) { Alert.alert("Wallet Not Connected", "Please connect your wallet first."); open(); return; }
    if (!bankName.trim() || !bloodGroups.trim() || !inventoryLevels.trim()) return;

    try {
      setIsRegistering(true);
      const metadata = { name: bankName, licenseId: licenseId, bloodGroups: bloodGroups, inventoryLevels: inventoryLevels, registeredAt: new Date().toISOString(), lastUpdated: new Date().toLocaleTimeString() };
      let ipfsCID = "QmFallbackCID";
      const pinataJwt = process.env.EXPO_PUBLIC_PINATA_JWT;

      if (pinataJwt) {
        const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${pinataJwt}` },
          body: JSON.stringify({ pinataContent: metadata })
        });
        const pinataData = await pinataRes.json();
        ipfsCID = pinataData.IpfsHash;
      }

      const web3Provider = new ethers.BrowserProvider(provider as any, "any");
      // --- FORCE WALLETCONNECT TO SEPOLIA ---
      try {
        await provider?.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      } catch (switchError) {
        console.log("Network switch bypassed or failed:", switchError);
      }
      // --------------------------------------
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, web3Provider);

      const encodedData = contract.interface.encodeFunctionData("registerBloodBank", [ipfsCID, location!.latitude.toString(), location!.longitude.toString()]);
      const txHash = await provider?.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: CONTRACT_ADDRESS,
          data: encodedData,
        }],
      });
      console.log("Transaction Hash:", txHash);
      
      Alert.alert("Submitted", "Hospital registered! Awaiting Admin approval.");
      setBankName(''); setLicenseId(''); setBloodGroups(''); setInventoryLevels('');
      setIsHospitalFormVisible(false);
      fetchBlockchainData();
    } catch (error: any) { Alert.alert("Error", error?.message); } finally { setIsRegistering(false); }
  };

  const approveHospital = async (hospitalAddress: string, hospitalName: string) => {
    try {
      const web3Provider = new ethers.BrowserProvider(provider as any, "any");

      // --- FORCE WALLETCONNECT TO SEPOLIA ---
      try {
        await provider?.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      } catch (switchError) {
        console.log("Network switch bypassed or failed:", switchError);
      }
      // --------------------------------------

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, web3Provider);
      const encodedData = contract.interface.encodeFunctionData("verifyBloodBank", [hospitalAddress, true]);

      // --- DIRECT WALLETCONNECT TRANSACTION ---
      const txHash = await provider?.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: CONTRACT_ADDRESS,
          data: encodedData,
        }],
      });
      console.log("Approval Transaction Hash:", txHash);
      // ----------------------------------------

      Alert.alert("Verified", `${hospitalName} is now approved on-chain!`);
      fetchBlockchainData(); 
    } catch (error: any) { 
      Alert.alert("Error", error?.message); 
    }
  };

  const handleAiSearch = async () => {
    if (!aiInput.trim()) return;
    
    // TIMING BOUNDARY START: Immediately on button press
    const startAppTime = performance.now(); 
    const timestamp = new Date().toISOString();
    
    setIsAiProcessing(true);
    setAiMessage('Analyzing your request...');
    
    try {
      // API Call
      const result = await parseQueryWithGemini(aiInput);
      
      // TIMING BOUNDARY MIDDLE: State updates (Triggers map UI re-render)
      if (result.bloodGroup && bloodTypeOptions.includes(result.bloodGroup)) {
        setSelectedFilter(result.bloodGroup);
      } else {
        setSelectedFilter('All');
      }
      setAiMessage(result.replyMessage || 'Filters updated.');

      // TIMING BOUNDARY END: Map is now updating
      const endAppTime = performance.now();
      const duration = (endAppTime - startAppTime).toFixed(2);
      
      // TRACEABILITY & ENVIRONMENT LOG (Success)
      console.log(`[LATENCY] Timestamp: ${timestamp} | Device: Oppo F23 5G | Network: Jio 5G | Input: "${aiInput}" | Output: ${JSON.stringify(result)} | Duration: ${duration}ms | Status: Success`);

      setTimeout(() => {
        setIsAiModalVisible(false);
        setAiInput(''); 
        setAiMessage('Type or hold the microphone to speak your emergency request.');
      }, 1200);

    } catch (error: any) {
      // TIMING BOUNDARY END: Fallback UI update
      const endAppTime = performance.now();
      const duration = (endAppTime - startAppTime).toFixed(2);
      
      // TRACEABILITY & ENVIRONMENT LOG (Failure)
      console.log(`[LATENCY] Timestamp: ${timestamp} | Device: Oppo F23 5G | Network: Jio 5G | Input: "${aiInput}" | Output: ERROR - ${error.message} | Duration: ${duration}ms | Status: Failure`);
      
      setAiMessage('Encountered an issue. Please select filter manually.');
    } finally {
      setIsAiProcessing(false);
    }
  };

  useEffect(() => {
    fetchBlockchainData();
    const interval = setInterval(fetchBlockchainData, 12000); 
    return () => clearInterval(interval);
  }, []);

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <LottieView
          autoPlay
          loop
          style={{ width: 150, height: 150 }}
          source={require('../assets/animations/heartbeat.json')} 
        />
        <Text style={{ marginTop: 10, fontWeight: 'bold', color: '#e74c3c' }}>Locating Nearby Hospitals...</Text>
      </View>
    );
  }

  // Filter Tier 1 on-chain banks
  const filteredBanks = bloodBanks.filter((bank) => {
    if (!bank.latitude || !bank.longitude) return false;
    const distanceInMeters = getDistance({ latitude: location.latitude, longitude: location.longitude }, { latitude: bank.latitude, longitude: bank.longitude });
    if (distanceInMeters > 35000) return false;
    if (!bank.isVerified && !isAdmin) return false;
    if (selectedFilter === 'All') return true;
    return bank.bloodGroups.toUpperCase().includes(selectedFilter.toUpperCase()) || bank.inventoryLevels.toUpperCase().includes(selectedFilter.toUpperCase());
  });

  // Filter Tier 2 public directory hospitals
  const filteredRealHospitals = realHospitals.filter((hospital) => {
    if (selectedFilter === 'All') return true;
    return hospital.inventoryLevels.toUpperCase().includes(selectedFilter.toUpperCase());
  });

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map}
        customMapStyle={silverMapStyle}
        initialRegion={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.12, longitudeDelta: 0.08 }}
      >
        <Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }} title="You are here" pinColor="blue" />

        {/* Tier 2: Public Real-World Hospitals (Red Pins) */}
        {filteredRealHospitals.map((hospital, index) => (
          <Marker 
            key={`real-${index}`} 
            coordinate={{ latitude: hospital.latitude, longitude: hospital.longitude }} 
            title={`🏥 ${hospital.name}`} 
            description={`Stock: ${hospital.inventoryLevels} (Tap for details)`} 
            pinColor="red" 
            onCalloutPress={() => setSelectedHospital(hospital)} 
          />
        ))}

        {/* Tier 1: Verified On-Chain Nodes (Green/Orange Pins) */}
        {filteredBanks.map((bank, index) => (
          <Marker 
            key={`${bank.id}-${index}`} 
            coordinate={{ latitude: bank.latitude, longitude: bank.longitude }} 
            title={`${bank.isVerified ? '✅' : '⏳'} ${bank.name}`} 
            description={`Live Stock: ${bank.inventoryLevels}`} 
            pinColor={bank.isVerified ? "green" : "orange"} 
            onCalloutPress={() => setSelectedHospital(bank)} 
          />
        ))}
      </MapView>

      {/* Wallet Connection Button */}
      <View style={styles.walletButtonContainer}>
        <TouchableOpacity style={styles.walletButton} onPress={() => open()}>
          <Text style={styles.walletButtonText}>
            {isConnected ? (isAdmin ? "Admin Connected" : "Wallet Connected") : "Connect Wallet"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Blood Group Filter Bar */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {bloodTypeOptions.map((type) => (
            <TouchableOpacity key={type} style={[styles.filterButton, selectedFilter === type && styles.activeFilterButton]} onPress={() => setSelectedFilter(type)}>
              <Text style={[styles.filterText, selectedFilter === type && styles.activeFilterText]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Action Buttons for Normal Users & Hospitals */}
      {!isAdmin && (
        <View style={styles.bottomActionsContainer}>
          <TouchableOpacity style={styles.hospitalToggleBtn} onPress={() => setIsHospitalFormVisible(!isHospitalFormVisible)}>
            <Text style={styles.hospitalToggleText}>🏥 {isHospitalFormVisible ? "Close Form" : "Register Node"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.aiFab} onPress={() => setIsAiModalVisible(true)}>
            <Text style={styles.aiFabText}>✨ Ask AI</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Admin Panel */}
      {isAdmin && (
        <BlurView intensity={95} tint="light" style={styles.panelContainer}>
          <Text style={styles.panelTitle}>🛠️ Admin Panel: Pending Approvals</Text>
          <ScrollView style={{ maxHeight: 160 }}>
            {bloodBanks.filter(b => !b.isVerified).length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#666', padding: 10 }}>No hospitals pending verification.</Text>
            ) : (
              bloodBanks.filter(b => !b.isVerified).map((bank, index) => (
                <View key={`${bank.id}-${index}`} style={styles.adminRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold' }}>{bank.name}</Text>
                    <Text style={{ fontSize: 11, color: '#e74c3c', fontWeight: 'bold' }}>License: {bank.licenseId}</Text>
                    <Text style={{ fontSize: 10, color: '#555' }} numberOfLines={1}>Address: {bank.id}</Text>
                  </View>
                  <TouchableOpacity style={styles.approveButton} onPress={() => approveHospital(bank.id, bank.name)}>
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Approve</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </BlurView>
      )}

      {/* Hospital Node Registration Modal */}
      {isHospitalFormVisible && !isAdmin && (
        <BlurView intensity={95} tint="light" style={styles.panelContainer}>
          <Text style={styles.panelTitle}>🏥 Hospital Node: Register on Chain</Text>
          <TextInput style={styles.input} placeholder="Hospital Name" placeholderTextColor="#666" value={bankName} onChangeText={setBankName} />
          <TextInput style={styles.input} placeholder="Govt Medical License ID (e.g. TN-MED-2026)" placeholderTextColor="#666" value={licenseId} onChangeText={setLicenseId} />
          <TextInput style={styles.input} placeholder="Available Blood Groups (e.g. A+, B+, O-)" placeholderTextColor="#666" value={bloodGroups} onChangeText={setBloodGroups} />
          <TextInput style={styles.input} placeholder="Stock Units (e.g. A+: 12, B+: 5, O-: 20)" placeholderTextColor="#666" value={inventoryLevels} onChangeText={setInventoryLevels} />
          <TouchableOpacity style={[styles.submitButton, (isRegistering || !bankName || !licenseId) && styles.submitButtonDisabled]} onPress={registerRealBloodBank} disabled={isRegistering || !bankName || !bloodGroups || !inventoryLevels || !licenseId}>
            <Text style={styles.submitButtonText}>{isRegistering ? "Registering on Chain..." : "Submit Registration"}</Text>
          </TouchableOpacity>
        </BlurView>
      )}

      {/* Sliding Bottom Sheet for Details (Supports both Tier 1 and Tier 2) */}
      <Modal visible={!!selectedHospital} transparent={true} animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedHospital(null)}>
          <View style={styles.bottomSheet} onStartShouldSetResponder={() => true}>
            
            <View style={styles.dragHandle} />

            <Text style={styles.hospitalTitle}>{selectedHospital?.name}</Text>
            
            <View style={[styles.statusBadge, !selectedHospital?.isVerified && styles.statusBadgeUnverified]}>
              <Text style={[styles.statusText, !selectedHospital?.isVerified && styles.statusTextUnverified]}>
                {selectedHospital?.isVerified ? "✅ Verified Network Node" : "🌐 Public Healthcare Node"}
              </Text>
            </View>

            <Text style={styles.sectionHeader}>Live Blood Stock Dashboard</Text>
            
            <View style={styles.inventoryContainer}>
              {selectedHospital?.inventoryLevels?.split(',').map((item: string, index: number) => {
                const [type, units] = item.split(':');
                return (
                  <View key={index} style={styles.stockCard}>
                    <Text style={styles.bloodTypeLabel}>{type?.trim()}</Text>
                    <Text style={styles.unitLabel}>{units ? `${units.trim()} units` : 'Available'}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.actionBar}>
              <TouchableOpacity style={styles.iconButton} onPress={() => handleCall('+910000000000')}>
                <Text style={styles.iconText}>📞 Call</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconButton} onPress={() => handleWhatsApp('+910000000000')}>
                <Text style={styles.iconText}>💬 WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.routeButton} onPress={() => openDirections(selectedHospital?.latitude, selectedHospital?.longitude, selectedHospital?.name)}>
                <Text style={styles.routeText}>🗺️ Get Route</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.emergencyButton} 
              onPress={() => Alert.alert("Emergency Alert Sent", `Priority dispatch triggered for ${selectedHospital?.name}.`)}
            >
              <Text style={styles.emergencyText}>🚨 SEND EMERGENCY ALERT</Text>
            </TouchableOpacity>

          </View>
        </TouchableOpacity>
      </Modal>

      {/* AI Assistant Modal with Text & Voice Dispatch */}
      <Modal visible={isAiModalVisible} transparent animationType="slide">
        <BlurView intensity={70} tint="dark" style={styles.modalBackground}>
          <View style={styles.aiModalCard}>
            <Text style={styles.aiModalTitle}>✨ AI Dispatch Assistant</Text>
            <Text style={styles.aiModalSubtitle}>{aiMessage}</Text>

            <View style={styles.micSection}>
              <TouchableOpacity 
                style={[styles.micButton, isRecording && styles.micButtonRecording]}
                onPressIn={startRecording}
                onPressOut={stopRecording}
                disabled={isAiProcessing}
              >
                <Text style={styles.micIcon}>{isRecording ? "🔴" : "🎙️"}</Text>
                <Text style={styles.micStatusText}>
                  {isRecording ? "Recording... (Release to send)" : "Hold to Speak"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ textAlign: 'center', color: '#888', marginVertical: 8 }}>— OR TYPE REQUEST —</Text>

            <TextInput 
              style={styles.aiInputBox}
              placeholder="e.g. Need 2 units of O- urgently..."
              placeholderTextColor="#999"
              multiline
              value={aiInput}
              onChangeText={setAiInput}
              editable={!isAiProcessing && !isRecording}
            />

            <View style={styles.aiActionRow}>
              <TouchableOpacity style={[styles.aiSubmitBtn, isAiProcessing && styles.submitButtonDisabled]} onPress={handleAiSearch} disabled={isAiProcessing || isRecording}>
                {isAiProcessing ? <ActivityIndicator color="white" /> : <Text style={styles.aiSubmitText}>Analyze Request</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.aiCloseBtn} onPress={() => setIsAiModalVisible(false)} disabled={isAiProcessing || isRecording}>
                <Text style={styles.aiCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  map: { width: '100%', height: '100%' },
  walletButtonContainer: { position: 'absolute', top: 55, right: 15, zIndex: 99 },
  walletButton: { backgroundColor: '#e74c3c', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  walletButtonText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  filterContainer: { position: 'absolute', top: 110, left: 15, right: 15, height: 45 },
  filterButton: { backgroundColor: 'rgba(255, 255, 255, 0.9)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  activeFilterButton: { backgroundColor: '#e74c3c' },
  filterText: { fontWeight: '700', color: '#555' },
  activeFilterText: { color: 'white' },
  bottomActionsContainer: { position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hospitalToggleBtn: { backgroundColor: '#2c3e50', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 30, elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5 },
  hospitalToggleText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  aiFab: { backgroundColor: '#8e44ad', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 8, shadowColor: '#8e44ad', shadowOpacity: 0.4, shadowRadius: 5 },
  aiFabText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  panelContainer: { position: 'absolute', bottom: 25, left: 15, right: 15, padding: 18, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', elevation: 12 },
  panelTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14, textAlign: 'center', color: '#111' },
  adminRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.7)', padding: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  approveButton: { backgroundColor: '#2ecc71', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  input: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.8)', fontSize: 14, color: '#333' },
  submitButton: { backgroundColor: '#3498db', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  submitButtonDisabled: { backgroundColor: '#95a5a6' },
  submitButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  modalBackground: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  aiModalCard: { width: '90%', backgroundColor: 'rgba(30,30,40,0.95)', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(142, 68, 173, 0.5)' },
  aiModalTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: '#fff', marginBottom: 8 },
  aiModalSubtitle: { textAlign: 'center', color: '#dcdde1', fontSize: 14, marginBottom: 16, fontStyle: 'italic' },
  micSection: { alignItems: 'center', marginVertical: 8 },
  micButton: { backgroundColor: '#8e44ad', width: '80%', paddingVertical: 14, borderRadius: 30, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  micButtonRecording: { backgroundColor: '#e74c3c' },
  micIcon: { fontSize: 20, marginRight: 8 },
  micStatusText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  aiInputBox: { backgroundColor: '#2f3640', color: 'white', borderRadius: 12, padding: 16, minHeight: 70, textAlignVertical: 'top', fontSize: 15, marginBottom: 16 },
  aiActionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  aiSubmitBtn: { backgroundColor: '#8e44ad', paddingVertical: 14, borderRadius: 12, flex: 0.65, alignItems: 'center' },
  aiSubmitText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  aiCloseBtn: { backgroundColor: '#576574', paddingVertical: 14, borderRadius: 12, flex: 0.3, alignItems: 'center' },
  aiCloseText: { color: 'white', fontWeight: 'bold', fontSize: 15 },

  // Bottom Sheet Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 24,
    minHeight: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 20,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#ccc',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 15,
  },
  hospitalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  statusBadge: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  statusBadgeUnverified: {
    backgroundColor: '#e3f2fd',
  },
  statusText: {
    color: '#2e7d32',
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextUnverified: {
    color: '#1565c0',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  inventoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  stockCard: {
    width: '31%',
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  bloodTypeLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 4,
  },
  unitLabel: {
    fontSize: 12,
    color: '#555',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 15,
  },
  iconButton: {
    backgroundColor: '#f1f3f5',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  iconText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  routeButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    flex: 1.2,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  routeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  emergencyButton: {
    backgroundColor: '#d32f2f',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 5,
  },
  emergencyText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
});