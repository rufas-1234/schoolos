export const minimumPasswordLength = 6;
export const maximumPasswordLength = 128;

const commonPasswords = new Set([
  "password",
  "password1!",
  "password123!",
  "qwerty123!",
  "letmein1!",
  "welcome1!",
  "admin123!",
  "school123!",
  "student1!",
]);

export function getPasswordStrengthError(password: string) {
  if (password.length < minimumPasswordLength) {
    return `Use at least ${minimumPasswordLength} characters.`;
  }
  if (password.length > maximumPasswordLength) {
    return `Use no more than ${maximumPasswordLength} characters.`;
  }
  if (/\s/.test(password)) return "Do not include spaces in your password.";
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter.";
  if (!/\d/.test(password)) return "Add at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Add at least one symbol, such as ! or @.";

  const normalized = password.toLocaleLowerCase();
  if (commonPasswords.has(normalized)) return "Choose a less common password.";
  if (/(.)\1{3,}/i.test(password)) return "Avoid repeating the same character four or more times.";
  if (/(?:012345|123456|234567|345678|456789|987654|876543|765432|654321|543210)/.test(password)) return "Avoid a simple number sequence.";
  return null;
}
