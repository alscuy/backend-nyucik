import { pool } from "../config/database";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000; // cek tiap 1 menit

/**
 * Auto-cancel mesin yang statusnya BOOKED lebih dari 5 menit
 * dan belum dipakai (belum berstatus IN_USE).
 */
export const autoCancelExpiredBookings = async () => {
  try {
    const batasWaktu = new Date(Date.now() - FIVE_MINUTES_MS); // hitung mundur 5 menit

    // 1. Mesin cuci: BOOKED & lebih dari 5 menit -> AVAILABLE
    await pool.query(
      `UPDATE washing_machines
       SET status = 'AVAILABLE', last_booked_at = NULL
       WHERE status = 'BOOKED' AND last_booked_at < ?`,
      [batasWaktu]
    );

    // 2. Mesin pengering: BOOKED & lebih dari 5 menit -> AVAILABLE
    await pool.query(
      `UPDATE drying_machines
       SET status = 'AVAILABLE', last_booked_at = NULL
       WHERE status = 'BOOKED' AND last_booked_at < ?`,
      [batasWaktu]
    );

    console.log(`[Auto-Cancel] Pengecekan selesai pada ${new Date().toISOString()}`);
  } catch (err) {
    console.error("[Auto-Cancel] Gagal menjalankan pengecekan:", err);
  }
};

/**
 * Jalankan pengecekan otomatis setiap 1 menit.
 * Dipanggil sekali saat server start.
 */
export const startAutoCancelScheduler = () => {
  console.log("[Auto-Cancel] Scheduler aktif - cek setiap 1 menit");
  autoCancelExpiredBookings(); // langsung jalan sekali saat start
  setInterval(autoCancelExpiredBookings, CHECK_INTERVAL_MS);
};
