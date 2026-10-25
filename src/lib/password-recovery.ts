export function isPasswordRecoveryHash(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, "")).get("type") === "recovery";
}

export function validateRecoveryPassword(password: string, confirmation: string): string | null {
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}

export async function saveRecoveryPassword(
  auth: { updateUser: (attributes: { password: string }) => Promise<{ error: { message: string } | null }> },
  password: string,
  confirmation: string,
) {
  const invalid = validateRecoveryPassword(password, confirmation);
  if (invalid) throw new Error(invalid);
  const { error } = await auth.updateUser({ password });
  if (error) throw new Error(error.message);
}