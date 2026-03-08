/**
 * Returns the host-exposed ports for aMule and Transmission, plus the
 * server's private (LAN) IP and public IP.
 * Public endpoint — no auth required.
 */
import os from "node:os";
import dns from "node:dns/promises";

async function getPrivateIp(): Promise<string> {
  // In Docker with extra_hosts: host.docker.internal:host-gateway resolves to host LAN IP
  try {
    const { address } = await dns.lookup("host.docker.internal");
    return address;
  } catch {
    // Dev / bare-metal: use first non-loopback IPv4 interface
    for (const addrs of Object.values(os.networkInterfaces())) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) return addr.address;
      }
    }
    return "";
  }
}

async function getPublicIp(): Promise<string> {
  try {
    const res = await $fetch<string>("https://portchecker.io/api/me", {
      responseType: "text",
    });
    return (res ?? "").trim();
  } catch {
    return "";
  }
}

async function checkPort(host: string, port: number): Promise<boolean> {
  try {
    const res = await $fetch<string>(
      `https://portchecker.io/api/${host}/${port}`,
      {
        responseType: "text",
        timeout: 10000,
      },
    );
    return (res ?? "").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  });

  const cfg = useRuntimeConfig();
  const [privateIp, publicIp] = await Promise.all([
    getPrivateIp(),
    getPublicIp(),
  ]);

  const tcpPorts = [
    Number(cfg.amuleEd2kTcpPort) || 16881,
    Number(cfg.transmissionPeerPort) || 16884,
  ];

  const checkResults = publicIp
    ? await Promise.all(
        tcpPorts.map(
          async (port) =>
            [port, await checkPort(publicIp, port)] as [number, boolean],
        ),
      )
    : [];

  const checks = Object.fromEntries(checkResults) as Record<number, boolean>;

  return {
    privateIp,
    publicIp,
    checks,
    amule: {
      tcp: Number(cfg.amuleEd2kTcpPort) || 16881,
      udp: Number(cfg.amuleEd2kUdpPort) || 16882,
      kad: Number(cfg.amuleKadUdpPort) || 16883,
    },
    transmission: {
      peer: Number(cfg.transmissionPeerPort) || 16884,
    },
  };
});
