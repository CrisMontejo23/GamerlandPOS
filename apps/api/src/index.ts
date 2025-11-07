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

const ExpenseCategories = ["MERCANCIA", "LOCAL", "FUERA_DEL_LOCAL"] as const;
type ExpenseCategory = (typeof ExpenseCategories)[number];

// Carga .env solo en desarrollo/local. En producción (Railway) no hace falta.
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
  // America/Bogota (sin DST). Si luego quieres, hazlo configurable por ENV.
  const TZ = "-05:00";
  const from = new Date(`${fromStr}T00:00:00.000${TZ}`);
  const to   = new Date(`${toStr}T23:59:59.999${TZ}`);
  return { from, to };
}

// Métodos de pago del local
const PaymentMethods = ["EFECTIVO", "QR_LLAVE", "DATAFONO"] as const;
type PaymentMethod = (typeof PaymentMethods)[number];

// Calcula stock actual (IN - OUT) de un producto
type StockGroupRow = { type: string; _sum: { qty: number | null } };

async function getCurrentStock(
  tx: Prisma.TransactionClient,
  productId: number
) {
  const rows = (await tx.stockMovement.groupBy({
    by: ["type"] as const,
    where: { productId },
    _sum: { qty: true },
  })) as unknown as StockGroupRow[];

  const sumIn = rows.find((r: StockGroupRow) => r.type === "in")?._sum.qty ?? 0;
  const sumOut =
    rows.find((r: StockGroupRow) => r.type === "out")?._sum.qty ?? 0;
  return Number(sumIn) - Number(sumOut);
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

// ===== AUTH: login / register / me / seed-admin =====
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

// (Opción bootstrap; en producción crea usuarios por /users)
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

// Semilla de admin (solo dev) con header ADMIN_SECRET
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

// ==================== A PARTIR DE AQUÍ: RUTAS PROTEGIDAS ====================
app.use(verifyToken);

// ==================== GESTIÓN DE USUARIOS (SOLO ADMIN) ====================
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
  } catch (e: any) {
    if (e?.code === "P2002")
      return res.status(409).json({ error: "Usuario ya existe" });
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e?.message || "No se pudo actualizar" });
  }
});

app.delete("/users/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e?.message || "No se pudo eliminar" });
  }
});

// ==================== PRODUCTS ====================
// EMPLOYEE puede leer; ADMIN crea/edita/activa/desactiva/elimina

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

// Leer productos (EMPLOYEE)
app.get("/products", requireRole("EMPLOYEE"), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const includeInactive =
    String(req.query.includeInactive || "").toLowerCase() === "true";
  const withStock = String(req.query.withStock || "").toLowerCase() === "true";

  const where = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(includeInactive ? {} : { active: true }),
  };

  const products = await prisma.product.findMany({
    where,
    take: 100,
    orderBy: { id: "asc" },
  });

  if (!withStock) return res.json(products);

  // Adjuntar stock actual
  const ids = products.map((p: { id: number }) => p.id);
  if (ids.length === 0) return res.json(products);

  const rows = (await prisma.stockMovement.groupBy({
    by: ["productId", "type"] as const,
    where: { productId: { in: ids } },
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

  res.json(products.map((p: any) => ({ ...p, stock: map.get(p.id) ?? 0 })));
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

// Crear/editar/eliminar (solo ADMIN)
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
  } catch (e: any) {
    if (e?.code === "P2002")
      return res
        .status(409)
        .json({ error: "SKU ya existe o código de barras ya existe" });
    res.status(400).json({ error: e.message || "No se pudo crear" });
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
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    if (e?.code === "P2002")
      return res
        .status(409)
        .json({ error: "SKU ya existe o código de barras ya existe" });
    res.status(400).json({ error: e.message || "No se pudo actualizar" });
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
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    if (e?.code === "P2002")
      return res
        .status(409)
        .json({ error: "SKU ya existe o código de barras ya existe" });
    res.status(400).json({ error: e.message || "No se pudo actualizar" });
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
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e.message || "No se pudo actualizar" });
  }
});

app.delete("/products/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const [movs, items] = await Promise.all([
      prisma.stockMovement.count({ where: { productId: id } }),
      prisma.saleItem.count({ where: { productId: id } }),
    ]);

    if (movs > 0 || items > 0) {
      return res.status(409).json({
        error:
          "No se puede eliminar: el producto tiene movimientos de stock o ventas asociadas. Usa 'Desactivar' en su lugar.",
      });
    }

    await prisma.product.delete({ where: { id } });
    return res.json({ ok: true, id });
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    return res.status(400).json({ error: e.message || "No se pudo eliminar" });
  }
});

// ==================== SALES (EMPLOYEE puede vender) ====================
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
      })
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.enum(PaymentMethods),
        amount: z.coerce.number().nonnegative(),
        reference: z.string().optional(),
      })
    )
    .min(1),
});

app.post("/sales", requireRole("EMPLOYEE"), async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }

  const { customer, items, payments } = parsed.data;
  const subtotal = items.reduce(
    (a: number, it) => a + it.unitPrice * it.qty,
    0
  );
  const tax = 0;
  const discount = items.reduce((a: number, it) => a + it.discount, 0);
  const total = subtotal + tax - discount;
  const sumaPagos = payments.reduce((a: number, p) => a + p.amount, 0);
  if (Math.abs(sumaPagos - total) > 0.01) {
    return res
      .status(400)
      .json({ error: "La suma de pagos debe igualar el total" });
  }

  try {
    const sale = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const s = await tx.sale.create({
          data: {
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
            },
          });
        }
        return s;
      }
    );

    res.status(201).json(sale);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "No se pudo crear la venta" });
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
      })
    )
    .min(1)
    .optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(PaymentMethods),
        amount: z.coerce.number().nonnegative(),
        reference: z.string().optional(),
      })
    )
    .min(1)
    .optional(),
  status: z.enum(["paid", "void", "return"]).optional(),
});

app.patch("/sales/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });
  const parsed = saleAdminUpdateSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.sale.findUnique({
        where: { id },
        include: { items: true, payments: true },
      });
      if (!prev) throw new Error("No encontrado");

      // Si vienen items: recalcular totales y reconciliar stock
      let items = prev.items;
      if (parsed.data.items) {
        // 1) revertir stock de items previos (crear movimientos 'in' de reverso)
        for (const it of prev.items) {
          await tx.stockMovement.create({
            data: {
              productId: it.productId,
              type: "in",
              qty: it.qty,
              unitCost: it.unitPrice, // aproximación: no conocemos avgCost histórico aquí
              reference: `sale#${id}:edit-revert`,
            },
          });
        }
        // 2) borrar items y crear nuevos
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        items = await Promise.all(
          parsed.data.items.map(async (it) =>
            tx.saleItem.create({
              data: {
                saleId: id,
                productId: it.productId,
                qty: it.qty,
                unitPrice: it.unitPrice,
                taxRate: 0,
                discount: it.discount ?? 0,
                total: it.unitPrice * it.qty - (it.discount ?? 0),
              },
            })
          )
        );
        // 3) crear nuevos movimientos 'out'
        for (const it of parsed.data.items) {
          // usar costo promedio actual como unitCost de salida
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
              reference: `sale#${id}:edit`,
            },
          });
        }
      }

      // Si vienen pagos: reemplazar pagos
      if (parsed.data.payments) {
        await tx.payment.deleteMany({ where: { saleId: id } });
        await tx.payment.createMany({
          data: parsed.data.payments.map((p) => ({
            saleId: id,
            method: p.method,
            amount: p.amount,
            reference: p.reference,
          })),
        });
      }

      // Recalcular totales de la venta (con los items actuales)
      const curItems = parsed.data.items ? items : prev.items;
      const subtotal = curItems.reduce(
        (a, it) => a + Number(it.unitPrice) * it.qty,
        0
      );
      const discount = curItems.reduce(
        (a, it) => a + Number(it.discount ?? 0),
        0
      );
      const tax = 0;
      const total = subtotal + tax - discount;

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
  } catch (e: any) {
    if (e?.message === "No encontrado")
      return res.status(404).json({ error: "No encontrado" });
    res
      .status(400)
      .json({ error: e?.message || "No se pudo actualizar la venta" });
  }
});

app.delete("/sales/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    // borra en cascada (SaleItem/Payment si FK on delete cascade no está)
    await prisma.payment.deleteMany({ where: { saleId: id } });
    await prisma.saleItem.deleteMany({ where: { saleId: id } });
    await prisma.sale.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e?.message || "No se pudo eliminar" });
  }
});

// ==================== STOCK IN (SOLO ADMIN) ====================
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
    const mov = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const prevStock = await getCurrentStock(tx, productId);
        const prod = await tx.product.findUnique({
          where: { id: productId },
          select: { cost: true },
        });
        const prevAvg = Number(prod?.cost ?? 0);

        const newQty = prevStock + qty;
        const newAvg =
          newQty > 0
            ? (prevStock * prevAvg + qty * unitCost) / newQty
            : unitCost;

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
      }
    );
    res.status(201).json(mov);
  } catch (e: any) {
    res
      .status(400)
      .json({ error: e.message || "No se pudo registrar el ingreso" });
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
    products.map((p: any) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock: map.get(p.id) || 0,
    }))
  );
});

// ==================== EXPENSES (EMPLOYEE permitido) ====================
const expenseSchema = z.object({
  description: z.string().min(1, "Descripción requerida"),
  amount: z.coerce.number().positive("Monto inválido"),
  paymentMethod: z.enum(["EFECTIVO", "QR_LLAVE", "DATAFONO"], {
    required_error: "Método de pago requerido",
  }),
  category: z.enum(ExpenseCategories).default("LOCAL"),
});

app.post("/expenses", requireRole("EMPLOYEE"), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.format() });
  }

  const d = parsed.data;
  const e = await prisma.expense.create({
    data: {
      category: d.category, // "MERCANCIA" | "LOCAL" | "FUERA_DEL_LOCAL"
      description: d.description.toUpperCase(),
      amount: d.amount,
      paymentMethod: d.paymentMethod,
    },
  });

  res.status(201).json(e);
});

app.get("/expenses", requireRole("EMPLOYEE"), async (req, res) => {
  const fromParam = req.query.from ? String(req.query.from) : "";
  const toParam = req.query.to ? String(req.query.to) : "";

  let where: any = {};
  if (fromParam && toParam) {
    const { from, to } = parseLocalDateRange(fromParam, toParam);
    where.createdAt = { gte: from, lte: to };
  } else if (fromParam) {
    const { from } = parseLocalDateRange(fromParam, fromParam);
    where.createdAt = { gte: from };
  } else if (toParam) {
    const { to } = parseLocalDateRange(toParam, toParam);
    where.createdAt = { lte: to };
  }
  const category = req.query.category
    ? String(req.query.category).toUpperCase()
    : "";
  if (category && ExpenseCategories.includes(category as ExpenseCategory)) {
    where.category = category;
  }

  const rows = await prisma.expense.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

// PUT (reemplazo completo) o PATCH (parcial)
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
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e?.message || "No se pudo actualizar" });
  }
});

app.delete("/expenses/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });
  try {
    await prisma.expense.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e?.message || "No se pudo eliminar" });
  }
});

// ==================== REPORTES (EMPLOYEE) ====================
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

  // Tipos explícitos para evitar 'any'
  const sales = (await prisma.sale.findMany({
    where: { createdAt: { gte: from, lte: to }, status: "paid" },
    select: { subtotal: true, tax: true, discount: true, total: true },
  })) as Array<{
    subtotal: unknown;
    tax: unknown;
    discount: unknown;
    total: unknown;
  }>;

  const sum = (k: "subtotal" | "tax" | "discount" | "total") =>
    sales.reduce(
      (a: number, s: { [key: string]: unknown }) => a + Number(s[k]),
      0
    );

  const outs = (await prisma.stockMovement.findMany({
    where: { type: "out", createdAt: { gte: from, lte: to } },
    select: { qty: true, unitCost: true },
  })) as Array<{ qty: unknown; unitCost: unknown }>;

  const costo = outs.reduce(
    (a: number, r: { qty: unknown; unitCost: unknown }) =>
      a + Number(r.qty) * Number(r.unitCost),
    0
  );

  const expenses = (await prisma.expense.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { amount: true, category: true },
  })) as Array<{ amount: unknown; category?: string | null }>;

  const gastos_total = expenses.reduce((a, r) => a + Number(r.amount), 0);
  const gastos_operativos = expenses
    .filter((e) => String(e.category ?? "").toUpperCase() !== "MERCANCIA")
    .reduce((a, r) => a + Number(r.amount), 0);

  const ventas = sum("total");
  const utilidad = ventas - costo - gastos_operativos;

  res.json({
    from,
    to,
    ventas,
    subtotal: sum("subtotal"),
    iva: sum("tax"),
    descuentos: sum("discount"),
    costo_vendido: costo,
    gastos_total,
    gastos_operativos,
    utilidad,
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
      items: { include: { product: true } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  })) as Array<{
    id: number;
    createdAt: Date;
    items: Array<{
      productId: number;
      unitPrice: unknown;
      qty: unknown;
      discount: unknown;
      total: unknown | null;
      product: { sku?: string | null; name?: string | null } | null;
    }>;
    payments: Array<{ method: string; amount: unknown }>;
  }>;

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

  const costMap = new Map<string, number>(); // `${saleId}:${productId}`
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
      const profit = revenue - cost;
      const total =
        it.total != null ? toN(it.total) : unitPrice * qty - discount;

      return {
        saleId: s.id,
        createdAt: s.createdAt,
        sku: it.product?.sku ?? "",
        name: it.product?.name ?? "",
        qty,
        unitPrice,
        discount,
        total,
        unitCost,
        revenue,
        cost,
        profit,
        paymentMethods: s.payments.map((p) => ({
          method: p.method,
          amount: toN(p.amount),
        })),
      };
    })
  );

  res.json(rows);
});

// Alias para el front antiguo: /reports/sales-detail
app.get(
  "/reports/sales-detail",
  requireRole("EMPLOYEE"),
  async (req, res, next) => {
    (app as any)._router.handle(
      { ...req, url: "/reports/sales-lines", method: "GET" },
      res,
      next
    );
  }
);

/// Pagos por método (caja)
app.get("/reports/payments", requireRole("EMPLOYEE"), async (req, res) => {
  const fromParam = String(req.query.from || "");
  const toParam = String(req.query.to || "");
  if (!fromParam || !toParam)
    return res.status(400).json({ error: "from/to requeridos" });

  const { from, to } = parseLocalDateRange(fromParam, toParam);

  const rows = (await prisma.payment.groupBy({
    by: ["method"] as const,
    where: { createdAt: { gte: from, lte: to } },
    _sum: { amount: true },
  })) as unknown as Array<{ method: string; _sum: { amount: unknown } }>;

  const sum = (m: string) =>
    Number(
      rows.find((r: { method: string }) => r.method === m)?._sum.amount ?? 0
    );
  const EFECTIVO = sum("EFECTIVO");
  const QR_LLAVE = sum("QR_LLAVE");
  const DATAFONO = sum("DATAFONO");
  const total = EFECTIVO + QR_LLAVE + DATAFONO;

  // gastos por método
  const exp = await prisma.expense.groupBy({
    by: ["paymentMethod"],
    where: { createdAt: { gte: from, lte: to } },
    _sum: { amount: true },
  });

  const expSum = (m: string) =>
    Number(exp.find((e) => e.paymentMethod === m)?._sum.amount ?? 0);

  const G_EFECTIVO = expSum("EFECTIVO");
  const G_QR = expSum("QR_LLAVE");
  const G_DATAFONO = expSum("DATAFONO");
  const G_TOTAL = G_EFECTIVO + G_QR + G_DATAFONO;

  // neto por método (caja actual por método)
  const N_EFECTIVO = EFECTIVO - G_EFECTIVO;
  const N_QR = QR_LLAVE - G_QR;
  const N_DATAFONO = DATAFONO - G_DATAFONO;
  const N_TOTAL = N_EFECTIVO + N_QR + N_DATAFONO;

  res.json({
    // bruto
    EFECTIVO,
    QR_LLAVE,
    DATAFONO,
    total,
    // gastos por método
    gastos: {
      EFECTIVO: G_EFECTIVO,
      QR_LLAVE: G_QR,
      DATAFONO: G_DATAFONO,
      total: G_TOTAL,
    },
    // neto
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

  const items = (await prisma.saleItem.findMany({
    where: { sale: { createdAt: { gte: from, lte: to }, status: "paid" } },
    select: {
      unitPrice: true,
      qty: true,
      discount: true,
      total: true,
      product: { select: { category: true } },
    },
  })) as Array<{
    unitPrice: unknown;
    qty: unknown;
    discount: unknown;
    total: unknown | null;
    product: { category?: string | null } | null;
  }>;

  const total = items
    .filter(
      (it: { product: { category?: string | null } | null }) =>
        String(it.product?.category ?? "").toUpperCase() === "SERVICIOS"
    )
    .reduce((acc: number, it) => {
      const unit = toN(it.unitPrice);
      const qty = toN(it.qty);
      const disc = toN(it.discount);
      const line = it.total != null ? toN(it.total) : unit * qty - disc;
      return acc + line;
    }, 0);

  res.json({ total });
});

// =================== TARJETAS DE TRABAJOS ==================

const workCreateSchema = z.object({
  item: z.string().min(1),
  description: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(3),
  reviewPaid: z.coerce.boolean().default(false),
  location: z.enum(["LOCAL", "BOGOTA"]).default("LOCAL"),
  // opcionales
  quote: z.coerce.number().optional(),
  notes: z.string().optional(),
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
});

// ==================== WORK ORDERS (EMPLOYEE puede gestionar, solo ADMIN elimina) ====================
app.get("/works", requireRole("EMPLOYEE"), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").toUpperCase();
  const location = String(req.query.location || "").toUpperCase();

  const where: any = {};
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
    where.status = status;
  }
  if (["LOCAL", "BOGOTA"].includes(location)) {
    where.location = location;
  }

  const rows = await prisma.workOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(rows);
});

app.post("/works", requireRole("EMPLOYEE"), async (req, res) => {
  const parsed = workCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }
  const code = await getNextWorkCode();
  const d = parsed.data;
  const row = await prisma.workOrder.create({
    data: {
      code,
      item: d.item.toUpperCase(),
      description: d.description.toUpperCase(),
      customerName: d.customerName.toUpperCase(),
      customerPhone: d.customerPhone,
      reviewPaid: d.reviewPaid,
      location: d.location,
      quote: d.quote ?? null,
      notes: d.notes ? d.notes.toUpperCase() : null,
    },
  });
  res.status(201).json(row);
});

app.patch("/works/:id", requireRole("EMPLOYEE"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const parsed = workUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Datos inválidos", issues: parsed.error.flatten() });
  }
  const d = parsed.data;
  try {
    const row = await prisma.workOrder.update({
      where: { id },
      data: {
        ...(d.item !== undefined ? { item: d.item.toUpperCase() } : {}),
        ...(d.description !== undefined
          ? { description: d.description.toUpperCase() }
          : {}),
        ...(d.customerName !== undefined
          ? { customerName: d.customerName.toUpperCase() }
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
          ? { notes: d.notes ? d.notes.toUpperCase() : null }
          : {}),
      },
    });
    res.json(row);
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e?.message || "No se pudo actualizar" });
  }
});

app.delete("/works/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });
  try {
    await prisma.workOrder.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "No encontrado" });
    res.status(400).json({ error: e?.message || "No se pudo eliminar" });
  }
});

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
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "wipe failed" });
  }
});

// ==================== SERVER ====================
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
