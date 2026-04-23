-- Down migration is a no-op: reversing the rewrite would require reconstructing
-- deleted access_devices rows and guessing which junction rows used the wrapper
-- convention. This migration aligns schema with code expectations one-way.
SELECT 1;
