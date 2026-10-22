// app/utils/filtering.ts

import { ParsedBloodQuery } from '../geminiService';

export interface BloodBankData {
  address: string;
  isVerified: boolean;
  isActive: boolean;
  inventory: Record<string, number>; // e.g., { "A+": 12, "AB+": 2, "B+": 0 }
}

export interface FilterResponse {
  success: boolean;
  message: string;
  results: BloodBankData[];
}

export function applyStrictFilters(
  aiQuery: ParsedBloodQuery,
  hospitals: BloodBankData[]
): FilterResponse {
  
  // Rule 1: Ask for clarification when extraction is null
  if (!aiQuery.bloodGroup || aiQuery.bloodGroup === "All") {
    return {
      success: false,
      message: aiQuery.replyMessage || "Please specify a single valid blood group (e.g., O-, A+).",
      results: []
    };
  }

  const requestedGroup = aiQuery.bloodGroup;
  // If AI couldn't extract a quantity, default to 1 unit to ensure at least some stock exists
  const requiredQty = aiQuery.quantity !== null ? aiQuery.quantity : 1;

  const validHospitals = hospitals.filter(hospital => {
    // Rule 2: Enforce verified and active status
    if (!hospital.isVerified || !hospital.isActive) {
      return false;
    }

    // Rule 3: Exact string match for blood group to avoid B+ / AB+ collisions
    const availableStock = hospital.inventory[requestedGroup] ?? 0;

    // Rule 4: Check available quantity against requested units
    return availableStock >= requiredQty;
  });

  return {
    success: true,
    message: validHospitals.length > 0
      ? `Showing verified hospitals with at least ${requiredQty} units of ${requestedGroup}.`
      : `No verified, active hospitals currently have ${requiredQty} units of ${requestedGroup}.`,
    results: validHospitals
  };
}