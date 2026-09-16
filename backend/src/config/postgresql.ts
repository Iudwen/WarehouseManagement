import { Pool } from 'pg';

export const pools: Record<string, Pool> = {
  HN: new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'admin123',
    host: process.env.POSTGRES_HOST_HN || 'localhost',
    port: Number(process.env.POSTGRES_PORT_HN) || 5433,
    database: process.env.POSTGRES_DB_HN || 'warehouse_hn',
  }),
  DN: new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'admin123',
    host: process.env.POSTGRES_HOST_DN || 'localhost',
    port: Number(process.env.POSTGRES_PORT_DN) || 5434,
    database: process.env.POSTGRES_DB_DN || 'warehouse_dn',
  }),
  HCM: new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'admin123',
    host: process.env.POSTGRES_HOST_HCM || 'localhost',
    port: Number(process.env.POSTGRES_PORT_HCM) || 5435,
    database: process.env.POSTGRES_DB_HCM || 'warehouse_hcm',
  }),
  CENTRAL: new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'admin123',
    host: process.env.POSTGRES_HOST_CENTRAL || 'localhost',
    port: Number(process.env.POSTGRES_PORT_CENTRAL) || 5436,
    database: process.env.POSTGRES_DB_CENTRAL || 'warehouse_central',
  }),
};

export const getDbPool = (maKho?: string): Pool => {
  if (maKho?.startsWith('HN')) return pools.HN;
  if (maKho?.startsWith('DN')) return pools.DN;
  if (maKho?.startsWith('HCM')) return pools.HCM;
  return pools.CENTRAL;
};