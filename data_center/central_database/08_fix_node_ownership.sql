BEGIN;

UPDATE kho
SET
    node_name = CASE ma_kho
        WHEN 'HN01' THEN 'NODE_HN'
        WHEN 'DN01' THEN 'NODE_DN'
        WHEN 'HCM01' THEN 'NODE_HCM'
    END,
    node_host = CASE ma_kho
        WHEN 'HN01' THEN 'postgres_hn'
        WHEN 'DN01' THEN 'postgres_dn'
        WHEN 'HCM01' THEN 'postgres_hcm'
    END,
    node_port = 5432,
    trang_thai = 'ACTIVE'
WHERE ma_kho IN ('HN01', 'DN01', 'HCM01');

COMMIT;
