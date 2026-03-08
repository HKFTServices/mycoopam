import type { MembershipSelection } from "./MembershipTypeStep";

export type ApplicationType = "myself" | "person" | "entity";

export interface ApplicationData {
  type: ApplicationType;
  entityCategoryId: string;
  relationshipTypeId: string;
  // Person fields
  titleId: string;
  firstName: string;
  lastName: string;
  initials: string;
  knownAs: string;
  idType: "rsa_id" | "passport";
  idNumber: string;
  gender: string;
  dateOfBirth: string;
  languageCode: string;
  // Entity fields
  entityName: string;
  registrationNumber: string;
  isVatRegistered: boolean;
  vatNumber: string;
  // Shared contact
  contactNumber: string;
  altContactNumber: string;
  emailAddress: string;
  ccEmail: string;
  website: string;
  // Address
  streetAddress: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  // Referrer
  hasReferrer: boolean;
  referrerId: string;
  commissionPercentage: string;
  // Bank
  skipBank: boolean;
  bankCountry: string;
  bankId: string;
  bankAccountTypeId: string;
  accountName: string;
  accountNumber: string;
  proofFile: File | null;
  // Documents
  uploadedDocs: Record<string, Array<{ file: File; name: string }>>;
  // T&Cs
  acceptedTerms: Record<string, boolean>;
  // Membership type selection
  selectedMembershipType: MembershipSelection;
}

export interface StepProps {
  data: ApplicationData;
  update: (partial: Partial<ApplicationData>) => void;
  tenantId: string;
}

export const createInitialData = (type: ApplicationType): ApplicationData => ({
  type,
  entityCategoryId: "",
  relationshipTypeId: "",
  titleId: "",
  firstName: "",
  lastName: "",
  initials: "",
  knownAs: "",
  idType: "rsa_id",
  idNumber: "",
  gender: "",
  dateOfBirth: "",
  languageCode: "en",
  entityName: "",
  registrationNumber: "",
  isVatRegistered: false,
  vatNumber: "",
  contactNumber: "",
  altContactNumber: "",
  emailAddress: "",
  ccEmail: "",
  website: "",
  streetAddress: "",
  suburb: "",
  city: "",
  province: "",
  postalCode: "",
  country: "South Africa",
  hasReferrer: false,
  referrerId: "",
  commissionPercentage: "0",
  skipBank: false,
  bankCountry: "",
  bankId: "",
  bankAccountTypeId: "",
  accountName: "",
  accountNumber: "",
  proofFile: null,
  uploadedDocs: {},
  acceptedTerms: {},
  selectedMembershipType: "full",
});
