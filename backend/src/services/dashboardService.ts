import { pools } from '../config/postgresql';
import { getStockByNode } from '../repositories/dashboardRepository';

const NODE_CONFIG = [
  {
    code: 'HN01',
    poolKey: 'HN',
  },
  {
    code: 'DN01',
    poolKey: 'DN',
  },
  {
    code: 'HCM01',
    poolKey: 'HCM',
  },
] as const;

export const getAggregatedStock = async (
  maKho?: string
) => {
  const normalizedKho = maKho?.trim().toUpperCase();

  let targetNodes: typeof NODE_CONFIG[number][] = [...NODE_CONFIG];

  // Tài khoản thuộc một kho → chỉ xem kho đó
  if (
    normalizedKho &&
    normalizedKho !== 'CENTRAL'
  ) {
    targetNodes = NODE_CONFIG.filter(
      (node) => node.code === normalizedKho
    );
  }

  const stockData: any[] = [];

  for (const node of targetNodes) {
    try {
      const pool = pools[node.poolKey];

      const rows = await getStockByNode(pool);

      stockData.push(...rows);
    } catch (error) {
      console.error(
        `Không thể lấy dữ liệu tồn kho Node ${node.code}:`,
        error
      );
    }
  }

  return stockData;
};