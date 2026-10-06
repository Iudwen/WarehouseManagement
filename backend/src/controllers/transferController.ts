import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  approveTransfer,
  confirmSourceTransfer,
  processTransfer,
  receiveDestinationTransfer,
  shipSourceTransfer,
} from '../services/transferService';

export const handleTransfer = async (req: CustomRequest, res: Response): Promise => {
  try {
    const result = await processTransfer(
      req.body,
      req.user?.ma_kho || undefined,
      req.user?.vai_tro
    );
    res.status(202).json({ message: '─É├ú tß║ío y├¬u cß║ºu ─æiß╗üu chuyß╗ân, ─æang chß╗¥ duyß╗çt', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lß╗ùi ─æiß╗üu chuyß╗ân kho' });
  }
};

export const handleApproveTransfer = async (req: CustomRequest, res: Response): Promise => {
  try {
    const result = await approveTransfer(req.params.maPhieu, req.user!);
    res.json({ message: '─É├ú duyß╗çt y├¬u cß║ºu ─æiß╗üu chuyß╗ân v├á tß║ío Saga', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lß╗ùi duyß╗çt y├¬u cß║ºu ─æiß╗üu chuyß╗ân' });
  }
};

export const handleSourceConfirmation = async (
  req: CustomRequest,
  res: Response,
): Promise => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Ch╞░a x├íc thß╗▒c ng╞░ß╗¥i d├╣ng' });
      return;
    }

    const result = await confirmSourceTransfer(req.params.maPhieu, req.user);
    res.status(202).json({
      message: '─É├ú x├íc nhß║¡n kho nguß╗ôn, reservation ─æang ─æ╞░ß╗úc xß╗¡ l├╜ tß║íi node sß╗ƒ hß╗»u',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lß╗ùi x├íc nhß║¡n kho nguß╗ôn' });
  }
};

/**
 * Task 3.5: Controller xß╗¡ l├╜ lß╗çnh xuß║Ñt h├áng tß║íi kho nguß╗ôn (Source Shipment)
 */
export const handleSourceShipment = async (
  req: CustomRequest,
  res: Response,
): Promise => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Ch╞░a x├íc thß╗▒c ng╞░ß╗¥i d├╣ng' });
      return;
    }

    const result = await shipSourceTransfer(req.params.maPhieu, req.user);
    res.status(202).json({
      message: '─É├ú xuß║Ñt h├áng tß║íi kho nguß╗ôn, shipment ─æang ─æ╞░ß╗úc xß╗¡ l├╜ tß║íi node sß╗ƒ hß╗»u',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lß╗ùi xuß║Ñt h├áng tß║íi kho nguß╗ôn' });
  }
};

/**
 * Task 3.7 & 3.9: Controller xß╗¡ l├╜ lß╗çnh nhß║¡n h├áng tß║íi kho ─æ├¡ch (Destination Receiving & Discrepancy Support)
 */
export const handleDestinationReceiving = async (
  req: CustomRequest,
  res: Response,
): Promise => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Ch╞░a x├íc thß╗▒c ng╞░ß╗¥i d├╣ng' });
      return;
    }

    const { so_luong_thuc_nhan, ly_do_thieu } = req.body || {};

    const discrepancyOptions = {
      so_luong_thuc_nhan: so_luong_thuc_nhan !== undefined ? Number(so_luong_thuc_nhan) : undefined,
      ly_do_thieu: ly_do_thieu ? String(ly_do_thieu).trim() : undefined,
    };

    const result = await receiveDestinationTransfer(
      req.params.maPhieu,
      req.user,
      discrepancyOptions,
    );

    res.status(202).json({
      message: '─É├ú nhß║¡n h├áng tß║íi kho ─æ├¡ch, qu├í tr├¼nh cß║¡p nhß║¡t kho ─æang ─æ╞░ß╗úc xß╗¡ l├╜ tß║íi node sß╗ƒ hß╗»u',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lß╗ùi nhß║¡n h├áng tß║íi kho ─æ├¡ch' });
  }
};
