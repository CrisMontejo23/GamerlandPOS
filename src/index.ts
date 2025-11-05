import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// Products
app.get('/products', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] }
    : {};
  const products = await prisma.product.findMany({ where, take: 100, orderBy: { id: 'desc' } });
  res.json(products);
});

app.post('/products', async (req, res) => {
  const { sku, barcode, name, cost, price, taxRate, minStock } = req.body;
  const p = await prisma.product.create({
    data: { sku, barcode, name, cost, price, taxRate, minStock }
  });
  res.status(201).json(p);
});

// TODO: sales, stock movements, payments...

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));