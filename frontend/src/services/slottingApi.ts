import api from './api';
import type {
  SlottingOverviewData,
  StorageBinItem,
  SlottingAdvisorData,
  StorageBinFilters,
  MoveBinPayload,
} from '../types';

export const slottingApi = {
  /**
   * Lấy KPI tổng quan ô kệ của kho
   */
  async getOverview(maKho: string): Promise<SlottingOverviewData> {
    const res = await api.get<{ success: boolean; data: SlottingOverviewData }>(
      '/slotting/overview',
      { params: { ma_kho: maKho } }
    );
    return res.data.data;
  },

  /**
   * Lấy danh sách 45 ô kệ kèm bộ lọc
   */
  async getBins(maKho: string, filters?: StorageBinFilters): Promise<StorageBinItem[]> {
    const res = await api.get<{ success: boolean; count: number; data: StorageBinItem[] }>(
      '/slotting/bins',
      { params: { ma_kho: maKho, ...filters } }
    );
    return res.data.data;
  },

  /**
   * Lấy chi tiết một ô kệ
   */
  async getBinDetail(maKho: string, maViTri: string): Promise<StorageBinItem> {
    const res = await api.get<{ success: boolean; data: StorageBinItem }>(
      `/slotting/bins/${encodeURIComponent(maViTri)}`,
      { params: { ma_kho: maKho } }
    );
    return res.data.data;
  },

  /**
   * Lấy khuyến nghị bố trí từ Slotting Advisor
   */
  async getAdvisor(maKho: string): Promise<SlottingAdvisorData> {
    const res = await api.get<{ success: boolean; data: SlottingAdvisorData }>(
      '/slotting/advisor',
      { params: { ma_kho: maKho } }
    );
    return res.data.data;
  },

  /**
   * Di chuyển sản phẩm giữa hai ô kệ trong kho
   */
  async moveBin(payload: MoveBinPayload): Promise<{ success: boolean; message: string; data: any }> {
    const res = await api.post<{ success: boolean; message: string; data: any }>(
      '/slotting/move',
      payload
    );
    return res.data;
  },
};

export default slottingApi;
