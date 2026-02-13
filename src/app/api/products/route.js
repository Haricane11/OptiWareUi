import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const minimal = searchParams.get("minimal") === "1";

    const pool = getPool();
    const sql = minimal
      ? `
        SELECT id, sku, name, unit_price
        FROM products
        WHERE status = 'active' OR status IS NULL
        ORDER BY name ASC
      `
      : `
        SELECT *
        FROM products
        ORDER BY id DESC
      `;

    const { rows } = await pool.query(sql);

    return NextResponse.json({
      ok: true,
      products: rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        unit_price: r.unit_price !== null ? Number(r.unit_price) : 0,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Failed to load products." }, { status: 500 });
  }
}
