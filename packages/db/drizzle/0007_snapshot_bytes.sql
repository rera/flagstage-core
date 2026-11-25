-- Snapshot byte size. A 32-bit int overflows above 2147483647 (~2.1 GB).
ALTER TABLE "snapshot" ALTER COLUMN "bytes" TYPE bigint;
