import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const run = async () => {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "nyucik_db",
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log("✅ Migrasi selesai: semua tabel berhasil dibuat/diperbarui");

    // Cek dan tambah kolom last_booked_at di washing_machines & drying_machines jika belum ada
    const checkMachineCol = async (tableName: string) => {
      const [existing] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [process.env.DB_NAME || 'nyucik_db', tableName, 'last_booked_at'],
      );
      const cols = existing as { COLUMN_NAME: string }[];
      if (cols.length === 0) {
        await conn.query(`ALTER TABLE ${tableName} ADD COLUMN last_booked_at DATETIME NULL`);
        console.log(`✅ Kolom 'last_booked_at' pada tabel ${tableName} berhasil ditambahkan`);
      }
    };

    await checkMachineCol('washing_machines');
    await checkMachineCol('drying_machines');

    console.log("✅ Migrasi selesai: semua tabel berhasil dibuat/diperbarui");
  } catch (err) {
    console.error("❌ Migrasi gagal:", err);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
};

run();
