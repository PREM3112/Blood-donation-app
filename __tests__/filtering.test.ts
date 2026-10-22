// __tests__/filtering.test.ts
import { applyStrictFilters, BloodBankData } from '../app/utils/filtering';

const mockHospitals: BloodBankData[] = [
  { address: "0x1", isVerified: true, isActive: true, inventory: { "B+": 5, "AB+": 10 } },
  { address: "0x2", isVerified: false, isActive: true, inventory: { "B+": 20 } }, // Unverified
  { address: "0x3", isVerified: true, isActive: false, inventory: { "B+": 20 } }, // Inactive
  { address: "0x4", isVerified: true, isActive: true, inventory: { "B+": 1 } },   // Low stock
];

describe('Blood Bank Strict Filtering', () => {

  test('Rejects ambiguous requests where bloodGroup is null', () => {
    const aiQuery = { bloodGroup: null, quantity: 2, urgency: "HIGH", replyMessage: "Did you mean B+?" };
    const result = applyStrictFilters(aiQuery as any, mockHospitals);
    
    expect(result.success).toBe(false);
    expect(result.results.length).toBe(0);
    expect(result.message).toContain("Did you mean B+?");
  });

  test('Filters out unverified and inactive hospitals', () => {
    const aiQuery = { bloodGroup: "B+", quantity: 2, urgency: "HIGH", replyMessage: "" };
    const result = applyStrictFilters(aiQuery as any, mockHospitals);
    
    // Should only return 0x1. 0x2 is unverified, 0x3 is inactive, 0x4 has insufficient stock.
    expect(result.results.length).toBe(1);
    expect(result.results[0].address).toBe("0x1");
  });

  test('Distinguishes exactly between B+ and AB+ (No substring matches)', () => {
    const aiQuery = { bloodGroup: "AB+", quantity: 8, urgency: "MEDIUM", replyMessage: "" };
    const result = applyStrictFilters(aiQuery as any, mockHospitals);
    
    // 0x1 has 10 AB+ units. If it did a substring match, it might get confused by B+.
    expect(result.results.length).toBe(1);
    expect(result.results[0].inventory["AB+"]).toBe(10);
  });

  test('Rejects hospitals with insufficient stock', () => {
    const aiQuery = { bloodGroup: "B+", quantity: 10, urgency: "HIGH", replyMessage: "" };
    const result = applyStrictFilters(aiQuery as any, mockHospitals);
    
    // 0x1 has 5 units, 0x4 has 1 unit. Neither has 10.
    expect(result.results.length).toBe(0);
    expect(result.message).toContain("No verified, active hospitals currently have 10 units");
  });
});