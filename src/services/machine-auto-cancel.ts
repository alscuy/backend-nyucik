import { pool } from "../config/database";
import { refundBooking, machineInfo } from "./booking.service";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000; // cek tiap 1 menit

/**
 * Auto-cancel mesin dan booking yang statusnya BOOKED / PENDING/CONFIRMED (jika belum bayar/mulai)
 * lebih dari 5 menit sejak dibuat/dipesan.
 */
export const autoCancelExpiredBookings = async () => {
  try {
    const batasWaktu = new Date(Date.now() - FIVE_MINUTES_MS);

    // 1. Cari booking yang PENDING (belum bayar) atau CONFIRMED (belum mulai cuci)
    // yang dibuat lebih dari 5 menit lalu
    const [expiredBookings]: any = await pool.query(
      `SELECT id, user_id, machine_type, washing_machine_id, drying_machine_id, total_price, status
       FROM bookings
       WHERE status IN ('PENDING', 'CONFIRMED') AND created_at < ?`,
      [batasWaktu]
    );

    for (const booking of expiredBookings) {
      await pool.getConnection().then(async (conn) => {
        try {
          await conn.beginTransaction();

          // Jika status CONFIRMED (sudah bayar), refund saldo user
          if (booking.status === 'CONFIRMED') {
            const [userRows]: any = await conn.query(
              "SELECT balance FROM users WHERE id = ? FOR UPDATE",
              [booking.user_id]
            );
            if (userRows.length > 0) {
              const before = Number(userRows[0].balance);
              const refund = Number(booking.total_price);
              const after = before + refund;

              await conn.query("UPDATE users SET balance = ? WHERE id = ?", [after, booking.user_id]);
              await conn.query(
                `INSERT INTO wallet_transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
                 VALUES (?, 'REFUND', ?, ?, ?, 'BOOKING', ?, ?)`,
                [booking.user_id, refund, before, after, booking.id, `Auto-cancel refund laundry #${booking.id}`]
              );
            }
          }

          // Ubah status booking jadi CANCELLED
          await conn.query("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?", [booking.id]);

          // Kembalikan status mesin jadi AVAILABLE
          const { machineColumn, table } = machineInfo(booking);
          const machineId = booking[machineColumn];
          if (machineId) {
            await conn.query(`UPDATE ${table} SET status = 'AVAILABLE', last_booked_at = NULL WHERE id = ?`, [machineId]);
          }

          await conn.commit();
          conn.release();
        } catch (e) {
          await conn.rollback();
          conn.release();
          console.error(`[Auto-Cancel] Gagal cancel booking #${booking.id}:`, e);
        }
      });
    }

    // 2. Jaga-jaga: Mesin cuci & pengering yang statusnya BOOKED tapi tidak ada booking aktif, reset ke AVAILABLE
    await pool.query(
      `UPDATE washing_machines
       SET status = 'AVAILABLE', last_booked_at = NULL
       WHERE status = 'BOOKED' AND last_booked_at < ?`,
      [batasWaktu]
    );

    await pool.query(
      `UPDATE drying_machines
       SET status = 'AVAILABLE', last_booked_at = NULL
       WHERE status = 'BOOKED' AND last_booked_at < ?`,
      [batasWaktu]
    );
  } catch (err) {
    console.error("[Auto-Cancel] Gagal menjalankan pengecekan:", err);
  }
};

export const startAutoCancelScheduler = () => {
  console.log("[Auto-Cancel] Scheduler aktif - cek setiap 1 menit");
  autoCancelExpiredBookings();
  setInterval(autoCancelExpiredBookings, CHECK_INTERVAL_MS);
};
