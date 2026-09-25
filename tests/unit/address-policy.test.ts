import { describe, expect, it } from "vitest";
import { isPublicAddress } from "@/lib/intake/address-policy";

describe("isPublicAddress", () => {
  const table: Array<[string, boolean]> = [
    ["93.184.216.34", true],
    ["8.8.8.8", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["127.255.255.254", false],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["172.31.255.255", false],
    ["172.32.0.1", true],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["255.255.255.255", false],
    ["224.0.0.1", false],
    ["192.0.2.1", false],
    ["198.18.0.1", false],
    ["::1", false],
    ["::", false],
    ["fe80::1", false],
    ["fc00::1", false],
    ["fd12:3456::1", false],
    ["ff02::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:7f00:1", false],
    ["::ffff:10.0.0.1", false],
    ["::ffff:169.254.169.254", false],
    ["::ffff:8.8.8.8", true],
    ["64:ff9b::7f00:1", false],
    ["2002:7f00:1::", false],
    ["2001:db8::1", false],
    ["2001::1", false],
    ["fec0::1", false],
    ["not-an-ip", false],
  ];

  it.each(table)("%s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});
