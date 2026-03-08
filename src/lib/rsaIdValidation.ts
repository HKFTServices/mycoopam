/**
 * Validates a South African ID number using the Luhn algorithm
 * and extracts date of birth and gender.
 */
export interface RsaIdResult {
  valid: boolean;
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: "male" | "female";
  error?: string;
}

export function validateRsaId(id: string): RsaIdResult {
  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(id)) {
    return { valid: false, error: "ID must be exactly 13 digits" };
  }

  // Extract date of birth (YYMMDD)
  const yy = parseInt(id.substring(0, 2), 10);
  const mm = parseInt(id.substring(2, 4), 10);
  const dd = parseInt(id.substring(4, 6), 10);

  // Determine century: if yy >= current 2-digit year + some buffer, assume 1900s
  const currentYear = new Date().getFullYear();
  const currentTwoDigit = currentYear % 100;
  const century = yy <= currentTwoDigit ? 2000 : 1900;
  const fullYear = century + yy;

  // Validate date
  const dob = new Date(fullYear, mm - 1, dd);
  if (
    dob.getFullYear() !== fullYear ||
    dob.getMonth() !== mm - 1 ||
    dob.getDate() !== dd ||
    mm < 1 || mm > 12 ||
    dd < 1 || dd > 31
  ) {
    return { valid: false, error: "Invalid date of birth in ID number" };
  }

  // Check not in the future
  if (dob > new Date()) {
    return { valid: false, error: "Date of birth cannot be in the future" };
  }

  // Extract gender (digits 7-10: 0000-4999 = female, 5000-9999 = male)
  const genderDigits = parseInt(id.substring(6, 10), 10);
  const gender: "male" | "female" = genderDigits >= 5000 ? "male" : "female";

  // Luhn algorithm validation
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id[i], 10);
    if (i % 2 !== 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  if (sum % 10 !== 0) {
    return { valid: false, error: "Invalid ID number (checksum failed)" };
  }

  const dateStr = `${fullYear}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

  return { valid: true, dateOfBirth: dateStr, gender };
}
