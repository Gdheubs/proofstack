import type { PoolClient } from "pg";
import { z } from "zod/v4";
import { ApiError } from "../lib/errors";

// Bump when the Terms or Privacy Policy change materially; every account is
// then asked to accept the new version before continuing.
export const TERMS_VERSION = "2026-10-22";
export const MINIMUM_AGE = 18;
// IT Rules 2021, rule 3(1)(h): keep registration details 180 days after deletion.
export const DELETED_ACCOUNT_RETENTION_DAYS = 180;

export const birthDateSchema = z.iso.date().refine((value) => {
  const age = ageOn(value);
  return age >= 0 && age <= 120;
}, "Enter your real date of birth");

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

export function assertAdult(birthDate: string) {
  if (ageOn(birthDate) < MINIMUM_AGE)
    throw new ApiError(
      403,
      "AGE_REQUIREMENT",
      `ProofStack accounts are currently for people aged ${MINIMUM_AGE} or over. We have not kept your details.`,
    );
}

// Stores the self-declared birth date once (it cannot later be changed to pass
// the age check) and records acceptance of the current terms.
export async function recordAgreement(
  db: PoolClient,
  userId: string,
  birthDate: string,
) {
  const stored = (
    await db.query<{ birth_date: string | null }>(
      "UPDATE users SET birth_date=COALESCE(birth_date,$2::date),updated_at=now() WHERE id=$1 RETURNING to_char(birth_date,'YYYY-MM-DD') AS birth_date",
      [userId, birthDate],
    )
  ).rows[0]?.birth_date;
  if (!stored) throw new ApiError(404, "USER_NOT_FOUND", "Account not found");
  assertAdult(stored);
  await db.query(
    "INSERT INTO consent_records(user_id,purpose,version) VALUES($1,'terms',$2) ON CONFLICT DO NOTHING",
    [userId, TERMS_VERSION],
  );
}

// SQL fragment: true when the user still has to give a birth date or accept
// the current terms. $2 must be TERMS_VERSION.
export const AGREEMENT_REQUIRED_SQL = `(u.birth_date IS NULL OR NOT EXISTS(SELECT 1 FROM consent_records c
  WHERE c.user_id=u.id AND c.purpose='terms' AND c.version=$2 AND c.withdrawn_at IS NULL))`;
