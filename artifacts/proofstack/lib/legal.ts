// Must match artifacts/api-server/src/services/legal.ts.
export const MINIMUM_AGE = 18;
export const TERMS_VERSION = "2026-10-22";
export const LEGAL_EFFECTIVE_DATE = "22 October 2026";

// Operator details published in the Terms, Privacy Policy and Contact page.
// IT Rules 2021 (rule 3(2)) require the Grievance Officer's name and contact
// to be published. Replace every "[...]" value before a public launch.
export const OPERATOR = {
  brand: "ProofStack",
  legalName: "[Your full legal name], sole proprietor, trading as ProofStack",
  address: "[Postal address in India: city, state, PIN]",
  contactEmail: "[contact email]",
  grievanceOfficer: "[Grievance Officer full name]",
  grievanceEmail: "[grievance email]",
  jurisdiction: "[City], India",
};

export const legalDetailsComplete = () =>
  !Object.values(OPERATOR).some((value) => value.includes("["));

// Whole years between a YYYY-MM-DD birth date and today (UTC).
export function ageOn(birthDate: string, today = new Date()) {
  const [y, m, d] = birthDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  let age = today.getUTCFullYear() - y;
  const month = today.getUTCMonth() + 1;
  if (month < m || (month === m && today.getUTCDate() < d)) age--;
  return age;
}
