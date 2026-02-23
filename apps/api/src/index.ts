import express from "express";
import cors from "cors";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { verifyToken, requireRole, AuthRequest } from "./middleware";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "gamerland_secret";

// ====== GASTOS: presets y categorías nuevas (para el front) ======
const EXPENSE_PRESETS = [
  "COMPRA DE MERCANCIA - PRODUCTOS",
  "TRANSACCION - CUADRE DE CAJA",
  "VIAJE A BOGOTÁ",
  "PAGO TRABAJADORES",
] as const;

// Si tu modelo Prisma usa enum, añade INTERNO/EXTERNO al enum.
// Si category es String, no necesitas migración.
const ExpenseCategories = ["INTERNO", "EXTERNO"] as const;
type ExpenseCategory = (typeof ExpenseCategories)[number];

// Carga .env local (Railway no lo necesita)
if (process.env.NODE_ENV !== "production") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config();
  } catch {
    /* noop */
  }
}

// --------- Setup ----------
app.use(cors());
app.use(express.json());

// --------- Helpers ----------
const toN = (v: unknown) => Number(v ?? 0);
const U = (s: unknown) =>
  (typeof s === "string" ? s.trim().toUpperCase() : s) as string;

function parseLocalDateRange(fromStr: string, toStr: string) {
  // America/Bogota (sin DST)
  const TZ = "-05:00";
  const from = new Date(`${fromStr}T00:00:00.000${TZ}`);
  const to = new Date(`${toStr}T23:59:59.999${TZ}`);
  return { from, to };
}

// Métodos de pago del local
const PaymentMethods = ["EFECTIVO", "QR_LLAVE", "DATAFONO"] as const;
type PaymentMethod = (typeof PaymentMethods)[number];

// Calcula stock actual
type StockGroupRow = { type: string; _sum: { qty: number | null } };
async function getCurrentStock(
  tx: Prisma.TransactionClient,
  productId: number,
) {
  const rows = (await tx.stockMovement.groupBy({
    by: ["type"] as const,
    where: { productId },
    _sum: { qty: true },
  })) as unknown as StockGroupRow[];

  const sumIn = rows.find((r) => r.type === "in")?._sum.qty ?? 0;
  const sumOut = rows.find((r) => r.type === "out")?._sum.qty ?? 0;
  return Number(sumIn) - Number(sumOut);
}

// ====== RESERVATIONS (Apartados v2 / Encargos) ======

const ReservationKinds = ["APARTADO", "ENCARGO"] as const;
type ReservationKind = (typeof ReservationKinds)[number];

async function getNextReservationCode(kind: ReservationKind) {
  const prefix = kind === "ENCARGO" ? "EN-" : "AP-";

  const last = await prisma.reservation.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let next = 1;
  if (last?.code) {
    const m = last.code.match(/\d+$/);
    if (m) next = parseInt(m[0], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, "0")}`;
}

async function recomputeReservationTotals(
  tx: Prisma.TransactionClient,
  reservationId: number,
) {
  const items = await tx.reservationItem.findMany({
    where: { reservationId },
    select: { qty: true, unitPrice: true, discount: true, totalLine: true },
  });

  const subtotal = items.reduce((a, it) => {
    const unit = Number(it.unitPrice || 0);
    const qty = Number(it.qty || 0);
    const disc = Number(it.discount || 0);
    const line =
      it.totalLine != null ? Number(it.totalLine) : unit * qty - disc;
    return a + line;
  }, 0);

  const current = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: { discount: true },
  });
  const discount = Number(current?.discount ?? 0);

  const totalPrice = subtotal - discount;

  const payAgg = await tx.reservationPayment.aggregate({
    where: { reservationId },
    _sum: { amount: true },
  });
  const totalPaid = Number(payAgg._sum.amount ?? 0);

  const shouldClose = totalPaid >= totalPrice && totalPrice > 0;

  const updated = await tx.reservation.update({
    where: { id: reservationId },
    data: {
      subtotal,
      totalPrice,
      totalPaid,
      ...(shouldClose ? { status: "CLOSED", closedAt: new Date() } : {}),
    },
  });

  return updated;
}

async function autoConvertExpiredEncargos(tx: Prisma.TransactionClient) {
  const now = new Date();

  // Regla: ENCARGO abierto, con pickupDate vencida (o igual), y sin abonos (totalPaid = 0)
  const res = await tx.reservation.updateMany({
    where: {
      status: "OPEN",
      kind: "ENCARGO",
      pickupDate: { not: null, lte: now },
      totalPaid: { lte: new Prisma.Decimal(0) }, // totalPaid Decimal
    },
    data: {
      kind: "APARTADO",
      convertedFromEncargo: true,
      kindChangedAt: now,
      // pickupDate la puedes dejar (auditoría) o null si prefieres:
      // pickupDate: null,
    },
  });

  return res.count;
}

// ===== SKU por categoría =====
const CATEGORY_PREFIX: Record<string, string> = {
  ACCESORIOS: "ACC",
  CABLES: "CAB",
  COMPONENTES: "COM",
  CONSOLAS: "CON",
  CONTROLES: "CTR",
  JUEGOS: "JUE",
  REPUESTOS: "REP",
  SERVICIOS: "SRV",
  PAPELERIA: "PAP",
};
async function getNextSku(category?: string | null) {
  const cat = (category || "").toUpperCase().trim();
  const prefix = CATEGORY_PREFIX[cat] || "PRD";
  const starts = `${prefix}-`;

  const last = await prisma.product.findFirst({
    where: { sku: { startsWith: starts } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });

  let next = 1;
  if (last?.sku) {
    const m = last.sku.match(/\d+$/);
    if (m) next = parseInt(m[0], 10) + 1;
  }
  return `${prefix}-${String(next).padStart(5, "0")}`;
}

async function getNextWorkCode() {
  const prefix = "WK-";
  const last = await prisma.workOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let next = 1;
  if (last?.code) {
    const m = last.code.match(/\d+$/);
    if (m) next = parseInt(m[0], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, "0")}`;
}

// ==================== RUTAS PÚBLICAS ====================
app.get("/health", (_req, res) => res.json({ ok: true }));

// ===== AUTH =====
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as {
    username: string;
    password: string;
  };
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user)
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok)
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: "8h",
  });
  res.json({ token, role: user.role, username: user.username });
});

// Bootstrap opcional
app.post("/auth/register", async (req, res) => {
  const { username, password, role } = req.body as {
    username: string;
    password: string;
    role?: "ADMIN" | "EMPLOYEE";
  };
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: "Usuario ya existe" });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, password: hash, role: role ?? "EMPLOYEE" },
  });
  res
    .status(201)
    .json({ id: user.id, username: user.username, role: user.role });
});

app.get("/auth/me", verifyToken, (req: AuthRequest, res) => {
  res.json({ id: req.user!.id, role: req.user!.role });
});

// Seed admin (dev) con header
app.post("/auth/seed-admin", async (req, res) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { username = "admin", password = "admin123" } = (req.body || {}) as {
    username?: string;
    password?: string;
  };
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists)
    return res.json({ ok: true, id: exists.id, username: exists.username });

  const hash = await bcrypt.hash(password, 10);
  const u = await prisma.user.create({
    data: { username, password: hash, role: "ADMIN" },
  });
  res.json({ ok: true, id: u.id, username: u.username });
});

// ==================== RUTAS PROTEGIDAS ====================
app.use(verifyToken);

// ===== USUARIOS (ADMIN) =====
const userBodySchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
});

app.get("/users", requireRole("ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { id: "asc" },
  });
  res.json(users);
});

app.post("/users", requireRole("ADMIN"), async (req, res) => {
  const parsed = userBodySchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });

  const { username, password, role } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: "Usuario ya existe" });

  const hash = await bcrypt.hash(password ?? "123456", 10);
  const u = await prisma.user.create({
    data: { username, password: hash, role: role ?? "EMPLOYEE" },
  });
  res.status(201).json({ id: u.id, username: u.username, role: u.role });
});

app.put("/users/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const parsed = userBodySchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });

  const data: {
    username?: string;
    password?: string;
    role?: "ADMIN" | "EMPLOYEE";
  } = {};
  if (parsed.data.username) data.username = parsed.data.username;
  if (parsed.data.role) data.role = parsed.data.role;
  if (parsed.data.password)
    data.password = await bcrypt.hash(parsed.data.password, 10);

  try {
    const u = await prisma.user.update({ where: { id }, data });
    res.json({ id: u.id, username: u.username, role: u.role });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2002")
      return res.status(409).json({ error: "Usuario ya existe" });
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: err?.message || "No se pudo actualizar" });
  }
});

app.delete("/users/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: err?.message || "No se pudo eliminar" });
  }
});

// ==================== PRODUCTS ====================
// EMPLOYEE lee; ADMIN crea/edita/activa/desactiva/elimina
const productCreateSchema = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional().nullable(),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  cost: z.coerce.number().nonnegative(),
  price: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().default(0),
  minStock: z.coerce.number().int().nonnegative().default(0),
  active: z.coerce.boolean().optional(),
});
const productUpdateSchema = productCreateSchema.partial();

app.get("/products", requireRole("EMPLOYEE"), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const includeInactive =
    String(req.query.includeInactive || "").toLowerCase() === "true";
  const withStock = String(req.query.withStock || "").toLowerCase() === "true";

  const pageSize = Math.min(
    Math.max(Number(req.query.pageSize || 10), 1),
    1000,
  );
  const page = Math.max(Number(req.query.page || 1), 1);
  const skip = (page - 1) * pageSize;

  const where: Prisma.ProductWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(includeInactive ? {} : { active: true }),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" }, // ← aquí el cambio
      skip,
      take: pageSize,
    }),
  ]);

  if (!withStock) return res.json({ total, rows: products });

  const ids = products.map((p) => p.id);
  let rowsWithStock = products;

  if (ids.length) {
    const grouped = await prisma.stockMovement.groupBy({
      by: ["productId", "type"] as const,
      where: { productId: { in: ids } },
      _sum: { qty: true },
    });

    const map = new Map<number, number>();
    for (const r of grouped as any[]) {
      const sign = r.type === "out" ? -1 : 1;
      map.set(
        r.productId,
        (map.get(r.productId) || 0) + sign * Number(r._sum.qty || 0),
      );
    }
    rowsWithStock = products.map((p) => ({ ...p, stock: map.get(p.id) ?? 0 }));
  }

  res.json({ total, rows: rowsWithStock });
});

app.get("/products/next-sku", requireRole("EMPLOYEE"), async (req, res) => {
  const category = String(req.query.category || "");
  const sku = await getNextSku(category);
  res.json({ sku });
});

app.get("/products/:id", requireRole("EMPLOYEE"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return res.status(404).json({ error: "No encontrado" });
  res.json(p);
});

app.post("/products", requireRole("ADMIN"), async (req, res) => {
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }
  const d = parsed.data;
  try {
    const autoSku = await getNextSku(d.category ?? null);
    const p = await prisma.product.create({
      data: {
        sku: d.sku?.trim() ? U(d.sku) : autoSku,
        barcode: d.barcode ? U(d.barcode) : null,
        name: U(d.name),
        category: d.category ? U(d.category) : null,
        cost: d.cost,
        price: d.price,
        taxRate: 0,
        minStock: d.minStock ?? 0,
        active: d.active ?? true,
      },
    });
    res.status(201).json(p);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2002")
      return res
        .status(409)
        .json({ error: "SKU ya existe o código de barras ya existe" });
    res.status(400).json({ error: err?.message || "No se pudo crear" });
  }
});

app.put("/products/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }

  try {
    const p = await prisma.product.update({ where: { id }, data: parsed.data });
    res.json(p);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    if (err?.code === "P2002")
      return res
        .status(409)
        .json({ error: "SKU ya existe o código de barras ya existe" });
    res.status(400).json({ error: err?.message || "No se pudo actualizar" });
  }
});

app.patch("/products/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }
  const d = parsed.data;

  try {
    const p = await prisma.product.update({
      where: { id },
      data: {
        ...(d.sku !== undefined ? { sku: U(d.sku) } : {}),
        ...(d.barcode !== undefined
          ? { barcode: d.barcode ? U(d.barcode) : null }
          : {}),
        ...(d.name !== undefined ? { name: U(d.name) } : {}),
        ...(d.category !== undefined
          ? { category: d.category ? U(d.category) : null }
          : {}),
        ...(d.cost !== undefined ? { cost: d.cost } : {}),
        ...(d.price !== undefined ? { price: d.price } : {}),
        ...(d.minStock !== undefined ? { minStock: d.minStock } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
        taxRate: 0,
      },
    });
    res.json(p);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    if (err?.code === "P2002")
      return res
        .status(409)
        .json({ error: "SKU ya existe o código de barras ya existe" });
    res.status(400).json({ error: err?.message || "No se pudo actualizar" });
  }
});

app.patch("/products/:id/activate", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const active = String(req.query.active || "").toLowerCase() === "true";
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });
  try {
    const p = await prisma.product.update({ where: { id }, data: { active } });
    res.json(p);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: err?.message || "No se pudo actualizar" });
  }
});

app.delete("/products/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    // 1) Borrar movimientos de stock asociados
    await prisma.stockMovement.deleteMany({
      where: { productId: id },
    });

    // 2) Borrar items de venta asociados
    await prisma.saleItem.deleteMany({
      where: { productId: id },
    });

    // 3) Borrar el producto
    await prisma.product.delete({
      where: { id },
    });

    return res.json({ ok: true, id });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "No encontrado" });
    }
    console.error("Error eliminando producto", err);
    return res
      .status(500)
      .json({ error: err?.message || "No se pudo eliminar" });
  }
});

// ==================== SALES ====================
const saleSchema = z.object({
  customer: z.string().nullish(),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        qty: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().nonnegative(),
        taxRate: z.coerce.number().nonnegative().default(0),
        discount: z.coerce.number().nonnegative().default(0),
      }),
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.enum(PaymentMethods),
        amount: z.coerce.number().nonnegative(),
        reference: z.string().optional(),
      }),
    )
    .min(1),
});

app.post("/sales", requireRole("EMPLOYEE"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }

  const { customer, items, payments } = parsed.data;
  const subtotal = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
  const tax = 0;
  const discount = items.reduce((a, it) => a + it.discount, 0);
  const total = subtotal + tax - discount;
  const sumaPagos = payments.reduce((a, p) => a + p.amount, 0);
  if (Math.abs(sumaPagos - total) > 0.01) {
    return res
      .status(400)
      .json({ error: "La suma de pagos debe igualar el total" });
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.create({
        data: {
          userId,
          customer: customer ? U(customer) : null,
          subtotal,
          tax,
          discount,
          total,
          status: "paid",
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              qty: it.qty,
              unitPrice: it.unitPrice,
              taxRate: 0,
              discount: it.discount,
              total: it.unitPrice * it.qty - it.discount,
            })),
          },
          payments: {
            create: payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference ? U(p.reference) : undefined,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      // Movimientos de stock por cada ítem (salida con costo promedio actual)
      for (const it of items) {
        const prod = await tx.product.findUnique({
          where: { id: it.productId },
          select: { cost: true },
        });
        const avgCost = Number(prod?.cost ?? 0);
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            type: "out",
            qty: it.qty,
            unitCost: avgCost,
            reference: `sale#${s.id}`,
            userId,
          },
        });
      }
      return s;
    });

    res.status(201).json(sale);
  } catch (e: unknown) {
    const err = e as { message?: string };
    res
      .status(400)
      .json({ error: err?.message || "No se pudo crear la venta" });
  }
});

const saleAdminUpdateSchema = z.object({
  customer: z.string().nullish(),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        qty: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().nonnegative(),
        discount: z.coerce.number().nonnegative().default(0),
      }),
    )
    .min(1)
    .optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(PaymentMethods),
        amount: z.coerce.number().nonnegative(),
        reference: z.string().optional(),
      }),
    )
    .min(1)
    .optional(),
  status: z.enum(["paid", "void", "return"]).optional(),
});

app.patch("/sales/:id", requireRole("ADMIN"), async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const parsed = saleAdminUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }

  const userId = req.user!.id;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.sale.findUnique({
        where: { id },
        include: { items: true, payments: true },
      });
      if (!prev) throw new Error("No encontrado");

      // =========================
      // 1) ITEMS (si vienen)
      // =========================
      if (parsed.data.items) {
        // 1.1) Borrar TODOS los movimientos de stock asociados a esa venta (sale#id, sale#id:edit, sale#id:edit-revert, etc.)
        await tx.stockMovement.deleteMany({
          where: { reference: { startsWith: `sale#${id}` } },
        });

        // 1.2) Reemplazar items en BD
        await tx.saleItem.deleteMany({ where: { saleId: id } });

        await tx.saleItem.createMany({
          data: parsed.data.items.map((it) => ({
            saleId: id,
            productId: it.productId,
            qty: it.qty,
            unitPrice: it.unitPrice,
            taxRate: 0,
            discount: it.discount ?? 0,
            total: it.unitPrice * it.qty - (it.discount ?? 0),
          })),
        });

        // 1.3) Crear los OUT nuevos (con costo promedio ACTUAL del producto)
        for (const it of parsed.data.items) {
          const prod = await tx.product.findUnique({
            where: { id: it.productId },
            select: { cost: true },
          });

          await tx.stockMovement.create({
            data: {
              productId: it.productId,
              type: "out",
              qty: it.qty,
              unitCost: Number(prod?.cost ?? 0),
              reference: `sale#${id}`, // 👈 dejamos la referencia base estable
              userId,
            },
          });
        }
      }

      // =========================
      // 2) PAYMENTS (si vienen)
      // =========================
      if (parsed.data.payments) {
        await tx.payment.deleteMany({ where: { saleId: id } });
        await tx.payment.createMany({
          data: parsed.data.payments.map((p) => ({
            saleId: id,
            method: p.method,
            amount: p.amount,
            reference: p.reference ? U(p.reference) : undefined,
          })),
        });
      }

      // =========================
      // 3) Recalcular totales con items actuales
      // =========================
      const curItems = parsed.data.items
        ? await tx.saleItem.findMany({ where: { saleId: id } })
        : prev.items;

      const subtotal = curItems.reduce(
        (a, it) => a + Number(it.unitPrice) * Number(it.qty),
        0,
      );
      const discount = curItems.reduce(
        (a, it) => a + Number(it.discount ?? 0),
        0,
      );
      const tax = 0;
      const total = subtotal + tax - discount;

      // (opcional pero recomendado) si llegan payments, validar suma
      if (parsed.data.payments) {
        const sumaPagos = parsed.data.payments.reduce(
          (a, p) => a + Number(p.amount || 0),
          0,
        );
        if (Math.abs(sumaPagos - total) > 0.01) {
          throw new Error("La suma de pagos debe igualar el total");
        }
      }

      // =========================
      // 4) Update final de la venta
      // =========================
      const sale = await tx.sale.update({
        where: { id },
        data: {
          customer:
            parsed.data.customer !== undefined
              ? parsed.data.customer
                ? U(parsed.data.customer)
                : null
              : prev.customer,
          subtotal,
          discount,
          tax,
          total,
          status: parsed.data.status ?? prev.status,
        },
        include: { items: true, payments: true },
      });

      return sale;
    });

    res.json(updated);
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err?.message === "No encontrado")
      return res.status(404).json({ error: "No encontrado" });
    res
      .status(400)
      .json({ error: err?.message || "No se pudo actualizar la venta" });
  }
});

app.delete(
  "/sales/:id",
  requireRole("ADMIN"),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id },
          select: { id: true },
        });

        if (!sale) {
          // si prefieres 404:
          const err: any = new Error("No encontrado");
          err.code = "P2025";
          throw err;
        }

        // ✅ CLAVE: borra todos los movimientos de esa venta (out/in de edits/deletes, etc.)
        await tx.stockMovement.deleteMany({
          where: { reference: { startsWith: `sale#${id}` } },
        });

        // borrar pagos, items y venta
        await tx.payment.deleteMany({ where: { saleId: id } });
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        await tx.sale.delete({ where: { id } });
      });

      return res.json({ ok: true, id, restocked: true });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "P2025" || err?.message === "No encontrado") {
        return res.status(404).json({ error: "No encontrado" });
      }
      return res
        .status(400)
        .json({ error: err?.message || "No se pudo eliminar" });
    }
  },
);

// ==================== STOCK IN (ADMIN) ====================
const stockInSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().nonnegative(),
  reference: z.string().optional(),
});

app.post("/stock/in", requireRole("ADMIN"), async (req, res) => {
  const parsed = stockInSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Datos inválidos" });

  const { productId, qty, unitCost, reference } = parsed.data;
  try {
    const mov = await prisma.$transaction(async (tx) => {
      const prevStock = await getCurrentStock(tx, productId);
      const prod = await tx.product.findUnique({
        where: { id: productId },
        select: { cost: true },
      });
      const prevAvg = Number(prod?.cost ?? 0);

      const newQty = prevStock + qty;
      const newAvg =
        newQty > 0 ? (prevStock * prevAvg + qty * unitCost) / newQty : unitCost;

      const m = await tx.stockMovement.create({
        data: {
          productId,
          type: "in",
          qty,
          unitCost,
          reference: reference ? U(reference) : "COMPRA",
        },
      });

      await tx.product.update({
        where: { id: productId },
        data: { cost: newAvg },
      });
      return m;
    });
    res.status(201).json(mov);
  } catch (e: unknown) {
    const err = e as { message?: string };
    res
      .status(400)
      .json({ error: err?.message || "No se pudo registrar el ingreso" });
  }
});

// ==================== STOCK OUT (ADMIN) ====================
const stockOutSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().positive(),
  reference: z.string().optional(),
});

app.post("/stock/out", requireRole("ADMIN"), async (req, res) => {
  const parsed = stockOutSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Datos inválidos" });

  const { productId, qty, reference } = parsed.data;

  try {
    const mov = await prisma.$transaction(async (tx) => {
      const prevStock = await getCurrentStock(tx, productId);
      if (prevStock < qty) {
        throw new Error("Stock insuficiente para realizar la salida");
      }

      const prod = await tx.product.findUnique({
        where: { id: productId },
        select: { cost: true },
      });
      const unitCost = Number(prod?.cost ?? 0);

      const m = await tx.stockMovement.create({
        data: {
          productId,
          type: "out",
          qty,
          unitCost,
          reference: reference ? U(reference) : "AJUSTE",
        },
      });

      // No se toca el costo promedio en una salida manual
      return m;
    });

    res.status(201).json(mov);
  } catch (e: unknown) {
    const err = e as { message?: string };
    res.status(400).json({
      error: err?.message || "No se pudo registrar la salida de stock",
    });
  }
});

// ==================== STOCK SUMMARY (EMPLOYEE) ====================
app.get("/stock/summary", requireRole("EMPLOYEE"), async (_req, res) => {
  const rows = (await prisma.stockMovement.groupBy({
    by: ["productId", "type"] as const,
    _sum: { qty: true },
  })) as unknown as Array<{
    productId: number;
    type: string;
    _sum: { qty: number | null };
  }>;

  const map = new Map<number, number>();
  for (const r of rows) {
    const sign = r.type === "out" ? -1 : 1;
    const prev = map.get(r.productId) || 0;
    map.set(r.productId, prev + sign * Number(r._sum.qty || 0));
  }

  const ids = Array.from(map.keys());
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
  });

  res.json(
    products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock: map.get(p.id) || 0,
    })),
  );
});

// ==================== EXPENSES ====================

// Presets para que el front alimente el selector
app.get("/expenses/presets", requireRole("EMPLOYEE"), (_req, res) => {
  res.json({
    presets: EXPENSE_PRESETS,
    // map opcional para mostrar ayuda en el UI
    categoryByPreset: Object.fromEntries(
      EXPENSE_PRESETS.map((p) => [p, "INTERNO"]),
    ),
  });
});

// Esquema: acepta INTERNO/EXTERNO y valida método
const expenseSchema = z.object({
  description: z.string().min(1, "Descripción requerida"),
  amount: z.coerce.number().positive("Monto inválido"),
  paymentMethod: z.enum(["EFECTIVO", "QR_LLAVE", "DATAFONO"]),
  category: z.enum(ExpenseCategories), // "INTERNO" | "EXTERNO"
});

app.post(
  "/expenses",
  requireRole("EMPLOYEE"),
  async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", issues: parsed.error.format() });
    }

    const d = parsed.data;

    // Normalización: si cae en preset ≠ "OTRO", forzamos category=INTERNO y descripción exacta en mayúscula.
    const isPreset = (desc: string) => EXPENSE_PRESETS.includes(desc as any);
    const descU = U(d.description);
    const descFinal = isPreset(descU) ? descU : descU; // el front ya lo envía, aquí solo normalizamos
    const catFinal: ExpenseCategory = isPreset(descU) ? "INTERNO" : d.category;

    const e = await prisma.expense.create({
      data: {
        userId,
        category: catFinal,
        description: descFinal,
        amount: d.amount,
        paymentMethod: d.paymentMethod,
      },
    });

    res.status(201).json(e);
  },
);

app.get("/expenses", requireRole("EMPLOYEE"), async (req, res) => {
  const fromParam = req.query.from ? String(req.query.from) : "";
  const toParam = req.query.to ? String(req.query.to) : "";

  const where: Prisma.ExpenseWhereInput = {};
  if (fromParam || toParam) {
    const { from, to } = parseLocalDateRange(
      fromParam || toParam,
      toParam || fromParam,
    );
    where.createdAt = { gte: from, lte: to };
  }

  const category = req.query.category
    ? String(req.query.category).toUpperCase()
    : "";
  if (category && (ExpenseCategories as readonly string[]).includes(category)) {
    where.category = category as ExpenseCategory;
  }

  const rows = await prisma.expense.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true } },
    },
  });
  res.json(rows);
});

const expenseUpdateSchema = expenseSchema.partial();

app.patch("/expenses/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });
  const parsed = expenseUpdateSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });

  try {
    const row = await prisma.expense.update({
      where: { id },
      data: parsed.data,
    });
    res.json(row);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: err?.message || "No se pudo actualizar" });
  }
});

app.delete("/expenses/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });
  try {
    await prisma.expense.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: err?.message || "No se pudo eliminar" });
  }
});

// ==================== REPORTES ====================
app.get("/reports/summary", requireRole("EMPLOYEE"), async (req, res) => {
  const fromParam = String(req.query.from || "");
  const toParam = String(req.query.to || "");

  if (!fromParam || !toParam) {
    return res.status(400).json({ error: "from/to requeridos (YYYY-MM-DD)" });
  }
  const { from, to } = parseLocalDateRange(fromParam, toParam);
  if (isNaN(+from) || isNaN(+to)) {
    return res.status(400).json({ error: "from/to inválidos (YYYY-MM-DD)" });
  }

  // 1) Ventas (todas, incl. REFACIL)
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: from, lte: to }, status: "paid" },
    select: {
      subtotal: true,
      tax: true,
      discount: true,
      total: true,
      id: true,
    },
  });
  const sumKey = (k: "subtotal" | "tax" | "discount" | "total") =>
    sales.reduce((a, s) => a + Number((s as any)[k] ?? 0), 0);

  // 2) Costos vendidos (desde outs) — se mantiene para referencia
  const outs = await prisma.stockMovement.findMany({
    where: {
      type: "out",
      createdAt: { gte: from, lte: to },
      reference: { startsWith: "sale#" },
    },
    select: { productId: true, unitCost: true, reference: true, qty: true },
  });
  const costo_vendido = outs.reduce(
    (a, r) => a + Number(r.qty || 0) * Number(r.unitCost || 0),
    0,
  );

  // 3) Gastos operativos (EXTERNOS) — se reportan aparte
  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { amount: true, category: true },
  });
  const gastos_total = expenses.reduce((a, r) => a + Number(r.amount), 0);
  const gastos_operativos = expenses
    .filter((e) => String(e.category ?? "").toUpperCase() !== "INTERNO")
    .reduce((a, r) => a + Number(r.amount), 0);

  // 4) UTILIDAD por REGLAS (sumatoria línea a línea)
  //    Necesitamos items y el unitCost por venta/producto
  const costMap = new Map<string, number>(); // `${saleId}:${productId}` -> unitCost
  for (const m of outs) {
    const saleId = Number((m.reference || "").split("#")[1] || 0);
    if (!saleId) continue;
    costMap.set(`${saleId}:${m.productId}`, Number(m.unitCost) || 0);
  }

  const items = await prisma.saleItem.findMany({
    where: { sale: { createdAt: { gte: from, lte: to }, status: "paid" } },
    select: {
      saleId: true,
      productId: true,
      qty: true,
      unitPrice: true,
      product: { select: { name: true } },
    },
  });

  const utilidadReglas = items.reduce((acc, it) => {
    const unitCost = toN(costMap.get(`${it.saleId}:${it.productId}`));
    return (
      acc +
      profitByRule(
        it.product?.name ?? "",
        Number(it.unitPrice || 0),
        unitCost,
        Number(it.qty || 0),
      )
    );
  }, 0);

  res.json({
    from,
    to,
    ventas: sumKey("total"), // <- TODAS las ventas
    subtotal: sumKey("subtotal"),
    iva: sumKey("tax"),
    descuentos: sumKey("discount"),
    costo_vendido: Math.round(costo_vendido),
    gastos_total: Math.round(gastos_total),
    gastos_operativos: Math.round(gastos_operativos),
    utilidad: Math.round(utilidadReglas), // <- SOLO utilidad por REGLAS
  });
});

// Detalle de ventas por ítem + métodos de pago
app.get("/reports/sales-lines", requireRole("EMPLOYEE"), async (req, res) => {
  const fromParam = String(req.query.from || "");
  const toParam = String(req.query.to || "");
  if (!fromParam || !toParam) {
    return res.status(400).json({ error: "from/to requeridos (YYYY-MM-DD)" });
  }
  const { from, to } = parseLocalDateRange(fromParam, toParam);

  const sales = (await prisma.sale.findMany({
    where: { createdAt: { gte: from, lte: to }, status: "paid" },
    include: {
      user: { select: { id: true, username: true } },
      items: {
        include: {
          product: { select: { sku: true, name: true, category: true } },
        },
      },
      payments: true,
    },

    orderBy: { createdAt: "desc" },
  })) as Array<{
    id: number;
    createdAt: Date;
    user: { id: number; username: string } | null;
    items: Array<{
      productId: number;
      unitPrice: unknown;
      qty: unknown;
      discount: unknown;
      total: unknown | null;
      product: {
        sku?: string | null;
        name?: string | null;
        category?: string | null;
      } | null;
    }>;
    payments: Array<{ method: string; amount: unknown }>;
  }>;

  // Costos unitarios por venta/producto (desde movimientos out)
  const outs = (await prisma.stockMovement.findMany({
    where: {
      type: "out",
      createdAt: { gte: from, lte: to },
      reference: { startsWith: "sale#" },
    },
    select: { productId: true, qty: true, unitCost: true, reference: true },
  })) as Array<{
    productId: number;
    qty: unknown;
    unitCost: unknown;
    reference: string | null;
  }>;

  const costMap = new Map<string, number>(); // `${saleId}:${productId}` -> unitCost
  for (const m of outs) {
    const saleId = Number((m.reference || "").split("#")[1] || 0);
    if (!saleId) continue;
    costMap.set(`${saleId}:${m.productId}`, Number(m.unitCost) || 0);
  }

  const rows = sales.flatMap((s) =>
    s.items.map((it) => {
      const unitPrice = toN(it.unitPrice);
      const qty = toN(it.qty);
      const discount = toN(it.discount);
      const unitCost = toN(costMap.get(`${s.id}:${it.productId}`));
      const revenue = unitPrice * qty;
      const cost = unitCost * qty;

      return {
        saleId: s.id,
        createdAt: s.createdAt,
        user: s.user ? { id: s.user.id, username: s.user.username } : null,
        sku: it.product?.sku ?? "",
        name: it.product?.name ?? "",
        category: it.product?.category ?? null,
        qty,
        unitPrice,
        discount,
        total: it.total != null ? toN(it.total) : unitPrice * qty - discount,
        unitCost,
        revenue,
        cost,
        profit: profitByRule(it.product?.name ?? "", unitPrice, unitCost, qty),
        paymentMethods: s.payments.map((p) => ({
          method: p.method,
          amount: toN(p.amount),
        })),
      };
    }),
  );

  res.json(rows);
});

// Alias legacy
app.get(
  "/reports/sales-detail",
  requireRole("EMPLOYEE"),
  async (req, res, next) => {
    (app as any)._router.handle(
      { ...req, url: "/reports/sales-lines", method: "GET" },
      res,
      next,
    );
  },
);

// ===== Utilidad por REGLAS (igual a tu front) =====
function profitByRule(
  name: string,
  unitPrice: number,
  unitCost: number,
  qty: number,
) {
  const N = (name || "").toUpperCase().trim();
  const total = unitPrice * qty;
  const costo = unitCost * qty;

  if (N === "REFACIL - RECARGA CELULAR") return Math.round(total * 0.055);
  if (N === "REFACIL - PAGO FACTURA") return 200;
  if (N === "REFACIL - PAGO VANTI GAS NATURAL CUNDIBOYACENSE") return 100;
  if (N === "REFACIL - PAGO CUOTA PAYJOY") return 250;
  if (N === "REFACIL - GAME PASS" || N === "REFACIL - GAME PASS/PSN")
    return Math.round(total * 0.03);
  if (
    [
      "REFACIL - CARGA DE CUENTA",
      "TRANSACCION",
      "TRANSACCION DATAFONO",
      "CUADRE DE CAJA",
    ].includes(N)
  )
    return 0;

  return Math.round(total - costo);
}

// ======= Pagos por método (CAJA) con AJUSTE de CERTIFICADO =======
app.get("/reports/payments", requireRole("EMPLOYEE"), async (req, res) => {
  const fromParam = String(req.query.from || "");
  const toParam = String(req.query.to || "");
  if (!fromParam || !toParam)
    return res.status(400).json({ error: "from/to requeridos" });

  const { from, to } = parseLocalDateRange(fromParam, toParam);

  // Pagos brutos por método
  const rows = (await prisma.payment.groupBy({
    by: ["method"] as const,
    where: { createdAt: { gte: from, lte: to } },
    _sum: { amount: true },
  })) as unknown as Array<{ method: string; _sum: { amount: unknown } }>;

  const sum = (m: string) =>
    Number(rows.find((r) => r.method === m)?._sum.amount ?? 0);
  let EFECTIVO = sum("EFECTIVO");
  let QR_LLAVE = sum("QR_LLAVE");
  let DATAFONO = sum("DATAFONO");

  // Gastos por método (reales)
  const exp = await prisma.expense.groupBy({
    by: ["paymentMethod"],
    where: { createdAt: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  const expSum = (m: string) =>
    Number(exp.find((e) => e.paymentMethod === m)?._sum.amount ?? 0);
  let G_EFECTIVO = expSum("EFECTIVO");
  let G_QR = expSum("QR_LLAVE");
  let G_DATAFONO = expSum("DATAFONO");

  // ===== AJUSTE: CERTIFICADO LIBERTAD Y TRADICION =====
  // Por cada unidad vendida: +25.000 a EFECTIVO y -21.900 a QR_LLAVE (caja)
  const CERT_NAME = "CERTIFICADO LIBERTAD Y TRADICION";
  const certItems = await prisma.saleItem.findMany({
    where: {
      sale: { createdAt: { gte: from, lte: to }, status: "paid" },
      product: { name: { equals: CERT_NAME } },
    },
    select: { qty: true },
  });
  const certUnits = certItems.reduce((a, r) => a + Number(r.qty || 0), 0);
  const AJ_EFECTIVO = 25000 * certUnits;
  const AJ_QR = 21900 * certUnits;

  EFECTIVO += AJ_EFECTIVO;
  QR_LLAVE -= AJ_QR;

  // Si quieres reflejar el "descuento" de QR como gasto virtual, súmalo a G_QR
  // (No crea Expense en DB, solo corrige el informe de caja)
  G_QR += AJ_QR;

  const total = EFECTIVO + QR_LLAVE + DATAFONO;
  const G_TOTAL = G_EFECTIVO + G_QR + G_DATAFONO;

  const N_EFECTIVO = EFECTIVO - G_EFECTIVO;
  const N_QR = QR_LLAVE - G_QR;
  const N_DATAFONO = DATAFONO - G_DATAFONO;
  const N_TOTAL = N_EFECTIVO + N_QR + N_DATAFONO;

  res.json({
    // bruto ajustado
    EFECTIVO,
    QR_LLAVE,
    DATAFONO,
    total,
    ajustes: {
      certificados: {
        unidades: certUnits,
        plus_efectivo: AJ_EFECTIVO,
        minus_qr: AJ_QR,
      },
    },
    // gastos (reales + virtual QR por certificado)
    gastos: {
      EFECTIVO: G_EFECTIVO,
      QR_LLAVE: G_QR,
      DATAFONO: G_DATAFONO,
      total: G_TOTAL,
    },
    // neto por método
    neto: {
      EFECTIVO: N_EFECTIVO,
      QR_LLAVE: N_QR,
      DATAFONO: N_DATAFONO,
      total: N_TOTAL,
    },
  });
});

// Total Papelería (categoría SERVICIOS)
app.get("/reports/papeleria", requireRole("EMPLOYEE"), async (req, res) => {
  const fromParam = String(req.query.from || "");
  const toParam = String(req.query.to || "");
  if (!fromParam || !toParam)
    return res.status(400).json({ error: "from/to requeridos" });

  const { from, to } = parseLocalDateRange(fromParam, toParam);

  const items = await prisma.saleItem.findMany({
    where: { sale: { createdAt: { gte: from, lte: to }, status: "paid" } },
    select: {
      unitPrice: true,
      qty: true,
      discount: true,
      total: true,
      product: { select: { category: true, sku: true, name: true } },
    },
  });

  const total = items
    .filter((it) => {
      const cat = String(it.product?.category ?? "").toUpperCase();
      const sku = String(it.product?.sku ?? "").toUpperCase();
      const name = String(it.product?.name ?? "").toUpperCase();
      // Regla principal: categoría PAPELERIA
      if (name.includes("PAPELERIA")) return true;
      return false;
    })
    .reduce((acc, it) => {
      const unit = toN(it.unitPrice);
      const qty = toN(it.qty);
      const disc = toN(it.discount);
      const line = it.total != null ? toN(it.total) : unit * qty - disc;
      return acc + line;
    }, 0);

  res.json({ total: Math.round(total) });
});

// CAJA actual por método (bruto - gastos), tomando toda la historia
app.get("/reports/cashbox", requireRole("EMPLOYEE"), async (_req, res) => {
  const rows = (await prisma.payment.groupBy({
    by: ["method"] as const,
    _sum: { amount: true },
  })) as unknown as Array<{ method: string; _sum: { amount: unknown } }>;
  const sumPay = (m: string) =>
    Number(rows.find((r) => r.method === m)?._sum.amount ?? 0);

  // Gastos por método (reales, toda la historia)
  const exp = await prisma.expense.groupBy({
    by: ["paymentMethod"],
    _sum: { amount: true },
  });
  const sumExp = (m: string) =>
    Number(exp.find((e) => e.paymentMethod === m)?._sum.amount ?? 0);

  const bruto = {
    efectivo: sumPay("EFECTIVO"),
    qr_llave: sumPay("QR_LLAVE"),
    datafono: sumPay("DATAFONO"),
  };
  const gastos = {
    efectivo: sumExp("EFECTIVO"),
    qr_llave: sumExp("QR_LLAVE"),
    datafono: sumExp("DATAFONO"),
  };

  const efectivo = bruto.efectivo - gastos.efectivo;
  const qr_llave = bruto.qr_llave - gastos.qr_llave;
  const datafono = bruto.datafono - gastos.datafono;
  const total = efectivo + qr_llave + datafono;

  res.json({
    efectivo,
    qr_llave,
    datafono,
    total,
    lastUpdated: new Date().toISOString(),
  });
});

// =================== WORK ORDERS ==================
const workCreateSchema = z.object({
  code: z.string().optional(), // 👈 NUEVO (para garantía)
  item: z.string().min(1),
  description: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(3),
  reviewPaid: z.coerce.boolean().default(false),
  location: z.enum(["LOCAL", "BOGOTA"]).default("LOCAL"),
  quote: z.coerce.number().optional(),
  notes: z.string().optional(),

  informedCustomer: z.coerce.boolean().optional(),

  // 👇 para que el back guarde estos campos también
  isWarranty: z.coerce.boolean().optional(),
  parentId: z.coerce.number().int().optional(),
});

const workUpdateSchema = z.object({
  item: z.string().optional(),
  description: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  reviewPaid: z.coerce.boolean().optional(),
  status: z
    .enum(["RECEIVED", "IN_PROGRESS", "FINISHED", "DELIVERED"])
    .optional(),
  location: z.enum(["LOCAL", "BOGOTA"]).optional(),
  quote: z.coerce.number().nullable().optional(),
  total: z.coerce.number().nullable().optional(),
  notes: z.string().nullable().optional(),

  // 👇 NUEVO (por si quieres marcar manualmente)
  isWarranty: z.coerce.boolean().optional(),
  parentId: z.coerce.number().int().nullable().optional(),

  informedCustomer: z.coerce.boolean().optional(),
});

const workPaymentSchema = z.object({
  amount: z.coerce.number().positive("Monto inválido"),
  method: z.enum(PaymentMethods).default("EFECTIVO"),
  note: z.string().optional(),
  createdBy: z.string().optional(),
});

const workItemCreateSchema = z.object({
  label: z.string().min(1, "Texto requerido"),
  // opcional, por si algún día quieres crear con precio/detalle desde otro sitio
  price: z.coerce.number().nonnegative().optional(),
  detail: z.string().optional(),
});

const workItemUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  done: z.coerce.boolean().optional(),
  price: z.coerce.number().nonnegative().optional(), // 👈 para el front
  detail: z.string().optional(), // 👈 para el front
});

app.get("/works", requireRole("EMPLOYEE"), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").toUpperCase();
  const location = String(req.query.location || "").toUpperCase();

  const where: Prisma.WorkOrderWhereInput = {};
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { item: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q, mode: "insensitive" } },
    ];
  }
  if (["RECEIVED", "IN_PROGRESS", "FINISHED", "DELIVERED"].includes(status)) {
    where.status = status as any;
  }
  if (["LOCAL", "BOGOTA"].includes(location)) {
    where.location = location as any;
  }

  const rows = await prisma.workOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { payments: { select: { amount: true } } },
  });

  const out = rows.map((r) => {
    const deposit = (r.payments || []).reduce(
      (a, p) => a + Number(p.amount || 0),
      0,
    );
    return { ...r, deposit };
  });

  res.json(out);
});

app.post("/works/:id/payments", requireRole("EMPLOYEE"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const parsed = workPaymentSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });

  const { amount, method, note, createdBy } = parsed.data;

  const wo = await prisma.workOrder.findUnique({ where: { id } });
  if (!wo) return res.status(404).json({ error: "Orden no encontrada" });

  if (wo.quote != null) {
    const agg = await prisma.workOrderPayment.aggregate({
      where: { workOrderId: id },
      _sum: { amount: true },
    });
    const paid = Number(agg._sum.amount ?? 0);
    const saldo = Math.max(Number(wo.quote) - paid, 0);
    if (amount > saldo + 0.0001) {
      return res
        .status(400)
        .json({ error: "El abono excede el saldo pendiente" });
    }
  }

  const pay = await prisma.workOrderPayment.create({
    data: {
      workOrderId: id,
      amount,
      method,
      note: note ? U(note) : undefined,
      createdBy: createdBy ? U(createdBy) : undefined,
    },
  });

  try {
    const agg2 = await prisma.workOrderPayment.aggregate({
      where: { workOrderId: id },
      _sum: { amount: true },
    });
    await prisma.workOrder.update({
      where: { id },
      data: { deposit: Number(agg2._sum.amount ?? 0) },
    });
  } catch {
    /* noop */
  }

  res.status(201).json(pay);
});

app.get("/works/:id/payments", requireRole("EMPLOYEE"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const exists = await prisma.workOrder.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ error: "Orden no encontrada" });

  const pays = await prisma.workOrderPayment.findMany({
    where: { workOrderId: id },
    orderBy: { createdAt: "desc" },
  });
  res.json(pays);
});

app.delete(
  "/works/:workId/payments/:paymentId",
  requireRole("ADMIN"),
  async (req, res) => {
    const workId = Number(req.params.workId);
    const paymentId = Number(req.params.paymentId);

    if (!Number.isInteger(workId) || !Number.isInteger(paymentId)) {
      return res.status(400).json({ error: "id inválido" });
    }

    try {
      // Verificamos que el pago exista y pertenezca a esa orden
      const pay = await prisma.workOrderPayment.findUnique({
        where: { id: paymentId },
        select: { id: true, workOrderId: true },
      });

      if (!pay || pay.workOrderId !== workId) {
        return res.status(404).json({ error: "Abono no encontrado" });
      }

      // Eliminamos el abono
      await prisma.workOrderPayment.delete({ where: { id: paymentId } });

      // Recalculamos el depósito total de la orden
      const agg = await prisma.workOrderPayment.aggregate({
        where: { workOrderId: workId },
        _sum: { amount: true },
      });

      const newDeposit = Number(agg._sum.amount ?? 0);

      await prisma.workOrder.update({
        where: { id: workId },
        data: { deposit: newDeposit },
      });

      res.json({
        ok: true,
        workOrderId: workId,
        paymentId,
        deposit: newDeposit,
      });
    } catch (e: unknown) {
      const err = e as { message?: string };
      res
        .status(400)
        .json({ error: err?.message || "No se pudo eliminar el abono" });
    }
  },
);

app.get("/works/:id/items", requireRole("EMPLOYEE"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!wo) {
    return res.status(404).json({ error: "Orden no encontrada" });
  }

  const items = await prisma.workItem.findMany({
    where: { workOrderId: id },
    orderBy: { createdAt: "asc" },
  });

  res.json(items);
});

app.post("/works/:id/items", requireRole("EMPLOYEE"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  const parsed = workItemCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Datos inválidos",
      issues: parsed.error.flatten(),
    });
  }

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!wo) {
    return res.status(404).json({ error: "Orden no encontrada" });
  }

  const item = await prisma.workItem.create({
    data: {
      workOrderId: id,
      label: U(parsed.data.label),
      ...(parsed.data.price !== undefined ? { price: parsed.data.price } : {}),
      ...(parsed.data.detail !== undefined
        ? { detail: U(parsed.data.detail) }
        : {}),
    },
  });

  res.status(201).json(item);
});

app.patch(
  "/works/:workId/items/:itemId",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const workId = Number(req.params.workId);
    const itemId = Number(req.params.itemId);

    if (!Number.isInteger(workId) || !Number.isInteger(itemId)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const parsed = workItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Datos inválidos",
        issues: parsed.error.flatten(),
      });
    }

    try {
      // opcional: garantizar que pertenece a esa orden
      const existing = await prisma.workItem.findUnique({
        where: { id: itemId },
        select: { id: true, workOrderId: true },
      });

      if (!existing || existing.workOrderId !== workId) {
        return res.status(404).json({ error: "Ítem no encontrado" });
      }

      const data: Prisma.WorkItemUpdateInput = {};
      if (parsed.data.label !== undefined) {
        data.label = U(parsed.data.label);
      }
      if (parsed.data.done !== undefined) {
        data.done = parsed.data.done;
      }
      if (parsed.data.price !== undefined) {
        data.price = parsed.data.price;
      }
      if (parsed.data.detail !== undefined) {
        data.detail = U(parsed.data.detail);
      }

      // Actualizamos el ítem
      const updated = await prisma.workItem.update({
        where: { id: itemId },
        data,
      });

      // 👇 Recalcular TOTAL del trabajo como suma de price de todos los ítems
      const agg = await prisma.workItem.aggregate({
        where: { workOrderId: workId },
        _sum: { price: true },
      });

      const newTotal = Number(agg._sum.price ?? 0);

      await prisma.workOrder.update({
        where: { id: workId },
        data: { total: newTotal },
      });

      res.json({ ...updated, totalWorkOrder: newTotal });
    } catch (e: unknown) {
      const err = e as { message?: string };
      res.status(400).json({
        error: err?.message || "No se pudo actualizar el ítem",
      });
    }
  },
);

app.post("/works", requireRole("EMPLOYEE"), async (req, res) => {
  const parsed = workCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }

  const d = parsed.data;

  // 👇 si viene code en el body (garantía), se usa ese; si no, se genera nuevo
  const code = d.code?.trim() ? U(d.code) : await getNextWorkCode();

  const row = await prisma.workOrder.create({
    data: {
      code,
      item: U(d.item),
      description: U(d.description),
      customerName: U(d.customerName),
      customerPhone: d.customerPhone,
      reviewPaid: d.reviewPaid,
      location: d.location,
      quote: d.quote ?? null,
      notes: d.notes ? U(d.notes) : null,
      informedCustomer: d.informedCustomer ?? false,

      isWarranty: d.isWarranty ?? false,
      parentId: d.parentId ?? null,
    },
  });

  res.status(201).json(row);
});

app.patch("/works/:id", requireRole("EMPLOYEE"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const parsed = workUpdateSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  const d = parsed.data;

  try {
    const row = await prisma.workOrder.update({
      where: { id },
      data: {
        ...(d.item !== undefined ? { item: U(d.item) } : {}),
        ...(d.description !== undefined
          ? { description: U(d.description) }
          : {}),
        ...(d.customerName !== undefined
          ? { customerName: U(d.customerName) }
          : {}),
        ...(d.customerPhone !== undefined
          ? { customerPhone: d.customerPhone }
          : {}),
        ...(d.reviewPaid !== undefined ? { reviewPaid: d.reviewPaid } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.location !== undefined ? { location: d.location } : {}),
        ...(d.quote !== undefined ? { quote: d.quote } : {}),
        ...(d.total !== undefined ? { total: d.total } : {}),
        ...(d.notes !== undefined
          ? { notes: d.notes ? U(d.notes) : null }
          : {}),

        // 👇 nuevo: se guarda en BD
        ...(d.informedCustomer !== undefined
          ? { informedCustomer: d.informedCustomer }
          : {}),
      },
    });
    res.json(row);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: err?.message || "No se pudo actualizar" });
  }
});

app.delete("/works/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });
  try {
    await prisma.workOrder.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: err?.message || "No se pudo eliminar" });
  }
});

// ==================== ENCARGOS / APARTADOS ============================

const ReservationTypes = ["ENCARGO", "APARTADO"] as const;

const reservationCreateSchema = z.object({
  kind: z.enum(["APARTADO", "ENCARGO"]).default("APARTADO"),

  // Si es ENCARGO, pickupDate es obligatorio
  pickupDate: z.string().datetime().optional(), // ISO string desde el front

  customerName: z.string().min(1),
  customerPhone: z.string().min(3),
  customerDoc: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),

  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive().optional(),
        productName: z.string().optional(),
        qty: z.coerce.number().int().positive().default(1),
        unitPrice: z.coerce.number().nonnegative().optional(),
        discount: z.coerce.number().nonnegative().default(0),
      }),
    )
    .min(1, "Debe haber al menos 1 ítem"),

  // Abono inicial: en ENCARGO puede ser 0 (si no hay abono)
  initialDeposit: z.coerce.number().nonnegative().default(0),
  method: z.enum(PaymentMethods).optional(), // solo requerido si initialDeposit > 0
});

const reservationItemCreateSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  productName: z.string().min(1, "Nombre requerido").optional(),
  qty: z.coerce.number().int().positive().default(1),
  unitPrice: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().nonnegative().default(0),
});

const reservationItemUpdateSchema = z.object({
  qty: z.coerce.number().int().positive().optional(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().nonnegative().optional(),
  productName: z.string().min(1).optional(),
});

const reservationPaymentSchema = z.object({
  amount: z.coerce.number().positive("Monto inválido"),
  method: z.enum(PaymentMethods),
  note: z.string().optional(),
  createdBy: z.string().optional(),
  reference: z.string().optional(),
});

app.get("/reservations", requireRole("EMPLOYEE"), async (req, res) => {
  const status = String(req.query.status || "").toUpperCase();
  const kind = String(req.query.kind || "").toUpperCase(); // APARTADO | ENCARGO
  const q = String(req.query.q || "").trim();

  try {
    // Auto-conversión (encargos vencidos sin abono)
    await prisma.$transaction(async (tx) => {
      await autoConvertExpiredEncargos(tx);
    });

    const where: Prisma.ReservationWhereInput = {};

    if (["OPEN", "CLOSED", "CANCELLED"].includes(status)) {
      where.status = status as any;
    }
    if (["APARTADO", "ENCARGO"].includes(kind)) {
      where.kind = kind as any;
    }

    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q, mode: "insensitive" } },
        {
          items: {
            some: { productName: { contains: q, mode: "insensitive" } },
          },
        },
      ];
    }

    const rows = await prisma.reservation.findMany({
      where,
      orderBy: [{ createdAt: "asc" }],
      include: {
        items: { orderBy: { id: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
      },
      take: 200,
    });

    res.json(rows);
  } catch (e: unknown) {
    const err = e as { message?: string };
    res
      .status(400)
      .json({ error: err?.message || "No se pudieron cargar reservas" });
  }
});

app.post(
  "/reservations",
  requireRole("EMPLOYEE"),
  async (req: AuthRequest, res) => {
    const parsed = reservationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
    }

    const d = parsed.data;

    // Validación: ENCARGO requiere pickupDate
    if (d.kind === "ENCARGO") {
      if (!d.pickupDate) {
        return res
          .status(400)
          .json({ error: "pickupDate es requerido para ENCARGO" });
      }
    }

    // Validación: si initialDeposit > 0, method es requerido
    if (Number(d.initialDeposit || 0) > 0 && !d.method) {
      return res
        .status(400)
        .json({ error: "method es requerido si hay abono inicial" });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // (opcional) corre auto conversión antes de crear
        await autoConvertExpiredEncargos(tx);

        const code = await getNextReservationCode(d.kind);

        // Normalizar items con snapshot desde Product
        const normalizedItems: Array<{
          productId: number | null;
          productName: string;
          skuSnapshot: string | null;
          qty: number;
          unitPrice: number;
          discount: number;
          totalLine: number;
        }> = [];

        for (const it of d.items) {
          let prod: any = null;

          if (it.productId) {
            prod = await tx.product.findUnique({ where: { id: it.productId } });
            if (!prod)
              throw new Error(`Producto no encontrado: ${it.productId}`);
          }

          const qty = Number(it.qty || 1);
          const unitPrice =
            it.unitPrice != null
              ? Number(it.unitPrice)
              : Number(prod?.price ?? 0);
          const discount = Number(it.discount ?? 0);

          const productName = U(it.productName ?? prod?.name ?? "ITEM");
          const skuSnapshot = prod?.sku ? String(prod.sku) : null;

          const totalLine = unitPrice * qty - discount;

          normalizedItems.push({
            productId: it.productId ?? null,
            productName,
            skuSnapshot,
            qty,
            unitPrice,
            discount,
            totalLine,
          });
        }

        const subtotal = normalizedItems.reduce(
          (a, it) => a + Number(it.totalLine || 0),
          0,
        );
        const discountGeneral = 0;
        const totalPrice = subtotal - discountGeneral;

        const pickupDate = d.pickupDate ? new Date(d.pickupDate) : null;

        const reservation = await tx.reservation.create({
          data: {
            code,
            status: "OPEN",
            kind: d.kind,
            pickupDate,
            convertedFromEncargo: false,
            kindChangedAt: null,

            customerName: U(d.customerName),
            customerPhone: d.customerPhone,
            customerDoc: d.customerDoc ? U(d.customerDoc) : null,
            city: d.city ? U(d.city) : null,
            notes: d.notes ? U(d.notes) : null,

            subtotal,
            discount: discountGeneral,
            totalPrice,
            totalPaid: Number(d.initialDeposit || 0),

            items: { create: normalizedItems },
          },
          include: { items: true, payments: true },
        });

        // Crear pago inicial solo si initialDeposit > 0
        let pay: any = null;
        if (Number(d.initialDeposit || 0) > 0) {
          pay = await tx.reservationPayment.create({
            data: {
              reservationId: reservation.id,
              amount: Number(d.initialDeposit || 0),
              method: d.method!, // ya validamos arriba
              note: "ABONO INICIAL",
            },
          });
        }

        const updated = await recomputeReservationTotals(tx, reservation.id);

        return {
          reservation: updated,
          items: reservation.items,
          payments: pay ? [pay] : [],
        };
      });

      res.status(201).json(result);
    } catch (e: unknown) {
      const err = e as { message?: string };
      res
        .status(400)
        .json({ error: err?.message || "No se pudo crear la reserva" });
    }
  },
);

app.post(
  "/reservations/:id/close",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "id inválido" });

    try {
      const row = await prisma.reservation.update({
        where: { id },
        data: { status: "CLOSED", closedAt: new Date() },
      });
      res.json(row);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "P2025")
        return res.status(404).json({ error: "No encontrado" });
      res.status(400).json({ error: err?.message || "No se pudo cerrar" });
    }
  },
);

app.post(
  "/reservations/:id/cancel",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "id inválido" });

    try {
      const row = await prisma.reservation.update({
        where: { id },
        data: { status: "CANCELLED", closedAt: new Date() },
      });
      res.json(row);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "P2025")
        return res.status(404).json({ error: "No encontrado" });
      res.status(400).json({ error: err?.message || "No se pudo cancelar" });
    }
  },
);

app.delete("/reservations/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    // Cascade debería borrar items/payments si pusiste onDelete: Cascade.
    await prisma.reservation.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res
      .status(400)
      .json({ error: err?.message || "No se pudo eliminar la reserva" });
  }
});

app.get(
  "/reservations/:id/items",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "id inválido" });

    const exists = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ error: "No encontrado" });

    const items = await prisma.reservationItem.findMany({
      where: { reservationId: id },
      orderBy: { id: "asc" },
    });
    res.json(items);
  },
);

app.post(
  "/reservations/:id/items",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const reservationId = Number(req.params.id);
    if (!Number.isInteger(reservationId))
      return res.status(400).json({ error: "id inválido" });

    const parsed = reservationItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
    }

    try {
      const out = await prisma.$transaction(async (tx) => {
        const r = await tx.reservation.findUnique({
          where: { id: reservationId },
        });
        if (!r) throw new Error("No encontrado");
        if (r.status !== "OPEN") throw new Error("La reserva no está abierta");

        let prod: any = null;
        if (parsed.data.productId) {
          prod = await tx.product.findUnique({
            where: { id: parsed.data.productId },
          });
          if (!prod) throw new Error("Producto no encontrado");
        }

        const qty = Number(parsed.data.qty ?? 1);
        const unitPrice =
          parsed.data.unitPrice != null
            ? Number(parsed.data.unitPrice)
            : Number(prod?.price ?? 0);
        const discount = Number(parsed.data.discount ?? 0);
        const productName = U(parsed.data.productName ?? prod?.name ?? "ITEM");
        const skuSnapshot = prod?.sku ? String(prod.sku) : null;

        const item = await tx.reservationItem.create({
          data: {
            reservationId,
            productId: parsed.data.productId ?? null,
            productName,
            skuSnapshot,
            qty,
            unitPrice,
            discount,
            totalLine: unitPrice * qty - discount,
          },
        });

        const updated = await recomputeReservationTotals(tx, reservationId);

        return { item, reservation: updated };
      });

      res.status(201).json(out);
    } catch (e: unknown) {
      const err = e as { message?: string };
      res
        .status(400)
        .json({ error: err?.message || "No se pudo agregar el ítem" });
    }
  },
);

app.patch(
  "/reservations/:reservationId/items/:itemId",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const reservationId = Number(req.params.reservationId);
    const itemId = Number(req.params.itemId);

    if (!Number.isInteger(reservationId) || !Number.isInteger(itemId)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const parsed = reservationItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
    }

    try {
      const out = await prisma.$transaction(async (tx) => {
        const r = await tx.reservation.findUnique({
          where: { id: reservationId },
        });
        if (!r) throw new Error("No encontrado");
        if (r.status !== "OPEN") throw new Error("La reserva no está abierta");

        const existing = await tx.reservationItem.findUnique({
          where: { id: itemId },
          select: {
            id: true,
            reservationId: true,
            qty: true,
            unitPrice: true,
            discount: true,
          },
        });
        if (!existing || existing.reservationId !== reservationId)
          throw new Error("Ítem no encontrado");

        const qty =
          parsed.data.qty != null
            ? Number(parsed.data.qty)
            : Number(existing.qty);
        const unitPrice =
          parsed.data.unitPrice != null
            ? Number(parsed.data.unitPrice)
            : Number(existing.unitPrice);
        const discount =
          parsed.data.discount != null
            ? Number(parsed.data.discount)
            : Number(existing.discount ?? 0);

        const updatedItem = await tx.reservationItem.update({
          where: { id: itemId },
          data: {
            ...(parsed.data.productName !== undefined
              ? { productName: U(parsed.data.productName) }
              : {}),
            ...(parsed.data.qty !== undefined ? { qty } : {}),
            ...(parsed.data.unitPrice !== undefined ? { unitPrice } : {}),
            ...(parsed.data.discount !== undefined ? { discount } : {}),
            totalLine: unitPrice * qty - discount,
          },
        });

        const updatedReservation = await recomputeReservationTotals(
          tx,
          reservationId,
        );

        return { item: updatedItem, reservation: updatedReservation };
      });

      res.json(out);
    } catch (e: unknown) {
      const err = e as { message?: string };
      res
        .status(400)
        .json({ error: err?.message || "No se pudo actualizar el ítem" });
    }
  },
);

app.delete(
  "/reservations/:reservationId/items/:itemId",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const reservationId = Number(req.params.reservationId);
    const itemId = Number(req.params.itemId);

    if (!Number.isInteger(reservationId) || !Number.isInteger(itemId)) {
      return res.status(400).json({ error: "id inválido" });
    }

    try {
      const out = await prisma.$transaction(async (tx) => {
        const r = await tx.reservation.findUnique({
          where: { id: reservationId },
        });
        if (!r) throw new Error("No encontrado");
        if (r.status !== "OPEN") throw new Error("La reserva no está abierta");

        const existing = await tx.reservationItem.findUnique({
          where: { id: itemId },
          select: { id: true, reservationId: true },
        });
        if (!existing || existing.reservationId !== reservationId)
          throw new Error("Ítem no encontrado");

        await tx.reservationItem.delete({ where: { id: itemId } });
        const updated = await recomputeReservationTotals(tx, reservationId);
        return { ok: true, reservation: updated };
      });

      res.json(out);
    } catch (e: unknown) {
      const err = e as { message?: string };
      res
        .status(400)
        .json({ error: err?.message || "No se pudo eliminar el ítem" });
    }
  },
);

app.get(
  "/reservations/:id/payments",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "id inválido" });

    const exists = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ error: "No encontrado" });

    const pays = await prisma.reservationPayment.findMany({
      where: { reservationId: id },
      orderBy: { createdAt: "asc" },
    });
    res.json(pays);
  },
);

app.post(
  "/reservations/:id/payments",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "id inválido" });

    const parsed = reservationPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
    }

    try {
      const out = await prisma.$transaction(async (tx) => {
        const r = await tx.reservation.findUnique({ where: { id } });
        if (!r) throw new Error("No encontrado");
        if (r.status !== "OPEN") throw new Error("La reserva está cerrada");

        const pay = await tx.reservationPayment.create({
          data: {
            reservationId: id,
            amount: parsed.data.amount,
            method: parsed.data.method,
            note: parsed.data.note ? U(parsed.data.note) : undefined,
            createdBy: parsed.data.createdBy
              ? U(parsed.data.createdBy)
              : undefined,
            reference: parsed.data.reference
              ? U(parsed.data.reference)
              : undefined,
          },
        });

        const updated = await recomputeReservationTotals(tx, id);
        return { reservation: updated, payment: pay };
      });

      res.status(201).json(out);
    } catch (e: unknown) {
      const err = e as { message?: string };
      res
        .status(400)
        .json({ error: err?.message || "No se pudo registrar el abono" });
    }
  },
);

app.delete(
  "/reservations/:reservationId/payments/:paymentId",
  requireRole("ADMIN"),
  async (req, res) => {
    const reservationId = Number(req.params.reservationId);
    const paymentId = Number(req.params.paymentId);

    if (!Number.isInteger(reservationId) || !Number.isInteger(paymentId)) {
      return res.status(400).json({ error: "id inválido" });
    }

    try {
      const out = await prisma.$transaction(async (tx) => {
        const pay = await tx.reservationPayment.findUnique({
          where: { id: paymentId },
          select: { id: true, reservationId: true },
        });
        if (!pay || pay.reservationId !== reservationId) {
          throw new Error("Abono no encontrado");
        }

        await tx.reservationPayment.delete({ where: { id: paymentId } });

        const updated = await recomputeReservationTotals(tx, reservationId);

        return { ok: true, reservationId, paymentId, reservation: updated };
      });

      res.json(out);
    } catch (e: unknown) {
      const err = e as { message?: string };
      res
        .status(400)
        .json({ error: err?.message || "No se pudo eliminar el abono" });
    }
  },
);

const reservationKindPatchSchema = z.object({
  kind: z.enum(["APARTADO", "ENCARGO"]),
  pickupDate: z
    .string()
    .optional()
    .refine((v) => {
      if (!v) return true;
      // acepta "YYYY-MM-DD" o ISO datetime
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
      const isIso = !Number.isNaN(Date.parse(v));
      return isDateOnly || isIso;
    }, "pickupDate inválida"),
});

app.patch(
  "/reservations/:id/kind",
  requireRole("EMPLOYEE"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "id inválido" });

    const parsed = reservationKindPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
    }

    const { kind, pickupDate } = parsed.data;

    if (kind === "ENCARGO" && !pickupDate) {
      return res
        .status(400)
        .json({ error: "pickupDate es requerido para ENCARGO" });
    }

    try {
      const row = await prisma.reservation.update({
        where: { id },
        data: {
          kind,
          pickupDate:
            pickupDate === undefined
              ? undefined
              : pickupDate
                ? new Date(pickupDate)
                : null,
          ...(kind === "APARTADO"
            ? { convertedFromEncargo: true, kindChangedAt: new Date() }
            : { kindChangedAt: new Date() }),
        },
      });

      res.json(row);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "P2025")
        return res.status(404).json({ error: "No encontrado" });
      res.status(400).json({ error: err?.message || "No se pudo actualizar" });
    }
  },
);

// ==================== ADMIN (extra dev) ====================
app.post("/admin/wipe", requireRole("ADMIN"), async (req, res) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Payment",
        "SaleItem",
        "Sale",
        "StockMovement",
        "Expense",
        "Product",
        "User"
      RESTART IDENTITY CASCADE;
    `);
    res.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { message?: string };
    res.status(400).json({ error: err?.message || "wipe failed" });
  }
});

// ==================== SERVER ====================
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
