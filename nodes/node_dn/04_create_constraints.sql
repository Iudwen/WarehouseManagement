ALTER TABLE san_pham
ADD CONSTRAINT fk_sp_nhom_dn
FOREIGN KEY (ma_nhom)
REFERENCES nhom_san_pham(ma_nhom);

ALTER TABLE phieu_nhap
ADD CONSTRAINT fk_pn_kho_dn
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);

ALTER TABLE phieu_nhap
ADD CONSTRAINT fk_pn_ncc_dn
FOREIGN KEY (ma_ncc)
REFERENCES nha_cung_cap(ma_ncc);

ALTER TABLE ct_phieu_nhap
ADD CONSTRAINT fk_ctpn_pn_dn
FOREIGN KEY (ma_phieu_nhap)
REFERENCES phieu_nhap(ma_phieu_nhap);

ALTER TABLE ct_phieu_nhap
ADD CONSTRAINT fk_ctpn_sp_dn
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);

ALTER TABLE phieu_xuat
ADD CONSTRAINT fk_px_kho_dn
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);

ALTER TABLE phieu_xuat
ADD CONSTRAINT fk_px_kh_dn
FOREIGN KEY (ma_kh)
REFERENCES khach_hang(ma_kh);

ALTER TABLE ct_phieu_xuat
ADD CONSTRAINT fk_ctpx_px_dn
FOREIGN KEY (ma_phieu_xuat)
REFERENCES phieu_xuat(ma_phieu_xuat);

ALTER TABLE ct_phieu_xuat
ADD CONSTRAINT fk_ctpx_sp_dn
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);

ALTER TABLE ton_kho
ADD CONSTRAINT fk_tk_kho_dn
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);

ALTER TABLE ton_kho
ADD CONSTRAINT fk_tk_sp_dn
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);

ALTER TABLE phieu_dieu_chuyen
ADD CONSTRAINT fk_dc_kho_xuat_dn
FOREIGN KEY (kho_xuat)
REFERENCES kho(ma_kho);

ALTER TABLE phieu_dieu_chuyen
ADD CONSTRAINT fk_dc_kho_nhap_dn
FOREIGN KEY (kho_nhap)
REFERENCES kho(ma_kho);

ALTER TABLE ct_dieu_chuyen
ADD CONSTRAINT fk_ctdc_dc_dn
FOREIGN KEY (ma_phieu_dc)
REFERENCES phieu_dieu_chuyen(ma_phieu_dc);

ALTER TABLE ct_dieu_chuyen
ADD CONSTRAINT fk_ctdc_sp_dn
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);

ALTER TABLE lich_su_ton_kho
ADD CONSTRAINT fk_lstk_kho_dn
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);

ALTER TABLE lich_su_ton_kho
ADD CONSTRAINT fk_lstk_sp_dn
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);

ALTER TABLE nguoi_dung
ADD CONSTRAINT fk_nd_kho_dn
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);