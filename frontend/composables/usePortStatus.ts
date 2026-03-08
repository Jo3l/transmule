/**
 * Fetches configured ports + private/public IPs and port reachability results
 * from the server-side /api/ports endpoint (which queries portchecker.io).
 */

export interface PortCheck {
  label: string;
  port: number;
  proto: "TCP" | "UDP";
  /** Whether this port can be checked (portchecker.io is TCP-only) */
  checkable: boolean;
  open: boolean | null; // null = loading / unknown
}

export function usePortStatus() {
  const config = useRuntimeConfig();

  const privateIp = ref<string>("");
  const publicIp = ref<string>("");

  const ports = ref<PortCheck[]>([
    { label: "aMule ED2K", port: 16881, proto: "TCP", checkable: true, open: null },
    { label: "aMule ED2K", port: 16882, proto: "UDP", checkable: false, open: null },
    { label: "aMule KAD", port: 16883, proto: "UDP", checkable: false, open: null },
    { label: "Transmission", port: 16884, proto: "TCP", checkable: true, open: null },
  ]);
  const checking = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function loadPorts() {
    checking.value = true;
    try {
      const data = await $fetch<{
        privateIp: string;
        publicIp: string;
        checks: Record<number, boolean>;
        amule: { tcp: number; udp: number; kad: number };
        transmission: { peer: number };
      }>(`${config.public.apiBase}/api/ports`);

      privateIp.value = data.privateIp;
      publicIp.value = data.publicIp;
      ports.value = [
        {
          label: "aMule ED2K",
          port: data.amule.tcp,
          proto: "TCP",
          checkable: true,
          open: data.checks[data.amule.tcp] ?? null,
        },
        {
          label: "aMule ED2K",
          port: data.amule.udp,
          proto: "UDP",
          checkable: false,
          open: data.checks[data.amule.tcp] ?? null,
        },
        {
          label: "aMule KAD",
          port: data.amule.kad,
          proto: "UDP",
          checkable: false,
          open: data.checks[data.amule.tcp] ?? null,
        },
        {
          label: "Transmission",
          port: data.transmission.peer,
          proto: "TCP",
          checkable: true,
          open: data.checks[data.transmission.peer] ?? null,
        },
      ];
    } catch {
      // Keep defaults
    } finally {
      checking.value = false;
    }
  }

  async function refresh() {
    await loadPorts();
  }

  onMounted(async () => {
    await refresh();
    timer = setInterval(refresh, 5 * 60 * 1000);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { ports, privateIp, publicIp, checking, refresh };
}
