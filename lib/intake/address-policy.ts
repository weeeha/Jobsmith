import ipaddr from "ipaddr.js";

export type AddressPolicy = { allowAddress(address: string): boolean; allowPort(port: number): boolean };

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  // process() unwraps an IPv4-mapped IPv6 address (::ffff:a.b.c.d) into the
  // plain IPv4 address it carries, so the range check below sees the real
  // address either way.
  return ipaddr.process(address).range() === "unicast";
}

export const DEFAULT_POLICY: AddressPolicy = {
  allowAddress: isPublicAddress,
  allowPort: (port) => port === 80 || port === 443,
};
