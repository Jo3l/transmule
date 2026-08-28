/**
 * Planner importer — detecta cuando un grab del planificador ha completado
 * su descarga y marca el episodio/película como 'downloaded'.
 *
 * Según la decisión Q4 (cleanup policy), NO movemos ni renombramos archivos
 * en esta iteración. Solo marcamos estado (read-only sobre los download clients).
 *
 * Mecanismo (por servicio):
 *   - transmission: buscar torrent por hash del grab → percentDone === 100
 *   - slskd: buscar transfer completada por nombre de archivo
 *   - amule: buscar en download queue por hash ed2k
 *   - pyload: (opcional — package completado)
 *
 * Cada 60s. Guard globalThis para HMR.
 */

import { useDatabase, getConfig } from "../utils/database";
import { recordGrabLog } from "../utils/planner-db";
import { useTransmissionClient } from "../utils/transmission-client";
import { useSlskdClient } from "../utils/slskd-client";
import { useAmuleClient } from "../utils/amule-client";
import { postProcessGrab } from "../utils/planner-postprocess";

const GUARD_KEY = "__transmule_planner_importer_started__";
const INTERVAL_MS = 60_000;

export default defineNitroPlugin(() => {
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  setInterval(checkCompleted, INTERVAL_MS);
  setInterval(recoverStuckGrabs, 5 * 60_000); // cada 5 min
  setTimeout(recoverStuckGrabs, 60_000); // 1 min tras boot
  setInterval(recoverFailedGrabs, 60 * 60_000); // reintentos de fallos: cada hora
  setTimeout(recoverFailedGrabs, 5 * 60_000); // 5 min tras boot
  console.log("[planner] importer started (every 60s)");
});

/**
 * Recovery: grabs 'dispatched' con más de N horas sin completar se marcan
 * 'failed' (el servicio probablemente no lo recibió) y se re-encolan una vez.
 */
async function recoverStuckGrabs(): Promise<void> {
  const db = useDatabase();
  const stuckHours = Math.max(
    Number(process.env.PLANNER_GRAB_STUCK_HOURS) || 6,
    1,
  );
  const stuck = db
    .prepare(
      `SELECT * FROM planner_grab_queue
       WHERE state = 'dispatched'
         AND created_at < datetime('now', '-' || ? || ' hours')`,
    )
    .all(stuckHours) as unknown as Array<Record<string, any>>;

  for (const grab of stuck) {
    const attempts = Number(grab.attempts ?? 0);
    if (attempts >= 1) {
      // Ya se reintentó una vez — marcar failed y liberar el episode/movie a
      // 'released' (emitido, descarga manual). El estado 'wanted' ya no existe.
      db.prepare(
        "UPDATE planner_grab_queue SET state = 'failed', last_error = 'stuck after dispatch (recovery)' WHERE id = ?",
      ).run(grab.id);
      if (grab.episode_id) {
        db.prepare(
          "UPDATE planner_episodes SET status = 'released' WHERE id = ? AND status = 'grabbed'",
        ).run(grab.episode_id);
      }
      if (grab.movie_id) {
        db.prepare(
          "UPDATE planner_movies SET status = 'released' WHERE id = ? AND status = 'grabbed'",
        ).run(grab.movie_id);
      }
      recordGrabLog({
        subscription_id: grab.subscription_id,
        episode_id: grab.episode_id ?? null,
        movie_id: grab.movie_id ?? null,
        grab_id: grab.id,
        event: "gave_up",
        message: `abandonado tras ${attempts + 1} intentos (atascado ${stuckHours}h en 'dispatched')`,
      });
      console.warn(
        `[planner] grab #${grab.id} marked failed after ${attempts + 1} attempts (stuck ${stuckHours}h); episode/movie released back to 'released' (manual download)`,
      );
    } else {
      // Primer stuck: re-encolar (state=pending) + incrementar attempts
      db.prepare(
        `UPDATE planner_grab_queue
         SET state = 'pending', attempts = attempts + 1, created_at = datetime('now'),
             last_error = 're-queued after ${stuckHours}h stuck'
         WHERE id = ?`,
      ).run(grab.id);
      recordGrabLog({
        subscription_id: grab.subscription_id,
        episode_id: grab.episode_id ?? null,
        movie_id: grab.movie_id ?? null,
        grab_id: grab.id,
        event: "stuck_recovered",
        message: `re-encolado tras ${stuckHours}h atascado en 'dispatched'`,
      });
      console.warn(`[planner] grab #${grab.id} re-queued (stuck ${stuckHours}h, attempt 2)`);
    }
  }
}

/**
 * Reintenta descargas fallidas (errores de dispatch) cada hora.
 *
 * Un grab en 'failed' (p.ej. el cliente de descargas estaba caído al encolar)
 * se re-encola a 'pending' hasta `planner.max_grab_attempts` veces, dando así
 * varios reintentos el mismo día del estreno. Al agotar los intentos se libera
 * el episodio/película a 'released' (descarga manual) para que no quede colgado
 * en 'grabbed' sin descargar.
 */
async function recoverFailedGrabs(): Promise<void> {
  const db = useDatabase();
  const maxAttempts = Math.max(
    Number(getConfig("planner.max_grab_attempts")) ||
      Number(process.env.PLANNER_GRAB_MAX_ATTEMPTS) ||
      5,
    1,
  );

  // Reintentar: failed con attempts < max.
  const retryable = db
    .prepare(
      `SELECT * FROM planner_grab_queue
       WHERE state = 'failed' AND attempts < ?`,
    )
    .all(maxAttempts) as unknown as Array<Record<string, any>>;
  for (const grab of retryable) {
    const nextAttempt = Number(grab.attempts ?? 0) + 1;
    db.prepare(
      `UPDATE planner_grab_queue
       SET state = 'pending', created_at = datetime('now'), last_error = NULL
       WHERE id = ?`,
    ).run(grab.id);
    recordGrabLog({
      subscription_id: grab.subscription_id,
      episode_id: grab.episode_id ?? null,
      movie_id: grab.movie_id ?? null,
      grab_id: grab.id,
      event: "requeued",
      message: `reintento ${nextAttempt}/${maxAttempts} (último error: ${grab.last_error ?? "desconocido"})`,
    });
    console.warn(`[planner] grab #${grab.id} re-queued (attempt ${nextAttempt}/${maxAttempts})`);
  }

  // Rendirse: failed con attempts >= max → liberar episodio/película a 'released'.
  const gaveUp = db
    .prepare(
      `SELECT * FROM planner_grab_queue WHERE state = 'failed' AND attempts >= ?`,
    )
    .all(maxAttempts) as unknown as Array<Record<string, any>>;
  for (const grab of gaveUp) {
    if (grab.episode_id) {
      db.prepare(
        "UPDATE planner_episodes SET status = 'released' WHERE id = ? AND status = 'grabbed'",
      ).run(grab.episode_id);
    }
    if (grab.movie_id) {
      db.prepare(
        "UPDATE planner_movies SET status = 'released' WHERE id = ? AND status = 'grabbed'",
      ).run(grab.movie_id);
    }
    db.prepare(
      "UPDATE planner_grab_queue SET state = 'given_up' WHERE id = ?",
    ).run(grab.id);
    recordGrabLog({
      subscription_id: grab.subscription_id,
      episode_id: grab.episode_id ?? null,
      movie_id: grab.movie_id ?? null,
      grab_id: grab.id,
      event: "gave_up",
      message: `abandonado tras ${grab.attempts} intentos (último error: ${grab.last_error ?? "desconocido"})`,
    });
    console.warn(`[planner] grab #${grab.id} given up after ${grab.attempts} attempts`);
  }
}

async function checkCompleted(): Promise<void> {
  const db = useDatabase();

  // Grabs dispatched que aún no han completado
  const grabs = db
    .prepare(
      `SELECT g.*,
              s.title AS sub_title, s.root_folder, s.smart_rename, s.plex_scan,
              e.season_number, e.episode_number, e.title AS episode_title,
              m.theatrical_release_date AS movie_theatrical,
              m.digital_release_date AS movie_digital
       FROM planner_grab_queue g
       LEFT JOIN planner_subscriptions s ON s.id = g.subscription_id
       LEFT JOIN planner_episodes e ON e.id = g.episode_id
       LEFT JOIN planner_movies m ON m.id = g.movie_id
       WHERE g.state = 'dispatched'`,
    )
    .all() as unknown as Array<Record<string, any>>;

  for (const grab of grabs) {
    let done = false;

    try {
      switch (grab.service) {
        case "transmission":
        case "direct-plugin": {
          done = await transmissionDone(grab.release_hash);
          break;
        }
        case "slskd": {
          done = await slskdDone(grab.release_title);
          break;
        }
        case "amule": {
          done = await amuleDone(grab.release_hash);
          break;
        }
        case "pyload":
        default: {
          // pyload: marcar completado después de un tiempo prudencial
          // (no tenemos hash; usamos antigüedad del grab)
          const created = new Date(grab.created_at).getTime();
          done = Date.now() - created > 2 * 60 * 60 * 1000;
          break;
        }
      }
    } catch (err: any) {
      console.error(`[planner] importer check failed for grab #${grab.id}:`, err?.message);
      continue;
    }

    if (done) {
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE planner_grab_queue SET state = 'completed' WHERE id = ?",
      ).run(grab.id);
      recordGrabLog({
        subscription_id: grab.subscription_id,
        episode_id: grab.episode_id ?? null,
        movie_id: grab.movie_id ?? null,
        grab_id: grab.id,
        event: "completed",
        message: `descargado (${grab.service})${grab.release_title ? ": " + grab.release_title : ""}`,
      });

      if (grab.episode_id) {
        db.prepare(
          `UPDATE planner_episodes
           SET status = 'downloaded', downloaded_at = ?, file_path = NULL
           WHERE id = ? AND status = 'grabbed'`,
        ).run(now, grab.episode_id);
        console.log(`[planner] episode #${grab.episode_id} completed (grab #${grab.id})`);
      }
      if (grab.movie_id) {
        db.prepare(
          `UPDATE planner_movies
           SET status = 'downloaded', downloaded_at = ?
           WHERE id = ? AND status = 'grabbed'`,
        ).run(now, grab.movie_id);
        console.log(`[planner] movie #${grab.movie_id} completed (grab #${grab.id})`);
      }

      // Post-proceso: mover a la carpeta destino (root_folder) + smart rename.
      // Se ejecuta en background — el contenido YA está descargado; el movimiento
      // (posiblemente a un share SMB) no debe bloquear el ciclo del importer.
      const thDate = (d: any) => (d ? String(d).slice(0, 4) : null);
      void postProcessGrab({
        id: grab.id,
        service: grab.service,
        release_hash: grab.release_hash ?? null,
        release_title: grab.release_title ?? null,
        episode_id: grab.episode_id ?? null,
        movie_id: grab.movie_id ?? null,
        sub_title: grab.sub_title ?? null,
        root_folder: grab.root_folder ?? null,
        smart_rename: grab.smart_rename ?? 0,
        plex_scan: grab.plex_scan ?? 0,
        season_number: grab.season_number ?? null,
        episode_number: grab.episode_number ?? null,
        episode_title: grab.episode_title ?? null,
        movie_year: Number(thDate(grab.movie_theatrical) ?? thDate(grab.movie_digital) ?? 0) || null,
      }).catch((err: any) => {
        console.error(`[planner] post-proceso grab #${grab.id}: ${err?.message ?? err}`);
      });
    }
  }
}

// ─── Per-service completion checks ──────────────────────────────────────────

async function transmissionDone(infoHash?: string | null): Promise<boolean> {
  if (!infoHash) return false;
  const client = useTransmissionClient();
  const torrents = await client.getTorrents();
  const t = torrents.find((x: any) => {
    const h = x.hashString ?? x.hash ?? "";
    return String(h).toLowerCase() === infoHash.toLowerCase();
  });
  if (!t) return false;
  // Transmission status: 0=stopped, 1=check, 2=check-wait, 3=download, 4=download-wait,
  // 5=seed-wait, 6=seeding; percentDone 1 = completo
  return t.percentDone >= 1 || t.status === 6 || t.status === 0;
}

async function slskdDone(filename?: string | null): Promise<boolean> {
  if (!filename) return false;
  const client = useSlskdClient();
  const transfers = await client.getTransfers("download");
  return transfers.some((tr) => tr.filename === filename && tr.state === "Completed");
}

async function amuleDone(hash?: string | null): Promise<boolean> {
  if (!hash) return false;
  const client = useAmuleClient();
  const queue = await client.getDownloadQueue();
  // Si el archivo ya no está en la cola activa, está completado o eliminado
  const lower = hash.toLowerCase();
  const stillActive = queue.some((f: any) => {
    const fh = f.hash?.toString?.("hex")?.toLowerCase?.() ?? "";
    return fh === lower;
  });
  return !stillActive;
}
