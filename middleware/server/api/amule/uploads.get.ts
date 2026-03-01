defineRouteMeta({
  openAPI: {
    tags: ["Uploads"],
    summary: "Upload queue",
    description:
      "Retrieve peers downloading from us across both aMule and Transmission.",
    responses: {
      200: {
        description: "Upload list with aMule clients and Transmission peers",
      },
      502: { description: "Backend connection error" },
    },
  },
});

export default defineEventHandler(async () => {
  // Fetch aMule upload queue and Transmission upload peers in parallel
  const amuleClient = useAmuleClient();
  const trClient = useTransmissionClient();

  const [amuleClients, trPeers] = await Promise.all([
    amuleClient.getClientQueue().catch(() => []),
    trClient.getUploadPeers().catch(() => []),
  ]);

  // Map aMule upload clients
  const amuleList = amuleClients.map((c) => ({
    _type: "amule" as const,
    clientName: c.clientName || "Unknown",
    userHash: c.userHashHexString || "",
    software: c.software || "",
    softwareVersion: c.softVerStr || "",
    fileName: "",
    score: c.score || 0,
    uploadSpeed: c.upSpeed || 0,
    uploadSpeed_fmt: formatSpeed(c.upSpeed),
    uploadSession: c.uploadSession || 0,
    uploadSession_fmt: formatBytes(c.uploadSession),
    uploadTotal: c.uploadedTotal || 0,
    uploadTotal_fmt: formatBytes(c.uploadedTotal),
    ip: c.userIP || "",
    port: c.userPort || 0,
  }));

  // Map Transmission upload peers
  const transmissionList = trPeers.map((p) => ({
    _type: "transmission" as const,
    clientName: p.clientName || "Unknown",
    userHash: "",
    software: p.clientName || "",
    softwareVersion: "",
    fileName: p.torrentName,
    score: 0,
    uploadSpeed: p.rateToPeer || 0,
    uploadSpeed_fmt: p.rateToPeer_fmt,
    uploadSession: 0,
    uploadSession_fmt: "",
    uploadTotal: 0,
    uploadTotal_fmt: "",
    ip: p.address || "",
    port: p.port || 0,
    peerProgress: p.progress || 0,
    flagStr: p.flagStr || "",
    isEncrypted: p.isEncrypted || false,
    torrentId: p.torrentId,
    torrentName: p.torrentName,
  }));

  const all = [...amuleList, ...transmissionList];
  const totalSpeed = all.reduce((s, c) => s + c.uploadSpeed, 0);

  return {
    uploads: {
      count: all.length,
      amuleCount: amuleList.length,
      transmissionCount: transmissionList.length,
      totalSpeed,
      totalSpeed_fmt: formatSpeed(totalSpeed),
      clients: all,
    },
  };
});
