export function signUpAllowed(userCount: number, allowSignup: boolean): boolean {
  return userCount === 0 || allowSignup;
}
